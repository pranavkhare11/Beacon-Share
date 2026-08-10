import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Peer } from 'peerjs';
import ThemedMediaPlayer from '../../components/common/ThemedMediaPlayer.jsx';
import { saveSession, getSession, saveChunk, getChunksForFile, clearSession } from '../../utils/storageDB.js';
import './ReceiverPage.css';

// Helper to extract file extension/type
const getFileType = (name) => {
  const extMatch = name.match(/\.([^.]+)$/);
  return extMatch ? extMatch[1].toUpperCase() : 'FILE';
};

// Helper to detect playable/viewable media types
const getMediaType = (filename) => {
  if (!filename) return null;
  const ext = filename.split('.').pop().toLowerCase();
  if (['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', 'ogv', '3gp'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus', 'wma'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  return null;
};

// Helper to resolve MIME types for media Blobs
const getMediaMimeType = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/mp4',
    mov: 'video/mp4',
    avi: 'video/mp4',
    m4v: 'video/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml'
  };
  return mimeMap[ext] || '';
};

// Helper to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

// Helper to sanitize filenames to prevent path traversal or filesystem errors
const sanitizeFilename = (name) => {
  if (!name) return 'downloaded_file';
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/^\.+/, '');
};

export default function ReceiverPage() {
  const { urlPeerId } = useParams();

  // Input states
  const [peerId, setPeerId] = useState(urlPeerId || '');
  const [pin, setPin] = useState('');

  // Media preview modal state & session restoration state
  const [activeMediaModal, setActiveMediaModal] = useState(null);
  const [isRestoredSession, setIsRestoredSession] = useState(false);

  // Status states
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [requiresPinEntry, setRequiresPinEntry] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Transfer states
  const [filesList, setFilesList] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState('0.00 MB/s');
  const [eta, setEta] = useState('N/A');

  // WebRTC / PeerInstance states
  const peerRef = useRef(null);
  const [activeConnection, setActiveConnection] = useState(null);

  // Keep references for async WebRTC closures & state tracking
  const fileChunksRef = useRef({}); // Keyed by fileIndex -> ArrayBuffer[]
  const filesListRef = useRef([]);
  const lastTimeRef = useRef(Date.now());
  const lastBytesRef = useRef(0);
  
  // Connection timeout & Heartbeat refs
  const connectTimeoutRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const lastPongTimeRef = useRef(Date.now());
  const wakeLockRef = useRef(null);

  useEffect(() => {
    filesListRef.current = filesList;
  }, [filesList]);

  // Pre-fill Peer ID if it comes from the URL path
  useEffect(() => {
    if (urlPeerId) {
      setPeerId(urlPeerId);
    }
  }, [urlPeerId]);

  // Restore session & chunks from IndexedDB if reloading or reconnecting
  useEffect(() => {
    const restoreSessionIfPresent = async () => {
      const targetId = peerId || urlPeerId;
      if (!targetId) return;

      const savedSession = await getSession(targetId);
      if (savedSession && savedSession.filesList && savedSession.filesList.length > 0) {
        console.log("Restoring session progress from IndexedDB for peer:", targetId);
        const restoredFiles = savedSession.filesList;
        setFilesList(restoredFiles);
        if (savedSession.pin) setPin(savedSession.pin);

        // Restore chunks for each file index
        for (let i = 0; i < restoredFiles.length; i++) {
          const chunks = await getChunksForFile(targetId, i);
          if (chunks && chunks.length > 0) {
            fileChunksRef.current[i] = chunks;
          }
        }
        setIsRestoredSession(true);
      }
    };

    restoreSessionIfPresent();
  }, [urlPeerId]);

  // Screen Wake Lock API helpers
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.warn("Screen Wake Lock request failed:", err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) { /* ignore */ }
      wakeLockRef.current = null;
    }
  };

  // Clear connection timeout
  const clearConnectTimeout = () => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  };

  // Clear heartbeat interval
  const stopHeartbeat = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  // Start heartbeat ping/pong monitor
  const startHeartbeat = (conn) => {
    stopHeartbeat();
    lastPongTimeRef.current = Date.now();
    
    heartbeatTimerRef.current = setInterval(() => {
      if (!conn || !conn.open) {
        stopHeartbeat();
        return;
      }

      // Check if host hasn't responded to pings in 12 seconds
      if (Date.now() - lastPongTimeRef.current > 12000) {
        console.warn("Heartbeat lost: Host unresponsive for >12s");
        stopHeartbeat();
        conn.close();
        setIsConnected(false);
        setIsConnecting(false);
        setErrorMsg('CONNECTION LOST // PEER UNREACHABLE');
        releaseWakeLock();
        return;
      }

      try {
        conn.send({ type: 'ping' });
      } catch (e) { /* ignore */ }
    }, 4000);
  };

  // Setup Peer instance on mount
  useEffect(() => {
    const peer = new Peer({
      debug: 1
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log("Client peer registered with ID:", id);
      
      // Auto-connect if direct link contains Peer ID
      if (urlPeerId) {
        initiateConnection(urlPeerId);
      }
    });

    peer.on('error', (err) => {
      console.error('PeerJS instance error:', err);
      clearConnectTimeout();
      setIsConnecting(false);
      setIsConnected(false);
      if (err.type === 'peer-unavailable') {
        setErrorMsg('PEER_UNAVAILABLE // SENDER IS OFFLINE');
      } else {
        setErrorMsg(`LINK_FAILED // ERROR_${err.type?.toUpperCase() || 'TIMEOUT'}`);
      }
    });

    return () => {
      clearConnectTimeout();
      stopHeartbeat();
      releaseWakeLock();
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
  }, [urlPeerId]);

  // Initiate a P2P Connection with guard & 12s timeout
  const initiateConnection = (targetId) => {
    if (!peerRef.current) {
      setErrorMsg('P2P ENGINE NOT INITIALIZED');
      return;
    }

    setIsConnecting(true);
    setErrorMsg('');
    clearConnectTimeout();

    const conn = peerRef.current.connect(targetId.trim());
    if (!conn) {
      setIsConnecting(false);
      setErrorMsg('LINK_FAILED // CANNOT INITIALIZE CONNECTION');
      return;
    }

    // 12-Second Connection Timeout Guard
    connectTimeoutRef.current = setTimeout(() => {
      if (!conn.open) {
        console.warn("Connection attempt timed out after 12s");
        conn.close();
        setIsConnecting(false);
        setErrorMsg('LINK_FAILED // CONNECTION TIMEOUT');
      }
    }, 12000);

    setupConnectionListeners(conn);
  };

  // Cancel in-flight connection manually
  const handleCancelConnection = () => {
    clearConnectTimeout();
    if (activeConnection) {
      activeConnection.close();
    }
    setIsConnecting(false);
    setErrorMsg('CONNECTION CANCELLED BY USER');
  };

  // Shared connection handler
  const setupConnectionListeners = (conn) => {
    setActiveConnection(conn);

    const handleOpen = () => {
      clearConnectTimeout();
      console.log("WebRTC channel opened. Awaiting authentication status...");
      setErrorMsg('');
      startHeartbeat(conn);
    };

    if (conn.open) {
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }

    conn.on('data', (data) => {
      // Pong response handler
      if (data.type === 'pong') {
        lastPongTimeRef.current = Date.now();
        return;
      }

      if (data.type === 'auth_required') {
        console.log("PIN verification required by host.");
        if (pinRef.current) {
          console.log("Submitting user-entered PIN automatically.");
          conn.send({ type: 'auth_submit', pin: pinRef.current });
        } else {
          setIsConnecting(false);
          setRequiresPinEntry(true);
          setIsConnected(false);
        }
      }
      else if (data.type === 'auth_success') {
        console.log("Authenticated successfully. Connection active.");
        setIsConnecting(false);
        setRequiresPinEntry(false);
        setIsConnected(true);
      }
      else if (data.type === 'auth_failed') {
        console.warn("Authentication rejected by host.");
        setErrorMsg(data.message || 'INVALID PIN // ACCESS DENIED');
        conn.close();
        setIsConnecting(false);
        setIsConnected(false);
        setRequiresPinEntry(true);
      }
      else if (data.type === 'auth_locked') {
        console.warn("Authentication locked by host due to repeated failures.");
        setErrorMsg(data.message || 'LOCKED OUT // TOO MANY FAILED ATTEMPTS');
        conn.close();
        setIsConnecting(false);
        setIsConnected(false);
        setRequiresPinEntry(true);
      }
      else if (data.type === 'host_busy') {
        console.warn("Host is busy in another session.");
        setErrorMsg(data.message || 'HOST BUSY // ANOTHER SESSION ACTIVE');
        conn.close();
        setIsConnecting(false);
        setIsConnected(false);
      }
      else if (data.type === 'host_closed') {
        console.warn("Host closed connection:", data.reason);
        setErrorMsg(`HOST DISCONNECTED // ${data.reason?.toUpperCase() || 'TAB CLOSED'}`);
        conn.close();
        setIsConnected(false);
        setIsConnecting(false);
        releaseWakeLock();
      }
      else if (data.type === 'meta') {
        console.log("Received P2P files metadata list:", data.files);
        const targetId = peerId || urlPeerId;
        setFilesList(prev => {
          if (prev.length === 0) return data.files.map(f => ({ ...f, status: 'pending' }));
          return data.files.map(inc => {
            const existing = prev.find(p => p.name === inc.name && p.size === inc.size);
            return existing ? { ...inc, status: existing.status } : { ...inc, status: 'pending' };
          });
        });
        if (targetId) {
          saveSession(targetId, pinRef.current, filesListRef.current);
        }
      }
      else if (data.type === 'start') {
        console.log(`Starting incoming stream for file index: ${data.fileIndex}`);
        setCurrentFileIndex(data.fileIndex);
        setProgress(0);
        
        // Key chunk buffer by fileIndex to isolate file streams
        if (!fileChunksRef.current[data.fileIndex] || data.startOffset === 0) {
          fileChunksRef.current[data.fileIndex] = [];
        }

        lastTimeRef.current = Date.now();
        lastBytesRef.current = 0;
        requestWakeLock();

        setFilesList(prev => prev.map((f, idx) => {
          if (idx === data.fileIndex) {
            return { ...f, status: 'downloading' };
          }
          return f;
        }));
      }
      else if (data.type === 'chunk') {
        const fileIndex = data.fileIndex;
        if (!fileChunksRef.current[fileIndex]) {
          fileChunksRef.current[fileIndex] = [];
        }

        const arrayBuffer = data.data;
        fileChunksRef.current[fileIndex].push(arrayBuffer);
        const targetId = peerId || urlPeerId;
        if (targetId) {
          saveChunk(targetId, fileIndex, data.offset, arrayBuffer);
        }

        const file = filesListRef.current[fileIndex];
        
        if (file) {
          const currentSize = fileChunksRef.current[fileIndex].reduce((acc, c) => acc + c.byteLength, 0);
          const currentProgress = Math.min(100, Math.ceil((currentSize / file.size) * 100));
          setProgress(currentProgress);

          if (targetId) {
            saveSession(targetId, pinRef.current, filesListRef.current);
          }

          // Calculate speed & ETA every 500ms
          const now = Date.now();
          const deltaMs = now - lastTimeRef.current;
          if (deltaMs > 500) {
            const deltaBytes = currentSize - lastBytesRef.current;
            const speedBps = deltaMs > 0 ? deltaBytes / (deltaMs / 1000) : 0;
            const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
            setTransferSpeed(`${speedMBps} MB/s`);
            
            const remainingBytes = file.size - currentSize;
            const etaSecs = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
            setEta(etaSecs > 0 ? `${etaSecs}s` : 'COMPLETED');

            lastTimeRef.current = now;
            lastBytesRef.current = currentSize;
          }
        }
      }
      else if (data.type === 'eof') {
        const fileIndex = data.fileIndex;
        const file = filesListRef.current[fileIndex];
        const chunks = fileChunksRef.current[fileIndex] || [];
        
        if (file) {
          console.log(`File stream EOF reached for: ${file.name}. Verifying size integrity...`);
          const totalReceivedSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);

          // Size / Integrity Verification
          if (totalReceivedSize !== file.size) {
            console.error(`Integrity mismatch! Expected ${file.size} bytes but received ${totalReceivedSize} bytes.`);
            setFilesList(prev => prev.map((f, idx) => {
              if (idx === fileIndex) {
                return { ...f, status: 'error', error: 'CHECKSUM / SIZE MISMATCH' };
              }
              return f;
            }));
            releaseWakeLock();
            return;
          }
          
          // Only pop up browser Save-As download prompt if explicitly requested by user via DOWNLOAD button
          if (file.autoSaveOnEof !== false) {
            const blob = new Blob(chunks, { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const cleanName = sanitizeFilename(file.name);
            const a = document.createElement('a');
            a.href = url;
            a.download = cleanName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          }
          
          setFilesList(prev => {
            const updated = prev.map((f, idx) => {
              if (idx === fileIndex) {
                return { ...f, status: 'finished' };
              }
              return f;
            });
            const targetId = peerId || urlPeerId;
            if (targetId) saveSession(targetId, pinRef.current, updated);
            return updated;
          });

          releaseWakeLock();
        }
      }
      else if (data.type === 'transfer_error') {
        console.error(`Transfer error received for file index ${data.fileIndex}:`, data.reason);
        setFilesList(prev => prev.map((f, idx) => {
          if (idx === data.fileIndex) {
            return { ...f, status: 'error', error: data.reason || 'TRANSFER_ERROR' };
          }
          return f;
        }));
        releaseWakeLock();
      }
      else if (data.type === 'transfer_cancelled') {
        console.log(`Transfer cancelled confirmation for file index ${data.fileIndex}`);
        setFilesList(prev => prev.map((f, idx) => {
          if (idx === data.fileIndex) {
            return { ...f, status: 'cancelled' };
          }
          return f;
        }));
        releaseWakeLock();
      }
    });

    conn.on('close', () => {
      console.log("WebRTC channel closed.");
      clearConnectTimeout();
      stopHeartbeat();
      releaseWakeLock();
      setIsConnected(false);
      setIsConnecting(false);
      setActiveConnection(null);
    });

    conn.on('error', (err) => {
      console.error("WebRTC link error:", err);
      clearConnectTimeout();
      stopHeartbeat();
      releaseWakeLock();
      setErrorMsg('LINK_FAILED // TIMEOUT');
      setIsConnected(false);
      setIsConnecting(false);
      setActiveConnection(null);
    });
  };

  const pinRef = useRef('');
  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  // Handle manual connection sequence
  const handleConnect = (e) => {
    e.preventDefault();
    if (!peerId.trim()) {
      setErrorMsg('PEER_ID REQUIRED');
      return;
    }
    initiateConnection(peerId.trim());
  };

  // Submit entered PIN code to Host over active RTCDataChannel
  const handleVerifyPinSubmit = (e) => {
    e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('SECURE_PIN // 4-DIGITS REQUIRED');
      return;
    }
    if (activeConnection && activeConnection.open) {
      setErrorMsg('');
      setIsConnecting(true);
      activeConnection.send({ type: 'auth_submit', pin: pin });
    } else {
      setErrorMsg('CONNECTION LOST // PEER OFFLINE');
    }
  };

  // Request a single file download from Host (with resume offset calculation)
  const handleRequestDownload = (fileIndex, shouldAutoSave = true) => {
    if (activeConnection && activeConnection.open) {
      const existingChunks = fileChunksRef.current[fileIndex] || [];
      const currentReceivedBytes = existingChunks.reduce((acc, c) => acc + c.byteLength, 0);

      setFilesList(prev => prev.map((f, idx) => {
        if (idx === fileIndex) {
          return { ...f, status: 'downloading', autoSaveOnEof: shouldAutoSave };
        }
        return f;
      }));

      activeConnection.send({ 
        type: 'request_download', 
        fileIndex, 
        offset: currentReceivedBytes 
      });
    }
  };

  // Pause single file transfer
  const handlePauseSingleTransfer = (fileIndex) => {
    if (activeConnection && activeConnection.open) {
      setFilesList(prev => prev.map((f, idx) => {
        if (idx === fileIndex) return { ...f, status: 'paused' };
        return f;
      }));
      activeConnection.send({ type: 'pause_file', fileIndex });
    }
  };

  // Resume single file transfer with byte offset recalculation
  const handleResumeSingleTransfer = (fileIndex) => {
    handleRequestDownload(fileIndex, true);
  };

  // Cancel single file transfer
  const handleCancelSingleTransfer = (fileIndex) => {
    if (activeConnection && activeConnection.open) {
      setFilesList(prev => prev.map((f, idx) => {
        if (idx === fileIndex) return { ...f, status: 'cancelled' };
        return f;
      }));
      activeConnection.send({ type: 'cancel_file', fileIndex });
    }
  };

  // Request all pending files download from Host
  const handleRequestDownloadAll = () => {
    if (activeConnection && activeConnection.open) {
      setFilesList(prev => prev.map(f => {
        if (f.status !== 'finished') {
          return { ...f, status: 'downloading', autoSaveOnEof: true };
        }
        return f;
      }));
      activeConnection.send({ type: 'request_download_all' });
    }
  };

  // Disconnect handler
  const handleDisconnect = () => {
    const targetId = peerId || urlPeerId;
    if (targetId) clearSession(targetId);
    stopHeartbeat();
    releaseWakeLock();
    if (activeConnection) {
      activeConnection.close();
    }
    setIsConnected(false);
    setProgress(0);
    setCurrentFileIndex(0);
    setFilesList([]);
    setPin('');
    setRequiresPinEntry(false);
    setIsRestoredSession(false);
    fileChunksRef.current = {};
  };

  // Open media preview modal (for movies, audio, images)
  const handleOpenMediaPreview = (file, idx) => {
    const mediaType = getMediaType(file.name);
    if (!mediaType) return;

    let chunks = fileChunksRef.current[idx] || [];

    // Auto request stream transfer without forcing browser download popup
    if (file.status !== 'finished' && file.status !== 'downloading' && chunks.length === 0) {
      handleRequestDownload(idx, false);
    }

    const mimeType = getMediaMimeType(file.name);
    const blob = new Blob(chunks, { type: mimeType });
    const objectUrl = chunks.length > 0 ? URL.createObjectURL(blob) : '';

    setActiveMediaModal({
      file,
      url: objectUrl,
      type: mediaType,
      fileIndex: idx
    });
  };

  const isAnyFileDownloading = filesList.some(f => f.status === 'downloading');

  // Save a finished file to disk on demand
  const handleSaveFinishedFile = (fileIndex) => {
    const file = filesList[fileIndex];
    const chunks = fileChunksRef.current[fileIndex] || [];
    if (!file || chunks.length === 0) return;

    const blob = new Blob(chunks, { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const cleanName = sanitizeFilename(file.name);
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // Remove a file entry from the list (for cancelled / error / finished files)
  const handleRemoveFile = (fileIndex) => {
    setFilesList(prev => prev.filter((_, idx) => idx !== fileIndex));
    delete fileChunksRef.current[fileIndex];
  };

  return (
    <div className="receiver-page-container">
      {!isConnected ? (
        // Connection Portal Panel
        <div className="receiver-connect-card panel">
          <span className="deck-screw top-left" aria-hidden="true" />
          <span className="deck-screw top-right" aria-hidden="true" />
          <span className="deck-screw bottom-left" aria-hidden="true" />
          <span className="deck-screw bottom-right" aria-hidden="true" />

          <div className="glyph-band" style={{ marginBottom: '1.5rem' }}>
            <span className="glyph-dot" aria-hidden="true" />
            <span className="file-meta">MODULE.P2P.RECEIVER // PORTAL</span>
          </div>

          {isConnecting ? (
            <div className="receiver-auto-connecting">
              <h3>SECURE BEACON LINK</h3>
              <p className="receiver-desc">
                Connecting to peer {peerId || urlPeerId}. Establishing RTC transport handshakes...
              </p>
              <div className="connection-status-group" style={{ justifyContent: 'center', margin: '2rem 0' }}>
                <span className="decor-led active" />
                <span className="connection-status-text font-dot blink">LINKING_TO_PEER</span>
              </div>
              <div className="loading-dots font-dot" style={{ fontSize: '0.72rem', letterSpacing: '0.12em', color: 'var(--text-faint)', marginBottom: '1.5rem' }}>
                VERIFYING BEACON KEY
              </div>
              <button 
                type="button" 
                onClick={handleCancelConnection} 
                className="cancel-link-btn font-dot"
              >
                CANCEL LINK
              </button>
            </div>
          ) : requiresPinEntry ? (
            <>
              <h2>Passcode Required</h2>
              <p className="receiver-desc">
                The sender {peerId || urlPeerId} requires a security PIN code to authorize this transmission channel.
              </p>

              <form onSubmit={handleVerifyPinSubmit} className="receiver-form">
                <div className="direct-link-info font-dot">
                  <span className="info-label">SENDER_ID:</span>
                  <code className="info-value">{peerId || urlPeerId}</code>
                </div>

                <div className="input-group">
                  <label className="input-label font-dot">SECURE_PIN // 4-DIGITS</label>
                  <input 
                    type="password" 
                    maxLength={4}
                    className="receiver-input font-dot passcode-input" 
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    autoFocus
                  />
                </div>

                {errorMsg && <div className="error-message-bar font-dot">{errorMsg}</div>}

                <button 
                  type="submit" 
                  className="establish-btn font-dot"
                >
                  VERIFY PASSCODE
                </button>
              </form>
            </>
          ) : (
            <>
              <h2>{urlPeerId ? 'Authorize Connection' : 'Establish P2P Receive Channel'}</h2>
              <p className="receiver-desc">
                {urlPeerId 
                  ? 'Connect to the sender device to inspect metadata. PIN code prompt will render dynamically if required.'
                  : 'Enter the Sender\'s Peer Connection ID. PIN code verification will prompt dynamically if required.'}
              </p>

              <form onSubmit={handleConnect} className="receiver-form">
                {urlPeerId ? (
                  <div className="direct-link-info font-dot">
                    <span className="info-label">TARGET_SENDER:</span>
                    <code className="info-value">{urlPeerId}</code>
                  </div>
                ) : (
                  <div className="input-group">
                    <label className="input-label font-dot">PEER_CONNECTION_ID</label>
                    <input 
                      type="text" 
                      className="receiver-input font-dot" 
                      value={peerId}
                      onChange={(e) => setPeerId(e.target.value.toUpperCase())}
                      placeholder="E.G. BEACON-8F92"
                    />
                  </div>
                )}

                {errorMsg && <div className="error-message-bar font-dot">{errorMsg}</div>}

                <button 
                  type="submit" 
                  className="establish-btn font-dot"
                >
                  ESTABLISH CHANNEL
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        // Connected Receive Deck Panel
        <div className="receiver-deck-wrapper">
          <div className="receiver-files-card panel">
            <span className="deck-screw top-left" aria-hidden="true" />
            <span className="deck-screw top-right" aria-hidden="true" />
            <span className="deck-screw bottom-left" aria-hidden="true" />
            <span className="deck-screw bottom-right" aria-hidden="true" />

            <div className="glyph-band" style={{ marginBottom: '1.25rem' }}>
              <span className="glyph-dot" aria-hidden="true" />
              <span className="file-meta">MODULE.P2P.INCOMING_QUEUE // ACTIVE</span>
            </div>

            <div className="linked-peer-spec">
              <div className="linked-peer-info">
                <span className="decor-led active" />
                <span className="linked-label font-dot">CONNECTED TO SENDER: {peerId}</span>
              </div>
              <button 
                onClick={handleRequestDownloadAll}
                className="receiver-download-all-btn font-dot"
                disabled={isAnyFileDownloading || filesList.every(f => f.status === 'finished')}
              >
                DOWNLOAD ALL
              </button>
            </div>

            {isRestoredSession && (
              <div className="restored-session-banner font-dot">
                <span className="decor-led ready" />
                <span>RECOVERY LINK ACTIVE // PROGRESS RESTORED FROM LOCAL STORAGE</span>
              </div>
            )}

            <div className="receiver-file-list-container">
              <ul className="receiver-file-list">
                {filesList.map((file, idx) => {
                  const isFinished = file.status === 'finished';
                  const isDownloading = file.status === 'downloading';
                  const isPaused = file.status === 'paused';
                  const isCancelled = file.status === 'cancelled';
                  const isError = file.status === 'error';
                  const isPending = !isFinished && !isDownloading && !isPaused && !isCancelled && !isError;
                  const mediaType = getMediaType(file.name);

                  return (
                    <li 
                      key={file.id || `${file.name}-${idx}`} 
                      className={`receiver-file-item ${isDownloading ? 'active' : ''} ${isFinished ? 'finished' : ''} ${isError ? 'error' : ''}`}
                    >
                      <div className="receiver-file-info">
                        <span className="receiver-file-name" title={file.name}>{file.name}</span>
                        <span className="receiver-file-type">{getFileType(file.name)} · {formatFileSize(file.size)}</span>
                      </div>

                      <div className="receiver-file-actions">
                        {/* Column 1: Play / View (media only) */}
                        {mediaType && (
                          <button 
                            type="button" 
                            className="media-preview-btn font-dot"
                            onClick={() => handleOpenMediaPreview(file, idx)}
                          >
                            {mediaType === 'video' ? '▶ PLAY' : mediaType === 'audio' ? '♫ PLAY' : '👁 VIEW'}
                          </button>
                        )}

                        {/* Column 2: Download / Pause / Resume */}
                        {isPending && (
                          <button 
                            className="file-action-btn download-action font-dot"
                            onClick={() => handleRequestDownload(idx)}
                            disabled={isAnyFileDownloading}
                          >
                            ↓ DOWNLOAD
                          </button>
                        )}
                        {isDownloading && (
                          <button 
                            className="file-action-btn pause-action font-dot"
                            onClick={() => handlePauseSingleTransfer(idx)}
                          >
                            ⏸ PAUSE
                          </button>
                        )}
                        {isPaused && (
                          <button 
                            className="file-action-btn download-action font-dot"
                            onClick={() => handleResumeSingleTransfer(idx)}
                          >
                            ▶ RESUME
                          </button>
                        )}
                        {isFinished && (
                          <button 
                            className="file-action-btn download-action font-dot"
                            onClick={() => handleSaveFinishedFile(idx)}
                          >
                            💾 SAVE
                          </button>
                        )}
                        {(isError || isCancelled) && (
                          <button 
                            className="file-action-btn download-action font-dot"
                            onClick={() => handleRequestDownload(idx)}
                            disabled={isAnyFileDownloading}
                          >
                            ↻ RETRY
                          </button>
                        )}

                        {/* Column 3: Cancel / Delete */}
                        {(isDownloading || isPaused) && (
                          <button 
                            className="file-action-btn cancel-action font-dot"
                            onClick={() => handleCancelSingleTransfer(idx)}
                          >
                            ✕ CANCEL
                          </button>
                        )}
                        {(isFinished || isCancelled || isError) && (
                          <button 
                            className="file-action-btn delete-action font-dot"
                            onClick={() => handleRemoveFile(idx)}
                          >
                            🗑 REMOVE
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Active Download Details Panel */}
          <div className="receiver-progress-card panel">
            <span className="deck-screw top-left" aria-hidden="true" />
            <span className="deck-screw top-right" aria-hidden="true" />
            <span className="deck-screw bottom-left" aria-hidden="true" />
            <span className="deck-screw bottom-right" aria-hidden="true" />

            <div className="progress-card-header">
              <span className="progress-card-title font-dot">DOWNLOAD_DECK_STATUS</span>
              <span className="progress-card-meta font-dot">SPEED: {transferSpeed} // ETA: {eta}</span>
            </div>

            <div className="deck-progress-container" style={{ margin: '1.25rem 0' }}>
              <div className="deck-progress-bar-wrapper">
                <div 
                  className="deck-progress-bar-fill" 
                  style={{ width: `${currentFileIndex >= filesList.length ? 100 : progress}%` }} 
                />
              </div>
              <span className="deck-progress-percentage font-dot">
                {currentFileIndex >= filesList.length ? 100 : progress}%
              </span>
            </div>

            <div className="receiver-deck-controls">
              <div className="deck-status-summary">
                <span className="summary-label font-dot">FILE_STAGE:</span>
                <span className="summary-value font-dot">
                  {currentFileIndex >= filesList.length 
                    ? 'ALL TRANSFERS COMPLETED' 
                    : `STREAMING FILE ${currentFileIndex + 1} OF ${filesList.length}`}
                </span>
              </div>
              <button onClick={handleDisconnect} className="disconnect-btn font-dot">
                DISCONNECT CHANNEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Themed Media Player Modal */}
      {activeMediaModal && (
        <ThemedMediaPlayer
          file={activeMediaModal.file}
          mediaUrl={activeMediaModal.url}
          mediaType={activeMediaModal.type}
          onClose={() => {
            if (activeMediaModal?.url) {
              URL.revokeObjectURL(activeMediaModal.url);
            }
            setActiveMediaModal(null);
          }}
        />
      )}
    </div>
  );
}


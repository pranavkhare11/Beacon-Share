import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Peer } from 'peerjs';
import './ReceiverPage.css';

// Helper to extract file extension/type
const getFileType = (name) => {
  const extMatch = name.match(/\.([^.]+)$/);
  return extMatch ? extMatch[1].toUpperCase() : 'FILE';
};

// Helper to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export default function ReceiverPage() {
  const { urlPeerId } = useParams();

  // Input states
  const [peerId, setPeerId] = useState(urlPeerId || '');
  const [pin, setPin] = useState('');

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

  // Keep references for async WebRTC closures
  const fileChunksRef = useRef([]);
  const filesListRef = useRef([]);
  const lastTimeRef = useRef(Date.now());
  const lastBytesRef = useRef(0);

  useEffect(() => {
    filesListRef.current = filesList;
  }, [filesList]);

  // Pre-fill Peer ID if it comes from the URL path
  useEffect(() => {
    if (urlPeerId) {
      setPeerId(urlPeerId);
    }
  }, [urlPeerId]);

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
        setIsConnecting(true);
        setErrorMsg('');
        const conn = peer.connect(urlPeerId);
        if (conn) {
          setupConnectionListeners(conn);
        } else {
          setIsConnecting(false);
          setErrorMsg('LINK_FAILED // CANNOT INITIALIZE CONNECTION');
        }
      }
    });

    peer.on('error', (err) => {
      console.error('PeerJS instance error:', err);
      setIsConnecting(false);
      setIsConnected(false);
      if (err.type === 'peer-unavailable') {
        setErrorMsg('PEER_UNAVAILABLE // SENDER IS OFFLINE');
      } else {
        setErrorMsg(`LINK_FAILED // ERROR_${err.type?.toUpperCase() || 'TIMEOUT'}`);
      }
    });

    return () => {
      peer.destroy();
      peerRef.current = null;
    };
  }, [urlPeerId]);

  // Shared connection handler
  const setupConnectionListeners = (conn) => {
    setActiveConnection(conn);

    const handleOpen = () => {
      console.log("WebRTC channel opened. Awaiting authentication status...");
      setErrorMsg('');
    };

    if (conn.open) {
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }

    conn.on('data', (data) => {
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
        setErrorMsg('INVALID PIN // ACCESS DENIED');
        conn.close();
        setIsConnecting(false);
        setIsConnected(false);
        setRequiresPinEntry(true); // Keep pin entry visible to retry
      }
      else if (data.type === 'meta') {
        console.log("Received P2P files metadata list:", data.files);
        setFilesList(data.files.map(f => ({ ...f, status: 'pending' })));
      }
      else if (data.type === 'start') {
        console.log(`Starting incoming stream for file index: ${data.fileIndex}`);
        setCurrentFileIndex(data.fileIndex);
        setProgress(0);
        fileChunksRef.current = [];
        lastTimeRef.current = Date.now();
        lastBytesRef.current = 0;

        setFilesList(prev => prev.map((f, idx) => {
          if (idx === data.fileIndex) {
            return { ...f, status: 'downloading' };
          }
          return f;
        }));
      }
      else if (data.type === 'chunk') {
        fileChunksRef.current.push(data.data);
        const file = filesListRef.current[data.fileIndex];
        
        if (file) {
          const currentSize = fileChunksRef.current.reduce((acc, c) => acc + c.byteLength, 0);
          const currentProgress = Math.min(100, Math.ceil((currentSize / file.size) * 100));
          setProgress(currentProgress);

          // Calculate speed & ETA every 500ms
          const now = Date.now();
          const deltaMs = now - lastTimeRef.current;
          if (deltaMs > 500) {
            const deltaBytes = currentSize - lastBytesRef.current;
            const speedBps = deltaBytes / (deltaMs / 1000);
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
        const file = filesListRef.current[data.fileIndex];
        if (file) {
          console.log(`File stream EOF reached for: ${file.name}. Reassembling Blob...`);
          
          // Reassemble chunks ArrayBuffers
          const blob = new Blob(fileChunksRef.current, { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          
          // Trigger file download in browser
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          setFilesList(prev => prev.map((f, idx) => {
            if (idx === data.fileIndex) {
              return { ...f, status: 'finished' };
            }
            return f;
          }));
        }
      }
    });

    conn.on('close', () => {
      console.log("WebRTC channel closed.");
      setIsConnected(false);
      setIsConnecting(false);
      setActiveConnection(null);
    });

    conn.on('error', (err) => {
      console.error("WebRTC link error:", err);
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
    if (!peerRef.current) {
      setErrorMsg('P2P ENGINE NOT INITIALIZED');
      return;
    }

    setErrorMsg('');
    setIsConnecting(true);

    const conn = peerRef.current.connect(peerId.trim());
    setupConnectionListeners(conn);
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

  // Request a single file download from Host
  const handleRequestDownload = (fileIndex) => {
    if (activeConnection && activeConnection.open) {
      setFilesList(prev => prev.map((f, idx) => {
        if (idx === fileIndex) {
          return { ...f, status: 'downloading' };
        }
        return f;
      }));
      activeConnection.send({ type: 'request_download', fileIndex });
    }
  };

  // Request all pending files download from Host
  const handleRequestDownloadAll = () => {
    if (activeConnection && activeConnection.open) {
      setFilesList(prev => prev.map(f => {
        if (f.status !== 'finished') {
          return { ...f, status: 'downloading' };
        }
        return f;
      }));
      activeConnection.send({ type: 'request_download_all' });
    }
  };

  // Disconnect handler
  const handleDisconnect = () => {
    if (activeConnection) {
      activeConnection.close();
    }
    setIsConnected(false);
    setProgress(0);
    setCurrentFileIndex(0);
    setFilesList([]);
    setPin('');
    setRequiresPinEntry(false);
  };

  const isAnyFileDownloading = filesList.some(f => f.status === 'downloading');

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
              <div className="loading-dots font-dot" style={{ fontSize: '0.72rem', letterSpacing: '0.12em', color: 'var(--text-faint)' }}>
                VERIFYING BEACON KEY
              </div>
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

            <div className="linked-peer-spec" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

            <div className="receiver-file-list-container">
              <ul className="receiver-file-list">
                {filesList.map((file, idx) => {
                  const isCurrent = idx === currentFileIndex;
                  const isFinished = file.status === 'finished';
                  const isDownloading = file.status === 'downloading';
                  return (
                    <li 
                      key={file.name} 
                      className={`receiver-file-item ${isCurrent && isDownloading ? 'active' : ''} ${isFinished ? 'finished' : ''}`}
                    >
                      <div className="receiver-file-info">
                        <span className="receiver-file-name" title={file.name}>{file.name}</span>
                        <span className="receiver-file-type">{getFileType(file.name)} FILE</span>
                      </div>
                      <div className="receiver-file-status">
                        <span className="receiver-file-size" style={{ marginRight: '8px' }}>{formatFileSize(file.size)}</span>
                        {isFinished ? (
                          <span className="status-badge finished font-dot">SAVED</span>
                        ) : isDownloading ? (
                          <span className="status-badge downloading font-dot">STREAMING</span>
                        ) : (
                          <button 
                            className="download-item-btn font-dot"
                            onClick={() => handleRequestDownload(idx)}
                            disabled={isAnyFileDownloading}
                          >
                            DOWNLOAD
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
    </div>
  );
}

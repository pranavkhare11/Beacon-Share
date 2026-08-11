import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Peer } from 'peerjs';
import './TransmissionDeck.css';

export default function TransmissionDeck({ filesList, setFilesList }) {
  const [isConnected, setIsConnected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState('0.00 MB/s');
  const [eta, setEta] = useState('N/A');
  
  // Security PIN states
  const [isPinRequired, setIsPinRequired] = useState(true);
  const [pinCode, setPinCode] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());
  const [copied, setCopied] = useState(false);

  // WebRTC / PeerInstance states
  const [isBeaconActive, setIsBeaconActive] = useState(false);
  const [myPeerId, setMyPeerId] = useState('');
  const [activeConnection, setActiveConnection] = useState(null);

  // Keep refs for closures inside Peer event handlers
  const isPinRequiredRef = useRef(isPinRequired);
  const pinCodeRef = useRef(pinCode);
  const filesListRef = useRef(filesList);
  const activeConnectionRef = useRef(activeConnection);
  
  // Transfer control & queue refs
  const pinAttemptsRef = useRef(new Map()); // peerId -> { attempts: number, lockedUntil: number }
  const cancelledFilesRef = useRef(new Set());
  const pausedFilesRef = useRef(new Set());
  const isTransferringRef = useRef(false);
  const transferQueueRef = useRef([]);

  useEffect(() => {
    isPinRequiredRef.current = isPinRequired;
    pinCodeRef.current = pinCode;
    filesListRef.current = filesList;
    activeConnectionRef.current = activeConnection;
  }, [isPinRequired, pinCode, filesList, activeConnection]);

  // Regenerate PIN whenever toggle is pressed
  const handlePinToggle = useCallback((checked) => {
    if (isBeaconActive) return; // Prevent pin toggle adjustments once active
    setIsPinRequired(checked);
    setPinCode(Math.floor(1000 + Math.random() * 9000).toString());
  }, [isBeaconActive]);

  // Handle share URL copy
  const handleCopyLink = useCallback(() => {
    if (!myPeerId) return;
    const shareUrl = `${window.location.origin}/receive/${myPeerId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [myPeerId]);

  // Helper to read File slice as ArrayBuffer
  const readSliceAsArrayBuffer = (slice) => slice.arrayBuffer();

  // Stream a single file at fileIndex chunk by chunk with event-driven backpressure & resume offset
  const streamSingleFile = async (conn, fileIndex, startOffset = 0) => {
    const filesToStream = filesListRef.current;
    const file = filesToStream[fileIndex];
    if (!file) {
      console.warn(`File index ${fileIndex} not found in current queue.`);
      return;
    }

    console.log(`Starting P2P WebRTC transfer for file: ${file.name} from offset ${startOffset}`);
    
    // Clear any previous cancel/pause flags for this file
    cancelledFilesRef.current.delete(fileIndex);
    pausedFilesRef.current.delete(fileIndex);

    // Send file header metadata
    try {
      conn.send({ type: 'start', fileIndex: fileIndex, fileName: file.name, fileSize: file.size, startOffset });
    } catch (err) {
      console.error("Failed to send transfer header:", err);
      return;
    }
    
    const chunkSize = 256 * 1024; // 256 KB chunks
    const maxBufferedBytes = 1 * 1024 * 1024; // High water mark: 1 MB
    const lowWaterMark = 256 * 1024; // Low water mark: 256 KB
    let offset = startOffset;
    
    let lastProgressTime = Date.now();
    let lastProgressBytes = offset;
    let transferFailed = false;

    while (offset < file.size) {
      // 1. Connection check
      if (!conn || !conn.open) {
        transferFailed = true;
        break;
      }

      // 2. Cancellation check
      if (cancelledFilesRef.current.has(fileIndex)) {
        console.log(`Transfer cancelled for file index ${fileIndex}`);
        conn.send({ type: 'transfer_cancelled', fileIndex });
        break;
      }

      // 3. Pause check
      while (pausedFilesRef.current.has(fileIndex)) {
        if (!conn.open || cancelledFilesRef.current.has(fileIndex)) break;
        await new Promise((res) => setTimeout(res, 200));
      }

      // 4. Event-driven backpressure check
      const rawChannel = conn.dataChannel;
      if (rawChannel && typeof rawChannel.bufferedAmount === 'number') {
        if (rawChannel.bufferedAmount > maxBufferedBytes) {
          rawChannel.bufferedAmountLowThreshold = lowWaterMark;
          await new Promise((resolve) => {
            const handleLow = () => {
              rawChannel.removeEventListener('bufferedamountlow', handleLow);
              resolve();
            };
            rawChannel.addEventListener('bufferedamountlow', handleLow);
            // Fallback timeout in case browser missed event
            setTimeout(() => {
              rawChannel.removeEventListener('bufferedamountlow', handleLow);
              resolve();
            }, 250);
          });
        }
      }

      // 5. Read slice and send chunk
      const slice = file.slice(offset, offset + chunkSize);
      try {
        const arrayBuffer = await readSliceAsArrayBuffer(slice);
        if (!conn.open) {
          transferFailed = true;
          break;
        }
        conn.send({
          type: 'chunk',
          fileIndex: fileIndex,
          data: arrayBuffer,
          offset: offset
        });
      } catch (err) {
        console.error("Slice reading / send error:", err);
        conn.send({ type: 'transfer_error', fileIndex, reason: 'FILE_READ_OR_SEND_FAILED' });
        transferFailed = true;
        break;
      }

      offset += chunkSize;
      const currentProgress = Math.min(100, Math.ceil((offset / file.size) * 100));
      setProgress(currentProgress);

      // Throttle progress & speed calculations to every 500ms
      const now = Date.now();
      if (now - lastProgressTime > 500) {
        const deltaBytes = offset - lastProgressBytes;
        const deltaTime = (now - lastProgressTime) / 1000;
        const speedBps = deltaTime > 0 ? deltaBytes / deltaTime : 0;
        const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
        setTransferSpeed(`${speedMBps} MB/s`);
        
        const remainingBytes = file.size - offset;
        const etaSecs = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
        setEta(etaSecs > 0 ? `${etaSecs}s` : 'COMPLETED');
        
        lastProgressTime = now;
        lastProgressBytes = offset;
      }
    }

    if (conn.open && !transferFailed && !cancelledFilesRef.current.has(fileIndex)) {
      conn.send({ type: 'eof', fileIndex: fileIndex });
      console.log(`Completed P2P WebRTC transfer for file: ${file.name}`);
      setTransferSpeed('0.00 MB/s');
      setEta('COMPLETED');
    } else {
      setTransferSpeed('0.00 MB/s');
      setEta('N/A');
    }
  };

  // Process transfer queue sequentially
  const processTransferQueue = async () => {
    if (isTransferringRef.current) return;
    isTransferringRef.current = true;

    while (transferQueueRef.current.length > 0) {
      const task = transferQueueRef.current.shift();
      if (task.conn && task.conn.open) {
        if (task.type === 'single') {
          await streamSingleFile(task.conn, task.fileIndex, task.offset || 0);
        } else if (task.type === 'all') {
          const filesToStream = filesListRef.current;
          for (let i = 0; i < filesToStream.length; i++) {
            if (!task.conn.open) break;
            await streamSingleFile(task.conn, i, 0);
          }
        }
      }
    }

    isTransferringRef.current = false;
  };

  const peerRef = useRef(null);
  const retryCountRef = useRef(0);

  const authenticatedClientsRef = useRef(new Map());

  const startBeacon = () => {
    if (peerRef.current) return;

    // Generate user-friendly random peer suffix
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    const generatedId = `BEACON-${randomSuffix}`;

    const peer = new Peer(generatedId, {
      debug: 1,
    });

    peerRef.current = peer;
    setIsBeaconActive(true);

    peer.on('open', (id) => {
      console.log("Registered host peer on signaling broker with ID:", id);
      setMyPeerId(id);
      retryCountRef.current = 0;
    });

    peer.on('error', (err) => {
      console.error('PeerJS Host instance error:', err);
      if (err.type === 'unavailable-id') {
        if (retryCountRef.current < 5) {
          retryCountRef.current += 1;
          console.warn(`Peer ID collision detected. Retrying with new suffix (Attempt ${retryCountRef.current})...`);
          if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
          }
          setTimeout(() => startBeacon(), 500);
          return;
        }
      }
      setIsBeaconActive(false);
      setMyPeerId('');
    });

    peer.on('connection', (conn) => {
      // 1. Close existing stale connection if peer is reconnecting or reloading
      if (activeConnectionRef.current) {
        console.log("Replacing previous connection with incoming reconnect transport link...");
        try {
          activeConnectionRef.current.close();
        } catch (e) { /* ignore */ }
      }

      conn.isAuthenticated = false;

      conn.on('open', () => {
        console.log("Incoming WebRTC transport link open.");
        const clientPeerId = conn.peer || 'remote';
        const lastAuthTime = authenticatedClientsRef.current.get(clientPeerId);
        const isRecentlyAuthed = lastAuthTime && (Date.now() - lastAuthTime < 10 * 60 * 1000);

        if (!isPinRequiredRef.current || isRecentlyAuthed) {
          conn.isAuthenticated = true; // Auto-authenticate on reconnect
          setActiveConnection(conn);
          setIsConnected(true);
          conn.send({ type: 'auth_success' });
          conn.send({ 
            type: 'meta', 
            files: filesListRef.current.map(f => ({ name: f.name, size: f.size, id: f.id })) 
          });
        } else {
          conn.send({ type: 'auth_required' });
        }
      });

      conn.on('data', (data) => {
        const clientPeerId = conn.peer || 'remote';

        // Ping/Pong Heartbeat
        if (data.type === 'ping') {
          if (conn.open) conn.send({ type: 'pong' });
          return;
        }

        if (data.type === 'auth_submit') {
          // Check PIN rate-limiting lockout
          const clientAttemptData = pinAttemptsRef.current.get(clientPeerId) || { attempts: 0, lockedUntil: 0 };
          const now = Date.now();

          if (now < clientAttemptData.lockedUntil) {
            const remainingSecs = Math.ceil((clientAttemptData.lockedUntil - now) / 1000);
            conn.send({ type: 'auth_locked', message: `TOO MANY FAILED ATTEMPTS. TRY AGAIN IN ${remainingSecs} SECONDS.` });
            return;
          }

          if (data.pin === pinCodeRef.current) {
            console.log("Secure authentication success. PIN matched.");
            pinAttemptsRef.current.delete(clientPeerId); // Reset on success
            authenticatedClientsRef.current.set(clientPeerId, Date.now()); // Store auth for 10m
            conn.isAuthenticated = true;
            setActiveConnection(conn);
            setIsConnected(true);
            conn.send({ type: 'auth_success' });
            conn.send({ 
              type: 'meta', 
              files: filesListRef.current.map(f => ({ name: f.name, size: f.size, id: f.id })) 
            });
          } else {
            console.warn("Secure authentication failed. Incorrect PIN.");
            clientAttemptData.attempts += 1;
            if (clientAttemptData.attempts >= 5) {
              clientAttemptData.lockedUntil = Date.now() + 3 * 60 * 1000; // 3 minute lockout
              console.warn(`Host locking out peer ${clientPeerId} for 3 minutes after 5 failed attempts.`);
              conn.send({ type: 'auth_locked', message: 'TOO MANY INCORRECT PIN ATTEMPTS. LOCKED FOR 3 MINUTES.' });
            } else {
              conn.send({ type: 'auth_failed', message: `INCORRECT PIN (${5 - clientAttemptData.attempts} ATTEMPTS REMAINING)` });
            }
            pinAttemptsRef.current.set(clientPeerId, clientAttemptData);
            setTimeout(() => conn.close(), 500);
          }
        }
        else if (data.type === 'request_download') {
          if (!conn.isAuthenticated) {
            console.warn("Rejected unauthenticated download request!");
            conn.close();
            return;
          }
          console.log(`Enqueuing download request for file index: ${data.fileIndex}, offset: ${data.offset || 0}`);
          transferQueueRef.current.push({ type: 'single', conn, fileIndex: data.fileIndex, offset: data.offset || 0 });
          processTransferQueue();
        } else if (data.type === 'request_download_all') {
          if (!conn.isAuthenticated) {
            console.warn("Rejected unauthenticated download request!");
            conn.close();
            return;
          }
          console.log("Enqueuing download request for all files");
          transferQueueRef.current.push({ type: 'all', conn });
          processTransferQueue();
        } else if (data.type === 'cancel_file') {
          console.log(`Received cancellation signal for file index ${data.fileIndex}`);
          cancelledFilesRef.current.add(data.fileIndex);
        } else if (data.type === 'pause_file') {
          console.log(`Received pause signal for file index ${data.fileIndex}`);
          pausedFilesRef.current.add(data.fileIndex);
        } else if (data.type === 'resume_file') {
          console.log(`Received resume signal for file index ${data.fileIndex}`);
          pausedFilesRef.current.delete(data.fileIndex);
          cancelledFilesRef.current.delete(data.fileIndex);
          // If the queue runner has fully exited (stream completed or was never running),
          // re-enqueue a fresh task from the receiver's current byte offset
          if (!isTransferringRef.current) {
            console.log(`Re-queuing stopped transfer for file index ${data.fileIndex} from offset ${data.offset || 0}`);
            transferQueueRef.current.push({ type: 'single', conn, fileIndex: data.fileIndex, offset: data.offset || 0 });
            processTransferQueue();
          }
        }
      });

      conn.on('close', () => {
        console.log("Host connection closed.");
        setIsConnected(false);
        setActiveConnection(null);
        transferQueueRef.current = [];
      });

      conn.on('error', (err) => {
        console.error('P2P connection error:', err);
        setIsConnected(false);
        setActiveConnection(null);
        transferQueueRef.current = [];
      });
    });
  };

  const stopBeacon = () => {
    if (activeConnection) {
      try {
        activeConnection.send({ type: 'host_closed', reason: 'Host manually stopped beacon.' });
      } catch (e) { /* ignore */ }
      activeConnection.close();
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setIsBeaconActive(false);
    setIsConnected(false);
    setActiveConnection(null);
    setMyPeerId('');
    setProgress(0);
    setTransferSpeed('0.00 MB/s');
    setEta('N/A');
    transferQueueRef.current = [];
  };

  // Window unload listener to broadcast tab close to active receiver
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeConnectionRef.current && activeConnectionRef.current.open) {
        try {
          activeConnectionRef.current.send({ type: 'host_closed', reason: 'Host tab closed or refreshed.' });
        } catch (e) { /* ignore */ }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  if (filesList.length === 0) {
    return null;
  }

  return (
    <div className="p2p-transmission-deck panel">
      {/* Mechanical Hardware Accent Screws */}
      <span className="deck-screw top-left" aria-hidden="true" />
      <span className="deck-screw top-right" aria-hidden="true" />
      <span className="deck-screw bottom-left" aria-hidden="true" />
      <span className="deck-screw bottom-right" aria-hidden="true" />

      <div className="deck-header">
        <div className="deck-status-group">
          <span className={`decor-led ${isConnected ? 'active' : isBeaconActive ? 'ready' : ''}`} />
          <span className="deck-status-text font-dot">
            {isConnected 
              ? 'PEER_CONNECTED // LINK_ACTIVE' 
              : isBeaconActive 
                ? 'WAITING_FOR_PEER // LNK.PENDING' 
                : 'BEACON_OFFLINE // INACTIVE'}
          </span>
        </div>
        <span className="deck-meta-spec font-dot">
          SPEED: {transferSpeed} // ETA: {eta}
        </span>
      </div>

      <div className="deck-progress-container">
        <div className="deck-progress-bar-wrapper">
          <div className="deck-progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="deck-progress-percentage font-dot">{progress}%</span>
      </div>

      <div className="deck-controls">
        <div className="deck-peer-display">
          <span className="deck-peer-label font-dot">YOUR_PEER_ID:</span>
          <div className="peer-id-badge-group">
            <code className="deck-peer-id font-dot">{myPeerId || 'BEACON_OFFLINE'}</code>
            <button 
              className={`copy-link-btn font-dot ${copied ? 'copied' : ''}`}
              onClick={handleCopyLink}
              disabled={!myPeerId}
              title="Copy shareable direct receive URL"
            >
              {copied ? 'LINK_COPIED' : 'COPY_LINK'}
            </button>
          </div>
        </div>

        {/* Security Settings with Switch Toggle */}
        <div className={`security-settings-group ${isBeaconActive ? 'disabled' : ''}`}>
          <label className="pin-toggle-container">
            <input 
              type="checkbox" 
              checked={isPinRequired} 
              onChange={(e) => handlePinToggle(e.target.checked)} 
              className="pin-checkbox-hidden"
              disabled={isBeaconActive}
            />
            <span className={`pin-switch ${isPinRequired ? 'enabled' : ''} ${isBeaconActive ? 'locked' : ''}`} />
            <span className="pin-toggle-label font-dot">SECURE_PIN // AUTH</span>
          </label>
          {isPinRequired && (
            <div className="pin-display-wrapper">
              <span className="pin-code font-dot">{pinCode}</span>
            </div>
          )}
        </div>

        <button 
          className={`deck-action-btn font-dot ${isBeaconActive ? 'active' : ''}`}
          onClick={isBeaconActive ? stopBeacon : startBeacon}
        >
          {isBeaconActive ? 'TERMINATE LINK' : 'AWAITING PEER LINK'}
        </button>
      </div>
    </div>
  );
}


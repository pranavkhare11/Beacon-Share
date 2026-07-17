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

  useEffect(() => {
    isPinRequiredRef.current = isPinRequired;
    pinCodeRef.current = pinCode;
    filesListRef.current = filesList;
  }, [isPinRequired, pinCode, filesList]);

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

  // Stream a single file at fileIndex chunk by chunk
  const streamSingleFile = async (conn, fileIndex) => {
    const filesToStream = filesListRef.current;
    const file = filesToStream[fileIndex];
    if (!file) return;

    console.log(`Starting P2P WebRTC transfer for file: ${file.name}`);
    
    // Send file header metadata
    conn.send({ type: 'start', fileIndex: fileIndex, fileName: file.name, fileSize: file.size });
    
    const chunkSize = 256 * 1024; // 256 KB chunks for better throughput
    const maxBufferedBytes = 1 * 1024 * 1024; // let the data channel drain before sending more
    let offset = 0;
    
    let lastProgressTime = Date.now();
    let lastProgressBytes = 0;

    while (offset < file.size) {
      // If connection got closed mid-transfer, break
      if (!conn.open) break;

      const rawChannel = conn.dataChannel;
      if (rawChannel && typeof rawChannel.bufferedAmount === 'number' && rawChannel.bufferedAmount > maxBufferedBytes) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }

      const slice = file.slice(offset, offset + chunkSize);
      try {
        const arrayBuffer = await readSliceAsArrayBuffer(slice);
        conn.send({
          type: 'chunk',
          fileIndex: fileIndex,
          data: arrayBuffer,
          offset: offset
        });
      } catch (err) {
        console.error("Slice reading error:", err);
        break;
      }

      offset += chunkSize;
      const currentProgress = Math.min(100, Math.ceil((offset / file.size) * 100));
      setProgress(currentProgress);

      // Throttle progress calculations to every 500ms
      const now = Date.now();
      if (now - lastProgressTime > 500) {
        const deltaBytes = offset - lastProgressBytes;
        const deltaTime = (now - lastProgressTime) / 1000;
        const speedBps = deltaBytes / deltaTime;
        const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);
        setTransferSpeed(`${speedMBps} MB/s`);
        
        const remainingBytes = file.size - offset;
        const etaSecs = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;
        setEta(etaSecs > 0 ? `${etaSecs}s` : 'COMPLETED');
        
        lastProgressTime = now;
        lastProgressBytes = offset;
      }

    }

    if (conn.open) {
      conn.send({ type: 'eof', fileIndex: fileIndex });
    }
    console.log(`Completed P2P WebRTC transfer for file: ${file.name}`);
    setTransferSpeed('0.00 MB/s');
    setEta('COMPLETED');
  };

  // Start chunked file streaming over RTCDataChannel for all files
  const startFileTransfer = async (conn) => {
    const filesToStream = filesListRef.current;
    if (filesToStream.length === 0) return;

    for (let i = 0; i < filesToStream.length; i++) {
      if (!conn.open) break;
      await streamSingleFile(conn, i);
    }
  };

  const peerRef = useRef(null);

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
    });

    peer.on('error', (err) => {
      console.error('PeerJS Host instance error:', err);
    });

    peer.on('connection', (conn) => {
      conn.isAuthenticated = false; // Initialize authentication state

      conn.on('open', () => {
        console.log("Secure Peer WebRTC link active.");
        if (!isPinRequiredRef.current) {
          conn.isAuthenticated = true; // Auto-authenticate
          setActiveConnection(conn);
          setIsConnected(true);
          conn.send({ type: 'auth_success' });
          conn.send({ 
            type: 'meta', 
            files: filesListRef.current.map(f => ({ name: f.name, size: f.size })) 
          });
        } else {
          conn.send({ type: 'auth_required' });
        }
      });

      conn.on('data', (data) => {
        if (data.type === 'auth_submit') {
          if (data.pin === pinCodeRef.current) {
            console.log("Secure authentication success. PIN matched.");
            conn.isAuthenticated = true; // Set authenticated
            setActiveConnection(conn);
            setIsConnected(true);
            conn.send({ type: 'auth_success' });
            conn.send({ 
              type: 'meta', 
              files: filesListRef.current.map(f => ({ name: f.name, size: f.size })) 
            });
          } else {
            console.warn("Secure authentication failed. Incorrect PIN.");
            conn.send({ type: 'auth_failed', message: 'INCORRECT PIN' });
            setTimeout(() => conn.close(), 500);
          }
        }
        else if (data.type === 'request_download') {
          if (!conn.isAuthenticated) {
            console.warn("Rejected unauthenticated download request!");
            conn.close();
            return;
          }
          console.log(`Received download request for file index: ${data.fileIndex}`);
          streamSingleFile(conn, data.fileIndex);
        } else if (data.type === 'request_download_all') {
          if (!conn.isAuthenticated) {
            console.warn("Rejected unauthenticated download request!");
            conn.close();
            return;
          }
          console.log("Received download request for all files");
          startFileTransfer(conn);
        }
      });

      conn.on('close', () => {
        setIsConnected(false);
        setActiveConnection(null);
      });

      conn.on('error', (err) => {
        console.error('P2P connection error:', err);
        setIsConnected(false);
        setActiveConnection(null);
      });
    });
  };

  const stopBeacon = () => {
    if (activeConnection) {
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
  };

  // Setup Peer instance destruction on unmount
  useEffect(() => {
    return () => {
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

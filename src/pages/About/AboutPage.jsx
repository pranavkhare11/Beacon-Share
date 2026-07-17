import React from 'react';
import './AboutPage.css';

export default function AboutPage() {
  return (
    <div className="about-page-container">
      <div className="about-card panel">
        {/* Hardware details */}
        <span className="deck-screw top-left" aria-hidden="true" />
        <span className="deck-screw top-right" aria-hidden="true" />
        <span className="deck-screw bottom-left" aria-hidden="true" />
        <span className="deck-screw bottom-right" aria-hidden="true" />

        <div className="glyph-band" style={{ marginBottom: '1.5rem' }}>
          <span className="glyph-dot" aria-hidden="true" />
          <span className="file-meta">MODULE.SYS.INFO // ARCHITECTURE</span>
        </div>

        <h2>ABOUT BEACON SHARE</h2>
        <p className="about-desc">
          Beacon Share is a decentralized, browser-to-browser P2P file transfer client. 
          It removes intermediate cloud servers, allowing direct device-to-device file streaming.
        </p>

        <hr className="divider-line" />

        <div className="specs-grid">
          <div className="spec-item">
            <span className="spec-label font-dot">CORE_PROTOCOL:</span>
            <span className="spec-value">WebRTC DataChannel</span>
          </div>
          <div className="spec-item">
            <span className="spec-label font-dot">SIGNALING_LAYER:</span>
            <span className="spec-value">PeerJS Cloud Broker</span>
          </div>
          <div className="spec-item">
            <span className="spec-label font-dot">ENCRYPTION:</span>
            <span className="spec-value">TLS / DTLS (End-to-End)</span>
          </div>
          <div className="spec-item">
            <span className="spec-label font-dot">DATA_PATH:</span>
            <span className="spec-value">Direct P2P Link</span>
          </div>
        </div>

        <hr className="divider-line" />

        <h3 className="section-subtitle font-dot">HOW IT WORKS</h3>
        <div className="step-list">
          <div className="step-item">
            <div className="step-num font-dot">01 / DISCOVERY</div>
            <div className="step-text">
              The sender registers a random Peer ID on the public signaling server. A secure, temporary connection path is created.
            </div>
          </div>
          <div className="step-item">
            <div className="step-num font-dot">02 / HANDSHAKE</div>
            <div className="step-text">
              The receiver initiates connection using the sender's Peer ID. If secure PIN is required, a dynamic dynamic handshake requests verification.
            </div>
          </div>
          <div className="step-item">
            <div className="step-num font-dot">03 / DIRECT FLOW</div>
            <div className="step-text">
              The files are sliced into 16KB binary chunks and piped directly over WebRTC. The receiver reassembles them into a Blob locally.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

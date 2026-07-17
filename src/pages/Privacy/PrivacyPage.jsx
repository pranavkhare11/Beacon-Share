import React from 'react';
import './PrivacyPage.css';

export default function PrivacyPage() {
  return (
    <div className="privacy-page-container">
      <div className="privacy-card panel">
        {/* Hardware details */}
        <span className="deck-screw top-left" aria-hidden="true" />
        <span className="deck-screw top-right" aria-hidden="true" />
        <span className="deck-screw bottom-left" aria-hidden="true" />
        <span className="deck-screw bottom-right" aria-hidden="true" />

        <div className="glyph-band" style={{ marginBottom: '1.5rem' }}>
          <span className="glyph-dot" aria-hidden="true" />
          <span className="file-meta">MODULE.SYS.PRIVACY // PROTOCOLS</span>
        </div>

        <h2>DATA PRIVACY SPECIFICATION</h2>
        <p className="privacy-desc">
          Beacon Share is built on decentralized design principles. Here is how your data is handled.
        </p>

        <hr className="divider-line" />

        <div className="privacy-sections">
          <div className="privacy-item">
            <span className="privacy-label font-dot">01 / ZERO_RETENTION_STORAGE</span>
            <p className="privacy-text">
              We do not own, maintain, or rent file storage servers. Your files exist only on your local file system, and are streamed memory-to-memory via transient WebRTC data structures. No permanent cloud storage footprint is created.
            </p>
          </div>

          <div className="privacy-item">
            <span className="privacy-label font-dot">02 / END_TO_END_SECURITY</span>
            <p className="privacy-text">
              All browser-to-browser data streams are authenticated and wrapped in DTLS encryption. Eavesdroppers, ISP routers, and intermediate internet backbones cannot decrypt, intercept, or inspect the packets.
            </p>
          </div>

          <div className="privacy-item">
            <span className="privacy-label font-dot">03 / EPHEMERAL_METADATA</span>
            <p className="privacy-text">
              Peer ID negotiation and ice-candidate discovery logs are routed through standard signaling brokers but never stored or inspected. Once either peer disconnects, the channel signature is instantly destroyed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

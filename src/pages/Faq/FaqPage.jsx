import React, { useState } from 'react';
import './FaqPage.css';

const FAQ_ITEMS = [
  {
    question: 'IS THERE A FILE SIZE LIMIT?',
    answer: 'No. Unlike traditional file sharing platforms that upload data to a server database, Beacon Share streams files directly in binary chunks (16KB) from one device\'s RAM/disk straight to the other. There is no file size ceiling, though performance depends on browser system capabilities.'
  },
  {
    question: 'ARE MY FILES STORED ON ANY INTERMEDIATE SERVERS?',
    answer: 'Absolutely not. Beacon Share is strictly Peer-to-Peer (P2P). Your file packets go directly from the sender browser session to the receiver browser session. The signaling broker is only used to establish connection metadata, never seeing or storing your file data.'
  },
  {
    question: 'WHY IS MY PEER CONNECTION FAILING TO ESTABLISH?',
    answer: 'WebRTC connections can sometimes be blocked by strict firewalls or corporate NAT routers. If the connection fails, make sure both devices are connected to standard network layouts (e.g. mobile hotspots or standard home Wi-Fi) and the sender session is active.'
  },
  {
    question: 'IS P2P TRANSMISSION ENCRYPTED?',
    answer: 'Yes. WebRTC RTCDataChannels are secured by default using DTLS (Datagram Transport Layer Security) encryption. This provides built-in end-to-end security, making it impossible for intermediate eavesdroppers to inspect your raw data streams.'
  }
];

export default function FaqPage() {
  const [activeIndex, setActiveIndex] = useState(null);

  const toggleAccordion = (index) => {
    setActiveIndex(prev => (prev === index ? null : index));
  };

  return (
    <div className="faq-page-container">
      <div className="faq-card panel">
        {/* Hardware details */}
        <span className="deck-screw top-left" aria-hidden="true" />
        <span className="deck-screw top-right" aria-hidden="true" />
        <span className="deck-screw bottom-left" aria-hidden="true" />
        <span className="deck-screw bottom-right" aria-hidden="true" />

        <div className="glyph-band" style={{ marginBottom: '1.5rem' }}>
          <span className="glyph-dot" aria-hidden="true" />
          <span className="file-meta">MODULE.SYS.FAQ // HELP_CENTER</span>
        </div>

        <h2>FREQUENTLY ASKED QUESTIONS</h2>
        <p className="faq-desc">
          Everything you need to know about secure decentralized P2P transfers.
        </p>

        <div className="faq-list">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = activeIndex === index;
            return (
              <div 
                key={index} 
                className={`faq-item ${isOpen ? 'open' : ''}`}
                onClick={() => toggleAccordion(index)}
              >
                <div className="faq-header">
                  <span className="faq-question font-dot">{item.question}</span>
                  <span className="faq-arrow">{isOpen ? '−' : '+'}</span>
                </div>
                <div className="faq-body">
                  <p className="faq-answer">{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

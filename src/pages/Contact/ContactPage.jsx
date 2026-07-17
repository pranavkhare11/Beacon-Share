import React, { useState } from 'react';
import './ContactPage.css';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !msg.trim()) return;
    
    setIsSent(true);
    setTimeout(() => {
      setIsSent(false);
      setName('');
      setEmail('');
      setMsg('');
    }, 3000);
  };

  return (
    <div className="contact-page-container">
      <div className="contact-card panel">
        {/* Hardware details */}
        <span className="deck-screw top-left" aria-hidden="true" />
        <span className="deck-screw top-right" aria-hidden="true" />
        <span className="deck-screw bottom-left" aria-hidden="true" />
        <span className="deck-screw bottom-right" aria-hidden="true" />

        <div className="glyph-band" style={{ marginBottom: '1.5rem' }}>
          <span className="glyph-dot" aria-hidden="true" />
          <span className="file-meta">MODULE.SYS.CONTACT // DISPATCHER</span>
        </div>

        <h2>SEND A SECURE TRANSMISSION</h2>
        <p className="contact-desc">
          Have feedback or run into connection issues? Submit a message below.
        </p>

        {isSent ? (
          <div className="contact-success-state">
            <span className="decor-led active" />
            <h3 className="font-dot">TRANSMISSION_SUCCESS // DIAL.OK</h3>
            <p>Your message has been dispatched successfully. Thank you.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="contact-form">
            <div className="input-group">
              <label className="input-label font-dot">USER_NAME</label>
              <input 
                type="text" 
                required
                className="contact-input font-dot" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="E.G. PEER_ONE"
              />
            </div>

            <div className="input-group">
              <label className="input-label font-dot">EMAIL_ROUTING</label>
              <input 
                type="email" 
                required
                className="contact-input font-dot" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="USER@ROUTER.COM"
              />
            </div>

            <div className="input-group">
              <label className="input-label font-dot">MESSAGE_PAYLOAD</label>
              <textarea 
                required
                rows={4}
                className="contact-textarea font-dot" 
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="ENTER PACKET DATA HERE..."
              />
            </div>

            <button type="submit" className="contact-submit-btn font-dot">
              DISPATCH PACKET
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

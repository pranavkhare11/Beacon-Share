import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle.jsx'
import './Navbar.css'

export default function Navbar() {
  return (
    <header className="app-header panel">
      <div className="navbar-content">
        <Link to="/" className="brand-link">
          <div className="header-brand">
            <img src="/logo.png" className="brand-logo" alt="Beacon Share Logo" />
            <div className="brand-title-group">
              <h1 className="brand-title">Beacon Share</h1>
              <span className="brand-subtitle">SYS.OP [BS-1001]</span>
            </div>
          </div>
        </Link>

        <nav className="site-nav">
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>

        <div className="navbar-right">
          <div className="navbar-decor" aria-hidden="true">
            <div className="decor-spec-group">
              <span className="decor-spec-label">NT.OS-V2.6.4</span>
              <span className="decor-spec-status">SYS.STATUS // OK</span>
            </div>

            <div className="decor-glyph-dial">
              <div className="waveform-line line-1" />
              <div className="waveform-line line-2" />
              <div className="waveform-line line-3" />
              <div className="waveform-line line-4" />
              <div className="waveform-line line-5" />
            </div>

            <div className="decor-hardware-group">
              <span className="decor-led" />
              <span className="decor-screw" />
              <span className="decor-shape-pill" />
            </div>
          </div>

          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

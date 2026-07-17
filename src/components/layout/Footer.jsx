import { Link } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="app-footer panel">
      <div className="glyph-band">
        <span className="glyph-dot" />
        <span>© {new Date().getFullYear()} Beacon Share // NT.OS</span>
      </div>
      <nav className="site-nav">
        <Link to="/about">About</Link>
        <Link to="/contact">Contact</Link>
        <Link to="/privacy">Privacy</Link>
      </nav>
    </footer>
  )
}

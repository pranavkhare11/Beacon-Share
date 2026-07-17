import { useTheme } from '../../context/ThemeContext.jsx'
import './ThemeToggle.css'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      className="toggle-container"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      aria-label="Toggle Theme"
    >
      <div className={`toggle-dial ${theme === 'dark' ? 'dark' : ''}`}>
        {/* Mechanical dial markings */}
        <span className="dial-marking dial-marking-1" />
        <span className="dial-marking dial-marking-2" />
        <span className="dial-marking dial-marking-3" />
        <span className="dial-marking dial-marking-4" />

        {/* Dynamic icon wrapper */}
        <div className="icon-wrapper">
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </div>

        {/* Mechanical active status led indicator */}
        <span className="led-indicator" />
      </div>
    </button>
  )
}

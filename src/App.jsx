import { ThemeProvider } from './context/ThemeContext.jsx'
import AppRouter from './routes/Router.jsx'

export default function App() {
  return (
    <ThemeProvider>
      <AppRouter />
    </ThemeProvider>
  )
}

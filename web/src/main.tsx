import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import App from './app/App'
import { AppDataProvider } from './app/AppDataContext'
import { useAppData } from './app/AppDataContext'
import '@fontsource-variable/manrope'
import './styles/global.css'

function MotionPreferences({ children }: { children: React.ReactNode }) {
  const { data } = useAppData()
  return <MotionConfig reducedMotion={data.preferences.reducedMotion ? 'always' : 'user'}>{children}</MotionConfig>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppDataProvider>
        <MotionPreferences>
          <App />
        </MotionPreferences>
      </AppDataProvider>
    </BrowserRouter>
  </StrictMode>,
)

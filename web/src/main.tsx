import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import { AuthProvider } from './app/AuthContext'
import { AppDataProvider } from './app/AppDataContext'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppDataProvider>
          <App />
        </AppDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

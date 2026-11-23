import { BookOpen, LogOut, Menu, Sparkles, Wifi, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { pageDetails } from '../../app/navigation'
import { useAuth } from '../../app/AuthContext'
import { useAppData } from '../../app/AppDataContext'

type AppHeaderProps = {
  onMenuClick: () => void
  menuOpen: boolean
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

export default function AppHeader({ onMenuClick, menuOpen }: AppHeaderProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { signOut, actionInProgress } = useAuth()
  const { data } = useAppData()
  const online = useOnlineStatus()
  const detail = pageDetails[pathname] ?? (pathname.startsWith('/courses/')
    ? { title: 'Course details', eyebrow: 'Your study library' }
    : pathname.startsWith('/lessons/')
      ? { title: 'Lesson', eyebrow: 'Your study library' }
      : { title: 'Workspace', eyebrow: 'Overseer' })
  const handleSignOut = async () => {
    if (await signOut()) navigate('/', { replace: true })
  }

  return (
    <header className="app-header">
      <div className="app-header__heading">
        <button
          className="icon-button menu-button"
          type="button"
          onClick={onMenuClick}
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div>
          <p className="header-eyebrow">{detail.eyebrow}</p>
          <h1>{detail.title}</h1>
        </div>
      </div>

      <div className="app-header__actions">
        <div className={`connection-status${online ? '' : ' connection-status--offline'}`} title={online ? 'You are online' : 'You are offline'}>
          {online ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
          <span>{online ? 'Online' : 'Offline'}</span>
        </div>
        <span className="ai-status"><Sparkles size={14} aria-hidden="true" /><span>AI not configured</span></span>
        <Link className="icon-button header-search" to="/library" aria-label="Open study library"><BookOpen size={18} /></Link>
        <Link to="/settings" className="profile-button" aria-label="Open settings">
          <span className="profile-avatar">{(data.preferences.displayName || 'S').trim().slice(0, 2).toUpperCase()}</span>
          <span className="profile-name">{data.preferences.displayName || 'Student'}</span>
        </Link>
        <button className="icon-button" type="button" onClick={() => void handleSignOut()} disabled={actionInProgress} aria-label="Sign out" title="Sign out">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  )
}

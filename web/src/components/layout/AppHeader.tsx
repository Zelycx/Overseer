import { CircleUserRound, Command, Menu, Plus, Wifi, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { pageDetails } from '../../app/navigation'
import { useAppData } from '../../app/AppDataContext'

type AppHeaderProps = {
  onMenuClick: () => void
  onCommandClick: () => void
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

export default function AppHeader({ onMenuClick, onCommandClick, menuOpen }: AppHeaderProps) {
  const { pathname } = useLocation()
  const { data } = useAppData()
  const online = useOnlineStatus()
  const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'
  const detail = pageDetails[pathname] ?? (pathname.startsWith('/courses/')
    ? { title: 'Course details', eyebrow: 'Your study library' }
    : pathname.startsWith('/lessons/')
      ? { title: 'Lesson', eyebrow: 'Your study library' }
      : { title: 'Workspace', eyebrow: 'Overseer' })

  return (
    <header className="app-header">
      <div className="app-header__heading">
        <button
          className="icon-button menu-button"
          type="button"
          onClick={onMenuClick}
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="overseer-navigation"
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
        <button className="header-command-trigger" type="button" onClick={onCommandClick} aria-label="Search workspace and open commands" aria-keyshortcuts="Control+K Meta+K">
          <Command size={16} aria-hidden="true" /><span>Search workspace</span><kbd>{shortcutLabel}</kbd>
        </button>
        <Link to="/tasks?new=1" className="button button--primary button--small header-quick-action"><Plus size={15} /><span>New task</span></Link>
        <Link to="/settings" className="profile-button" aria-label="Open settings">
          <span className="profile-avatar">{data.preferences.displayName ? data.preferences.displayName.trim().slice(0, 2).toUpperCase() : <CircleUserRound size={17} aria-hidden="true" />}</span>
          <span className="profile-name">{data.preferences.displayName || 'Settings'}</span>
        </Link>
      </div>
    </header>
  )
}

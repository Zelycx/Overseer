import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import AppHeader from './AppHeader'
import AppSidebar from './AppSidebar'
import { useAuth } from '../../app/AuthContext'
import { useAppData } from '../../app/AppDataContext'

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { error: authError } = useAuth()
  const { storageError } = useAppData()

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <AppSidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="app-main">
        <AppHeader onMenuClick={() => setMenuOpen((open) => !open)} menuOpen={menuOpen} />
        {storageError && <div className="storage-error-banner" role="alert">{storageError}</div>}
        <main className="page-content" id="main-content">
          {authError && <p className="inline-notice inline-notice--error" role="alert">{authError}</p>}
          <Outlet />
        </main>
      </div>
    </div>
  )
}

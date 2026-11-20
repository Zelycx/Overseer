import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import AppHeader from './AppHeader'
import AppSidebar from './AppSidebar'

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <AppSidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="app-main">
        <AppHeader onMenuClick={() => setMenuOpen((open) => !open)} menuOpen={menuOpen} />
        <main className="page-content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

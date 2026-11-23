import { useState } from 'react'
import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import AppHeader from './AppHeader'
import AppSidebar from './AppSidebar'
import { useAuth } from '../../app/AuthContext'
import { useAppData } from '../../app/AppDataContext'
import GlobalCommandPalette from './GlobalCommandPalette'

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const { error: authError } = useAuth()
  const { data, update, storageError } = useAppData()
  const location = useLocation()
  const pathname = location.pathname
  const reduceMotion = useReducedMotion()
  const collapsed = Boolean(data?.preferences?.sidebarCollapsed)

  return (
    <div className={`app-shell${collapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <AppSidebar open={menuOpen} collapsed={collapsed} onNavigate={() => setMenuOpen(false)} onToggleCollapsed={() => update({ preferences: { ...data.preferences, sidebarCollapsed: !collapsed } })} />
      <div className="app-main" aria-hidden={menuOpen || undefined}>
        <AppHeader onMenuClick={() => setMenuOpen((open) => !open)} onCommandClick={() => setCommandOpen(true)} menuOpen={menuOpen} />
        {storageError && <div className="storage-error-banner" role="alert">{storageError}</div>}
        <main className="page-content" id="main-content">
          <Suspense fallback={<div className="page-loading" role="status">Loading page…</div>}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="route-transition"
                key={pathname}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
              >
                {authError && <p className="inline-notice inline-notice--error" role="alert">{authError}</p>}
          <Outlet />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
      <GlobalCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}

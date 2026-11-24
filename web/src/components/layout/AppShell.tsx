import { useEffect, useState } from 'react'
import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import AppHeader from './AppHeader'
import AppSidebar from './AppSidebar'
import { useAppData } from '../../app/AppDataContext'
import GlobalCommandPalette from './GlobalCommandPalette'

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const { data, storageError, update } = useAppData()
  const { pathname } = useLocation()
  const systemReducedMotion = useReducedMotion()
  const collapsed = data.preferences.sidebarCollapsed
  const reduceMotion = data.preferences.reducedMotion || systemReducedMotion

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const sidebar = document.querySelector<HTMLElement>('.sidebar')
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const getFocusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [])
    getFocusable()[0]?.focus()
    const handleDrawerKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); return }
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', handleDrawerKeys)
    return () => {
      window.removeEventListener('keydown', handleDrawerKeys)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [menuOpen])

  return (
    <div className={`app-shell${collapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <AppSidebar open={menuOpen} collapsed={collapsed} onNavigate={() => setMenuOpen(false)} onToggleCollapsed={() => update({ preferences: { ...data.preferences, sidebarCollapsed: !collapsed } })} />
      <div className="app-main" aria-hidden={menuOpen || undefined}>
        <AppHeader onMenuClick={() => setMenuOpen((open) => !open)} menuOpen={menuOpen} />
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

import { ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { primaryNavigation, settingsNavigation, workspaceNavigation, type NavigationItem } from '../../app/navigation'
import { useAppData } from '../../app/AppDataContext'

type AppSidebarProps = {
  open: boolean
  collapsed: boolean
  onNavigate: () => void
  onToggleCollapsed: () => void
}

function NavigationGroup({ title, items, onNavigate, collapsed }: { title: string; items: NavigationItem[]; onNavigate: () => void; collapsed: boolean }) {
  return (
    <div className="nav-group">
      <p className="nav-group__title">{title}</p>
      <nav aria-label={title}>
        {items.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
            end={to === '/dashboard'}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function AppSidebar({ open, collapsed, onNavigate, onToggleCollapsed }: AppSidebarProps) {
  const { data } = useAppData()
  return (
    <aside id="overseer-navigation" className={`sidebar${open ? ' sidebar--open' : ''}${collapsed ? ' sidebar--collapsed' : ''}`} aria-label="Main navigation" role={open ? 'dialog' : undefined} aria-modal={open || undefined}>
      <div className="sidebar-brand-row">
      <NavLink to="/dashboard" className="brand" onClick={onNavigate} aria-label="Overseer dashboard">
        <span className="brand__word">Overseer</span>
      </NavLink>
      <button type="button" className="sidebar-collapse-toggle" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>
      </div>

      <div className="workspace-switcher">
        <span className="workspace-switcher__avatar"><GraduationCap size={17} aria-hidden="true" /></span>
        <span className="workspace-switcher__copy"><strong>{data.preferences.displayName || 'My workspace'}</strong><small>Local workspace</small></span>
        <span className="workspace-switcher__dots" aria-hidden="true">···</span>
      </div>

      <NavigationGroup title="Workspace" items={primaryNavigation} onNavigate={onNavigate} collapsed={collapsed} />
      <NavigationGroup title="Study tools" items={workspaceNavigation} onNavigate={onNavigate} collapsed={collapsed} />
      <div className="sidebar-bottom" />
    </aside>
  )
}

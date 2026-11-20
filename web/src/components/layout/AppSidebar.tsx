import { GraduationCap } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { primaryNavigation, settingsNavigation, workspaceNavigation, type NavigationItem } from '../../app/navigation'

type AppSidebarProps = {
  open: boolean
  onNavigate: () => void
}

function NavigationGroup({ title, items, onNavigate }: { title: string; items: NavigationItem[]; onNavigate: () => void }) {
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
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function AppSidebar({ open, onNavigate }: AppSidebarProps) {
  return (
    <aside className={`sidebar${open ? ' sidebar--open' : ''}`} aria-label="Main navigation">
      <NavLink to="/dashboard" className="brand" onClick={onNavigate} aria-label="Overseer dashboard">
        <span className="brand__mark"><span /></span>
        <span className="brand__word">overseer</span>
      </NavLink>

      <div className="workspace-switcher">
        <span className="workspace-switcher__avatar"><GraduationCap size={17} aria-hidden="true" /></span>
        <span className="workspace-switcher__copy"><strong>My workspace</strong><small>Personal</small></span>
        <span className="workspace-switcher__dots" aria-hidden="true">···</span>
      </div>

      <NavigationGroup title="Workspace" items={primaryNavigation} onNavigate={onNavigate} />
      <NavigationGroup title="Study tools" items={workspaceNavigation} onNavigate={onNavigate} />
      <NavigationGroup title="Your account" items={settingsNavigation} onNavigate={onNavigate} />

      <div className="sidebar-bottom">
        <div className="sidebar-tip">
          <span className="sidebar-tip__icon"><span aria-hidden="true">✳</span></span>
          <p><strong>Small steps count.</strong><br />A little progress adds up.</p>
        </div>
        <div className="sidebar-help"><span>Help & feedback</span></div>
        <p className="sidebar-version">OVERSEER · PREVIEW</p>
      </div>
    </aside>
  )
}

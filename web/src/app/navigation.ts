import {
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Focus,
  Sparkles,
  LayoutDashboard,
  Clock3,
  ListTodo,
  NotebookPen,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type NavigationItem = {
  label: string
  to: string
  icon: LucideIcon
}

export const primaryNavigation: NavigationItem[] = [
{ label: 'Study', to: '/library', icon: BookOpen },
{ label: 'Study assistant', to: '/assistant', icon: Sparkles},
  
  
  
]

export const workspaceNavigation: NavigationItem[] = [
  { label: 'Day planner', to: '/day-planner', icon: NotebookPen },
{ label: 'Schedule', to: '/schedule', icon: CalendarDays },
  { label: 'Tasks', to: '/tasks', icon: ListTodo },
  
]

export const settingsNavigation: NavigationItem[] = [
{ label: 'Focus', to: '/focus', icon: Clock3 },
  { label: 'Progress', to: '/progress', icon: ChartNoAxesCombined },
]

export const pageDetails: Record<string, { title: string; eyebrow: string }> = {
  '/dashboard': { title: 'Home', eyebrow: 'Your workspace' },
  '/schedule': { title: 'Schedule', eyebrow: 'Make room for what matters' },
  '/day-planner': { title: 'Day planner', eyebrow: 'A realistic plan for today' },
  '/tasks': { title: 'Tasks', eyebrow: 'Keep every next step in view' },
  '/library': { title: 'Study', eyebrow: 'Your courses and materials' },
  '/library/import': { title: 'Import material', eyebrow: 'Bring your notes into Overseer' },
  '/assistant': { title: 'Study assistant', eyebrow: 'Learn with your course context' },
  '/focus': { title: 'Focus', eyebrow: 'One session at a time' },
  '/progress': { title: 'Progress', eyebrow: 'See how your work adds up' },
  '/settings': { title: 'Settings', eyebrow: 'Make Overseer yours' },
}

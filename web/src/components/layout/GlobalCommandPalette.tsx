import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, CalendarDays, CircleHelp, Command, Focus, LayoutDashboard, ListTodo, NotebookPen, Plus, Search, Settings, ChartNoAxesCombined, type LucideIcon } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../../app/AppDataContext'

type CommandItem = {
  id: string
  label: string
  detail: string
  group: string
  icon: LucideIcon
  to: string
}

const navigation: CommandItem[] = [
  { id: 'dashboard', label: 'Home', detail: 'Your workspace overview', group: 'Navigate', icon: LayoutDashboard, to: '/dashboard' },
  { id: 'schedule', label: 'Schedule', detail: 'Classes and events', group: 'Navigate', icon: CalendarDays, to: '/schedule' },
  { id: 'planner', label: 'Day planner', detail: 'Plan a day with breathing room', group: 'Navigate', icon: NotebookPen, to: '/day-planner' },
  { id: 'tasks', label: 'Tasks', detail: 'Review and organize your tasks', group: 'Navigate', icon: ListTodo, to: '/tasks' },
  { id: 'library', label: 'Study', detail: 'Courses, lessons, and materials', group: 'Navigate', icon: BookOpen, to: '/library' },
  { id: 'focus', label: 'Focus', detail: 'Open your focus timer', group: 'Navigate', icon: Focus, to: '/focus' },
  { id: 'progress', label: 'Progress', detail: 'Review study activity', group: 'Navigate', icon: ChartNoAxesCombined, to: '/progress' },
  { id: 'assistant', label: 'Study assistant', detail: 'View the assistant status', group: 'Navigate', icon: CircleHelp, to: '/assistant' },
  { id: 'settings', label: 'Settings', detail: 'Appearance and local data', group: 'Navigate', icon: Settings, to: '/settings' },
]

const actions: CommandItem[] = [
  { id: 'new-task', label: 'Create a task', detail: 'Open the task form', group: 'Quick actions', icon: Plus, to: '/tasks?new=1' },
  { id: 'new-event', label: 'Add a schedule event', detail: 'Open the event form', group: 'Quick actions', icon: CalendarDays, to: '/schedule?new=1' },
  { id: 'start-focus', label: 'Start a focus session', detail: 'Open and start the timer', group: 'Quick actions', icon: Focus, to: '/focus?start=1' },
]

export default function GlobalCommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data } = useAppData()
  const navigate = useNavigate()
  const shortcutModifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matches = useMemo(() => {
    const savedItems: CommandItem[] = normalizedQuery ? [
      ...data.courses.map((course): CommandItem => ({ id: `course-${course.id}`, label: course.name, detail: `${course.code || 'Course'} · Study library`, group: 'Courses', icon: BookOpen, to: `/courses/${course.id}` })),
      ...data.lessons.map((lesson): CommandItem => ({ id: `lesson-${lesson.id}`, label: lesson.title, detail: `${data.courses.find((course) => course.id === lesson.courseId)?.name ?? 'Study library'} · Lesson`, group: 'Lessons', icon: BookOpen, to: `/lessons/${lesson.id}` })),
    ] : []
    return [...navigation, ...actions, ...savedItems].filter((item) => !normalizedQuery || `${item.label} ${item.detail} ${item.group}`.toLocaleLowerCase().includes(normalizedQuery))
  }, [data.courses, data.lessons, normalizedQuery])

  useEffect(() => { setActiveIndex(0) }, [normalizedQuery])
  useEffect(() => { if (open) { setQuery(''); setActiveIndex(0) } }, [open])

  const choose = (item: CommandItem) => {
    onOpenChange(false)
    navigate(item.to)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, matches.length - 1)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && matches[activeIndex]) {
      event.preventDefault()
      choose(matches[activeIndex])
    }
  }

  const groups = [...new Set(matches.map((item) => item.group))]

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="command-overlay" />
      <Dialog.Content className="command-dialog" aria-describedby="command-description" onOpenAutoFocus={() => { openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }} onCloseAutoFocus={(event: Event) => { event.preventDefault(); openerRef.current?.focus() }}>
        <div className="command-dialog__search"><Search size={19} aria-hidden="true" /><input ref={inputRef} autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleInputKeyDown} placeholder="Search pages, courses, and lessons" aria-label="Search pages, courses, and lessons" role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={matches[activeIndex] ? `command-option-${matches[activeIndex].id}` : undefined} /><kbd>ESC</kbd></div>
        <Dialog.Title className="visually-hidden">Search workspace and commands</Dialog.Title>
        <Dialog.Description id="command-description" className="visually-hidden">Navigate to a page, find a course or lesson, or run a workspace action.</Dialog.Description>
        <div className="command-results" id="command-results" role="listbox" aria-label="Workspace commands">
          {groups.map((group) => <div className="command-group" role="group" aria-label={group} key={group}>
            <p className="command-group__title">{group}</p>
            {matches.map((item, index) => item.group === group ? <button id={`command-option-${item.id}`} key={item.id} type="button" role="option" aria-selected={index === activeIndex} className={`command-option${index === activeIndex ? ' command-option--active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}>
              <span className="command-option__icon"><item.icon size={17} aria-hidden="true" /></span><span className="command-option__copy"><strong>{item.label}</strong><small>{item.detail}</small></span><Command className="command-option__enter" size={14} aria-hidden="true" />
            </button> : null)}
          </div>)}
          {matches.length === 0 && <div className="command-empty"><Search size={19} /><strong>No matches found</strong><span>Try a page, course, or lesson title.</span></div>}
        </div>
        <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span><span><kbd>{shortcutModifier}</kbd><kbd>K</kbd> to toggle</span></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

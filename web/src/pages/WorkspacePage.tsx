import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileUp, Flame, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import { useAppData } from '../app/AppDataContext'
import { addDays, durationLabel, eventOccursOnDate, formatDate, formatTime, isValidTime, localDateKey, parseLocalDate, startOfWeek } from '../data/dates'
import { createId, loadLegacyAppData, mergeAppData, parseImportData, STORAGE_VERSION } from '../data/storage'
import { saveUserPreferences, subscribeUserPreferences } from '../data/firestore/repositories/preferences'
import type { AccentColor, AppearanceMode, AppearancePreset, AppData, Course, EventColor, EventType, FocusMode, LayoutDensity, Lesson, PlannerBlock, Priority, ScheduleEvent, StudyMaterial, Task, UserPreferences } from '../types/app'
import Badge from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import Card from '../components/ui/Card'
import ProgressBar from '../components/ui/ProgressBar'
import SectionHeading from '../components/ui/SectionHeading'
import type { CourseChartPoint, FocusChartPoint, StudyActivityPoint } from '../components/charts/ProgressCharts'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/primitives/alert-dialog'

type PageKey = 'schedule' | 'dayPlanner' | 'tasks' | 'library' | 'import' | 'course' | 'lesson' | 'assistant' | 'focus' | 'progress' | 'settings' | 'notFound'

const ProgressCharts = lazy(() => import('../components/charts/ProgressCharts'))

const empty = (text: string) => <p className="empty-copy">{text}</p>
const stamp = () => new Date().toISOString()

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`form-field ${className}`}><span>{label}</span>{children}</label>
}

function InlineNotice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' | 'success' }) {
  return <p className={`inline-notice inline-notice--${tone}`} role="status">{children}</p>
}

function CountUp({ value, reducedMotion }: { value: number; reducedMotion: boolean }) {
  const systemReducedMotion = useReducedMotion()
  const [displayed, setDisplayed] = useState(() => reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0)

  useEffect(() => {
    if (reducedMotion || systemReducedMotion) { setDisplayed(value); return }
    const duration = 560
    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      setDisplayed(Math.round(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [value, reducedMotion, systemReducedMotion])

  return <>{displayed}</>
}

function ConfirmAction({ children, title, description, onConfirm }: { children: ReactElement; title: string; description: string; onConfirm: () => void }) {
  return <AlertDialog><AlertDialogTrigger asChild>{children}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onConfirm}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
}

function courseName(courses: Course[], id: string | null): string {
  return courses.find((course) => course.id === id)?.name ?? 'Personal'
}

function TaskEditor({ initial, courses, onSave, onCancel }: { initial?: Task; courses: Course[]; onSave: (task: Task) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [dueTime, setDueTime] = useState(initial?.dueTime ?? '')
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'Medium')
  const [courseId, setCourseId] = useState(initial?.courseId ?? '')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) { setError('Enter a task title.'); return }
    if (dueTime && !isValidTime(dueTime)) { setError('Enter a valid due time.'); return }
    onSave({ id: initial?.id ?? createId('task'), title: title.trim(), description: description.trim(), dueDate: dueDate || null, dueTime: dueTime || null, priority, courseId: courseId || null, completed: initial?.completed ?? false, createdAt: initial?.createdAt ?? stamp(), completedAt: initial?.completedAt ?? null })
  }
  return <form className="editor-form" onSubmit={submit}>
    <div className="form-grid"><Field label="Task title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></Field><Field label="Course"><select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">Personal / no course</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></Field><Field label="Due date"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field><Field label="Due time"><input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} /></Field><Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option>Low</option><option>Medium</option><option>High</option></select></Field></div>
    <Field label="Description"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
    {error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-actions"><Button type="submit">{initial ? 'Save changes' : 'Create task'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form>
}

function EventEditor({ initial, courses, date, existing, onSave, onCancel }: { initial?: ScheduleEvent; courses: Course[]; date: string; existing: ScheduleEvent[]; onSave: (event: ScheduleEvent) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [eventDate, setEventDate] = useState(initial?.date ?? date)
  const [repeatWeekly, setRepeatWeekly] = useState(initial?.repeatWeekly ?? false)
  const [startTime, setStartTime] = useState(initial?.startTime ?? '09:00')
  const [endTime, setEndTime] = useState(initial?.endTime ?? '10:00')
  const [type, setType] = useState<EventType>(initial?.type ?? 'study')
  const [courseId, setCourseId] = useState(initial?.courseId ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [color, setColor] = useState<EventColor>(initial?.color ?? 'navy')
  const [error, setError] = useState('')
  const conflicts = existing.filter((event) => event.id !== initial?.id && eventOccursOnDate(event, eventDate) && startTime < event.endTime && endTime > event.startTime)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) { setError('Enter an event title.'); return }
    if (!eventDate || !isValidTime(startTime) || !isValidTime(endTime) || endTime <= startTime) { setError('Choose a date and make sure the end time is after the start time.'); return }
    onSave({ id: initial?.id ?? createId('event'), title: title.trim(), description: description.trim(), date: eventDate, repeatWeekly, startTime, endTime, type, courseId: courseId || null, location: location.trim(), color, createdAt: initial?.createdAt ?? stamp() })
  }
  return <form className="editor-form" onSubmit={submit}>
    <div className="form-grid"><Field label="Event title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></Field><Field label="Type"><select value={type} onChange={(e) => setType(e.target.value as EventType)}><option value="class">Class</option><option value="study">Study</option><option value="personal">Personal</option><option value="other">Other</option></select></Field><Field label="Date"><input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required /></Field><Field label="Course"><select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">No course</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></Field><Field label="Start"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></Field><Field label="End"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></Field><Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} /></Field><Field label="Color"><select value={color} onChange={(e) => setColor(e.target.value as EventColor)}><option value="navy">Navy</option><option value="lime">Lime</option><option value="blue">Blue</option><option value="amber">Amber</option></select></Field></div>
    <label className="setting-toggle event-repeat-toggle"><span><strong>Repeat weekly</strong><small>Keep this event on the same weekday.</small></span><input type="checkbox" checked={repeatWeekly} onChange={(e) => setRepeatWeekly(e.target.checked)} /><span className="setting-toggle__track" aria-hidden="true"><span /></span></label>
    <Field label="Description"><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
    {conflicts.length > 0 && <InlineNotice tone="info">Schedule conflict: this overlaps {conflicts.map((item) => item.title).join(', ')}. Review the time before saving.</InlineNotice>}{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-actions"><Button type="submit">{initial ? 'Save changes' : 'Create event'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form>
}

function CourseEditor({ initial, onSave, onCancel }: { initial?: Course; onSave: (course: Course) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [instructor, setInstructor] = useState(initial?.instructor ?? '')
  const [tint, setTint] = useState<Course['tint']>(initial?.tint ?? 'lavender')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) { setError('Enter a course name.'); return } onSave({ id: initial?.id ?? createId('course'), name: name.trim(), code: code.trim(), description: description.trim(), instructor: instructor.trim(), tint, createdAt: initial?.createdAt ?? stamp() }) }
  return <form className="editor-form" onSubmit={submit}><div className="form-grid"><Field label="Course name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Course code"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CS 204" /></Field><Field label="Instructor"><input value={instructor} onChange={(e) => setInstructor(e.target.value)} /></Field><Field label="Card color"><select value={tint} onChange={(e) => setTint(e.target.value as Course['tint'])}><option value="lavender">Lavender</option><option value="mint">Mint</option><option value="sand">Sand</option></select></Field></div><Field label="Description"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-actions"><Button type="submit">{initial ? 'Save course' : 'Create course'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div></form>
}

function LessonEditor({ initial, onSave, onCancel }: { initial?: Lesson; onSave: (lesson: Lesson) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) { setError('Enter a lesson title.'); return } onSave({ id: initial?.id ?? createId('lesson'), courseId: initial?.courseId ?? '', title: title.trim(), description: description.trim(), content: content.trim(), completed: initial?.completed ?? false, updatedAt: stamp() }) }
  return <form className="editor-form" onSubmit={submit}><Field label="Lesson title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required /></Field><Field label="Short description"><input value={description} onChange={(e) => setDescription(e.target.value)} /></Field><Field label="Lesson content"><textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write or paste your lesson notes here." /></Field>{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-actions"><Button type="submit">{initial ? 'Save lesson' : 'Add lesson'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div></form>
}

function TasksPage() {
  const { data, update } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showForm, setShowForm] = useState(searchParams.get('new') === '1')
  const [editing, setEditing] = useState<Task | undefined>()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [courseFilter, setCourseFilter] = useState('all')
  const [deletionError, setDeletionError] = useState('')
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const today = localDateKey()
  const updateShow = (value: boolean) => { setShowForm(value); if (!value && searchParams.has('new')) setSearchParams({}, { replace: true }) }
  const save = (task: Task) => { update({ tasks: data.tasks.some((item) => item.id === task.id) ? data.tasks.map((item) => item.id === task.id ? task : item) : [...data.tasks, task] }); setEditing(undefined); updateShow(false) }
  const list = [...data.tasks].filter((task) => {
    const matchesStatus = status === 'all' || (status === 'pending' && !task.completed) || (status === 'completed' && task.completed) || (status === 'overdue' && !task.completed && !!task.dueDate && task.dueDate < today) || (status === 'today' && !task.completed && task.dueDate === today)
    return matchesStatus && (priorityFilter === 'all' || task.priority === priorityFilter) && (courseFilter === 'all' || task.courseId === courseFilter) && `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase())
  }).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]))
  const toggle = (task: Task) => update({ tasks: data.tasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed, completedAt: item.completed ? null : stamp() } : item) })
  const remove = async (task: Task) => {
    if (!window.confirm(`Delete “${task.title}”? This uses the trusted deletion system.`)) return
    setDeletionError('')
    setDeletingTaskId(task.id)
    try {
      const { getFirebaseServices } = await import('../firebase/client')
      const { functions } = getFirebaseServices()
      const deletion = await import('../data/firestore/repositories/workspace')
      const request = await deletion.requestTrustedTaskDeletion(functions, task.id)
      let status = request
      for (let attempt = 0; attempt < 20 && !status.completed && status.status !== 'failed'; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        status = await deletion.getTrustedTaskDeletionStatus(functions, task.id, request.jobId)
      }
      if (!status.completed) throw new Error(status.status === 'failed' ? 'Trusted deletion failed.' : 'Trusted deletion is still in progress. Retry status from Tasks.')
      update({ tasks: data.tasks.filter((item) => item.id !== task.id), plannerBlocks: data.plannerBlocks.map((block) => block.taskId === task.id ? { ...block, taskId: null } : block), focusTimer: data.focusTimer.taskId === task.id ? { ...data.focusTimer, taskId: null } : data.focusTimer })
    } catch (cause) {
      setDeletionError(cause instanceof Error ? cause.message : 'Task deletion failed.')
    } finally {
      setDeletingTaskId(null)
    }
  }
  return <div className="workspace-page"><SectionHeading title="Keep your next steps together." detail={`${data.tasks.filter((task) => !task.completed).length} pending · ${data.tasks.filter((task) => task.completed).length} completed`} action={<Button onClick={() => { setEditing(undefined); updateShow(!showForm) }}><Plus size={16} /> New task</Button>} />
    {deletionError && <InlineNotice tone="error">{deletionError}</InlineNotice>}
    {(showForm || editing) && <Card className="editor-card" padding="medium"><h3>{editing ? 'Edit task' : 'Create a task'}</h3><TaskEditor initial={editing} courses={data.courses} onSave={save} onCancel={() => { setEditing(undefined); updateShow(false) }} /></Card>}
    <Card className="filter-card" padding="medium"><div className="filter-row task-status-filters">{[['all','All'],['pending','Pending'],['today','Due today'],['overdue','Overdue'],['completed','Completed']].map(([value,label]) => <button className={`filter-chip${status === value ? ' filter-chip--active' : ''}`} key={value} onClick={() => setStatus(value)}>{label}</button>)}</div><div className="filter-row"><label className="search-field"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" /></label><select aria-label="Filter by priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}><option value="all">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select><select aria-label="Filter by course" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}><option value="all">All courses</option>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></div></Card>
    <div className="task-list">{list.map((task) => <Card className={`managed-task${task.completed ? ' managed-task--complete' : ''}`} key={task.id} padding="medium"><button className={`task-check task-check-button${task.completed ? ' task-check--done' : ''}`} aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`} onClick={() => toggle(task)}>{task.completed && <Check size={13} />}</button><div className="managed-task__main"><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}<div className="managed-task__meta"><Badge tone={task.priority === 'High' ? 'amber' : task.priority === 'Medium' ? 'blue' : 'soft'}>{task.priority} priority</Badge><span>{courseName(data.courses, task.courseId)}</span><span>{task.dueDate ? `${formatDate(task.dueDate, { month: 'short', day: 'numeric', year: 'numeric' })}${task.dueTime ? ` · ${formatTime(task.dueTime, data.preferences.timeFormat)}` : ''}` : 'No due date'}</span>{!task.completed && task.dueDate && task.dueDate < today && <Badge tone="amber">Overdue</Badge>}</div></div><div className="row-actions"><button className="icon-button" aria-label={`Edit ${task.title}`} onClick={() => { setEditing(task); setShowForm(false) }}><Pencil size={16} /></button><button className="icon-button" aria-label={`Delete ${task.title}`} disabled={deletingTaskId === task.id} onClick={() => void remove(task)}><Trash2 size={16} /></button></div></Card>)}{list.length === 0 && <Card padding="large">{empty(search ? 'No tasks match your search and filters.' : 'No tasks in this view yet. Create one to get started.')}</Card>}</div>
  </div>
}

function SchedulePage() {
  const { data, update } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selected, setSelected] = useState(searchParams.get('date') ?? localDateKey())
  const [week, setWeek] = useState(() => startOfWeek(selected, data.preferences.firstDayOfWeek))
  const [showForm, setShowForm] = useState(searchParams.get('new') === '1')
  const [editing, setEditing] = useState<ScheduleEvent | undefined>()
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index))
  const events = data.events.filter((event) => eventOccursOnDate(event, selected)).sort((a,b) => a.startTime.localeCompare(b.startTime))
  const save = (event: ScheduleEvent) => { update({ events: data.events.some((item) => item.id === event.id) ? data.events.map((item) => item.id === event.id ? event : item) : [...data.events, event] }); setShowForm(false); setEditing(undefined); setSelected(event.date); setWeek(startOfWeek(event.date, data.preferences.firstDayOfWeek)); setSearchParams({ date: event.date }, { replace: true }) }
  const changeWeek = (amount: number) => { const next = addDays(week, amount * 7); setWeek(next); setSelected(next) }
  const remove = (event: ScheduleEvent) => update({ events: data.events.filter((item) => item.id !== event.id) })
  return <div className="workspace-page"><SectionHeading title="Your schedule, at a glance." detail="Select a day to view or manage events" action={<Button onClick={() => { setEditing(undefined); setShowForm(true) }}><Plus size={16} /> Add event</Button>} />
    <Card className="calendar-card" padding="medium"><div className="calendar-toolbar"><div><h3>{formatDate(week, { month: 'long', year: 'numeric' })}</h3><p>{formatDate(week, { month: 'short', day: 'numeric' })} – {formatDate(addDays(week, 6), { month: 'short', day: 'numeric', year: 'numeric' })}</p></div><div className="form-actions"><Button variant="secondary" size="small" onClick={() => { setWeek(startOfWeek(localDateKey(), data.preferences.firstDayOfWeek)); setSelected(localDateKey()) }}>Today</Button><Button variant="secondary" size="small" aria-label="Previous week" onClick={() => changeWeek(-1)}><ChevronLeft size={16} /></Button><Button variant="secondary" size="small" aria-label="Next week" onClick={() => changeWeek(1)}><ChevronRight size={16} /></Button></div></div><div className="week-strip">{days.map((day) => <button key={day} className={`week-day${day === selected ? ' week-day--active' : ''}${day === localDateKey() ? ' week-day--today' : ''}`} onClick={() => setSelected(day)}><small>{formatDate(day, { weekday: 'short' })}</small><strong>{parseLocalDate(day).getDate()}</strong><span>{data.events.filter((event) => eventOccursOnDate(event, day)).length} events</span></button>)}</div></Card>
    <div className="schedule-detail"><div className="schedule-detail__heading"><div><p className="eyebrow">SELECTED DAY</p><h2>{formatDate(selected)}</h2></div><div className="schedule-day-picker"><input aria-label="Select schedule date" type="date" value={selected} onChange={(e) => { if (e.target.value) { setSelected(e.target.value); setWeek(startOfWeek(e.target.value, data.preferences.firstDayOfWeek)) } }} /></div></div>
      {(showForm || editing) && <Card className="editor-card" padding="medium"><h3>{editing ? 'Edit event' : 'Add schedule event'}</h3><EventEditor initial={editing} courses={data.courses} date={selected} existing={data.events} onSave={save} onCancel={() => { setShowForm(false); setEditing(undefined) }} /></Card>}
      <Card className="schedule-list" padding="small">{events.map((event) => <div className="schedule-event-row" key={event.id}><div className="schedule-event-time"><strong>{formatTime(event.startTime, data.preferences.timeFormat)}</strong><span>{formatTime(event.endTime, data.preferences.timeFormat)}</span></div><span className={`schedule-color-dot schedule-color-dot--${event.color}`} /><div className="schedule-event-copy"><strong>{event.title}</strong><p>{event.description || event.type[0]!.toUpperCase() + event.type.slice(1)}{event.location ? ` · ${event.location}` : ''}</p><small>{courseName(data.courses, event.courseId)}{event.repeatWeekly ? ' · Weekly' : ''}</small></div><Badge tone={event.type === 'class' ? 'blue' : event.type === 'study' ? 'lime' : 'soft'}>{event.type}</Badge><div className="row-actions"><button className="icon-button" aria-label={`Edit ${event.title}`} onClick={() => { setEditing(event); setShowForm(false) }}><Pencil size={16} /></button><ConfirmAction title={`Delete ${event.title}?`} description="This schedule event will be permanently removed from your workspace." onConfirm={() => remove(event)}><button type="button" className="icon-button" aria-label={`Delete ${event.title}`}><Trash2 size={16} /></button></ConfirmAction></div></div>)}{events.length === 0 && empty('No events on this date. Add a class, study session, or personal event.')}</Card>
    </div>
  </div>
}

function PlannerPage() {
  const { data, update } = useAppData()
  const [date, setDate] = useState(localDateKey())
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('15:00')
  const [endTime, setEndTime] = useState('16:00')
  const [taskId, setTaskId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [editingBlock, setEditingBlock] = useState<PlannerBlock | undefined>()
  const [error, setError] = useState('')
  const blocks = data.plannerBlocks.filter((block) => block.date === date).sort((a,b) => a.order - b.order || a.startTime.localeCompare(b.startTime))
  const events = data.events.filter((event) => eventOccursOnDate(event, date)).sort((a,b) => a.startTime.localeCompare(b.startTime))
  const tasks = data.tasks.filter((task) => !task.completed && (!task.dueDate || task.dueDate <= date)).sort((a,b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const add = (event: FormEvent) => { event.preventDefault(); setError(''); if (!title.trim()) { setError('Add a title for this planned block.'); return }; if (!isValidTime(startTime) || !isValidTime(endTime) || endTime <= startTime) { setError('End time must be after start time.'); return } if (editingBlock) { update({ plannerBlocks: data.plannerBlocks.map((item) => item.id === editingBlock.id ? { ...item, title: title.trim(), startTime, endTime, taskId: taskId || null, courseId: courseId || null } : item) }); setEditingBlock(undefined) } else { const item: PlannerBlock = { id: createId('block'), date, title: title.trim(), startTime, endTime, taskId: taskId || null, courseId: courseId || null, completed: false, order: blocks.length, createdAt: stamp() }; update({ plannerBlocks: [...data.plannerBlocks, item] }) } setTitle(''); setTaskId(''); setCourseId('') }
  const edit = (block: PlannerBlock) => { setEditingBlock(block); setTitle(block.title); setStartTime(block.startTime); setEndTime(block.endTime); setTaskId(block.taskId ?? ''); setCourseId(block.courseId ?? ''); setError('') }
  const cancelEdit = () => { setEditingBlock(undefined); setTitle(''); setTaskId(''); setCourseId(''); setError('') }
  const remove = (block: PlannerBlock) => update({ plannerBlocks: data.plannerBlocks.filter((item) => item.id !== block.id) })
  const move = (block: PlannerBlock, amount: number) => { const reordered = [...blocks]; const index = reordered.findIndex((item) => item.id === block.id); const target = index + amount; if (target < 0 || target >= reordered.length) return; [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!]; const ranks = new Map(reordered.map((item, i) => [item.id, i])); update({ plannerBlocks: data.plannerBlocks.map((item) => ranks.has(item.id) ? { ...item, order: ranks.get(item.id)! } : item) }) }
  return <div className="workspace-page"><SectionHeading title="Plan a day that has breathing room." detail="Your schedule, open tasks, and planned study blocks in one place" action={<label className="date-input-label">Plan date<input aria-label="Plan date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>} />
    <div className="planner-columns"><section><SectionHeading title="Fixed schedule" detail={formatDate(date)} /><Card className="planner-list" padding="small">{events.map((event) => <div className="planner-row planner-row--fixed" key={event.id}><div className="planner-time">{formatTime(event.startTime, data.preferences.timeFormat)}<small>{formatTime(event.endTime, data.preferences.timeFormat)}</small></div><div className="planner-row__copy"><strong>{event.title}</strong><small>{courseName(data.courses, event.courseId)}{event.location ? ` · ${event.location}` : ''}</small></div><Badge tone="neutral">Scheduled</Badge></div>)}{events.length === 0 && empty('No fixed events on this day. Your planned blocks are still here.')}</Card><SectionHeading title="Tasks to consider" detail="Open tasks with no due date or due by this day" /><Card className="planner-list" padding="small">{tasks.map((task) => <div className="planner-row" key={task.id}><span className="planner-task-indicator" /><div className="planner-row__copy"><strong>{task.title}</strong><small>{courseName(data.courses, task.courseId)} · {task.dueDate ? formatDate(task.dueDate, { month: 'short', day: 'numeric' }) : 'No due date'}</small></div><button className="icon-button" title={`Plan ${task.title}`} onClick={() => { setTaskId(task.id); setCourseId(task.courseId ?? ''); setTitle(task.title) }}><Plus size={16} /></button></div>)}{tasks.length === 0 && empty('No outstanding tasks need to be planned for this day.')}</Card></section>
      <section><SectionHeading title="Your plan" detail={`${blocks.filter((block) => block.completed).length} of ${blocks.length} blocks complete`} /><Card className="planner-list planner-list--blocks" padding="small">{blocks.map((block, index) => <div className={`planner-row${block.completed ? ' planner-row--complete' : ''}`} key={block.id}><button className={`task-check task-check-button${block.completed ? ' task-check--done' : ''}`} aria-label={block.completed ? 'Mark planned block incomplete' : 'Mark planned block complete'} onClick={() => update({ plannerBlocks: data.plannerBlocks.map((item) => item.id === block.id ? { ...item, completed: !item.completed } : item) })}>{block.completed && <Check size={13} />}</button><div className="planner-time">{formatTime(block.startTime, data.preferences.timeFormat)}<small>{formatTime(block.endTime, data.preferences.timeFormat)}</small></div><div className="planner-row__copy"><strong>{block.title}</strong><small>{courseName(data.courses, block.courseId)}{block.taskId ? ` · ${data.tasks.find((task) => task.id === block.taskId)?.title ?? 'Linked task'}` : ''}</small></div><div className="row-actions"><button className="icon-button" aria-label={`Edit ${block.title}`} onClick={() => edit(block)}><Pencil size={15} /></button><button className="icon-button" aria-label="Move block up" disabled={index === 0} onClick={() => move(block, -1)}><ArrowUp size={15} /></button><button className="icon-button" aria-label="Move block down" disabled={index === blocks.length - 1} onClick={() => move(block, 1)}><ArrowDown size={15} /></button><ConfirmAction title={`Delete ${block.title}?`} description="This planned block will be permanently removed from your day plan." onConfirm={() => remove(block)}><button type="button" className="icon-button" aria-label={`Delete planned block ${block.title}`}><Trash2 size={15} /></button></ConfirmAction></div></div>)}{blocks.length === 0 && empty('Add a study block or plan an open task for this day.')}</Card>
        <Card className="editor-card" padding="medium"><h3><Plus size={16} /> {editingBlock ? 'Edit planned block' : 'Add a planned block'}</h3><form className="editor-form" onSubmit={add}><div className="form-grid"><Field label="Block title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reading, review, practice…" /></Field><Field label="Link to task"><select value={taskId} onChange={(e) => { setTaskId(e.target.value); const task = data.tasks.find((item) => item.id === e.target.value); if (task) { setTitle(task.title); setCourseId(task.courseId ?? '') } }}><option value="">No linked task</option>{data.tasks.filter((task) => !task.completed).map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></Field><Field label="Start"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field><Field label="End"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field><Field label="Course"><select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">No course</option>{data.courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></Field></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-actions"><Button type="submit">{editingBlock ? 'Save block' : <><Plus size={15} /> Add to day plan</>}</Button>{editingBlock && <Button type="button" variant="secondary" onClick={cancelEdit}>Cancel</Button>}</div></form></Card>
      </section></div>
  </div>
}

function LibraryPage({ importing = false }: { importing?: boolean }) {
  const { data, update } = useAppData()
  const [courseForm, setCourseForm] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | undefined>()
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null)
  const saveCourse = (course: Course) => { update({ courses: data.courses.some((item) => item.id === course.id) ? data.courses.map((item) => item.id === course.id ? course : item) : [...data.courses, course] }); setCourseForm(false); setEditingCourse(undefined) }
  const removeCourse = (course: Course) => {
    void (async () => {
      if (!window.confirm(`Delete ${course.name} and all associated Course data? This uses the trusted deletion system.`)) return
      setError('')
      setDeletingCourseId(course.id)
      try {
        const { getFirebaseServices } = await import('../firebase/client')
        const { functions } = getFirebaseServices()
        const deletion = await import('../data/firestore/repositories/workspace')
        const request = await deletion.requestTrustedCourseDeletion(functions, course.id)
        let status = request
        for (let attempt = 0; attempt < 20 && !status.completed && status.status !== 'failed'; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000))
          status = await deletion.getTrustedCourseDeletionStatus(functions, course.id, request.jobId)
        }
        if (!status.completed) throw new Error(status.status === 'failed' ? 'Trusted Course deletion failed.' : 'Trusted Course deletion is still in progress.')
        update({ courses: data.courses.filter((item) => item.id !== course.id), lessons: data.lessons.filter((lesson) => lesson.courseId !== course.id), tasks: data.tasks.map((item) => item.courseId === course.id ? { ...item, courseId: null } : item), events: data.events.map((item) => item.courseId === course.id ? { ...item, courseId: null } : item), materials: data.materials.map((item) => item.courseId === course.id ? { ...item, courseId: null } : item), plannerBlocks: data.plannerBlocks.map((item) => item.courseId === course.id ? { ...item, courseId: null } : item), focusSessions: data.focusSessions.map((item) => item.courseId === course.id ? { ...item, courseId: null } : item), focusTimer: data.focusTimer.courseId === course.id ? { ...data.focusTimer, courseId: null } : data.focusTimer })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Course deletion failed.')
      } finally {
        setDeletingCourseId(null)
      }
    })()
  }
  const addFile = async (file: File) => {
    setError('')
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['txt', 'md', 'markdown', 'html', 'htm'].includes(ext ?? '')) { setError('Choose a TXT, Markdown, or HTML file.'); return }
    try {
      let content = await file.text()
      if (ext === 'html' || ext === 'htm') { const doc = new DOMParser().parseFromString(content, 'text/html'); doc.querySelectorAll('script,style,noscript').forEach((node) => node.remove()); content = doc.body.innerText || doc.body.textContent || '' }
      content = content.replace(/\r\n/g, '\n').trim()
      if (!content) { setError('This file has no readable text.'); return }
      const material: StudyMaterial = { id: createId('material'), title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, content, courseId: null, createdAt: stamp(), updatedAt: stamp() }
      update({ materials: [...data.materials, material] })
    } catch { setError('The file could not be read. Try saving it as plain text or Markdown.') }
  }
  const shownMaterials = data.materials.filter((material) => `${material.title} ${material.content} ${material.fileName}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="workspace-page"><SectionHeading title={importing ? 'Bring your notes with you.' : 'A home for everything you’re learning.'} detail="Courses, lessons, and local study materials" action={importing ? <Link className="button button--secondary button--medium" to="/library"><ArrowLeft size={15} /> Back to library</Link> : <Button onClick={() => setCourseForm(!courseForm)}><Plus size={16} /> Add course</Button>} />
    {(courseForm || editingCourse) && <Card className="editor-card" padding="medium"><h3>{editingCourse ? 'Edit course' : 'Create a course'}</h3><CourseEditor initial={editingCourse} onSave={saveCourse} onCancel={() => { setCourseForm(false); setEditingCourse(undefined) }} /></Card>}
    {importing && <Card className="editor-card import-dropzone" padding="large"><FileUp size={24} /><h3>Import a local study material</h3><p>Text is extracted in your browser and saved only in this workspace.</p><label className="button button--primary button--medium">Choose TXT, Markdown, or HTML<input className="visually-hidden" type="file" accept=".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html" onChange={(e) => { const file = e.target.files?.[0]; if (file) void addFile(file); e.currentTarget.value = '' }} /></label>{error && <InlineNotice tone="error">{error}</InlineNotice>}</Card>}
    {!importing && <><div className="library-heading"><SectionHeading title="Your courses" detail={`${data.courses.length} ${data.courses.length === 1 ? 'course' : 'courses'}`} /><Link className="text-link" to="/library/import"><FileUp size={15} /> Import material <ArrowRight size={14} /></Link></div><div className="library-course-grid">{data.courses.map((course) => { const lessons = data.lessons.filter((lesson) => lesson.courseId === course.id); const done = lessons.filter((lesson) => lesson.completed).length; return <Card className="library-course" key={course.id} padding="medium"><div className="library-course__top"><span className={`course-icon course-icon--${course.tint}`}><BookOpen size={17} /></span><span className="course-code">{course.code || 'COURSE'}</span><span className="row-actions"><button className="icon-button" aria-label={`Edit ${course.name}`} onClick={() => { setEditingCourse(course); setCourseForm(false) }}><Pencil size={15} /></button><button className="icon-button" aria-label={`Delete ${course.name}`} disabled={deletingCourseId === course.id} onClick={() => removeCourse(course)}><Trash2 size={15} /></button></span></div><Link className="library-course__title" to={`/courses/${course.id}`}>{course.name}</Link><p>{course.description || 'No description yet.'}</p><div className="course-progress"><ProgressBar value={lessons.length ? done / lessons.length * 100 : 0} label={`${course.name} progress`} /><span>{lessons.length ? Math.round(done / lessons.length * 100) : 0}%</span></div><small>{done} of {lessons.length} lessons complete</small></Card> })}{data.courses.length === 0 && <Card padding="medium">{empty('Create a course to organize lessons, materials, tasks, and focus sessions.')}</Card>}</div>
      <div className="library-heading materials-heading"><SectionHeading title="Study materials" detail={`${data.materials.length} saved locally`} /><label className="search-field"><Search size={15} /><input aria-label="Search materials" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials" /></label></div><div className="materials-grid">{shownMaterials.map((material) => <MaterialCard key={material.id} material={material} courses={data.courses} onChange={(next) => update({ materials: data.materials.map((item) => item.id === next.id ? next : item) })} onDelete={() => { if (window.confirm(`Delete “${material.title}”?`)) update({ materials: data.materials.filter((item) => item.id !== material.id) }) }} />)}{shownMaterials.length === 0 && <Card padding="medium">{empty(search ? 'No materials match that search.' : 'Import a TXT, Markdown, or HTML file to add local study material.')}</Card>}</div></>}
  </div>
}

function MaterialCard({ material, courses, onChange, onDelete }: { material: StudyMaterial; courses: Course[]; onChange: (material: StudyMaterial) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(material.title)
  const [content, setContent] = useState(material.content)
  return <Card className="material-card" padding="medium"><div className="material-card__top"><div><span className="material-file-icon"><FileUp size={16} /></span><span><strong>{material.title}</strong><small>{material.fileName}</small></span></div><div className="row-actions"><button className="icon-button" aria-label={`Edit ${material.title}`} onClick={() => { setTitle(material.title); setContent(material.content); setEditing(!editing) }}><Pencil size={15} /></button><ConfirmAction title={`Delete ${material.title}?`} description="This study material will be permanently removed from your workspace." onConfirm={onDelete}><button type="button" className="icon-button" aria-label={`Delete ${material.title}`}><Trash2 size={15} /></button></ConfirmAction></div></div>{editing ? <><Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field><Field label="Extracted text"><textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} /></Field><div className="form-actions"><Button size="small" onClick={() => { onChange({ ...material, title: title.trim() || material.title, content, updatedAt: stamp() }); setEditing(false) }}>Save</Button><Button size="small" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div></> : <><p className="material-preview">{material.content.slice(0, 340)}{material.content.length > 340 ? '…' : ''}</p><div className="material-card__footer"><select aria-label={`Course for ${material.title}`} value={material.courseId ?? ''} onChange={(e) => onChange({ ...material, courseId: e.target.value || null, updatedAt: stamp() })}><option value="">No course</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select><span>{new Date(material.updatedAt).toLocaleDateString()}</span></div></>}</Card>
}

function CoursePage() {
  const { courseId } = useParams()
  const { data, update } = useAppData()
  const navigate = useNavigate()
  const course = data.courses.find((item) => item.id === courseId)
  const [form, setForm] = useState(false)
  const [editingCourse, setEditingCourse] = useState(false)
  const lessons = data.lessons.filter((lesson) => lesson.courseId === courseId)
  if (!course) return <NotFound message="This course may have been deleted or the link may be incorrect." />
  const saveLesson = (lesson: Lesson) => { lesson.courseId = course.id; update({ lessons: data.lessons.some((item) => item.id === lesson.id) ? data.lessons.map((item) => item.id === lesson.id ? lesson : item) : [...data.lessons, lesson] }); setForm(false) }
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const remove = () => {
    void (async () => {
      if (!window.confirm(`Delete ${course.name} and all associated trusted Course data?`)) return
      setDeleting(true)
      setDeleteError('')
      try {
        const { getFirebaseServices } = await import('../firebase/client')
        const { functions } = getFirebaseServices()
        const deletion = await import('../data/firestore/repositories/workspace')
        const request = await deletion.requestTrustedCourseDeletion(functions, course.id)
        let status = request
        for (let attempt = 0; attempt < 20 && !status.completed && status.status !== 'failed'; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000))
          status = await deletion.getTrustedCourseDeletionStatus(functions, course.id, request.jobId)
        }
        if (!status.completed) throw new Error(status.status === 'failed' ? 'Trusted Course deletion failed.' : 'Trusted Course deletion is still in progress.')
        navigate('/library')
      } catch (cause) {
        setDeleteError(cause instanceof Error ? cause.message : 'Course deletion failed.')
      } finally {
        setDeleting(false)
      }
    })()
  }
  const done = lessons.filter((lesson) => lesson.completed).length
  return <div className="workspace-page"><div className="detail-back"><Link className="text-link" to="/library"><ArrowLeft size={15} /> Study library</Link><div className="row-actions"><Button variant="secondary" size="small" onClick={() => setEditingCourse(!editingCourse)}><Pencil size={14} /> Edit course</Button><Button variant="secondary" size="small" disabled={deleting} onClick={remove}><Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}</Button></div></div>
    {deleteError && <InlineNotice tone="error">{deleteError}</InlineNotice>}
    {editingCourse && <Card className="editor-card" padding="medium"><h3>Edit course</h3><CourseEditor initial={course} onSave={(next) => { update({ courses: data.courses.map((item) => item.id === course.id ? next : item) }); setEditingCourse(false) }} onCancel={() => setEditingCourse(false)} /></Card>}
    <Card className="course-detail-card" padding="large"><div className="course-detail-heading"><span className={`course-icon course-icon--${course.tint}`}><BookOpen size={20} /></span><div><span className="eyebrow">{course.code || 'COURSE'}</span><h2>{course.name}</h2></div></div><p>{course.description || 'Add a description to keep the course context close.'}</p>{course.instructor && <p className="course-instructor">Instructor: {course.instructor}</p>}<div className="course-progress course-detail-progress"><ProgressBar value={lessons.length ? done / lessons.length * 100 : 0} /><span>{lessons.length ? Math.round(done / lessons.length * 100) : 0}% · {done}/{lessons.length} lessons</span></div></Card>
    <SectionHeading title="Lessons" detail="Open a lesson or mark it complete" action={<Button onClick={() => setForm(!form)}><Plus size={16} /> Add lesson</Button>} />{form && <Card className="editor-card" padding="medium"><h3>Add a lesson</h3><LessonEditor onSave={saveLesson} onCancel={() => setForm(false)} /></Card>}
    <div className="lesson-list">{lessons.map((lesson, index) => <Card className="lesson-row" key={lesson.id} padding="medium"><button className={`task-check task-check-button${lesson.completed ? ' task-check--done' : ''}`} aria-label={lesson.completed ? 'Reopen lesson' : 'Complete lesson'} onClick={() => update({ lessons: data.lessons.map((item) => item.id === lesson.id ? { ...item, completed: !item.completed, updatedAt: stamp() } : item) })}>{lesson.completed && <Check size={13} />}</button><div className="lesson-row__copy"><span>LESSON {index + 1}</span><Link to={`/lessons/${lesson.id}`}>{lesson.title}</Link><small>{lesson.description || 'Open lesson to view content.'}</small></div><Badge tone={lesson.completed ? 'lime' : 'soft'}>{lesson.completed ? 'Complete' : 'In progress'}</Badge><Link className="text-link" to={`/lessons/${lesson.id}`}>Open <ArrowRight size={14} /></Link></Card>)}{lessons.length === 0 && <Card padding="medium">{empty('Add your first lesson to start tracking course progress.')}</Card>}</div>
    {data.materials.filter((material) => material.courseId === course.id).length > 0 && <><SectionHeading title="Materials" detail="Attached to this course" /><div className="materials-grid">{data.materials.filter((material) => material.courseId === course.id).map((material) => <MaterialCard key={material.id} material={material} courses={data.courses} onChange={(next) => update({ materials: data.materials.map((item) => item.id === next.id ? next : item) })} onDelete={() => update({ materials: data.materials.filter((item) => item.id !== material.id) })} />)}</div></>}
  </div>
}

function LessonPage() {
  const { lessonId } = useParams()
  const { data, update } = useAppData()
  const navigate = useNavigate()
  const lesson = data.lessons.find((item) => item.id === lessonId)
  const [editing, setEditing] = useState(false)
  if (!lesson) return <NotFound message="This lesson may have been deleted or the link may be incorrect." />
  const course = data.courses.find((item) => item.id === lesson.courseId)
  const lessons = data.lessons.filter((item) => item.courseId === lesson.courseId)
  const index = lessons.findIndex((item) => item.id === lesson.id)
  const updateLesson = (next: Lesson) => { update({ lessons: data.lessons.map((item) => item.id === lesson.id ? { ...next, courseId: lesson.courseId } : item) }); setEditing(false) }
  const remove = () => { update({ lessons: data.lessons.filter((item) => item.id !== lesson.id) }); navigate(course ? `/courses/${course.id}` : '/library') }
  return <div className="workspace-page"><div className="detail-back"><Link className="text-link" to={course ? `/courses/${course.id}` : '/library'}><ArrowLeft size={15} /> {course?.name ?? 'Study library'}</Link><div className="row-actions"><Button variant="secondary" size="small" onClick={() => setEditing(!editing)}><Pencil size={14} /> Edit lesson</Button><ConfirmAction title={`Delete ${lesson.title}?`} description="This lesson will be permanently removed from your course." onConfirm={remove}><button type="button" className="button button--secondary button--small"><Trash2 size={14} /> Delete</button></ConfirmAction></div></div>
    {editing ? <Card className="editor-card" padding="medium"><h3>Edit lesson</h3><LessonEditor initial={lesson} onSave={updateLesson} onCancel={() => setEditing(false)} /></Card> : <Card className="lesson-content-card" padding="large"><p className="eyebrow">{course?.code || 'LESSON'} · LESSON {index + 1} OF {lessons.length}</p><h2>{lesson.title}</h2>{lesson.description && <p className="lesson-description">{lesson.description}</p>}<div className="lesson-content">{lesson.content ? lesson.content.split(/\n{2,}/).map((paragraph, i) => <p key={i}>{paragraph}</p>) : <p className="empty-copy">This lesson has no content yet. Edit it to add notes.</p>}</div><div className="lesson-footer"><Button variant={lesson.completed ? 'secondary' : 'primary'} onClick={() => update({ lessons: data.lessons.map((item) => item.id === lesson.id ? { ...item, completed: !item.completed, updatedAt: stamp() } : item) })}><CheckCircle2 size={16} /> {lesson.completed ? 'Mark as in progress' : 'Mark lesson complete'}</Button><div className="lesson-navigation"><Button variant="secondary" size="small" disabled={index <= 0} onClick={() => navigate(`/lessons/${lessons[index - 1]?.id}`)}><ArrowLeft size={14} /> Previous</Button><Button variant="secondary" size="small" disabled={index >= lessons.length - 1} onClick={() => navigate(`/lessons/${lessons[index + 1]?.id}`)}>Next <ArrowRight size={14} /></Button></div></div></Card>}</div>
}

function FocusPage() {
  const { data, update } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()
  const timer = data.focusTimer
  const [now, setNow] = useState(Date.now())
  const [customMinutes, setCustomMinutes] = useState(String(Math.max(1, Math.round(timer.durationSeconds / 60))))
  const [completionMessage, setCompletionMessage] = useState('')
  const previousTimerStatus = useRef(timer.status)
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(id) }, [])
  useEffect(() => {
    if (searchParams.get('start') === '1') {
      if (timer.status !== 'running') start()
      setSearchParams({}, { replace: true })
    }
  // The query parameter is a one-shot dashboard shortcut.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  const remaining = timer.status === 'running' && timer.endsAt ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : timer.remainingSeconds
  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0')
  const seconds = (remaining % 60).toString().padStart(2, '0')
  const modeLabels: Record<FocusMode, string> = { focus: 'Focus', shortBreak: 'Short break', longBreak: 'Long break' }
  const progress = timer.durationSeconds > 0 ? Math.min(1, Math.max(0, 1 - remaining / timer.durationSeconds)) : 0
  useEffect(() => {
    if (previousTimerStatus.current === 'running' && timer.status === 'idle' && remaining === 0) {
      setCompletionMessage(`${modeLabels[timer.mode]} complete. Your session has been saved.`)
    }
    previousTimerStatus.current = timer.status
  }, [remaining, timer.mode, timer.status])
  function start() { setCompletionMessage(''); const nowIso = new Date().toISOString(); const duration = timer.remainingSeconds > 0 ? timer.remainingSeconds : timer.durationSeconds; update({ focusTimer: { ...timer, status: 'running', remainingSeconds: duration, startedAt: timer.status === 'paused' ? timer.startedAt : nowIso, segmentStartedAt: nowIso, elapsedSeconds: timer.status === 'paused' ? timer.elapsedSeconds : 0, endsAt: Date.now() + duration * 1000 } }) }
  const chooseMode = (mode: FocusMode) => { setCompletionMessage(''); const durationSeconds = mode === 'focus' ? 25 * 60 : mode === 'shortBreak' ? 5 * 60 : 15 * 60; update({ focusTimer: { status: 'idle', mode, durationSeconds, remainingSeconds: durationSeconds, startedAt: null, segmentStartedAt: null, elapsedSeconds: 0, endsAt: null, courseId: timer.courseId, taskId: timer.taskId } }) }
  const pause = () => update({ focusTimer: { ...timer, status: 'paused', remainingSeconds: remaining, elapsedSeconds: timer.elapsedSeconds + (timer.segmentStartedAt ? Math.max(0, (Date.now() - new Date(timer.segmentStartedAt).getTime()) / 1000) : 0), segmentStartedAt: null, endsAt: null } })
  const reset = () => { setCompletionMessage(''); update({ focusTimer: { ...timer, status: 'idle', remainingSeconds: timer.durationSeconds, startedAt: null, segmentStartedAt: null, elapsedSeconds: 0, endsAt: null } }) }
  const finish = () => { if (!timer.startedAt) return; const endedAt = new Date().toISOString(); const elapsedSeconds = Math.floor(timer.elapsedSeconds + (timer.segmentStartedAt ? Math.max(0, (Date.now() - new Date(timer.segmentStartedAt).getTime()) / 1000) : 0)); const session = elapsedSeconds > 0 ? [{ id: createId('session'), mode: timer.mode, startedAt: timer.startedAt, endedAt, durationSeconds: elapsedSeconds, courseId: timer.courseId, taskId: timer.taskId, completed: true as const }, ...data.focusSessions] : data.focusSessions; update({ focusSessions: session, focusTimer: { ...timer, status: 'idle', remainingSeconds: timer.durationSeconds, startedAt: null, segmentStartedAt: null, elapsedSeconds: 0, endsAt: null } }); setCompletionMessage(elapsedSeconds > 0 ? 'Session saved to your history.' : '') }
  const saveCustom = (event: FormEvent) => { event.preventDefault(); const value = Number(customMinutes); if (!Number.isFinite(value) || value < 1 || value > 180) return; const durationSeconds = Math.round(value * 60); update({ focusTimer: { ...timer, status: 'idle', durationSeconds, remainingSeconds: durationSeconds, startedAt: null, segmentStartedAt: null, elapsedSeconds: 0, endsAt: null } }) }
  const sessions = data.focusSessions
  const weekStartDate = parseLocalDate(startOfWeek(localDateKey(), data.preferences.firstDayOfWeek)); weekStartDate.setHours(0, 0, 0, 0)
  const weeklySeconds = data.focusSessions.filter((session) => session.mode === 'focus' && new Date(session.startedAt).getTime() >= weekStartDate.getTime()).reduce((sum, session) => sum + session.durationSeconds, 0)
  return <div className="workspace-page focus-page"><SectionHeading title="One focused session is a good start." detail="Timer state and completed sessions are saved on this device" />
    <div className="focus-layout"><Card className={`timer-card timer-card--${timer.mode}`} padding="large"><div className="timer-modes">{(['focus','shortBreak','longBreak'] as FocusMode[]).map((mode) => <button key={mode} className={`filter-chip${timer.mode === mode ? ' filter-chip--active' : ''}`} disabled={timer.status === 'running'} onClick={() => chooseMode(mode)}>{modeLabels[mode]}</button>)}</div><div className={`timer-ring${completionMessage ? ' timer-ring--complete' : ''}`} role="img" aria-label={`${modeLabels[timer.mode]} timer: ${minutes} minutes and ${seconds} seconds remaining`}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="timer-ring__track" cx="50" cy="50" r="45" /><circle className="timer-ring__progress" cx="50" cy="50" r="45" strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - progress)} /></svg><div><span>{minutes}:{seconds}</span><small>{timer.status === 'running' ? 'IN SESSION' : timer.status === 'paused' ? 'PAUSED' : modeLabels[timer.mode].toUpperCase()}</small></div></div>{completionMessage && <InlineNotice tone="success">{completionMessage}</InlineNotice>}<div className="timer-controls">{timer.status === 'running' ? <Button onClick={pause}>Pause</Button> : <Button onClick={start}>{timer.status === 'paused' ? 'Resume' : 'Start session'}</Button>}{timer.status !== 'idle' && <Button variant="lime" onClick={finish}>Finish session</Button>}<Button variant="secondary" onClick={reset}>Reset</Button></div><form className="custom-duration" onSubmit={saveCustom}><Field label="Custom minutes"><input aria-label="Custom timer minutes" type="number" min="1" max="180" value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} disabled={timer.status === 'running'} /></Field><Button type="submit" variant="secondary" size="small" disabled={timer.status === 'running'}>Set duration</Button></form><div className="focus-associations"><Field label="Course"><select disabled={timer.status === 'running'} value={timer.courseId ?? ''} onChange={(e) => update({ focusTimer: { ...timer, courseId: e.target.value || null } })}><option value="">No course</option>{data.courses.map((course) => <option value={course.id} key={course.id}>{course.name}</option>)}</select></Field><Field label="Task"><select disabled={timer.status === 'running'} value={timer.taskId ?? ''} onChange={(e) => update({ focusTimer: { ...timer, taskId: e.target.value || null } })}><option value="">No task</option>{data.tasks.filter((task) => !task.completed).map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></Field></div></Card>
      <div className="focus-side"><Card className="focus-stat-card" padding="medium"><span className="stat-icon stat-icon--lime"><Flame size={17} /></span><p className="eyebrow">FOCUS TIME THIS WEEK</p><strong>{durationLabel(weeklySeconds)}</strong><small>{data.focusSessions.filter((session) => session.mode === 'focus').length} completed focus sessions total</small></Card><Card padding="medium"><SectionHeading title="How the timer works" /><p className="muted-copy focus-help-copy">The countdown uses a saved end time, so it stays accurate if you switch tabs or refresh. Paused or reset sessions are not added to history.</p><div className="focus-mode-help"><span>Focus</span><span>Short break</span><span>Long break</span></div></Card></div></div>
    <SectionHeading title="Session history" detail="Completed sessions saved on this device" /><Card className="history-list" padding="small">{sessions.map((session) => <div className="history-row" key={session.id}><span className="history-icon"><Clock3 size={16} /></span><div><strong>{modeLabels[session.mode]}</strong><small>{courseName(data.courses, session.courseId)}{session.taskId ? ` · ${data.tasks.find((task) => task.id === session.taskId)?.title ?? 'Task'}` : ''}</small></div><span>{durationLabel(session.durationSeconds)}</span><time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(session.endedAt))}</time></div>)}{sessions.length === 0 && empty('Your completed focus and break sessions will appear here.')}</Card>
  </div>
}

function ProgressPage() {
  const { data } = useAppData()
  const today = localDateKey()
  const tasksComplete = data.tasks.filter((task) => task.completed).length
  const pending = data.tasks.filter((task) => !task.completed).length
  const overdue = data.tasks.filter((task) => !task.completed && !!task.dueDate && task.dueDate < today).length
  const focus = data.focusSessions.filter((session) => session.mode === 'focus')
  const weekStartKey = startOfWeek(today, data.preferences.firstDayOfWeek)
  const weeklyFocus: FocusChartPoint[] = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(weekStartKey, index)
    const date = parseLocalDate(day)
    const seconds = focus.filter((session) => localDateKey(new Date(session.startedAt)) === day).reduce((sum, session) => sum + session.durationSeconds, 0)
    return { day, label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date), minutes: Math.round(seconds / 60) }
  })
  const weekFocus = weeklyFocus.reduce((sum, point) => sum + point.minutes * 60, 0)
  const trendStart = addDays(today, -13)
  const focusTrend: FocusChartPoint[] = Array.from({ length: 14 }, (_, index) => {
    const day = addDays(trendStart, index)
    const date = parseLocalDate(day)
    const seconds = focus.filter((session) => localDateKey(new Date(session.startedAt)) === day).reduce((sum, session) => sum + session.durationSeconds, 0)
    return { day, label: new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' }).format(date), minutes: Math.round(seconds / 60) }
  })
  const totalFocus = focus.reduce((sum, session) => sum + session.durationSeconds, 0)
  const courseProgress: CourseChartPoint[] = data.courses.map((course) => {
    const lessons = data.lessons.filter((lesson) => lesson.courseId === course.id)
    const completed = lessons.filter((lesson) => lesson.completed).length
    return { name: course.name, completed, total: lessons.length, percentage: lessons.length ? Math.round(completed / lessons.length * 100) : 0 }
  })
  const activityDays: StudyActivityPoint[] = Array.from({ length: 14 }, (_, index) => {
    const day = addDays(trendStart, index)
    const date = parseLocalDate(day)
    return {
      day,
      label: new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' }).format(date),
      lessons: data.lessons.filter((lesson) => lesson.completed && localDateKey(new Date(lesson.updatedAt)) === day).length,
      tasks: data.tasks.filter((task) => task.completedAt && localDateKey(new Date(task.completedAt)) === day).length,
      focusSessions: focus.filter((session) => localDateKey(new Date(session.endedAt)) === day).length,
    }
  })
  const recent = [...data.lessons.filter((lesson) => lesson.completed).map((lesson) => ({ at: lesson.updatedAt, label: `Completed lesson: ${lesson.title}`, context: courseName(data.courses, lesson.courseId) })), ...data.tasks.filter((task) => task.completed && task.completedAt).map((task) => ({ at: task.completedAt!, label: `Completed task: ${task.title}`, context: courseName(data.courses, task.courseId) })), ...data.focusSessions.map((session) => ({ at: session.endedAt, label: `Completed ${session.mode === 'focus' ? 'focus session' : 'break'}`, context: courseName(data.courses, session.courseId) }))].sort((a,b) => b.at.localeCompare(a.at)).slice(0, 10)
  return <div className="workspace-page"><SectionHeading title="Progress you can trust." detail="Every number is calculated from your saved local activity" /><div className="stat-grid"><Card padding="medium"><span className="eyebrow">TASKS COMPLETED</span><strong><CountUp value={tasksComplete} reducedMotion={data.preferences.reducedMotion} /></strong><small>{pending} still pending</small></Card><Card padding="medium"><span className="eyebrow">OVERDUE TASKS</span><strong><CountUp value={overdue} reducedMotion={data.preferences.reducedMotion} /></strong><small>Across all courses</small></Card><Card padding="medium"><span className="eyebrow">FOCUS THIS WEEK</span><strong>{durationLabel(weekFocus)}</strong><small>Completed focus sessions</small></Card><Card padding="medium"><span className="eyebrow">TOTAL FOCUS TIME</span><strong>{durationLabel(totalFocus)}</strong><small>{focus.length} sessions completed</small></Card></div>
    <SectionHeading title="Your study patterns" detail="Focus time and learning activity from your saved records" />
    <Suspense fallback={<Card className="chart-empty" padding="medium">Loading your study charts…</Card>}><ProgressCharts weeklyFocus={weeklyFocus} focusTrend={focusTrend} courseProgress={courseProgress} activity={activityDays} /></Suspense>
    <SectionHeading title="Course progress details" detail="Completed lessons by course" /><div className="progress-course-list">{data.courses.map((course) => { const lessons = data.lessons.filter((lesson) => lesson.courseId === course.id); const completed = lessons.filter((lesson) => lesson.completed).length; const percentage = lessons.length ? Math.round(completed / lessons.length * 100) : 0; return <Card className="progress-course" padding="medium" key={course.id}><div><Link to={`/courses/${course.id}`}>{course.name}</Link><small>{completed} of {lessons.length} lessons</small></div><ProgressBar value={percentage} /><strong>{percentage}%</strong></Card> })}{data.courses.length === 0 && <Card padding="medium">{empty('Create courses and lessons to track learning progress.')}</Card>}</div>
    <SectionHeading title="Recent learning activity" detail="Completed tasks, lessons, and focus sessions" /><Card className="history-list" padding="small">{recent.map((item, index) => <div className="history-row" key={`${item.at}-${index}`}><span className="history-icon"><CheckCircle2 size={16} /></span><div><strong>{item.label}</strong><small>{item.context}</small></div><time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.at))}</time></div>)}{recent.length === 0 && empty('Complete a lesson, task, or focus session and your activity will appear here.')}</Card>
  </div>
}

function SettingsPage() {
  const { data, update, importData, resetData } = useAppData()
  const [name, setName] = useState(data.preferences.displayName)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<AppData | null>(null)
  const [hasLegacyData] = useState(() => loadLegacyAppData() !== null)
  const [cloudPreferenceStatus, setCloudPreferenceStatus] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading')
  const [savingPreferences, setSavingPreferences] = useState(false)
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    void import('../firebase/client').then(({ getFirebaseServices }) => {
      if (!active) return
      try {
        const { auth, firestore } = getFirebaseServices()
        unsubscribe = subscribeUserPreferences(auth, firestore, (remote, fromCache) => {
          if (!active) return
          setCloudPreferenceStatus(fromCache ? 'offline' : 'ready')
          if (remote) {
            setName(remote.displayName)
            update({ preferences: { ...data.preferences, displayName: remote.displayName, timeFormat: remote.timeFormat, firstDayOfWeek: remote.firstDayOfWeek, timeZoneId: remote.timeZoneId } })
          }
        }, (cause) => {
          if (!active) return
          setCloudPreferenceStatus('error')
          setError(cause.message)
        })
      } catch (cause) {
        if (!active) return
        setCloudPreferenceStatus('error')
        setError(cause instanceof Error ? cause.message : 'Cloud preferences are unavailable.')
      }
    }).catch((cause: unknown) => {
      if (!active) return
      setCloudPreferenceStatus('error')
      setError(cause instanceof Error ? cause.message : 'Cloud preferences are unavailable.')
    })
    return () => { active = false; unsubscribe?.() }
  }, [update])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const preferences = { ...data.preferences, displayName: name.trim() }
    try { new Intl.DateTimeFormat('en', { timeZone: preferences.timeZoneId }) } catch { setError('Enter a valid IANA timezone, such as Asia/Manila.'); return }
    update({ preferences })
    setSavingPreferences(true)
    try {
      const { auth, firestore } = await import('../firebase/client').then(({ getFirebaseServices }) => getFirebaseServices())
      await saveUserPreferences(auth, firestore, preferences)
      setCloudPreferenceStatus('ready')
      setMessage('Preferences saved in this browser and synchronized to your Overseer account.')
    } catch (cause) {
      setCloudPreferenceStatus('error')
      setError(`Your preferences remain saved in this browser, but cloud synchronization failed: ${cause instanceof Error ? cause.message : 'unknown error'}`)
    } finally {
      setSavingPreferences(false)
    }
  }
  const updatePreferences = (patch: Partial<UserPreferences>, feedback = 'Appearance updated.') => {
    update({ preferences: { ...data.preferences, ...patch } })
    setMessage(feedback)
    setError('')
  }
  const chooseMode = (appearanceMode: AppearanceMode) => updatePreferences({
    appearanceMode,
    theme: appearanceMode === 'dark' ? 'dark' : appearanceMode === 'light' ? 'light' : data.preferences.theme,
  }, 'Color mode updated.')
  const exportData = () => { const blob = new Blob([JSON.stringify({ version: STORAGE_VERSION, data }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `overseer-backup-${localDateKey()}.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Your data export has been downloaded.') }
  const exportLegacyData = () => { const legacyData = loadLegacyAppData(); if (!legacyData) { setError('No valid legacy local workspace was found.'); return } const blob = new Blob([JSON.stringify({ version: 2, data: legacyData }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `overseer-legacy-backup-${localDateKey()}.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('The previous local workspace backup has been downloaded. Import it only into the account that owns that data.') }
  const readImport = async (file: File) => { setError(''); setMessage(''); try { setPendingImport(parseImportData(await file.text())) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read this data file.') } }
  const confirmImport = () => {
    if (!pendingImport) return
    const result = mergeAppData(data, pendingImport)
    importData(result.data)
    setPendingImport(null)
    setMessage(`Imported ${result.summary.added} records; ${result.summary.alreadyPresent} already existed. Local preferences and timer were kept.${result.summary.idConflicts ? ` ${result.summary.idConflicts} ID conflicts were kept as separate records.` : ''}`)
  }
  const reset = () => { resetData(); setName(''); setResetOpen(false); setMessage('Your local workspace has been reset.') }
  return <div className="workspace-page"><SectionHeading title="Make your study space work for you." detail="Preferences sync through Firestore. Courses and other workspace records remain browser-local until their cloud workflows are connected." />{message && <InlineNotice tone="success">{message}</InlineNotice>}{error && <InlineNotice tone="error">{error}</InlineNotice>}
    <Card className="settings-card appearance-card" padding="large">
      <div className="appearance-section-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h3>Appearance</h3><p className="muted-copy">Build a study space that feels comfortable to return to.</p></div></div>
      <div className="appearance-control-group">
        <div className="appearance-control-heading"><div><h4>Visual preset</h4><p>Each preset changes the full workspace palette.</p></div></div>
        <div className="theme-options" role="group" aria-label="Appearance preset">
          {([
            ['studio', 'Studio', 'Warm neutral, ink and olive'],
            ['midnight', 'Midnight', 'Deep navy and soft contrast'],
            ['paper', 'Paper', 'Ivory, graphite and earth'],
            ['high-contrast', 'High Contrast', 'Clear boundaries and stronger text'],
          ] as [AppearancePreset, string, string][]).map(([preset, title, detail]) => {
            const selected = data.preferences.appearancePreset === preset
            return <button key={preset} type="button" className={`theme-option theme-option--${preset}${selected ? ' theme-option--selected' : ''}`} aria-pressed={selected} onClick={() => updatePreferences({ appearancePreset: preset })}>
              <span className="theme-preview" data-preview={preset} aria-hidden="true"><span className="theme-preview__rail" /><span className="theme-preview__content"><i /><i /><i /><b /></span></span>
              <span className="theme-option__label"><span><strong>{title}</strong><small>{detail}</small></span>{selected && <span className="theme-option__selected"><Check size={14} /> Selected</span>}</span>
            </button>
          })}
        </div>
      </div>
      <div className="appearance-controls-grid">
        <div className="appearance-control-group">
          <div className="appearance-control-heading"><div><h4>Accent color</h4><p>Used for highlights, focus and progress.</p></div></div>
          <div className="accent-options" role="group" aria-label="Accent color">
            {([
              ['olive', 'Olive'], ['blue', 'Ocean blue'], ['terracotta', 'Terracotta'], ['violet', 'Iris'], ['teal', 'Teal'],
            ] as [AccentColor, string][]).map(([accent, label]) => <button key={accent} type="button" className={`accent-swatch accent-swatch--${accent}`} aria-label={`${label} accent`} aria-pressed={data.preferences.accentColor === accent} onClick={() => updatePreferences({ accentColor: accent })}><span>{data.preferences.accentColor === accent && <Check size={15} />}</span></button>)}
          </div>
        </div>
        <div className="appearance-control-group appearance-select-group">
          <Field label="Color mode"><select value={data.preferences.appearanceMode} onChange={(event) => chooseMode(event.target.value as AppearanceMode)}><option value="system">System preference</option><option value="light">Always light</option><option value="dark">Always dark</option></select></Field>
          <Field label="Layout density"><select value={data.preferences.density} onChange={(event) => updatePreferences({ density: event.target.value as LayoutDensity }, 'Layout density updated.')}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field>
        </div>
      </div>
      <label className="setting-toggle"><span><strong>Reduce motion</strong><small>Use quieter transitions throughout the workspace.</small></span><input type="checkbox" checked={data.preferences.reducedMotion} onChange={(event) => updatePreferences({ reducedMotion: event.target.checked }, event.target.checked ? 'Reduced motion enabled.' : 'Reduced motion disabled.')} /><span className="setting-toggle__track" aria-hidden="true"><span /></span></label>
    </Card>
    <Card className="settings-card" padding="large"><form className="editor-form" onSubmit={(event) => void save(event)}><h3>Account preferences</h3><p className="muted-copy">Your display name, time format, week start, and timezone are synced to your account. Sync status: {cloudPreferenceStatus === 'loading' ? 'connecting' : cloudPreferenceStatus === 'ready' ? 'online' : cloudPreferenceStatus === 'offline' ? 'using cached data' : 'error'}.</p><div className="form-grid"><Field label="Display name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field><Field label="Time format"><select value={data.preferences.timeFormat} onChange={(e) => update({ preferences: { ...data.preferences, timeFormat: e.target.value as '12h' | '24h' } })}><option value="12h">12-hour (3:30 PM)</option><option value="24h">24-hour (15:30)</option></select></Field><Field label="First day of the week"><select value={data.preferences.firstDayOfWeek} onChange={(e) => update({ preferences: { ...data.preferences, firstDayOfWeek: Number(e.target.value) as 0 | 1 } })}><option value={1}>Monday</option><option value={0}>Sunday</option></select></Field><Field label="IANA timezone"><input value={data.preferences.timeZoneId} onChange={(e) => update({ preferences: { ...data.preferences, timeZoneId: e.target.value } })} placeholder="Asia/Manila" required /></Field></div><Button type="submit" disabled={savingPreferences}>{savingPreferences ? 'Saving preferences…' : 'Save preferences'}</Button></form></Card>
    <Card className="settings-card" padding="large"><h3>Backup and transfer</h3><p className="muted-copy">Export a versioned JSON backup or merge one from Android or another browser. Existing records and local preferences stay in place.</p><div className="form-actions"><Button variant="secondary" onClick={exportData}>Export application data</Button><label className="button button--secondary button--medium">Import JSON backup<input className="visually-hidden" type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void readImport(file); e.currentTarget.value = '' }} /></label></div></Card>
    {hasLegacyData && <Card className="settings-card" padding="large"><h3>Previous browser workspace</h3><p className="muted-copy">An older workspace without an account association is still stored in this browser. It was not copied into this account. Export it to review or import it yourself; only do that if you own the data.</p><Button variant="secondary" onClick={exportLegacyData}>Export previous workspace</Button></Card>}
    <Card className="settings-card settings-danger" padding="large"><h3>Data management</h3><p className="muted-copy">Reset clears local workspace records and restores a blank workspace. This cannot be undone.</p><Button variant="secondary" onClick={() => setResetOpen(true)}><Trash2 size={15} /> Reset local data</Button></Card>
    <AlertDialog open={Boolean(pendingImport)} onOpenChange={(open: boolean) => { if (!open) setPendingImport(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Merge this workspace backup?</AlertDialogTitle><AlertDialogDescription>Imported records will be added to this workspace. Existing records, preferences, and timer state stay in place. Conflicting IDs are kept as separate records.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmImport}>Merge backup</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={resetOpen} onOpenChange={setResetOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset all local data?</AlertDialogTitle><AlertDialogDescription>This permanently deletes your courses, lessons, materials, tasks, schedule, plans, and focus history from this browser. Overseer will return to a blank Studio workspace.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep my data</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={reset}>Reset workspace</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}

function AssistantPage() {
  return <div className="workspace-page"><Card className="assistant-notice" padding="large"><span className="assistant-icon"><BookOpen size={22} /></span><p className="eyebrow">STUDY ASSISTANT</p><h2>Study assistant is planned for the AI integration phase.</h2><p>AI features are not connected yet. This page does not generate answers or simulate an assistant. You can keep organizing courses, lessons, materials, and tasks in your local study library.</p><Link className="button button--secondary button--medium" to="/library">Open study library <ArrowRight size={15} /></Link></Card></div>
}

function NotFound({ message = 'Try heading back to your workspace.' }: { message?: string }) {
  return <div className="placeholder-page"><span className="placeholder-icon"><BookOpen size={22} /></span><p className="eyebrow">NOT FOUND</p><h2>We couldn’t find that page.</h2><p>{message}</p><Link className="button button--secondary" to="/dashboard">Go to dashboard <ArrowRight size={15} /></Link></div>
}

export default function WorkspacePage({ page }: { page: PageKey }) {
  switch (page) {
    case 'schedule': return <SchedulePage />
    case 'dayPlanner': return <PlannerPage />
    case 'tasks': return <TasksPage />
    case 'library': return <LibraryPage />
    case 'import': return <LibraryPage importing />
    case 'course': return <CoursePage />
    case 'lesson': return <LessonPage />
    case 'focus': return <FocusPage />
    case 'progress': return <ProgressPage />
    case 'settings': return <SettingsPage />
    case 'assistant': return <AssistantPage />
    default: return <NotFound />
  }
}

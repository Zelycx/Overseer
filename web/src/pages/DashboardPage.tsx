import { ArrowRight, BookOpen, Clock3, Flame, MoreHorizontal, Plus, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppDataContext'
import { addDays, durationLabel, eventOccursOnDate, formatDate, formatTime, localDateKey, startOfWeek } from '../data/dates'
import Badge from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/Button'
import Card from '../components/ui/Card'
import ProgressBar from '../components/ui/ProgressBar'
import SectionHeading from '../components/ui/SectionHeading'

export default function DashboardPage() {
  const { data, update } = useAppData()
  const today = localDateKey()
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const courseById = (id: string | null) => data.courses.find((course) => course.id === id)?.name ?? 'Personal'
  const todayEvents = data.events.filter((event) => eventOccursOnDate(event, today)).sort((a, b) => a.startTime.localeCompare(b.startTime))
  const upcoming = todayEvents.filter((event) => event.endTime > `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
  const pending = data.tasks.filter((task) => !task.completed).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const completed = data.tasks.filter((task) => task.completed)
  const todayFocusSeconds = data.focusSessions.filter((session) => session.mode === 'focus' && localDateKey(new Date(session.startedAt)) === today).reduce((sum, session) => sum + session.durationSeconds, 0)
  const totalFocusSeconds = data.focusSessions.filter((session) => session.mode === 'focus').reduce((sum, session) => sum + session.durationSeconds, 0)
  const nextDays = Array.from({ length: 61 }, (_, index) => addDays(today, index))
  const upcomingEvents = [
    ...data.events.filter((event) => !event.repeatWeekly && event.date >= today).map((event) => ({ ...event, displayDate: event.date })),
    ...data.events.filter((event) => event.repeatWeekly).flatMap((event) => nextDays.filter((day) => eventOccursOnDate(event, day)).map((day) => ({ ...event, displayDate: day }))),
  ].filter((event) => event.displayDate > today || event.endTime > `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    .sort((a, b) => a.displayDate.localeCompare(b.displayDate) || a.startTime.localeCompare(b.startTime)).slice(0, 4)
  const weekStart = new Date(`${startOfWeek(today, data.preferences.firstDayOfWeek)}T12:00:00`)
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart); date.setDate(weekStart.getDate() + index)
    const key = localDateKey(date)
    const seconds = data.focusSessions.filter((session) => session.mode === 'focus' && localDateKey(new Date(session.startedAt)) === key).reduce((sum, session) => sum + session.durationSeconds, 0)
    return { label: new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(date), seconds }
  })
  const maxFocus = Math.max(1, ...weekly.map((day) => day.seconds))
  const courses = data.courses.slice(0, 3).map((course) => {
    const lessons = data.lessons.filter((lesson) => lesson.courseId === course.id)
    const done = lessons.filter((lesson) => lesson.completed).length
    return { ...course, lessonsComplete: done, lessonsTotal: lessons.length, progress: lessons.length ? Math.round(done / lessons.length * 100) : 0 }
  })
  const recent = [
    ...data.focusSessions.map((session) => ({ at: session.endedAt, title: `${session.mode === 'focus' ? 'Focus session' : 'Break'} completed`, detail: courseById(session.courseId) })),
    ...data.lessons.filter((lesson) => lesson.completed).map((lesson) => ({ at: lesson.updatedAt, title: `Completed ${lesson.title}`, detail: courseById(lesson.courseId) })),
    ...data.tasks.filter((task) => task.completed && task.completedAt).map((task) => ({ at: task.completedAt!, title: `Completed ${task.title}`, detail: courseById(task.courseId) })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3)

  return (
    <div className="dashboard-page">
      <div className="dashboard-welcome-row">
        <div><h2>{greeting}{data.preferences.displayName && `, ${data.preferences.displayName}`} <span className="greeting-star">✳</span></h2><p className="dashboard-date">{formatDate(today)}</p><p className="dashboard-subtitle">Here’s a little space to make progress.</p></div>
        <ButtonLink to="/day-planner" variant="secondary"><Sparkles size={16} /> Plan my day</ButtonLink>
      </div>

      <div className="dashboard-grid dashboard-grid--top">
         <Card className="focus-summary-card" padding="large"><div className="card-top-line"><span className="focus-heading"><span className="stat-icon stat-icon--lime"><Flame size={17} /></span><span className="eyebrow">FOCUS THIS WEEK</span></span><Link to="/focus" className="icon-ornament" aria-label="Focus history"><MoreHorizontal size={19} /></Link></div><div className="focus-value">{durationLabel(weekly.reduce((sum, day) => sum + day.seconds, 0))}<span className="focus-change"><Clock3 size={13} /> {data.focusSessions.length} sessions</span></div><p className="muted-copy">{durationLabel(todayFocusSeconds)} today · {durationLabel(totalFocusSeconds)} total</p><div className="week-bars" aria-label="Weekly focus time chart">{weekly.map((day, index) => <div className="week-bar-column" key={`${day.label}-${index}`} title={`${day.label}: ${durationLabel(day.seconds)}`}><span className={`week-bar${localDateKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)) === today ? ' week-bar--today' : ''}`} style={{ height: `${Math.max(day.seconds ? 10 : 5, day.seconds / maxFocus * 100)}%` }} /><small>{day.label}</small></div>)}</div></Card>
      </div>

      <div className="dashboard-grid dashboard-grid--middle">
        <section className="dashboard-section"><SectionHeading title="Coming up" detail="Your schedule for today" action={<Link className="text-link" to="/schedule">Full schedule <ArrowRight size={14} /></Link>} /><Card className="agenda-card" padding="small">{todayEvents.length ? todayEvents.slice(0, 4).map((event, index) => <div className={`agenda-row${index === 0 ? ' agenda-row--next' : ''}`} key={event.id}><div className="agenda-time"><strong>{formatTime(event.startTime, data.preferences.timeFormat)}</strong><span>{formatTime(event.endTime, data.preferences.timeFormat)}</span></div><span className={`agenda-marker agenda-marker--${event.color}`} /><div className="agenda-event"><strong>{event.title}</strong><span>{courseById(event.courseId)}{event.location ? ` · ${event.location}` : ''}</span></div>{upcoming[0]?.id === event.id && <Badge tone="soft">UP NEXT</Badge>}</div>) : <p className="empty-copy">Nothing scheduled today. Add an event when you’re ready.</p>}<Link to="/schedule?new=1" className="agenda-add"><Plus size={15} /> Add schedule event</Link></Card></section>
        <section className="dashboard-section"><SectionHeading title="Your priorities" detail={`${pending.length} pending · ${completed.length} completed`} action={<Link className="text-link" to="/tasks">All tasks <ArrowRight size={14} /></Link>} /><Card className="tasks-card" padding="small"><div className="priority-progress"><ProgressBar value={pending.length + completed.length ? completed.length / (pending.length + completed.length) * 100 : 0} label="Task completion" /><span>{completed.length} of {pending.length + completed.length} complete</span></div>{pending.slice(0, 3).map((task) => <div className="task-row" key={task.id}><motion.button type="button" className="task-check task-check-button" aria-label={`Complete ${task.title}`} onClick={() => update({ tasks: data.tasks.map((item) => item.id === task.id ? { ...item, completed: true, completedAt: new Date().toISOString() } : item) })} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 480, damping: 24 }} /><div className="task-info"><strong>{task.title}</strong><span>{courseById(task.courseId)}</span></div><div className="task-meta"><span className={`priority-dot priority-dot--${task.priority.toLowerCase()}`} /><span>{task.dueDate ? formatDate(task.dueDate, { month: 'short', day: 'numeric' }) : 'No due date'}</span></div></div>)}{pending.length === 0 && <p className="empty-copy">You’re all caught up. Add a task when the next one comes along.</p>}<Link to="/tasks?new=1" className="task-add"><Plus size={15} /> Create a task</Link></Card></section>
      </div>

      <section className="dashboard-section"><SectionHeading title="Upcoming events" detail="Your next scheduled events" action={<Link className="text-link" to="/schedule">Open schedule <ArrowRight size={14} /></Link>} /><Card className="agenda-card upcoming-event-list" padding="small">{upcomingEvents.map((event, index) => <div className="agenda-row" key={`${event.id}-${event.displayDate}-${index}`}><div className="agenda-time"><strong>{formatDate(event.displayDate, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><span>{formatTime(event.startTime, data.preferences.timeFormat)} – {formatTime(event.endTime, data.preferences.timeFormat)}</span></div><span className={`agenda-marker agenda-marker--${event.color}`} /><div className="agenda-event"><strong>{event.title}</strong><span>{courseById(event.courseId)}{event.location ? ` · ${event.location}` : ''}</span></div></div>)}{upcomingEvents.length === 0 && <p className="empty-copy">No upcoming events are scheduled. Add one from your schedule.</p>}</Card></section>

      <section className="dashboard-section courses-section"><SectionHeading title="Pick up where you left off" detail="A little progress goes a long way" action={<Link className="text-link" to="/library">Open library <ArrowRight size={14} /></Link>} /><div className="course-grid">{courses.map((course) => <Card className="course-card" key={course.id} padding="medium"><span className={`course-icon course-icon--${course.tint} course-card__icon`}><BookOpen size={17} /></span><div className="course-card__main"><span className="course-code">{course.code || 'COURSE'}</span><Link className="course-card__title" to={`/courses/${course.id}`}>{course.name}</Link><p>{course.lessonsComplete} of {course.lessonsTotal} lessons completed</p><div className="course-progress"><ProgressBar value={course.progress} label={`${course.name} course progress`} /><span>{course.progress}%</span></div></div><Link className="course-continue" to={`/courses/${course.id}`}>Continue <ArrowRight size={14} /></Link></Card>)}</div>{courses.length === 0 && <div className="empty-state"><p className="empty-copy">Create your first course in the study library.</p><Link className="text-link" to="/library">Open study library <ArrowRight size={14} /></Link></div>}</section>
      <div className="dashboard-grid dashboard-extra-grid"><section><SectionHeading title="Recent learning activity" action={<Link className="text-link" to="/progress">View progress <ArrowRight size={14} /></Link>} /><Card className="activity-list" padding="small">{recent.length ? recent.map((item, index) => <div className="activity-row" key={`${item.at}-${index}`}><span className="activity-dot" /><span className="activity-row__copy"><strong>{item.title}</strong><small>{item.detail}</small></span><time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.at))}</time></div>) : <p className="empty-copy">Completed lessons, tasks, and focus sessions will show up here.</p>}</Card></section><section><SectionHeading title="Quick actions" /><Card className="quick-actions" padding="medium"><Link to="/tasks?new=1"><Plus size={16} /> Add task</Link><Link to="/schedule?new=1"><Plus size={16} /> Add schedule</Link><Link to="/focus?start=1"><Flame size={16} /> Start focus</Link><Link to="/library/import"><BookOpen size={16} /> Add study material</Link></Card></section></div>
      <div className="dashboard-footer-callout"><div className="callout-icon"><Sparkles size={17} /></div><div><strong>Study assistant</strong><span>AI is not connected. This route explains what will be available in a later phase.</span></div><Link to="/assistant" aria-label="Open study assistant"><ArrowRight size={17} /></Link></div>
    </div>
  )
}

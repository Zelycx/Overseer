import { ArrowRight, BookOpen, CalendarDays, Clock3, Flame, ListChecks, MoreHorizontal, Plus, Sparkles, Target } from 'lucide-react'
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
  const dueToday = pending.filter((task) => task.dueDate === today)
  const completed = data.tasks.filter((task) => task.completed)
  const todayBlocks = data.plannerBlocks.filter((block) => block.date === today)
  const plannedMinutes = [...todayEvents, ...todayBlocks].reduce((sum, item) => {
    const [sh, sm] = item.startTime.split(':').map(Number); const [eh, em] = item.endTime.split(':').map(Number)
    return sum + Math.max(0, ((eh ?? 0) * 60 + (em ?? 0)) - ((sh ?? 0) * 60 + (sm ?? 0)))
  }, 0)
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
      <div>
        <p className="dashboard-date">{formatDate(today)}</p>
        <h2>
          {greeting}{data.preferences.displayName && `, ${data.preferences.displayName}`}{' '}
          <span className="greeting-star">✳</span>
        </h2>
        <p className="dashboard-subtitle">Here’s a little space to make progress.</p>
      </div>
      <ButtonLink to="/day-planner" variant="secondary">
        <Sparkles size={16} /> Plan my day
      </ButtonLink>
    </div>

    {/* ROW 1 */}
    <div className="dashboard-grid dashboard-grid--balanced">
      <section className="dashboard-section">
        <SectionHeading
  title="Coming up"
  detail="Your schedule for today"
  icon={
<Link to="/schedule?new=1" className="section-heading__icon-link" aria-label="Add schedule event">      <CalendarDays size={20} />
    </Link>
  }
/>
<Link to="/schedule" className="dashboard-card-link">
  <Card className="agenda-card" padding="small">          {todayEvents.length ? todayEvents.slice(0, 4).map((event, index) => (
            <div className={`agenda-row${index === 0 ? ' agenda-row--next' : ''}`} key={event.id}>
              <div className="agenda-time">
                <strong>{formatTime(event.startTime, data.preferences.timeFormat)}</strong>
                <span>{formatTime(event.endTime, data.preferences.timeFormat)}</span>
              </div>
              <span className={`agenda-marker agenda-marker--${event.color}`} />
              <div className="agenda-event">
                <strong>{event.title}</strong>
                <span>{courseById(event.courseId)}{event.location ? ` · ${event.location}` : ''}</span>
              </div>
              {upcoming[0]?.id === event.id && <Badge tone="soft">UP NEXT</Badge>}
            </div>
          )) : <p className="empty-copy">Nothing scheduled today. Add an event when you’re ready.</p>}
        </Card>
        </Link>
      </section>

      <section className="dashboard-section">
      <SectionHeading
  title="Your priorities"
  detail={`${pending.length} pending · ${completed.length} completed`}
  icon={
<Link to="/tasks?new=1" className="section-heading__icon-link" aria-label="Create task">      <ListChecks size={20} />
    </Link>
  }
/>   
<Link to="/tasks" className="dashboard-card-link">
  <Card className="tasks-card" padding="small">          {pending.slice(0, 3).map((task) => (
            <div className="task-row" key={task.id}>
              <motion.button
                type="button"
                className="task-check task-check-button"
                aria-label={`Complete ${task.title}`}
                onClick={() => update({
                  tasks: data.tasks.map((item) => item.id === task.id
                    ? { ...item, completed: true, completedAt: new Date().toISOString() }
                    : item)
                })}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 480, damping: 24 }}
              />
              <div className="task-info">
                <strong>{task.title}</strong>
                <span>{courseById(task.courseId)}</span>
              </div>
              <div className="task-meta">
                <span className={`priority-dot priority-dot--${task.priority.toLowerCase()}`} />
                <span>{task.dueDate ? formatDate(task.dueDate, { month: 'short', day: 'numeric' }) : 'No due date'}</span>
              </div>
            </div>
          ))}
    {pending.length === 0 && (
  <p className="empty-copy">
    You’re all caught up. Add a task when the next one comes along.
  </p>
)}
        </Card>
        </Link>
      </section>
    </div>

    {/* ROW 2 */}
    <div className="dashboard-grid dashboard-grid--balanced">
      <section className="dashboard-section">
        <SectionHeading
  title="Upcoming events"
  detail="Your next scheduled events"
  icon={
<Link to="/schedule?new=1" className="section-heading__icon-link" aria-label="Add schedule event">      <CalendarDays size={20} />
    </Link>
  }
/>
<Link to="/schedule" className="dashboard-card-link">
  <Card className="agenda-card upcoming-event-list" padding="small">          {upcomingEvents.map((event, index) => (
            <div className="agenda-row" key={`${event.id}-${event.displayDate}-${index}`}>
              <div className="agenda-time">
                <strong>{formatDate(event.displayDate, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                <span>{formatTime(event.startTime, data.preferences.timeFormat)} – {formatTime(event.endTime, data.preferences.timeFormat)}</span>
              </div>
              <span className={`agenda-marker agenda-marker--${event.color}`} />
              <div className="agenda-event">
                <strong>{event.title}</strong>
                <span>{courseById(event.courseId)}{event.location ? ` · ${event.location}` : ''}</span>
              </div>
            </div>
          ))}
          {upcomingEvents.length === 0 && (
            <p className="empty-copy">No upcoming events are scheduled. Add one from your schedule.</p>
          )}
        </Card>
        </Link>
      </section>

      <section className="dashboard-section courses-section">
       <SectionHeading
  title="Pick up where you left off"
  detail="A little progress goes a long way"
  icon={
<Link to="/library/import" className="section-heading__icon-link" aria-label="Add study material">      <BookOpen size={20} />
    </Link>
  }
/>
        <div className="course-grid">
          {courses.map((course) => (
            
<Link
  to={`/courses/${course.id}`}
  className="dashboard-card-link"
  key={course.id}
>
  <Card className="course-card" padding="medium">              <div className="course-card__top">
                <span className={`course-icon course-icon--${course.tint}`}>
                  <BookOpen size={17} />
                </span>
                <span className="course-code">{course.code || 'COURSE'}</span>
                <span className="icon-ornament course-menu" aria-hidden="true">
                  <MoreHorizontal size={18} />
                </span>
              </div>
              <span className="course-card__title">{course.name}</span>
              <p>{course.lessonsComplete} of {course.lessonsTotal} lessons completed</p>
              <div className="course-progress">
                <ProgressBar value={course.progress} label={`${course.name} course progress`} />
                <span>{course.progress}%</span>
              </div>
            </Card>
            </Link>
          ))}
        </div>
        {courses.length === 0 && (
  <Link to="/library" className="dashboard-card-link">
    <Card padding="small">
      <div className="empty-tasks-content">
        <p className="empty-copy">Create your first course in the study library.</p>
        <Link to="/assistant" className="callout-icon" aria-label="Open study assistant">
          <Sparkles size={24} />
        </Link>
      </div>
    </Card>
  </Link>
)}
      </section>
    </div>

    {/* ROW 3 */}
    <div className="dashboard-grid dashboard-grid--balanced">
      <section className="dashboard-section">
        <SectionHeading
  title="Focus"
  icon={
<Link to="/focus?start=1" className="section-heading__icon-link" aria-label="Start focus session">      <Flame size={20} />
    </Link>
  }
/>
<Link to="/focus" className="dashboard-card-link">
  <Card className="focus-summary-card" padding="large">          <div className="card-top-line">
        
          </div>
          <span className="eyebrow">FOCUS THIS WEEK</span>
          <div className="focus-value">
            <div className="focus-value-main">
              {durationLabel(weekly.reduce((sum, day) => sum + day.seconds, 0))}
              <span className="focus-change">
                <Clock3 size={13} /> {data.focusSessions.length} sessions
              </span>
            </div>
            <span className="muted-copy focus-secondary">
              {durationLabel(todayFocusSeconds)} today · {durationLabel(totalFocusSeconds)} total
            </span>
          </div>
          <div className="week-bars" aria-label="Weekly focus time chart">
            {weekly.map((day, index) => (
              <div
                className="week-bar-column"
                key={`${day.label}-${index}`}
                title={`${day.label}: ${durationLabel(day.seconds)}`}
              >
                <span
                  className={`week-bar${localDateKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)) === today ? ' week-bar--today' : ''}`}
                  style={{ height: `${Math.max(day.seconds ? 10 : 5, day.seconds / maxFocus * 100)}%` }}
                />
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </Card>
        </Link>
      </section>

      <section className="dashboard-section">
        <SectionHeading
          title="Recent learning activity"
        />
<Link to="/progress" className="dashboard-card-link">
  <Card padding="small">          {recent.length ? recent.map((item, index) => (
            <div className="activity-row" key={`${item.at}-${index}`}>
              <span className="activity-dot" />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.detail} · {new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  }).format(new Date(item.at))}
                </small>
              </span>
            </div>
          )) : (
            <p className="empty-copy">Completed lessons, tasks, and focus sessions will show up here.</p>
          )}
        </Card>
        </Link>
      </section>
    </div>
  </div>
)

}

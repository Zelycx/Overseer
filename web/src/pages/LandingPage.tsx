import { ArrowRight, BookOpenCheck, CalendarDays, CirclePlay, Sparkles, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppDataContext'
import { durationLabel, formatDate, formatTime, localDateKey, startOfWeek } from '../data/dates'

const features = [
  { icon: CalendarDays, title: 'Plan around real life', text: 'Build a day that leaves room for classes, breaks, and the work that matters.' },
  { icon: BookOpenCheck, title: 'Learn with your materials', text: 'Keep courses, notes, and lessons together in one calm study space.' },
  { icon: Timer, title: 'Make focus feel doable', text: 'Start with one session, then let steady progress build over time.' },
]

export default function LandingPage() {
  const { data } = useAppData()
  const today = localDateKey()
  const todayEvents = data.events.filter((event) => event.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 2)
  const pendingTask = data.tasks.find((task) => !task.completed)
  const completedTasks = data.tasks.filter((task) => task.completed).length
  const weekStart = new Date(`${startOfWeek(today, data.preferences.firstDayOfWeek)}T00:00:00`).getTime()
  const focusSeconds = data.focusSessions.filter((session) => session.mode === 'focus' && new Date(session.startedAt).getTime() >= weekStart).reduce((total, session) => total + session.durationSeconds, 0)
  const currentYear = new Date().getFullYear()
  const courseName = (id: string | null) => data.courses.find((course) => course.id === id)?.name ?? 'Personal'

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link to="/" className="brand" aria-label="Overseer home"><span className="brand__mark"><span /></span><span className="brand__word">overseer</span></Link>
        <nav aria-label="Main menu"><a href="#features">Features</a><Link to="/dashboard">Open workspace</Link><Link className="button button--primary button--small" to="/dashboard">Get started <ArrowRight size={15} /></Link></nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <span className="eyebrow-pill"><span /> STUDY WITH A LITTLE MORE CLARITY</span>
            <h1>Your time.<br /><span>Your lessons.</span><br />Under control.</h1>
            <p>Overseer brings your schedule, study materials, and next steps into one thoughtful space—so you can focus on learning, not keeping track of everything.</p>
            <div className="landing-hero__actions"><Link className="button button--primary button--large" to="/dashboard">Open my workspace <ArrowRight size={17} /></Link><Link className="landing-preview-link" to="/dashboard"><CirclePlay size={18} /> Open workspace</Link></div>
            <div className="landing-proof"><span className="landing-proof__mark"><BookOpenCheck size={15} /></span><span>Made for the way students really study</span></div>
          </div>

          <div className="landing-visual" aria-label="Preview of your local study workspace">
            <div className="landing-orbit landing-orbit--one" /><div className="landing-orbit landing-orbit--two" />
            <div className="landing-note landing-note--top"><span className="landing-note__dot" /><span>One thing at a time</span></div>
            <div className="preview-window">
              <div className="preview-window__top"><span /><span /><span /><small>MY DAY</small><b>···</b></div>
              <div className="preview-window__content">
                <div className="preview-welcome"><div><small>{formatDate(today).toUpperCase()}</small><h3>Looking good, {data.preferences.displayName || 'Student'}.</h3><p>Your local study space is ready.</p></div><div className="preview-sun">✳</div></div>
                <div className="preview-stats">
                  <div><small>FOCUS THIS WEEK</small><strong>{durationLabel(focusSeconds)}</strong><span className="preview-up">Saved on this device</span></div>
                  <div><small>TASKS DONE</small><strong>{completedTasks} <em>/ {data.tasks.length}</em></strong><div className="preview-mini-progress"><span style={{ width: `${data.tasks.length ? completedTasks / data.tasks.length * 100 : 0}%` }} /></div></div>
                </div>
                <div className="preview-agenda"><div className="preview-agenda__heading"><b>Up next</b><Link to="/schedule">View day <ArrowRight size={12} /></Link></div>
                  {todayEvents.length ? todayEvents.map((event) => <div className={`preview-event${event.color === 'lime' ? ' preview-event--lime' : ''}`} key={event.id}><span className="preview-event__line" /><div><small>{formatTime(event.startTime, data.preferences.timeFormat)} – {formatTime(event.endTime, data.preferences.timeFormat)}</small><b>{event.title}</b><span>{courseName(event.courseId)}{event.location ? ` · ${event.location}` : ''}</span></div><span className="preview-event__icon">{event.type === 'study' ? <Timer size={15} /> : <CalendarDays size={15} />}</span></div>) : <div className="preview-empty-line">No events scheduled today</div>}
                </div>
                <div className="preview-task">{pendingTask ? <><span className="preview-task__check" /><span><b>{pendingTask.title}</b><small>{pendingTask.dueDate ? `Due ${formatDate(pendingTask.dueDate, { month: 'short', day: 'numeric' })}` : 'No due date'} · {courseName(pendingTask.courseId)}</small></span><span className="preview-task__priority">{pendingTask.priority.toUpperCase()}</span></> : <span><b>No pending tasks</b><small>Add a task whenever you need.</small></span>}</div>
              </div>
            </div>
            <div className="landing-note landing-note--bottom"><span><Sparkles size={15} /></span><span>Progress, at your pace</span></div>
          </div>
          <div className="landing-hero__wash" />
        </section>

        <section className="landing-features" id="features">
          <div className="landing-section-intro"><span className="eyebrow">A calmer way to keep up</span><h2>Everything you need<br />to move forward.</h2><p>Less juggling tabs. More time for the work you came here to do.</p></div>
          <div className="feature-grid">{features.map(({ icon: Icon, title, text }, index) => <article className="feature-card" key={title}><span className={`feature-icon feature-icon--${index}`}><Icon size={21} /></span><h3>{title}</h3><p>{text}</p><Link to="/dashboard" aria-label={`Open workspace: ${title}`}><ArrowRight size={17} /></Link></article>)}</div>
        </section>

        <section className="landing-bottom-cta"><div><span className="eyebrow">YOUR NEXT STEP STARTS HERE</span><h2>Make a little room<br />for what matters.</h2></div><Link className="button button--lime button--large" to="/dashboard">Open workspace <ArrowRight size={17} /></Link></section>
      </main>
      <footer className="landing-footer"><Link to="/" className="brand"><span className="brand__mark"><span /></span><span className="brand__word">overseer</span></Link><span>Your time. Your lessons. Under control.</span><small>© {currentYear} Overseer · Local workspace</small></footer>
    </div>
  )
}

import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Flame,
  MoreHorizontal,
  Plus,
  Sparkles,
  Target,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatToday, getGreeting, previewCourses, previewEvents, previewTasks } from '../data/dashboard'
import Badge from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/Button'
import Card from '../components/ui/Card'
import ProgressBar from '../components/ui/ProgressBar'
import SectionHeading from '../components/ui/SectionHeading'

function formatTime(value: string) {
  const [hourString, minute] = value.split(':')
  const hour = Number(hourString)
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
}

export default function DashboardPage() {
  const pendingTasks = previewTasks.filter((task) => !task.complete)

  return (
    <div className="dashboard-page">
      <div className="dashboard-welcome-row">
        <div>
          <p className="dashboard-date">{formatToday()}</p>
          <h2>{getGreeting()}, Maya <span className="greeting-star">✳</span></h2>
          <p className="dashboard-subtitle">You’ve got this. Let’s make today count.</p>
        </div>
        <ButtonLink to="/day-planner" variant="secondary"><Sparkles size={16} /> Plan my day</ButtonLink>
      </div>

      <div className="dashboard-grid dashboard-grid--top">
        <Card className="day-plan-card" padding="large">
          <div className="day-plan-card__top"><div><span className="eyebrow eyebrow--light">YOUR DAY AT A GLANCE</span><h3>A good day starts<br />with a clear plan.</h3></div><div className="day-plan-ornament"><span /><span /><span /></div></div>
          <div className="day-plan-card__bottom"><div className="plan-metric"><span className="plan-metric__icon"><Clock3 size={15} /></span><span><strong>3h 30m</strong><small>planned today</small></span></div><div className="plan-metric"><span className="plan-metric__icon plan-metric__icon--lime"><Target size={15} /></span><span><strong>2 priorities</strong><small>to keep in view</small></span></div><ButtonLink to="/day-planner" variant="lime" size="small">View day plan <ArrowRight size={14} /></ButtonLink></div>
        </Card>

        <Card className="focus-summary-card" padding="large">
          <div className="card-top-line"><span className="stat-icon stat-icon--lime"><Flame size={17} /></span><span className="icon-ornament" aria-hidden="true"><MoreHorizontal size={19} /></span></div>
          <span className="eyebrow">FOCUS THIS WEEK</span>
          <div className="focus-value">4.5 <span>hrs</span><span className="focus-change"><ArrowUpRight size={14} /> 12%</span></div>
          <p className="muted-copy">A steady start to your week.</p>
          <div className="week-bars" aria-label="Weekly focus time chart">
            {[['M', 52], ['T', 76], ['W', 36], ['T', 88], ['F', 60], ['S', 24], ['S', 44]].map(([day, height], index) => <div className="week-bar-column" key={`${day}-${index}`}><span className={index === 3 ? 'week-bar week-bar--today' : 'week-bar'} style={{ height: `${height}%` }} /><small>{day}</small></div>)}
          </div>
        </Card>
      </div>

      <div className="dashboard-grid dashboard-grid--middle">
        <section className="dashboard-section">
          <SectionHeading title="Coming up" detail="Your schedule for today" action={<Link className="text-link" to="/schedule">Full schedule <ArrowRight size={14} /></Link>} />
          <Card className="agenda-card" padding="small">
            {previewEvents.map((event, index) => <div className={`agenda-row${index === 0 ? ' agenda-row--next' : ''}`} key={event.id}>
              <div className="agenda-time"><strong>{formatTime(event.start)}</strong><span>{formatTime(event.end)}</span></div>
              <span className={`agenda-marker agenda-marker--${event.color}`} />
              <div className="agenda-event"><strong>{event.title}</strong><span>{event.course}</span></div>
              {index === 0 && <Badge tone="soft">UP NEXT</Badge>}
            </div>)}
            <Link to="/schedule" className="agenda-add"><Plus size={15} /> View schedule</Link>
          </Card>
        </section>

        <section className="dashboard-section">
          <SectionHeading title="Your priorities" detail={`${pendingTasks.length} things to keep moving`} action={<Link className="text-link" to="/tasks">All tasks <ArrowRight size={14} /></Link>} />
          <Card className="tasks-card" padding="small">
            {pendingTasks.slice(0, 3).map((task) => <div className="task-row" key={task.id}>
              <span className="task-check" aria-hidden="true" />
              <div className="task-info"><strong>{task.title}</strong><span>{task.course}</span></div>
              <div className="task-meta"><span className={`priority-dot priority-dot--${task.priority.toLowerCase()}`} /><span>{task.due}</span></div>
            </div>)}
            <Link to="/tasks" className="task-add"><Plus size={15} /> View all tasks</Link>
          </Card>
        </section>
      </div>

      <section className="dashboard-section courses-section">
        <SectionHeading title="Pick up where you left off" detail="A little progress goes a long way" action={<Link className="text-link" to="/library">Open library <ArrowRight size={14} /></Link>} />
        <div className="course-grid">{previewCourses.map((course) => <Card className="course-card" key={course.id} padding="medium">
          <div className="course-card__top"><span className={`course-icon course-icon--${course.tint}`}><BookOpen size={17} /></span><span className="course-code">{course.code}</span><span className="icon-ornament course-menu" aria-hidden="true"><MoreHorizontal size={18} /></span></div>
          <Link className="course-card__title" to={`/courses/${course.id}`}>{course.title}</Link>
          <p>{course.lessonsComplete} of {course.lessonsTotal} lessons completed</p>
          <div className="course-progress"><ProgressBar value={course.progress} label={`${course.title} course progress`} /><span>{course.progress}%</span></div>
        </Card>)}</div>
      </section>

      <div className="dashboard-footer-callout"><div className="callout-icon"><Sparkles size={17} /></div><div><strong>Need a hand with a tricky topic?</strong><span>Your study assistant can help explain lessons when AI is connected.</span></div><Link to="/assistant" aria-label="Open study assistant"><ArrowRight size={17} /></Link></div>
      <p className="preview-disclaimer">You’re viewing a preview workspace. Dashboard details are sample content; your data has not been saved.</p>
    </div>
  )
}

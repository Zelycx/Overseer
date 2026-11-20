import { ArrowRight, BookOpen, CalendarDays, ChartNoAxesCombined, CircleHelp, FileUp, Focus, ListTodo, NotebookPen, Settings } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { pageDetails } from '../app/navigation'
import Card from '../components/ui/Card'

type WorkspacePageKey = 'schedule' | 'dayPlanner' | 'tasks' | 'library' | 'import' | 'course' | 'lesson' | 'assistant' | 'focus' | 'progress' | 'settings' | 'notFound'

const pageContent: Record<Exclude<WorkspacePageKey, 'course' | 'lesson' | 'notFound'>, { title: string; text: string; icon: typeof CalendarDays }> = {
  schedule: { title: 'Your schedule, at a glance.', text: 'A day and week calendar with event details, recurring classes, and conflict checks is coming in the next implementation stage.', icon: CalendarDays },
  dayPlanner: { title: 'Plan a day that has breathing room.', text: 'The planner will use your fixed schedule, task deadlines, and break preferences to suggest a realistic study plan for your approval.', icon: NotebookPen },
  tasks: { title: 'Keep your next steps together.', text: 'Task creation, due dates, priorities, and filters will be powered by local storage in the next implementation stage.', icon: ListTodo },
  library: { title: 'A home for everything you’re learning.', text: 'Courses, lessons, and locally imported materials will live together here. Your files will stay on this device by default.', icon: BookOpen },
  import: { title: 'Bring your notes with you.', text: 'HTML and TXT extraction, a content preview, and local saving are planned for the material import stage.', icon: FileUp },
  assistant: { title: 'Get help with the part that feels hard.', text: 'The study assistant is not connected to an AI service yet, so it will not generate or pretend to generate answers.', icon: CircleHelp },
  focus: { title: 'One focused session is a good start.', text: 'A timer with pause, resume, recovery after reload, and session history is planned for the learning features stage.', icon: Focus },
  progress: { title: 'Progress you can trust.', text: 'Learning progress will reflect completed lessons, quiz attempts, and tracked focus sessions—not just opened pages.', icon: ChartNoAxesCombined },
  settings: { title: 'Make your study space work for you.', text: 'Schedule preferences, AI permissions, privacy, and export options will be added as the local-first and integration layers are built.', icon: Settings },
}

export default function WorkspacePage({ page }: { page: WorkspacePageKey }) {
  const params = useParams()
  if (page === 'notFound') {
    return <div className="placeholder-page"><span className="placeholder-icon"><BookOpen size={22} /></span><p className="eyebrow">NOT FOUND</p><h2>We couldn’t find that page.</h2><p>Try heading back to your workspace.</p><Link className="button button--secondary" to="/dashboard">Go to dashboard <ArrowRight size={15} /></Link></div>
  }

  if (page === 'course' || page === 'lesson') {
    const isCourse = page === 'course'
    const title = isCourse ? 'Course details' : 'Lesson viewer'
    const detail = pageDetails['/library']
    return <div className="placeholder-page"><span className="placeholder-icon"><BookOpen size={22} /></span><p className="eyebrow">{detail.eyebrow.toUpperCase()}</p><h2>{title}</h2><p>This {isCourse ? 'course' : 'lesson'} page is ready for structured learning content. Identifier: <code>{params.courseId ?? params.lessonId}</code></p><Link className="button button--secondary" to="/library">Return to study library <ArrowRight size={15} /></Link></div>
  }

  const content = pageContent[page]
  const Icon = content.icon
  return (
    <div className="placeholder-page">
      <span className="placeholder-icon"><Icon size={22} /></span>
      <p className="eyebrow">{pageDetails[page === 'dayPlanner' ? '/day-planner' : page === 'import' ? '/library/import' : `/${page}`]?.eyebrow.toUpperCase() ?? 'WORKSPACE'}</p>
      <h2>{content.title}</h2>
      <p>{content.text}</p>
      <Card className="placeholder-status"><span className="placeholder-status__dot" /><span>This screen is part of the application foundation. It does not save or change data yet.</span></Card>
      <Link className="text-link" to="/dashboard">Back to dashboard <ArrowRight size={15} /></Link>
    </div>
  )
}

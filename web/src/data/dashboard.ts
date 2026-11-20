import type { DashboardCourse, DashboardEvent, DashboardTask } from '../types/app'

/** Sample content keeps the first-run preview useful until local storage is added. */
export const previewEvents: DashboardEvent[] = [
  { id: 'event-1', title: 'Discrete Mathematics', course: 'Lecture · Room 204', start: '09:00', end: '10:30', kind: 'class', color: 'navy' },
  { id: 'event-2', title: 'Study block', course: 'Data Structures', start: '11:00', end: '12:00', kind: 'study', color: 'lime' },
  { id: 'event-3', title: 'Human–Computer Interaction', course: 'Lecture · Design Lab', start: '13:30', end: '15:00', kind: 'class', color: 'blue' },
]

export const previewTasks: DashboardTask[] = [
  { id: 'task-1', title: 'Finish graph theory problem set', course: 'Discrete Mathematics', due: 'Today, 6:00 PM', priority: 'High', complete: false },
  { id: 'task-2', title: 'Review linked lists and stacks', course: 'Data Structures', due: 'Tomorrow', priority: 'Medium', complete: false },
  { id: 'task-3', title: 'Draft usability test questions', course: 'Human–Computer Interaction', due: 'Nov 21', priority: 'Low', complete: false },
]

export const previewCourses: DashboardCourse[] = [
  { id: 'cs-204', title: 'Data Structures', code: 'CS 204', progress: 68, lessonsComplete: 11, lessonsTotal: 16, tint: 'lavender' },
  { id: 'math-221', title: 'Discrete Mathematics', code: 'MATH 221', progress: 42, lessonsComplete: 7, lessonsTotal: 17, tint: 'mint' },
  { id: 'it-310', title: 'Human–Computer Interaction', code: 'IT 310', progress: 81, lessonsComplete: 13, lessonsTotal: 16, tint: 'sand' },
]

export function formatToday(date = new Date()): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date)
}

export function getGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

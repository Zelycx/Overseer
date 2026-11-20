export type DashboardEvent = {
  id: string
  title: string
  course: string
  start: string
  end: string
  kind: 'class' | 'study' | 'deadline'
  color: 'navy' | 'lime' | 'blue' | 'amber'
}

export type DashboardTask = {
  id: string
  title: string
  course: string
  due: string
  priority: 'High' | 'Medium' | 'Low'
  complete: boolean
}

export type DashboardCourse = {
  id: string
  title: string
  code: string
  progress: number
  lessonsComplete: number
  lessonsTotal: number
  tint: 'lavender' | 'mint' | 'sand'
}

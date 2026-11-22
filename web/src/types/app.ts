export type Priority = 'Low' | 'Medium' | 'High'
export type EventType = 'class' | 'study' | 'personal' | 'other'
export type EventColor = 'navy' | 'lime' | 'blue' | 'amber'
export type FocusMode = 'focus' | 'shortBreak' | 'longBreak'
export type TimerStatus = 'idle' | 'running' | 'paused'
export type Theme = 'light' | 'dark'
export type AppearancePreset = 'studio' | 'midnight' | 'paper' | 'high-contrast'
export type AppearanceMode = 'system' | 'light' | 'dark'
export type AccentColor = 'olive' | 'blue' | 'terracotta' | 'violet' | 'teal'
export type LayoutDensity = 'comfortable' | 'compact'

export interface UserPreferences {
  displayName: string
  /** Android keeps this optional profile detail; Web preserves it during round trips. */
  profileEmail?: string
  timeFormat: '12h' | '24h'
  firstDayOfWeek: 0 | 1
  /** Retained for compatibility with local records written before the appearance system. */
  theme: Theme
  appearancePreset: AppearancePreset
  appearanceMode: AppearanceMode
  accentColor: AccentColor
  density: LayoutDensity
  reducedMotion: boolean
  sidebarCollapsed: boolean
}

export interface Course {
  id: string
  name: string
  code: string
  description: string
  instructor: string
  tint: 'lavender' | 'mint' | 'sand'
  createdAt: string
}

export interface Lesson {
  id: string
  courseId: string
  title: string
  description: string
  content: string
  completed: boolean
  updatedAt: string
}

export interface StudyMaterial {
  id: string
  title: string
  courseId: string | null
  content: string
  fileName: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  description: string
  dueDate: string | null
  dueTime: string | null
  priority: Priority
  courseId: string | null
  completed: boolean
  createdAt: string
  completedAt: string | null
}

export interface ScheduleEvent {
  id: string
  title: string
  description: string
  date: string
  /** The event repeats on this weekday from `date` onward when true. */
  repeatWeekly: boolean
  startTime: string
  endTime: string
  type: EventType
  courseId: string | null
  location: string
  color: EventColor
  createdAt: string
}

export interface PlannerBlock {
  id: string
  date: string
  title: string
  startTime: string
  endTime: string
  taskId: string | null
  courseId: string | null
  completed: boolean
  order: number
  createdAt: string
}

export interface FocusSession {
  id: string
  mode: FocusMode
  startedAt: string
  endedAt: string
  durationSeconds: number
  courseId: string | null
  taskId: string | null
  completed: boolean
}

export interface FocusTimer {
  status: TimerStatus
  mode: FocusMode
  durationSeconds: number
  remainingSeconds: number
  startedAt: string | null
  segmentStartedAt: string | null
  elapsedSeconds: number
  endsAt: number | null
  courseId: string | null
  taskId: string | null
}

export interface AppData {
  preferences: UserPreferences
  courses: Course[]
  lessons: Lesson[]
  materials: StudyMaterial[]
  tasks: Task[]
  events: ScheduleEvent[]
  plannerBlocks: PlannerBlock[]
  focusSessions: FocusSession[]
  focusTimer: FocusTimer
}

export interface PersistedAppData {
  version: number
  data: AppData
}

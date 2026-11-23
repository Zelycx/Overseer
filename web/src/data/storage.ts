import type { AppData, PersistedAppData } from '../types/app'
import { localDateKey } from './dates'

export const STORAGE_KEY = 'overseer.local-data'
export const STORAGE_VERSION = 2

export function getAppDataStorageKey(userId: string | null): string {
  if (userId === null) return STORAGE_KEY
  if (userId.length === 0) throw new Error('A Firebase user ID cannot be empty.')
  return `${STORAGE_KEY}.user.${encodeURIComponent(userId)}`
}

function validDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  return date.getFullYear() === year && date.getMonth() === (month ?? 1) - 1 && date.getDate() === day
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function createId(prefix = 'item'): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `${prefix}-${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`
}

export function createEmptyData(): AppData {
  return {
    preferences: {
      displayName: 'Student',
      timeFormat: '12h',
      firstDayOfWeek: 1,
      timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      theme: 'light',
      appearancePreset: 'studio',
      appearanceMode: 'system',
      accentColor: 'olive',
      density: 'comfortable',
      reducedMotion: false,
      sidebarCollapsed: false,
    },
    courses: [], lessons: [], materials: [], tasks: [], events: [], plannerBlocks: [], focusSessions: [],
    focusTimer: { status: 'idle', mode: 'focus', durationSeconds: 25 * 60, remainingSeconds: 25 * 60, startedAt: null, segmentStartedAt: null, elapsedSeconds: 0, endsAt: null, courseId: null, taskId: null },
  }
}

export function createSeedData(now = new Date()): AppData {
  const data = createEmptyData()
  // Keep seeded IDs identical across Android and Web so a first-time backup
  // import recognizes the shared sample records instead of duplicating them.
  const stamp = '2026-01-01T00:00:00.000Z'
  const date = localDateKey(now)
  const courses = [
    { id: 'course-structures', name: 'Data Structures', code: 'CS 204', description: 'Core data structures, algorithms, and practical analysis.', instructor: 'Prof. Rivera', tint: 'lavender' as const },
    { id: 'course-math', name: 'Discrete Mathematics', code: 'MATH 221', description: 'Logic, graphs, counting, and proofs.', instructor: 'Dr. Chen', tint: 'mint' as const },
    { id: 'course-design', name: 'Human-Computer Interaction', code: 'IT 310', description: 'Research and design for usable interfaces.', instructor: 'Prof. Santos', tint: 'sand' as const },
  ]
  data.courses = courses.map((course) => ({ ...course, createdAt: stamp }))
  data.lessons = [
    ['lesson-array', courses[0]!.id, 'Arrays and linked lists', 'Compare contiguous and linked storage.', 'Arrays store items in contiguous memory and support constant-time indexed access. Linked lists connect nodes with references, which makes insertion flexible but indexed access slower.'],
    ['lesson-stacks', courses[0]!.id, 'Stacks and queues', 'Explore common linear structures.', 'A stack follows last-in, first-out. A queue follows first-in, first-out. Both are useful abstractions for managing work in order.'],
    ['lesson-trees', courses[0]!.id, 'Trees and traversals', 'Represent hierarchical data.', 'Trees organize values in parent and child relationships. Preorder, inorder, and postorder traversals visit nodes in different sequences.'],
    ['lesson-logic', courses[1]!.id, 'Propositional logic', 'Build and evaluate statements.', 'Propositions have truth values. Logical connectives combine them into compound statements that can be evaluated with truth tables.'],
    ['lesson-graphs', courses[1]!.id, 'Graph theory basics', 'Model relationships with graphs.', 'A graph is a set of vertices joined by edges. Graphs can represent networks, dependencies, and paths.'],
    ['lesson-research', courses[2]!.id, 'Usability research', 'Plan a useful study.', 'A usability study observes representative users completing realistic tasks. Clear prompts and careful note-taking reduce bias.'],
  ].map(([id, courseId, title, description, content], index) => ({ id: id!, courseId: courseId!, title: title!, description: description!, content: content!, completed: index === 0, updatedAt: stamp }))
  data.tasks = [
    { id: 'task-graph-set', title: 'Finish graph theory problem set', description: 'Complete questions 1–8 and check the proofs.', dueDate: date, dueTime: '18:00', priority: 'High', courseId: courses[1]!.id, completed: false, createdAt: stamp, completedAt: null },
    { id: 'task-stack-review', title: 'Review linked lists and stacks', description: 'Review notes and write a short comparison.', dueDate: null, dueTime: null, priority: 'Medium', courseId: courses[0]!.id, completed: false, createdAt: stamp, completedAt: null },
    { id: 'task-test-questions', title: 'Draft usability test questions', description: '', dueDate: null, dueTime: null, priority: 'Low', courseId: courses[2]!.id, completed: false, createdAt: stamp, completedAt: null },
  ]
  data.events = [
    { id: 'event-math', title: 'Discrete Mathematics', description: 'Lecture', date, repeatWeekly: false, startTime: '09:00', endTime: '10:30', type: 'class', courseId: courses[1]!.id, location: 'Room 204', color: 'navy', createdAt: stamp },
    { id: 'event-study', title: 'Study block', description: 'Review trees and traversals', date, repeatWeekly: false, startTime: '11:00', endTime: '12:00', type: 'study', courseId: courses[0]!.id, location: '', color: 'lime', createdAt: stamp },
    { id: 'event-hci', title: 'Human-Computer Interaction', description: 'Studio class', date, repeatWeekly: false, startTime: '13:30', endTime: '15:00', type: 'class', courseId: courses[2]!.id, location: 'Design Lab', color: 'blue', createdAt: stamp },
  ]
  return data
}

export function validateAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<AppData>
  if (!data.preferences || typeof data.preferences.displayName !== 'string' || !['12h', '24h'].includes(data.preferences.timeFormat)) return false
  if (data.preferences.firstDayOfWeek !== 0 && data.preferences.firstDayOfWeek !== 1) return false
  if (data.preferences.timeZoneId !== undefined && !validTimeZone(data.preferences.timeZoneId)) return false
  const rows = (key: keyof AppData): Record<string, unknown>[] | null => Array.isArray(data[key]) && (data[key] as unknown[]).every((entry) => !!entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string') ? data[key] as unknown as Record<string, unknown>[] : null
  const hasStrings = (row: Record<string, unknown>, fields: string[]) => fields.every((field) => typeof row[field] === 'string')
  const optionalId = (row: Record<string, unknown>, field: string) => row[field] === null || typeof row[field] === 'string'
  const courses = rows('courses'), lessons = rows('lessons'), materials = rows('materials'), tasks = rows('tasks'), events = rows('events'), blocks = rows('plannerBlocks'), sessions = rows('focusSessions')
  if (!courses || !lessons || !materials || !tasks || !events || !blocks || !sessions) return false
  if (!courses.every((row) => hasStrings(row, ['name','code','description','instructor','createdAt']) && ['lavender','mint','sand'].includes(String(row.tint)))) return false
  if (!lessons.every((row) => hasStrings(row, ['courseId','title','description','content','updatedAt']) && typeof row.completed === 'boolean')) return false
  if (!materials.every((row) => hasStrings(row, ['title','content','fileName','createdAt','updatedAt']) && optionalId(row, 'courseId'))) return false
  if (!tasks.every((row) => hasStrings(row, ['title','description','createdAt']) && ['Low','Medium','High'].includes(String(row.priority)) && typeof row.completed === 'boolean' && optionalId(row, 'courseId') && optionalId(row, 'dueDate') && optionalId(row, 'dueTime') && optionalId(row, 'completedAt'))) return false
  if (!events.every((row) => hasStrings(row, ['title','description','date','startTime','endTime','location','createdAt']) && (row.repeatWeekly === undefined || typeof row.repeatWeekly === 'boolean') && ['class','study','personal','other'].includes(String(row.type)) && ['navy','lime','blue','amber'].includes(String(row.color)) && optionalId(row, 'courseId'))) return false
  if (!blocks.every((row) => hasStrings(row, ['date','title','startTime','endTime','createdAt']) && typeof row.completed === 'boolean' && Number.isFinite(row.order) && optionalId(row, 'courseId') && optionalId(row, 'taskId'))) return false
  if (!sessions.every((row) => hasStrings(row, ['startedAt','endedAt']) && ['focus','shortBreak','longBreak'].includes(String(row.mode)) && Number.isFinite(row.durationSeconds) && optionalId(row, 'courseId') && optionalId(row, 'taskId') && typeof row.completed === 'boolean')) return false
  if (!tasks.every((row) => (row.dueDate === null || validDateKey(row.dueDate)) && (row.dueTime === null || validTime(row.dueTime)))) return false
  if (!events.every((row) => validDateKey(row.date) && validTime(row.startTime) && validTime(row.endTime) && String(row.endTime) > String(row.startTime))) return false
  if (!blocks.every((row) => validDateKey(row.date) && validTime(row.startTime) && validTime(row.endTime) && String(row.endTime) > String(row.startTime))) return false
  const allIds = [...courses, ...lessons, ...materials, ...tasks, ...events, ...blocks, ...sessions].map((row) => row.id)
  if (new Set(allIds).size !== allIds.length) return false
  if (!data.focusTimer || !['idle', 'running', 'paused'].includes(data.focusTimer.status) || !['focus','shortBreak','longBreak'].includes(data.focusTimer.mode) || !Number.isFinite(data.focusTimer.durationSeconds) || !Number.isFinite(data.focusTimer.remainingSeconds) || !Number.isFinite(data.focusTimer.elapsedSeconds ?? 0) || !optionalId(data.focusTimer as unknown as Record<string, unknown>, 'courseId') || !optionalId(data.focusTimer as unknown as Record<string, unknown>, 'taskId') || !(data.focusTimer.endsAt === null || Number.isFinite(data.focusTimer.endsAt)) || !optionalId(data.focusTimer as unknown as Record<string, unknown>, 'startedAt') || !(data.focusTimer.segmentStartedAt === undefined || optionalId(data.focusTimer as unknown as Record<string, unknown>, 'segmentStartedAt'))) return false
  return true
}

function migrateAppData(value: AppData): AppData {
  const legacyTheme = value.preferences?.theme === 'dark' ? 'dark' : 'light'
  const preset = ['studio', 'midnight', 'paper', 'high-contrast'].includes(value.preferences?.appearancePreset)
    ? value.preferences.appearancePreset
    : legacyTheme === 'dark' ? 'midnight' : 'studio'
  const appearanceMode = ['system', 'light', 'dark'].includes(value.preferences?.appearanceMode)
    ? value.preferences.appearanceMode
    : legacyTheme
  const accentColor = ['olive', 'blue', 'terracotta', 'violet', 'teal'].includes(value.preferences?.accentColor)
    ? value.preferences.accentColor
    : 'olive'
  const density = value.preferences?.density === 'compact' ? 'compact' : 'comfortable'
  return {
    ...value,
    preferences: {
      ...value.preferences,
      appearancePreset: preset,
      appearanceMode,
      accentColor,
      density,
      timeZoneId: validTimeZone(value.preferences?.timeZoneId)
        ? value.preferences.timeZoneId
        : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
    focusTimer: {
      ...value.focusTimer,
      segmentStartedAt: value.focusTimer.segmentStartedAt ?? value.focusTimer.startedAt ?? null,
      elapsedSeconds: Number.isFinite(value.focusTimer.elapsedSeconds) ? value.focusTimer.elapsedSeconds : 0,
    },
    events: value.events.map((event) => ({ ...event, repeatWeekly: event.repeatWeekly === true })),
  }
}

export function loadAppData(userId: string | null = null): AppData {
  const storageKey = getAppDataStorageKey(userId)
  let raw: string | null
  try {
    raw = localStorage.getItem(storageKey)
  } catch {
    return createEmptyData()
  }
  if (raw === null) return createEmptyData()
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAppData>
    if (Number.isInteger(parsed.version) && parsed.version! >= 1 && parsed.version! <= STORAGE_VERSION && validateAppData(parsed.data)) return migrateAppData(parsed.data)
  } catch {
    // Preserve an unusable record below before starting a clean workspace.
  }
  try { localStorage.setItem(`${storageKey}.recovery`, raw) } catch { /* Storage may be unavailable or full. */ }
  return createEmptyData()
}

export function saveAppData(data: AppData, userId: string | null = null): void {
  const record: PersistedAppData = { version: STORAGE_VERSION, data }
  localStorage.setItem(getAppDataStorageKey(userId), JSON.stringify(record))
}

export function loadLegacyAppData(): AppData | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedAppData>
    if ((parsed.version === STORAGE_VERSION || parsed.version === 1) && validateAppData(parsed.data)) {
      return migrateAppData(parsed.data)
    }
  } catch {
    return null
  }
  return null
}

export function parseImportData(text: string): AppData {
  const parsed: unknown = JSON.parse(text)
  const maybeEnvelope = parsed as Partial<PersistedAppData>
  const isSupportedEnvelope = maybeEnvelope && Number.isInteger(maybeEnvelope.version) && maybeEnvelope.version! >= 1 && maybeEnvelope.version! <= STORAGE_VERSION
  const data = isSupportedEnvelope ? maybeEnvelope.data : parsed
  if (!validateAppData(data)) throw new Error('This file is not a valid Overseer data export.')
  return migrateAppData(data)
}

export type MergeSummary = { added: number; alreadyPresent: number; idConflicts: number }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function stableImportedId(value: unknown): string {
  const source = stableJson(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619)
  return `imported-${(hash >>> 0).toString(36)}`
}

/** Merge an imported workspace without replacing existing records or preferences. */
export function mergeAppData(current: AppData, imported: AppData): { data: AppData; summary: MergeSummary } {
  const merged: AppData = {
    ...current,
    courses: [...current.courses], lessons: [...current.lessons], materials: [...current.materials],
    tasks: [...current.tasks], events: [...current.events], plannerBlocks: [...current.plannerBlocks],
    focusSessions: [...current.focusSessions],
  }
  const summary: MergeSummary = { added: 0, alreadyPresent: 0, idConflicts: 0 }
  const idMap = new Map<string, string>()
  const usedIds = new Set([
    ...merged.courses, ...merged.lessons, ...merged.materials, ...merged.tasks,
    ...merged.events, ...merged.plannerBlocks, ...merged.focusSessions,
  ].map((row) => row.id))

  const mergeRows = <T extends { id: string }>(
    key: 'courses' | 'lessons' | 'materials' | 'tasks' | 'events' | 'plannerBlocks' | 'focusSessions',
    rows: T[],
    rewrite: (row: T) => T,
  ) => {
    const target = merged[key] as unknown as T[]
    for (const original of rows) {
      const mapped = rewrite(original)
      const sameId = target.find((row) => row.id === mapped.id)
      if (!sameId && !usedIds.has(mapped.id)) {
        idMap.set(original.id, original.id)
        target.push(mapped)
        usedIds.add(mapped.id)
        summary.added += 1
      } else if (stableJson(sameId) === stableJson(mapped)) {
        idMap.set(original.id, original.id)
        summary.alreadyPresent += 1
      } else {
        const baseId = stableImportedId(mapped)
        let nextId = baseId
        let suffix = 1
        while (true) {
          const importedCopy = target.find((row) => row.id === nextId)
          if (importedCopy) {
            if (stableJson(importedCopy) === stableJson({ ...mapped, id: nextId })) {
              idMap.set(original.id, nextId)
              summary.alreadyPresent += 1
              break
            }
            nextId = `${baseId}-${suffix++}`
            continue
          }
          if (usedIds.has(nextId)) { nextId = `${baseId}-${suffix++}`; continue }
          idMap.set(original.id, nextId)
          target.push({ ...mapped, id: nextId })
          usedIds.add(nextId)
          summary.added += 1
          summary.idConflicts += 1
          break
        }
      }
    }
  }

  mergeRows('courses', imported.courses, (row) => ({ ...row }))
  mergeRows('lessons', imported.lessons, (row) => ({ ...row, courseId: idMap.get(row.courseId) ?? row.courseId }))
  mergeRows('materials', imported.materials, (row) => ({ ...row, courseId: row.courseId ? idMap.get(row.courseId) ?? row.courseId : null }))
  mergeRows('tasks', imported.tasks, (row) => ({ ...row, courseId: row.courseId ? idMap.get(row.courseId) ?? row.courseId : null }))
  mergeRows('events', imported.events, (row) => ({ ...row, repeatWeekly: row.repeatWeekly === true, courseId: row.courseId ? idMap.get(row.courseId) ?? row.courseId : null }))
  mergeRows('plannerBlocks', imported.plannerBlocks, (row) => ({ ...row, courseId: row.courseId ? idMap.get(row.courseId) ?? row.courseId : null, taskId: row.taskId ? idMap.get(row.taskId) ?? row.taskId : null }))
  mergeRows('focusSessions', imported.focusSessions, (row) => ({ ...row, courseId: row.courseId ? idMap.get(row.courseId) ?? row.courseId : null, taskId: row.taskId ? idMap.get(row.taskId) ?? row.taskId : null }))

  // Local preferences and timer state are device-specific. Keep them intact on import.
  return { data: merged, summary }
}

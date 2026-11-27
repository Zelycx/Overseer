export type WorkerPagination = { hasMore: boolean; nextCursor: string | null; complete?: boolean }
export type WorkerErrorInfo = { code: string; message: string; retryable: boolean }

export class GoogleWorkerError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly payload: unknown) {
    super(message)
    this.name = 'GoogleWorkerError'
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function workerErrorInfo(value: unknown): WorkerErrorInfo | null {
  const rawError = record(value)?.error
  if (typeof rawError === 'string') return { code: 'GOOGLE_WORKER_ERROR', message: rawError, retryable: false }
  const error = record(rawError)
  if (!error) return null
  return {
    code: typeof error.code === 'string' ? error.code : 'GOOGLE_WORKER_ERROR',
    message: typeof error.message === 'string' ? error.message : typeof error.error === 'string' ? error.error : 'Google integration request failed.',
    retryable: error.retryable === true,
  }
}

export function paginationInfo(value: unknown): WorkerPagination | null {
  const pagination = record(record(value)?.pagination)
  if (!pagination || typeof pagination.hasMore !== 'boolean') return null
  return {
    hasMore: pagination.hasMore,
    nextCursor: typeof pagination.nextCursor === 'string' && pagination.nextCursor.length ? pagination.nextCursor : null,
    ...(typeof pagination.complete === 'boolean' ? { complete: pagination.complete } : {}),
  }
}

export function workerFailure(status: number, payload: unknown): GoogleWorkerError {
  const info = workerErrorInfo(payload)
  return new GoogleWorkerError(status, info?.code ?? `HTTP_${status}`, info?.message ?? `Google integration request failed (${status}).`, payload)
}

export function partialPage<T extends object>(error: unknown): T | null {
  if (!(error instanceof GoogleWorkerError)) return null
  const value = record(error.payload)
  return value && (Array.isArray(value.calendars) || Array.isArray(value.courses)) ? value as T : null
}

export function mergeCalendarItems<T extends { calendarId: string; event: { id?: string; summary?: string; start?: { dateTime?: string; date?: string } } }>(previous: T[], incoming: T[], append: boolean): T[] {
  const merged = new Map<string, T>()
  for (const row of (append ? previous : [])) merged.set(`${row.calendarId}:${row.event.id ?? `${row.event.summary ?? ''}:${row.event.start?.dateTime ?? row.event.start?.date ?? ''}`}`, row)
  for (const row of incoming) merged.set(`${row.calendarId}:${row.event.id ?? `${row.event.summary ?? ''}:${row.event.start?.dateTime ?? row.event.start?.date ?? ''}`}`, row)
  return [...merged.values()]
}

type HasId = { id?: string }
type CourseRecord<C extends HasId, W extends HasId, A extends HasId> = { course: C; courseWork: W[]; announcements: A[] }
export function mergeClassroomCourses<C extends HasId, W extends HasId, A extends HasId>(previous: CourseRecord<C, W, A>[], incoming: CourseRecord<C, W, A>[], append: boolean): CourseRecord<C, W, A>[] {
  const merged = new Map<string, CourseRecord<C, W, A>>()
  if (append) previous.forEach((course, index) => merged.set(course.course.id ?? `legacy-course-${index}`, course))
  const mergeRows = <T extends HasId>(left: T[], right: T[]) => [...new Map([...left, ...right].map((item, index) => [item.id ?? `missing-${index}`, item])).values()]
  incoming.forEach((record, index) => {
    const key = record.course.id ?? `incoming-course-${index}`
    const old = merged.get(key)
    merged.set(key, old ? { course: record.course, courseWork: mergeRows(old.courseWork, record.courseWork), announcements: mergeRows(old.announcements, record.announcements) } : record)
  })
  return [...merged.values()]
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import Card from '../ui/Card'
import { googleWorker } from '../../google/workerClient'
import { GoogleWorkerError, mergeCalendarItems, mergeClassroomCourses, paginationInfo, partialPage, workerErrorInfo } from '../../google/workerResponse'

type Provider = 'calendar' | 'classroom'
type Status = { connected: boolean; accountEmail?: string | null; grantedScopes?: string; connectedAt?: number | null }
type CalendarEvent = { id?: string; summary?: string; description?: string; location?: string; start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string } }
type ClassroomCourse = { id?: string; name?: string; section?: string; room?: string; courseState?: string }
type ClassroomRecord = { course: ClassroomCourse; courseWork: Array<{ id?: string; title?: string; dueDate?: { year?: number; month?: number; day?: number }; state?: string }>; announcements: Array<{ id?: string; text?: string; creationTime?: string }> }

export default function GoogleIntegrationPanel({ provider, date }: { provider: Provider; date?: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [items, setItems] = useState<Array<{ calendar: string; calendarId: string; event: CalendarEvent }>>([])
  const [courses, setCourses] = useState<ClassroomRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [nextRetryable, setNextRetryable] = useState(true)
  const calendarRange = useRef<{ from: string; to: string } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const title = provider === 'calendar' ? 'Google Calendar' : 'Google Classroom'

  const refreshStatus = useCallback(async () => {
    setStatus(await googleWorker.status(provider))
  }, [provider])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    if (params.get('google') && params.get('provider') === provider) {
      setNotice(params.get('google') === 'connected' ? `${title} connected.` : 'Google could not complete the connection. Review consent and try again.')
      params.delete('google'); params.delete('provider'); params.delete('message')
      window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`)
    }
    void refreshStatus().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : `${title} status is unavailable.`) })
    return () => { active = false }
  }, [provider, refreshStatus, title])

  const connect = async () => {
    setLoading(true); setError(''); setNotice('')
    try {
      const result = await googleWorker.begin(provider, window.location.href.split('#')[0] ?? window.location.origin)
      window.location.assign(result.authorizationUrl)
    } catch (cause) { setError(cause instanceof Error ? cause.message : `${title} authorization could not start.`); setLoading(false) }
  }

  const disconnect = async () => {
    setLoading(true); setError('')
    try {
      await googleWorker.disconnect(provider)
      setStatus({ connected: false }); setItems([]); setCourses([]); setNextCursor(null); setNextRetryable(true); calendarRange.current = null; setNotice(`${title} disconnected from Overseer.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : `${title} could not be disconnected.`) }
    finally { setLoading(false) }
  }

  const refreshData = async (continueFromCursor = false) => {
    setLoading(true); setError('')
    try {
      if (provider === 'calendar') {
        if (!continueFromCursor || !calendarRange.current) {
          const from = date ? new Date(`${date}T00:00:00`).toISOString() : new Date(Date.now() - 7 * 86400000).toISOString()
          const to = date ? new Date(new Date(`${date}T00:00:00`).getTime() + 86400000).toISOString() : new Date(Date.now() + 31 * 86400000).toISOString()
          calendarRange.current = { from, to }
        }
        const { from, to } = calendarRange.current
        const result = await googleWorker.calendar(from, to, continueFromCursor ? nextCursor : null)
        const incoming = result.calendars.flatMap((calendar) => calendar.events.map((event) => ({ calendar: calendar.calendarName, calendarId: calendar.calendarId, event })))
        setItems((previous) => mergeCalendarItems(previous, incoming, continueFromCursor))
        const pageError = workerErrorInfo(result)
        setNextCursor(paginationInfo(result)?.nextCursor ?? null)
        setNextRetryable(pageError?.retryable ?? true)
        if (pageError) setError(pageError.message)
      } else {
        const result = await googleWorker.classroom(continueFromCursor ? nextCursor : null)
        setCourses((previous) => mergeClassroomCourses(previous, result.courses, continueFromCursor))
        const pageError = workerErrorInfo(result)
        setNextCursor(paginationInfo(result)?.nextCursor ?? null)
        setNextRetryable(pageError?.retryable ?? true)
        if (pageError) setError(pageError.message)
      }
      await refreshStatus()
    } catch (cause) {
      const partial = partialPage<{ calendars?: Array<{ calendarId: string; calendarName: string; events: CalendarEvent[] }>; courses?: ClassroomRecord[] }>(cause)
      if (partial?.calendars && provider === 'calendar') {
        const incoming = partial.calendars.flatMap((calendar) => calendar.events.map((event) => ({ calendar: calendar.calendarName, calendarId: calendar.calendarId, event })))
        setItems((previous) => mergeCalendarItems(previous, incoming, continueFromCursor))
        setNextCursor(paginationInfo(partial)?.nextCursor ?? null)
        setNextRetryable(workerErrorInfo(partial)?.retryable ?? true)
      } else if (partial?.courses && provider === 'classroom') {
        setCourses((previous) => mergeClassroomCourses(previous, partial.courses!, continueFromCursor))
        setNextCursor(paginationInfo(partial)?.nextCursor ?? null)
        setNextRetryable(workerErrorInfo(partial)?.retryable ?? true)
      }
      const info = workerErrorInfo(partial) ?? (cause instanceof GoogleWorkerError ? { code: cause.code, message: cause.message, retryable: cause.code !== 'INVALID_PAGE_CURSOR' } : null)
      if (info?.code === 'INVALID_PAGE_CURSOR') {
        setNextCursor(null)
        setNextRetryable(false)
        setError('This Google data continuation expired or is invalid. Your loaded records are preserved; refresh to restart.')
      } else {
        if (info && !info.retryable) {
          setNextRetryable(false)
          if (!paginationInfo(partial)?.nextCursor) setNextCursor(null)
        }
        setError(info?.message ?? (cause instanceof Error ? cause.message : `Unable to load ${title} data.`))
      }
    }
    finally { setLoading(false) }
  }

  return <Card className="editor-card" padding="medium">
    <div className="library-heading"><div><h3>{title} <span className="eyebrow">GOOGLE</span></h3><p>{status?.connected ? `Connected${status.accountEmail ? ` as ${status.accountEmail}` : ''}` : status ? 'Not connected' : 'Checking connection…'}</p></div><div className="form-actions">{status?.connected ? <><Button variant="secondary" size="small" disabled={loading} onClick={() => void refreshData()}>{loading ? 'Refreshing…' : 'Refresh'}</Button><Button variant="secondary" size="small" disabled={loading} onClick={() => void disconnect()}>Disconnect</Button></> : <Button size="small" disabled={loading} onClick={() => void connect()}>{loading ? 'Connecting…' : `Connect ${provider === 'calendar' ? 'Calendar' : 'Classroom'}`}</Button>}</div></div>
    {notice && <p role="status" className="inline-notice inline-notice--success">{notice}</p>}{error && <p role="alert" className="inline-notice inline-notice--error">{error}</p>}
    {status?.connected && provider === 'calendar' && items.length > 0 && <div className="schedule-list">{items.map(({ calendar, calendarId, event }, index) => <div className="schedule-event-row" key={`${calendarId}:${event.id ?? index}`}><div className="schedule-event-time"><strong>{event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : event.start?.date ?? 'All day'}</strong><span>{event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : event.end?.date ?? ''}</span></div><span className="schedule-color-dot" /><div className="schedule-event-copy"><strong>{event.summary || '(Untitled event)'}</strong><p>{event.location || event.description || calendar}</p><small>Google Calendar · {calendar}{event.start?.timeZone ? ` · ${event.start.timeZone}` : ''}</small></div></div>)}</div>}
    {status?.connected && provider === 'calendar' && items.length === 0 && <p className="empty-copy">No Google Calendar events in this range. Use Refresh to check again.</p>}
    {status?.connected && provider === 'classroom' && courses.length > 0 && <div className="library-course-grid">{courses.map((record, index) => <article className="library-course" key={record.course.id ?? index}><span className="eyebrow">GOOGLE CLASSROOM · {record.course.courseState || 'COURSE'}</span><h4>{record.course.name || 'Untitled course'}</h4><p>{[record.course.section, record.course.room].filter(Boolean).join(' · ') || 'No section or room details'}</p><p>{record.courseWork.length} coursework items · {record.announcements.length} announcements</p>{record.courseWork.slice(0, 3).map((work) => <small key={work.id}>{work.title || 'Coursework'}{work.dueDate ? ` · Due ${work.dueDate.year}-${String(work.dueDate.month).padStart(2, '0')}-${String(work.dueDate.day).padStart(2, '0')}` : ''}</small>)}</article>)}</div>}
    {status?.connected && provider === 'classroom' && courses.length === 0 && <p className="empty-copy">No active Google Classroom courses are available to this account.</p>}
    {status?.connected && nextCursor && <Button variant="secondary" size="small" disabled={loading} onClick={() => void refreshData(true)}>{loading ? 'Loading…' : nextRetryable ? 'Load more Google data' : 'Continue past failed page'}</Button>}
  </Card>
}

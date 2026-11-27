import { getFirebaseServices } from '../firebase/client'
import { workerFailure } from './workerResponse'

const workerBase = (import.meta.env.VITE_GOOGLE_WORKER_URL as string | undefined)?.replace(/\/$/, '')

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!workerBase) throw new Error('Google integrations backend URL is not configured.')
  const { auth } = getFirebaseServices()
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to Overseer before using Google integrations.')
  const idToken = await user.getIdToken()
  const response = await fetch(`${workerBase}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json', ...init.headers },
    credentials: 'omit',
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw workerFailure(response.status, payload)
  }
  return response.json() as Promise<T>
}

export const googleWorker = {
  begin(provider: 'calendar' | 'classroom', returnUrl: string) {
    return request<{ authorizationUrl: string }>('/v1/google/web/authorize', { method: 'POST', body: JSON.stringify({ provider, returnUrl }) })
  },
  status(provider: 'calendar' | 'classroom') {
    return request<{ connected: boolean; provider?: string; accountEmail?: string | null; grantedScopes?: string; connectedAt?: number | null }>(`/v1/google/${provider}/status`)
  },
  calendar(timeMin: string, timeMax: string, cursor?: string | null) {
    const query = new URLSearchParams({ timeMin, timeMax })
    if (cursor) query.set('cursor', cursor)
    return request<{ calendars: Array<{ calendarId: string; calendarName: string; events: Array<{ id?: string; summary?: string; description?: string; location?: string; start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string } }> }>; pagination?: { hasMore: boolean; nextCursor: string | null; complete?: boolean }; error?: { code: string; message: string; retryable: boolean } }>(`/v1/google/calendar/events?${query}`)
  },
  classroom(cursor?: string | null) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    return request<{ courses: Array<{ course: { id?: string; name?: string; section?: string; room?: string; courseState?: string }; courseWork: Array<{ id?: string; title?: string; dueDate?: { year?: number; month?: number; day?: number }; state?: string }>; announcements: Array<{ id?: string; text?: string; creationTime?: string }> }>; pagination?: { hasMore: boolean; nextCursor: string | null; complete?: boolean }; error?: { code: string; message: string; retryable: boolean } }>(`/v1/google/classroom/courses${query}`)
  },
  disconnect(provider: 'calendar' | 'classroom') {
    return request<{ disconnected: boolean }>(`/v1/google/${provider}`, { method: 'DELETE' })
  },
}

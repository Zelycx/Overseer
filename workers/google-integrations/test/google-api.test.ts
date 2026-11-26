import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { loadProviderPage, pages, persistCredential } from '../src/index.js'
import { encryptPaginationCursor } from '../src/crypto.js'
import { SCOPES, type Env } from '../src/types.js'

const bindings = { ...(env as unknown as Env), GOOGLE_WEB_CLIENT_ID: 'web', GOOGLE_ANDROID_CLIENT_ID: 'android', GOOGLE_WEB_CLIENT_SECRET: 'secret', TOKEN_ENCRYPTION_CURRENT_VERSION: 'v1', TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: btoa(String.fromCharCode(...new Uint8Array(32).fill(4))) }) } as Env
const setupCredential = async () => persistCredential(bindings, 'page-user', 'classroom', 'android', { sub: 'google-page-user' }, SCOPES.classroom.join(' '), 'refresh-value')
const setupCalendarCredential = async () => persistCredential(bindings, 'page-user', 'calendar', 'android', { sub: 'google-page-user' }, SCOPES.calendar.join(' '), 'refresh-value')

afterEach(() => vi.unstubAllGlobals())
describe('Google API pagination and failures', () => {
  it('follows nextPageToken using the correct resource collection key', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); seen.push(url)
      return url.includes('pageToken=next') ? Response.json({ courseWork: [{ id: 'second' }] }) : Response.json({ courseWork: [{ id: 'first' }], nextPageToken: 'next' })
    }))
    const result = await pages('https://classroom.googleapis.com/v1/courses/c/courseWork?pageSize=100', 'access-token', 'courseWork')
    expect(result.map((item) => item.id)).toEqual(['first', 'second'])
    expect(seen).toHaveLength(2)
    expect(seen[1]).toContain('pageToken=next')
  })
  it('maps permission, quota, server, and malformed response errors without leaking provider bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private-provider-error-body', { status: 403 })))
    await expect(pages('https://classroom.googleapis.com/v1/courses', 'token', 'courses')).rejects.toMatchObject({ failure: { status: 403 } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota-details', { status: 429 })))
    await expect(pages('https://www.googleapis.com/calendar/v3/events', 'token')).rejects.toMatchObject({ failure: { status: 503 } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })))
    await expect(pages('https://www.googleapis.com/calendar/v3/events', 'token')).rejects.toMatchObject({ failure: { status: 503 } })
  })
  it('enforces the Worker subrequest page budget without silently dropping pending pages', async () => {
    const budget = { used: 42 }
    await expect(pages('https://www.googleapis.com/calendar/v3/events', 'token', 'items', budget)).rejects.toMatchObject({ status: 429 })
  })
  it('stops when Google repeats a page token instead of looping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [], nextPageToken: 'repeat' })))
    let failure: unknown
    try { await pages('https://www.googleapis.com/calendar/v3/events', 'token') } catch (error) { failure = error }
    expect((failure as { status?: number } | undefined)?.status).toBe(502)
  })
})

describe('bounded resumable provider pagination', () => {
  afterEach(async () => {
    vi.unstubAllGlobals()
    await bindings.DB.prepare('DELETE FROM google_credentials WHERE firebase_uid=?').bind('page-user').run()
  })

  it('returns a structured continuation at 42 calls and resumes without repeating completed rows', async () => {
    await setupCredential()
    let apiCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'short-lived-access', scope: SCOPES.classroom.join(' ') })
      apiCalls++
      if (url.includes('/courses?')) {
        expect(url).toContain('pageSize=20')
        const second = url.includes('pageToken=courses-next')
        return Response.json({ courses: second ? [{ id: 'c20', name: 'Course 20' }] : Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `Course ${i}` })), ...(!second ? { nextPageToken: 'courses-next' } : {}) })
      }
      return Response.json(url.includes('/courseWork') ? { courseWork: [] } : { announcements: [] })
    }))
    const firstPage = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', null)
    const first = firstPage.body as any
    expect(first.pagination.hasMore).toBe(true)
    expect(first.pagination.nextCursor).toEqual(expect.any(String))
    expect(apiCalls).toBe(42)
    expect(firstPage.status).toBe(200)
    expect(first.courses.length).toBeGreaterThan(0)
    expect(first.courses.length).toBeLessThanOrEqual(21)
    const cursor = first.pagination.nextCursor as string
    const secondPage = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', cursor)
    const second = secondPage.body as any
    expect(second.pagination.hasMore).toBe(false)
    expect(apiCalls).toBe(44)
  })

  it('continues Calendar event pages with the same date range and yields each event once', async () => {
    await setupCalendarCredential()
    let eventPage = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'short-lived-access', scope: SCOPES.calendar.join(' ') })
      if (url.pathname.endsWith('/calendarList')) return Response.json({ items: [{ id: 'primary', summary: 'Main' }] })
      eventPage++
      return Response.json({ items: [{ id: `event-${eventPage}` }], ...(eventPage < 42 ? { nextPageToken: `p${eventPage}` } : {}) })
    }))
    const fingerprint = 'calendar|2026-11-01T00:00:00.000Z|2026-12-01T00:00:00.000Z'
    const firstPage = await loadProviderPage(bindings, 'page-user', 'calendar', fingerprint, null, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')
    const first = firstPage.body as any
    expect(first.pagination.hasMore).toBe(true)
    expect(first.calendars[0].events).toHaveLength(41)
    const secondPage = await loadProviderPage(bindings, 'page-user', 'calendar', fingerprint, first.pagination.nextCursor, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')
    const second = secondPage.body as any
    expect(second.pagination.hasMore).toBe(false)
    expect(second.calendars[0].events).toHaveLength(1)
    expect(new Set([...first.calendars[0].events, ...second.calendars[0].events].map((event) => event.id)).size).toBe(42)
    await expect(loadProviderPage(bindings, 'page-user', 'calendar', 'calendar|different-range', first.pagination.nextCursor, '2026-11-02T00:00:00.000Z', '2026-12-01T00:00:00.000Z')).rejects.toMatchObject({ status: 400 })
  })

  it('deduplicates repeated provider records and page tokens cannot loop forever', async () => {
    await setupCredential()
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'short-lived-access', scope: SCOPES.classroom.join(' ') })
      calls++
      if (url.includes('/courses?')) return Response.json({ courses: [{ id: 'c1' }, { id: 'c1' }] })
      if (url.includes('/courseWorkMaterials')) return Response.json({ courseWorkMaterial: [{ id: 'm1' }, { id: 'm1' }] })
      return Response.json({ announcements: [] })
    }))
    const firstPage = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', null)
    const first = firstPage.body as any
    expect(first.courses).toHaveLength(1)
    expect(first.courses[0].courseWorkMaterials).toHaveLength(1)
    expect(first.pagination.hasMore).toBe(false)
    expect(calls).toBeLessThan(10)
  })

  it('maps Google API errors without exposing provider response details', async () => {
    await setupCredential()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('oauth2.googleapis.com/token')
      ? Response.json({ access_token: 'short-lived-access', scope: SCOPES.classroom.join(' ') })
      : new Response('private-provider-message', { status: 403 })))
    const result = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', null)
    expect(result.status).toBe(403)
    expect((result.body as any).error.code).toBe('GOOGLE_PERMISSION_DENIED')
    expect(JSON.stringify(result.body)).not.toContain('private-provider-message')
  })

  it('refreshes once and resumes pagination when a later page expires its access token', async () => {
    await setupCredential()
    let refreshes = 0, pageCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('oauth2.googleapis.com/token')) { refreshes++; return Response.json({ access_token: `access-${refreshes}`, scope: SCOPES.classroom.join(' ') }) }
      pageCalls++
      if (url.includes('/courses?')) return Response.json({ courses: [{ id: 'c1' }] })
      if (url.includes('/courseWorkMaterials')) return Response.json({ courseWorkMaterial: [] })
      if (pageCalls === 3) return new Response('expired', { status: 401 })
      return Response.json({ announcements: [{ id: 'a1' }] })
    }))
    const result = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', null)
    expect((result.body as any).pagination.hasMore).toBe(false)
    expect((result.body as any).courses[0].announcements.map((row: any) => row.id)).toEqual(['a1'])
    expect(refreshes).toBe(2)
    expect(pageCalls).toBe(4)
  })

  it('returns earlier results and an encrypted continuation after a later page returns 503', async () => {
    await setupCredential()
    let failedUrl = '', fail = true
    const seenUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); seenUrls.push(url)
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'short-lived-access', scope: SCOPES.classroom.join(' ') })
      if (url.includes('/courses?')) return Response.json({ courses: [{ id: 'c1', name: 'Course' }] })
      if (url.includes('/courseWorkMaterials')) return Response.json({ courseWorkMaterial: [{ id: 'material-1', title: 'Earlier result' }] })
      if (fail) { fail = false; failedUrl = url; return new Response('transient upstream failure', { status: 503 }) }
      return Response.json({ announcements: [{ id: 'announcement-1', text: 'Recovered page' }] })
    }))
    const first = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', null)
    const firstBody = first.body as any
    expect(first.status).toBe(206)
    expect(firstBody.courses[0].courseWorkMaterials.map((row: any) => row.id)).toEqual(['material-1'])
    expect(firstBody.error).toMatchObject({ code: 'GOOGLE_UPSTREAM_UNAVAILABLE', retryable: true })
    expect(firstBody.pagination).toMatchObject({ hasMore: true, complete: false })
    expect(firstBody.pagination.nextCursor).toEqual(expect.any(String))

    const second = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', firstBody.pagination.nextCursor)
    const secondBody = second.body as any
    expect(seenUrls.at(-1)).toBe(failedUrl)
    expect(second.status).toBe(200)
    expect(secondBody.courses[0].courseWorkMaterials).toEqual([])
    expect(secondBody.courses[0].announcements.map((row: any) => row.id)).toEqual(['announcement-1'])
    expect(secondBody.pagination).toMatchObject({ hasMore: false, complete: true })
  })

  it('keeps retryable page failures recoverable across repeated continuation requests', async () => {
    await setupCredential()
    let announcementAttempts = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'short-lived-access', scope: SCOPES.classroom.join(' ') })
      if (url.includes('/courses?')) return Response.json({ courses: [{ id: 'c1', name: 'Course' }] })
      if (url.includes('/courseWork')) return Response.json({ courseWork: [{ id: 'work-1' }] })
      announcementAttempts++
      if (announcementAttempts < 3) return new Response('temporary failure', { status: 503 })
      return Response.json({ announcements: [{ id: 'a1' }] })
    }))
    const first = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', null)
    const firstBody = first.body as any
    const second = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', firstBody.pagination.nextCursor)
    const secondBody = second.body as any
    expect(second.status).toBe(503)
    expect(secondBody.courses).toEqual([])
    expect(secondBody.error.retryable).toBe(true)
    expect(secondBody.pagination.nextCursor).toEqual(expect.any(String))
    const third = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', secondBody.pagination.nextCursor)
    expect((third.body as any).courses[0].announcements.map((row: any) => row.id)).toEqual(['a1'])
    expect(announcementAttempts).toBe(3)
  })

  it('marks permanent provider failures non-retryable and does not fetch their blocked page again', async () => {
    await setupCredential()
    let deniedUrl = '', deniedCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'short-lived-access', scope: SCOPES.classroom.join(' ') })
      if (url.includes('/courses?')) return Response.json({ courses: [{ id: 'c1' }] })
      if (url.includes('/courseWork')) return Response.json({ courseWork: [] })
      deniedUrl = url; deniedCalls++; return new Response('forbidden provider details', { status: 403 })
    }))
    const first = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', null)
    const firstBody = first.body as any
    expect(firstBody.error).toMatchObject({ code: 'GOOGLE_PERMISSION_DENIED', retryable: false })
    expect(firstBody.pagination.nextCursor).toEqual(expect.any(String))
    const second = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', firstBody.pagination.nextCursor)
    expect(deniedCalls).toBe(1)
    expect((second.body as any).pagination.hasMore).toBe(false)
    expect(JSON.stringify(second.body)).not.toContain('forbidden provider details')
    expect(deniedUrl).toContain('/announcements')
  })

  it('rejects cross-user, cross-provider, tampered, expired, changed-query, and malformed cursors', async () => {
    const fingerprint = 'classroom|active-courses'
    const base = { v: 1, expiresAt: Math.floor(Date.now() / 1000) + 900, fingerprint, tasks: [], issues: [] }
    const cursor = await encryptPaginationCursor(bindings, 'page-user', 'classroom', base)
    const expectCursorError = async (promise: Promise<unknown>) => {
      let failure: unknown
      try { await promise } catch (error) { failure = error }
      expect((failure as { status?: number } | undefined)?.status).toBe(400)
    }
    await expectCursorError(loadProviderPage(bindings, 'other-user', 'classroom', fingerprint, cursor))
    await expectCursorError(loadProviderPage(bindings, 'page-user', 'calendar', fingerprint, cursor))
    await expectCursorError(loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|different-query', cursor))
    const middle = Math.floor(cursor.length / 2)
    await expectCursorError(loadProviderPage(bindings, 'page-user', 'classroom', fingerprint, `${cursor.slice(0, middle)}${cursor[middle] === 'A' ? 'B' : 'A'}${cursor.slice(middle + 1)}`))
    await expectCursorError(loadProviderPage(bindings, 'page-user', 'classroom', fingerprint, 'not-a-valid-cursor'))
    const expired = await encryptPaginationCursor(bindings, 'page-user', 'classroom', { ...base, expiresAt: Math.floor(Date.now() / 1000) - 1 })
    await expectCursorError(loadProviderPage(bindings, 'page-user', 'classroom', fingerprint, expired))
  })

  it('allows safe cursor replay and produces identical provider IDs for client-side idempotent merge', async () => {
    await setupCredential()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('oauth2.googleapis.com/token')
      ? Response.json({ access_token: 'short-lived-access', scope: SCOPES.classroom.join(' ') })
      : Response.json({ courses: [{ id: 'replayed-course' }] })))
    const cursor = await encryptPaginationCursor(bindings, 'page-user', 'classroom', {
      v: 1, expiresAt: Math.floor(Date.now() / 1000) + 900, fingerprint: 'classroom|active-courses', issues: [],
      tasks: [{ kind: 'courses', key: 'courses', listKey: 'courses', url: 'https://classroom.googleapis.com/v1/courses?pageSize=20', seenTokens: [] }],
    })
    const first = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', cursor)
    const replay = await loadProviderPage(bindings, 'page-user', 'classroom', 'classroom|active-courses', cursor)
    expect((first.body as any).courses.map((row: any) => row.course.id)).toEqual(['replayed-course'])
    expect((replay.body as any).courses.map((row: any) => row.course.id)).toEqual(['replayed-course'])
  })
})

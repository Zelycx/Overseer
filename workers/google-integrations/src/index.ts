import { verifyFirebaseIdToken } from './auth.js'

import { decryptPaginationCursor, decryptRefreshToken, encryptPaginationCursor, encryptRefreshToken, pkceChallenge, randomUrlSafe, sha256Base64Url, validateScopes } from './crypto.js'

import { SCOPES, type Attempt, type Env, type Platform, type Provider } from './types.js'



const TTL = 10 * 60

const now = () => Math.floor(Date.now() / 1000)

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const validProvider = (v: unknown): v is Provider => v === 'calendar' || v === 'classroom'

function safeOrigins(env: Env) { return env.ALLOWED_ORIGINS.split(',').map((v) => v.trim()).filter(Boolean) }

function callback(env: Env, platform: Platform) {

  const value = platform === 'web' ? env.GOOGLE_WEB_CALLBACK_URL : env.GOOGLE_ANDROID_REDIRECT_URI

  const uri = new URL(value)

  if (uri.protocol !== 'https:' || uri.username || uri.password || uri.search || uri.hash) throw new Error('OAuth redirect configuration is invalid.')

  return uri.toString()

}

function allowedReturn(env: Env, value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('A return URL is required.')
  }

  const url = new URL(value)
  const allowed = env.GOOGLE_WEB_RETURN_ORIGINS
    .split(',')
    .map((origin) => origin.trim())

  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'

  const isSecureProtocol =
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && isLoopback)

  if (
    !isSecureProtocol ||
    !allowed.includes(url.origin) ||
    url.username ||
    url.password
  ) {
    throw new Error('Return URL is not allowed.')
  }

  return url.toString()
}

async function authenticated(request: Request, env: Env): Promise<string> {

  const header = request.headers.get('authorization') ?? ''

  const match = /^Bearer ([^\s]+)$/.exec(header)

  if (!match) throw new Response('Authentication required.', { status: 401 })

  try { return (await verifyFirebaseIdToken(env, match[1]!)).sub }

  catch { throw new Response('Invalid Firebase ID token.', { status: 401 }) }

}

async function body(request: Request) {

  try {

    const value = await request.json()

    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON body must be an object.')

    return value as Record<string, unknown>

  }

  catch { throw new Response('Invalid JSON body.', { status: 400 }) }

}

async function saveAttempt(env: Env, attempt: Attempt) {

  await env.DB.prepare(`INSERT INTO oauth_attempts(state_hash,firebase_uid,provider,platform,redirect_uri,return_url,code_verifier,code_challenge,expires_at,created_at)

    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(attempt.state_hash, attempt.firebase_uid, attempt.provider, attempt.platform, attempt.redirect_uri, attempt.return_url, attempt.code_verifier, attempt.code_challenge, attempt.expires_at, now()).run()

}

function authorizationUrl(clientId: string, uri: string, state: string, challenge: string, provider: Provider) {

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')

  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: uri, response_type: 'code', scope: [...SCOPES[provider], 'openid', 'email'].join(' '), state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false' }).toString()

  return url.toString()

}

async function begin(request: Request, env: Env, platform: Platform) {

  const uid = await authenticated(request, env)

  const data = await body(request)

  if (!validProvider(data.provider)) throw new Response('Choose Calendar or Classroom.', { status: 400 })

  const provider = data.provider

  const uri = callback(env, platform)

  const state = randomUrlSafe()

  const verifier = platform === 'web' ? randomUrlSafe() : null

  const challenge = platform === 'android' ? data.codeChallenge : await pkceChallenge(verifier!)

  if (typeof challenge !== 'string' || !/^[A-Za-z0-9\_-]{43}$/.test(challenge)) throw new Response('A valid S256 PKCE challenge is required.', { status: 400 })

  const returnUrl = platform === 'web' ? allowedReturn(env, data.returnUrl) : null

  await env.DB.prepare('DELETE FROM oauth_attempts WHERE expires_at <= ?').bind(now()).run()

  await saveAttempt(env, { state_hash: await sha256Base64Url(state), firebase_uid: uid, provider, platform, redirect_uri: uri, return_url: returnUrl, code_verifier: verifier, code_challenge: challenge, expires_at: now() + TTL, consumed_at: null })

  const clientId = env.GOOGLE_WEB_CLIENT_ID
  
  const url = authorizationUrl(clientId, uri, state, challenge, provider)

  return platform === 'web' ? json({ authorizationUrl: url }) : json({ authorizationUrl: url, state, redirectUri: uri, expiresAt: (now() + TTL) * 1000 })

}

export async function consume(env: Env, state: string, uid: string, provider: Provider, platform: Platform, verifier?: string): Promise<Attempt> {

  const stateHash = await sha256Base64Url(state)

  const row = await env.DB.prepare('SELECT * FROM oauth_attempts WHERE state_hash = ?').bind(stateHash).first<Attempt>()

  if (!row || row.consumed_at !== null || row.expires_at <= now() || row.firebase_uid !== uid || row.provider !== provider || row.platform !== platform) throw new Response('Authorization attempt is invalid, expired, replayed, or bound to another account.', { status: 409 })

  if (verifier) {

    if (!row.code_challenge || await pkceChallenge(verifier) !== row.code_challenge) throw new Response('PKCE verification failed.', { status: 400 })

  }

  const result = await env.DB.prepare(`UPDATE oauth_attempts SET consumed_at=? WHERE state_hash=? AND firebase_uid=? AND provider=? AND platform=? AND consumed_at IS NULL AND expires_at>?`)

    .bind(now(), stateHash, uid, provider, platform, now()).run()

  if (result.meta.changes !== 1) throw new Response('Authorization attempt was already used.', { status: 409 })

  return row

}

async function exchange(env: Env, code: string, attempt: Attempt, verifier: string) {

  const form = new URLSearchParams({
  code,
  client_id: env.GOOGLE_WEB_CLIENT_ID,
  redirect_uri: attempt.redirect_uri,
  grant_type: 'authorization_code',
  code_verifier: verifier,
})

  form.set('client_secret', env.GOOGLE_WEB_CLIENT_SECRET)

  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form })

  const value = await response.json() as Record<string, unknown>

  if (!response.ok || typeof value.access_token !== 'string') throw new Response('Google authorization could not be completed. Start a new attempt.', { status: 400 })

  return value

}

async function googleIdentity(accessToken: string): Promise<{ sub: string; email?: string }> {

  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })

  const value = await response.json() as { sub?: string; email?: string }

  if (!response.ok || !value.sub) throw new Response('Google account identity could not be verified.', { status: 400 })

  return { sub: value.sub, email: value.email }

}

export async function persistCredential(env: Env, uid: string, provider: Provider, platform: Platform, identity: { sub: string; email?: string }, scopes: string, refreshToken: unknown) {

  if (!validateScopes(scopes, provider)) throw new Response('Google did not grant all required permissions.', { status: 403 })

  const existing = await env.DB.prepare('SELECT * FROM google_credentials WHERE firebase_uid=? AND provider=?').bind(uid, provider).first<any>()

  let encrypted: { ciphertext: string; iv: string; keyVersion: string } | null = null

  if (typeof refreshToken === 'string' && refreshToken) encrypted = await encryptRefreshToken(env, uid, provider, refreshToken)

  if (!encrypted && (!existing || existing.google_subject !== identity.sub || existing.oauth_platform !== platform)) throw new Response('Google did not return a reusable refresh token. Retry authorization with offline access.', { status: 400 })

  const stamp = now()

  const result = await env.DB.prepare(`INSERT INTO google_credentials(firebase_uid,provider,oauth_platform,google_subject,account_email,granted_scopes,ciphertext,iv,key_version,token_version,connected_at,updated_at)

    VALUES(?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(firebase_uid,provider) DO UPDATE SET

    oauth_platform=excluded.oauth_platform,

    google_subject=excluded.google_subject, account_email=excluded.account_email, granted_scopes=excluded.granted_scopes,

    ciphertext=CASE WHEN excluded.ciphertext!='' THEN excluded.ciphertext WHEN google_credentials.google_subject=excluded.google_subject AND google_credentials.oauth_platform=excluded.oauth_platform THEN google_credentials.ciphertext ELSE NULL END,

    iv=CASE WHEN excluded.ciphertext!='' THEN excluded.iv WHEN google_credentials.google_subject=excluded.google_subject AND google_credentials.oauth_platform=excluded.oauth_platform THEN google_credentials.iv ELSE NULL END,

    key_version=CASE WHEN excluded.ciphertext!='' THEN excluded.key_version WHEN google_credentials.google_subject=excluded.google_subject AND google_credentials.oauth_platform=excluded.oauth_platform THEN google_credentials.key_version ELSE NULL END,

    connected_at=CASE WHEN google_credentials.google_subject=excluded.google_subject AND google_credentials.oauth_platform=excluded.oauth_platform THEN google_credentials.connected_at ELSE excluded.connected_at END,

    updated_at=excluded.updated_at

    WHERE excluded.ciphertext!='' OR (google_credentials.google_subject=excluded.google_subject AND google_credentials.oauth_platform=excluded.oauth_platform)`)

    .bind(uid, provider, platform, identity.sub, identity.email ?? null, scopes, encrypted?.ciphertext ?? '', encrypted?.iv ?? '', encrypted?.keyVersion ?? '', stamp, stamp).run()

  if (result.meta.changes !== 1) throw new Response('Google did not return a reusable refresh token. The existing connection was preserved.', { status: 400 })

}

async function completeNative(request: Request, env: Env) {

  const uid = await authenticated(request, env)

  const data = await body(request)

  if (!validProvider(data.provider) || data.platform !== 'android' || typeof data.state !== 'string' || typeof data.code !== 'string' || typeof data.codeVerifier !== 'string') throw new Response('Authorization response is incomplete.', { status: 400 })

  const attempt = await consume(env, data.state, uid, data.provider, 'android', data.codeVerifier)

  const tokens = await exchange(env, data.code, attempt, data.codeVerifier)

  const identity = await googleIdentity(tokens.access_token as string)

  const scopes = typeof tokens.scope === 'string' ? tokens.scope : ''

  await persistCredential(env, uid, data.provider, 'android', identity, scopes, tokens.refresh_token)

  return json({ connected: true, provider: data.provider, accountEmail: identity.email ?? null, grantedScopes: scopes })

}

async function finishWeb(request: Request, env: Env) {

  const url = new URL(request.url), state = url.searchParams.get('state') ?? '', code = url.searchParams.get('code') ?? ''

  const hashed = await sha256Base64Url(state)

  const attempt = await env.DB.prepare('SELECT * FROM oauth_attempts WHERE state_hash=?').bind(hashed).first<Attempt>()

  const fallback = 'https://localhost/'

  let returnUrl = fallback

  try {

    if (!state || !attempt?.return_url || !attempt.code_verifier) throw new Error('invalid callback')

    returnUrl = allowedReturn(env, attempt.return_url)

    const used = await consume(env, state, attempt.firebase_uid, attempt.provider, 'web')

    if (url.searchParams.has('error') || !code) throw new Error('Google authorization was cancelled or denied.')

    const tokens = await exchange(env, code, used, used.code_verifier!)

    const identity = await googleIdentity(tokens.access_token as string)

    const scopes = typeof tokens.scope === 'string' ? tokens.scope : ''

    await persistCredential(env, used.firebase_uid, used.provider, 'web', identity, scopes, tokens.refresh_token)

    const dest = new URL(returnUrl); dest.searchParams.set('google', 'connected'); dest.searchParams.set('provider', used.provider)

    return Response.redirect(dest.toString(), 303)

  } catch {

    const dest = new URL(returnUrl); dest.searchParams.set('google', 'error'); dest.searchParams.set('provider', attempt?.provider ?? '')

    return Response.redirect(dest.toString(), 303)

  }

}

export async function freshAccessToken(env: Env, uid: string, provider: Provider) {

  const record = await env.DB.prepare('SELECT * FROM google_credentials WHERE firebase_uid=? AND provider=?').bind(uid, provider).first<any>()

  if (!record) throw new Response(`${provider} is not connected.`, { status: 409 })

  let refresh: string

  try { refresh = await decryptRefreshToken(env, uid, provider, record) }

  catch { throw new Response('Stored Google authorization is unavailable. Reconnect this service.', { status: 409 }) }

  const form = new URLSearchParams({
  client_id: env.GOOGLE_WEB_CLIENT_ID,
  refresh_token: refresh,
  grant_type: 'refresh_token',
})
 form.set('client_secret', env.GOOGLE_WEB_CLIENT_SECRET)

  let response: Response

  try { response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form }) }

  catch { throw new Response(JSON.stringify({ error: { code: 'GOOGLE_TOKEN_TEMPORARY', message: 'Google authorization is temporarily unavailable.', retryable: true } }), { status: 503, headers: { 'content-type': 'application/json' } }) }

  const value = await response.json().catch(() => ({})) as Record<string, unknown>

  if (response.status === 429 || response.status >= 500) throw new Response(JSON.stringify({ error: { code: 'GOOGLE_TOKEN_TEMPORARY', message: 'Google authorization is temporarily unavailable.', retryable: true } }), { status: 503, headers: { 'content-type': 'application/json' } })

  if (!response.ok || typeof value.access_token !== 'string') throw new Response(JSON.stringify({ error: { code: 'GOOGLE_REAUTH_REQUIRED', message: 'Google authorization expired or was revoked. Reconnect this service.', retryable: false } }), { status: 409, headers: { 'content-type': 'application/json' } })

  const scopes = typeof value.scope === 'string' ? value.scope : record.granted_scopes

  if (!validateScopes(scopes, provider)) throw new Response('Google authorization is missing permissions. Reconnect this service.', { status: 403 })

  return value.access_token as string

}

const GOOGLE_PAGE_BUDGET = 42

type PageTask = { kind: 'calendarList' | 'calendarEvents' | 'courses' | 'courseWork' | 'announcements' | 'courseWorkMaterials'; key: string; listKey: string; url: string; pageToken?: string; seenTokens: string[]; calendarName?: string; course?: Record<string, unknown>; blockedFailure?: PageFailure }

type PageIssue = { failure: PageFailure; task: PageTask }

type PageCursor = { v: 1; expiresAt: number; fingerprint: string; tasks: PageTask[]; issues: PageIssue[] }

type PageItem = Record<string, unknown>

type PageFailure = { code: string; message: string; retryable: boolean; status: number }

class GooglePageFailure extends Error {

  constructor(readonly failure: PageFailure) { super(failure.message) }

}

export class GooglePagesFailure extends Error {

  readonly status: number

  readonly code: string

  readonly retryable: boolean

  constructor(readonly failure: PageFailure, readonly partialResults: Record<string, unknown>[]) {

    super(failure.message)

    this.status = failure.status

    this.code = failure.code

    this.retryable = failure.retryable

  }

}

function failureFor(error: unknown): PageFailure {

  if (error instanceof GooglePageFailure) return error.failure

  if (error instanceof Response) {

    if (error.status === 409) return { code: 'GOOGLE_REAUTH_REQUIRED', message: 'Reconnect Google to continue loading this data.', retryable: false, status: 409 }

    if (error.status === 403) return { code: 'GOOGLE_PERMISSION_DENIED', message: 'Google denied access. Review permissions or reconnect.', retryable: false, status: 403 }

    return { code: 'GOOGLE_UPSTREAM_UNAVAILABLE', message: 'Google is temporarily unavailable. Continue to retry this page.', retryable: true, status: 503 }

  }

  return { code: 'GOOGLE_UPSTREAM_UNAVAILABLE', message: 'Google is temporarily unavailable. Continue to retry this page.', retryable: true, status: 503 }

}

async function googlePage(url: string, token: string) {

  let response: Response

  try { response = await fetch(url, { headers: { authorization: `Bearer ${token}` } }) }

  catch { throw new GooglePageFailure({ code: 'GOOGLE_NETWORK_ERROR', message: 'Google is temporarily unreachable. Continue to retry this page.', retryable: true, status: 503 }) }

  if (response.status === 401) throw new GooglePageFailure({ code: 'GOOGLE_ACCESS_TOKEN_EXPIRED', message: 'The Google access token expired while loading this page.', retryable: true, status: 401 })

  if (response.status === 403) throw new GooglePageFailure({ code: 'GOOGLE_PERMISSION_DENIED', message: 'Google denied access. Review permissions or reconnect.', retryable: false, status: 403 })

  if (response.status === 429) throw new GooglePageFailure({ code: 'GOOGLE_RATE_LIMITED', message: 'Google rate-limited this request. Continue to retry this page.', retryable: true, status: 503 })

  if (response.status >= 500) throw new GooglePageFailure({ code: 'GOOGLE_UPSTREAM_UNAVAILABLE', message: 'Google is temporarily unavailable. Continue to retry this page.', retryable: true, status: 503 })

  const data = await response.json().catch(() => null) as Record<string, unknown> | null

  if (!response.ok) throw new GooglePageFailure({ code: 'GOOGLE_API_REJECTED', message: 'Google rejected this data request. Review the integration and request filters.', retryable: false, status: 502 })

  if (!data || typeof data !== 'object') throw new GooglePageFailure({ code: 'GOOGLE_INVALID_RESPONSE', message: 'Google returned an unreadable response. Continue to retry this page.', retryable: true, status: 502 })

  return data

}

function taskUrl(task: PageTask) {

  const url = new URL(task.url)

  if (task.pageToken) url.searchParams.set('pageToken', task.pageToken)

  else url.searchParams.delete('pageToken')

  return url.toString()

}

function entries(value: unknown): PageItem[] { return Array.isArray(value) ? value.filter((x): x is PageItem => !!x && typeof x === 'object' && !Array.isArray(x)) : [] }

function cursorError() { return new Response(JSON.stringify({ error: { code: 'INVALID_PAGE_CURSOR', message: 'This continuation has expired or does not match this query. Refresh to start again.' } }), { status: 400, headers: { 'content-type': 'application/json' } }) }

function makeTask(kind: PageTask['kind'], key: string, listKey: string, url: string, extra: Partial<PageTask> = {}): PageTask { return { kind, key, listKey, url, seenTokens: [], ...extra } }

function retainFailedTask(state: PageCursor, task: PageTask, failure: PageFailure) {

  if (failure.retryable) state.tasks.unshift(task)

  else { task.blockedFailure = failure; state.tasks.unshift(task) }

}

export async function loadProviderPage(env: Env, uid: string, provider: Provider, fingerprint: string, cursorValue: string | null, min?: string, max?: string) {

  let state: PageCursor

  if (cursorValue) {

    try {

      const value = await decryptPaginationCursor(env, uid, provider, cursorValue) as PageCursor

      if (value?.v !== 1 || typeof value.expiresAt !== 'number' || value.expiresAt <= now() || value.fingerprint !== fingerprint || !Array.isArray(value.tasks) || value.tasks.some((t) => !t || typeof t.url !== 'string' || !Array.isArray(t.seenTokens)) || (value.issues !== undefined && !Array.isArray(value.issues))) throw new Error('invalid cursor')

      state = { ...value, issues: Array.isArray(value.issues) ? value.issues : [] }

    } catch { throw cursorError() }

  } else {

    const tasks = provider === 'calendar'

      ? [makeTask('calendarList', 'calendarList', 'items', 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=20')]

      : [makeTask('courses', 'courses', 'courses', 'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=20')]

    state = { v: 1, expiresAt: now() + 15 * 60, fingerprint, tasks, issues: [] }

  }

  const outputCalendars = new Map<string, { calendarId: string; calendarName: string; events: PageItem[] }>()

  const outputCourses = new Map<string, {
  course: PageItem
  courseWork: PageItem[]
  courseWorkMaterials: PageItem[]
  announcements: PageItem[]
}>()

  const dedupe = new Map<string, Set<string>>()

  const budget = { used: 0 }

  let accessToken = await freshAccessToken(env, uid, provider)

  let refreshedAfter401 = false

  let failure: PageFailure | undefined

  while (state.tasks.length && budget.used < GOOGLE_PAGE_BUDGET) {

    const task = state.tasks.shift()!

    if (task.blockedFailure) {

      state.issues.push({ failure: task.blockedFailure, task })

      failure ??= task.blockedFailure

      continue

    }

    budget.used++

    let data: Record<string, unknown>

    try { data = await googlePage(taskUrl(task), accessToken) }

    catch (error) {

      const firstFailure = failureFor(error)

      if (firstFailure.code !== 'GOOGLE_ACCESS_TOKEN_EXPIRED' || refreshedAfter401) {

        failure = firstFailure; retainFailedTask(state, task, firstFailure); break

      }

      refreshedAfter401 = true

      if (budget.used >= GOOGLE_PAGE_BUDGET) {

        failure = { code: 'GOOGLE_PAGE_DEFERRED', message: 'The request budget was reached before retrying this page. Continue to resume it.', retryable: true, status: 503 }

        retainFailedTask(state, task, failure); break

      }

      try { accessToken = await freshAccessToken(env, uid, provider) }

      catch (refreshError) { failure = failureFor(refreshError); retainFailedTask(state, task, failure); break }

      budget.used++

      try { data = await googlePage(taskUrl(task), accessToken) }

      catch (retryError) {

        const retryFailure = failureFor(retryError)

        failure = retryFailure.code === 'GOOGLE_ACCESS_TOKEN_EXPIRED'

          ? { code: 'GOOGLE_REAUTH_REQUIRED', message: 'Google rejected the refreshed access token. Reconnect this service.', retryable: false, status: 409 }

          : retryFailure

        retainFailedTask(state, task, failure); break

      }

    }

    const rows = entries(data[task.listKey])

    const seen = dedupe.get(task.key) ?? new Set<string>()

    dedupe.set(task.key, seen)

    const unique = rows.filter((row) => {

      const id = typeof row.id === 'string' ? row.id : null

      if (!id) return true

      if (seen.has(id)) return false

      seen.add(id); return true

    })

    if (task.kind === 'calendarList') {

      for (const calendar of unique) if (typeof calendar.id === 'string') {

        const name = typeof calendar.summary === 'string' ? calendar.summary : 'Google Calendar'

        outputCalendars.set(calendar.id, { calendarId: calendar.id, calendarName: name, events: [] })

        state.tasks.push(makeTask('calendarEvents', calendar.id, 'items', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?maxResults=100&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(min!)}&timeMax=${encodeURIComponent(max!)}`, { calendarName: name }))

      }

    } else if (task.kind === 'courses') {

      for (const course of unique) if (typeof course.id === 'string') {

        outputCourses.set(course.id, { course, courseWork: [], courseWorkMaterials: [], announcements: [] })

        const id = encodeURIComponent(course.id)

        state.tasks.push(makeTask('courseWorkMaterials', `${course.id}:courseWorkMaterials`, 'courseWorkMaterial', `https://classroom.googleapis.com/v1/courses/${id}/courseWorkMaterials?pageSize=100`, { course }))
        state.tasks.push(makeTask('announcements', `${course.id}:announcements`, 'announcements', `https://classroom.googleapis.com/v1/courses/${id}/announcements?pageSize=100`, { course }))
      }

    } else if (task.kind === 'calendarEvents') {

      const record = outputCalendars.get(task.key) ?? { calendarId: task.key, calendarName: task.calendarName ?? 'Google Calendar', events: [] }

      record.events.push(...unique); outputCalendars.set(task.key, record)

    } else {

      const id = typeof task.course?.id === 'string' ? task.course.id : task.key.split(':')[0]!

      const record = outputCourses.get(id) ?? { course: task.course ?? { id }, courseWork: [], courseWorkMaterials: [], announcements: [] }
      if (task.kind === 'courseWork') record.courseWork.push(...unique)
      else if (task.kind === 'courseWorkMaterials') record.courseWorkMaterials.push(...unique)
      else record.announcements.push(...unique)

      outputCourses.set(id, record)

    }

    const pageToken = data.nextPageToken

    if (typeof pageToken === 'string' && pageToken.length) {

      if (task.seenTokens.includes(pageToken) || pageToken === task.pageToken) {

        failure = { code: 'GOOGLE_PAGINATION_TOKEN_LOOP', message: 'Google returned a repeated page token. Refresh to restart this listing.', retryable: false, status: 502 }

        task.blockedFailure = failure

        state.tasks.unshift(task)

        // Preserve the failed task in the cursor, but never refetch a known loop.

        break

      }

      task.seenTokens.push(pageToken); task.pageToken = pageToken; state.tasks.push(task)

    }

  }

  failure ??= state.issues[0]?.failure

  const hasMore = state.tasks.length > 0

  let nextCursor: string | null = null

  if (hasMore) {

    state.expiresAt = now() + 15 * 60

    try { nextCursor = await encryptPaginationCursor(env, uid, provider, state) }

    catch { failure = { code: 'CONTINUATION_UNAVAILABLE', message: 'The continuation could not be prepared. Refresh and narrow the result set.', retryable: false, status: 413 } }

    if (nextCursor && nextCursor.length > 24_000) {

      nextCursor = null

      failure = { code: 'CONTINUATION_TOO_LARGE', message: 'The continuation is too large. Refresh and narrow the result set.', retryable: false, status: 413 }

    }

  }

  const body = provider === 'calendar'

    ? { calendars: [...outputCalendars.values()], pagination: { hasMore: nextCursor ? hasMore : false, nextCursor, complete: !hasMore && !failure } }

    : { courses: [...outputCourses.values()], pagination: { hasMore: nextCursor ? hasMore : false, nextCursor, complete: !hasMore && !failure } }

  const hasRecords = provider === 'calendar'

    ? (body as { calendars: Array<{ events: PageItem[] }> }).calendars.some((calendar) => calendar.events.length > 0)

    : (body as { courses: Array<{ course: PageItem }> }).courses.length > 0

  if (failure) return { body: { ...body, error: { code: failure.code, message: failure.message, retryable: failure.retryable } }, status: hasRecords ? 206 : failure.status }

  return { body, status: 200 }

}



// Retained as a small helper for focused pagination tests and simple one-list callers.

export async function pages(url: string, accessToken: string, listKey = 'items', budget = { used: 0 }): Promise<Record<string, unknown>[]> {

  const all: Record<string, unknown>[] = [], seen = new Set<string>(); let next: string | undefined = url

  while (next && budget.used < GOOGLE_PAGE_BUDGET) {

    budget.used++

    let data: Record<string, unknown>

    try { data = await googlePage(next, accessToken) }

    catch (error) { throw new GooglePagesFailure(failureFor(error), all) }

    for (const row of entries(data[listKey])) { const id = typeof row.id === 'string' ? row.id : undefined; if (!id || !seen.has(id)) { all.push(row); if (id) seen.add(id) } }

    const token = data.nextPageToken

    if (typeof token !== 'string') next = undefined

    else { if (seen.has(`page:${token}`)) throw new GooglePagesFailure({ code: 'GOOGLE_PAGINATION_TOKEN_LOOP', message: 'Google returned a repeated page token.', retryable: false, status: 502 }, all); seen.add(`page:${token}`); const page = new URL(url); page.searchParams.set('pageToken', token); next = page.toString() }

  }

  if (next) throw new GooglePagesFailure({ code: 'PAGINATION_LIMIT', message: 'Google returned more pages than this request can safely fetch. Continue with the next page.', retryable: true, status: 429 }, all)

  return all

}

async function api(request: Request, env: Env, uid: string, provider: Provider) {

  if (request.method === 'GET' && request.url.includes('/status')) {

    const row = await env.DB.prepare('SELECT provider,account_email,granted_scopes,connected_at FROM google_credentials WHERE firebase_uid=? AND provider=?').bind(uid, provider).first<any>()

    return json(row ? { connected: true, provider, accountEmail: row.account_email, grantedScopes: row.granted_scopes, connectedAt: row.connected_at * 1000 } : { connected: false })

  }

  if (request.method === 'DELETE') {

    await disconnectCredential(env, uid, provider)

    return json({ disconnected: true })

  }

  if (request.method !== 'GET') throw new Response('Method not allowed.', { status: 405 })

  if (provider === 'calendar') {

    const input = new URL(request.url)

    const min = input.searchParams.get('timeMin') ?? new Date(Date.now() - 7 * 86400000).toISOString()

    const max = input.searchParams.get('timeMax') ?? new Date(Date.now() + 31 * 86400000).toISOString()

    if (!Number.isFinite(Date.parse(min)) || !Number.isFinite(Date.parse(max)) || Date.parse(max) <= Date.parse(min)) throw new Response('Choose a valid Calendar date range.', { status: 400 })

    const cursor = input.searchParams.get('cursor')

    const result = await loadProviderPage(env, uid, provider, `calendar|${min}|${max}`, cursor, min, max)

    return json(result.body, result.status)

  }

  const input = new URL(request.url)

  const result = await loadProviderPage(env, uid, provider, 'classroom|active-courses', input.searchParams.get('cursor'))

  return json(result.body, result.status)

}



export async function disconnectCredential(env: Env, uid: string, provider: Provider) {

  await env.DB.prepare('DELETE FROM google_credentials WHERE firebase_uid=? AND provider=?').bind(uid, provider).run()

}



export default {

  async fetch(request: Request, env: Env): Promise<Response> {

    const origin = request.headers.get('origin')

    const allowed = safeOrigins(env)

    if (origin && !allowed.includes(origin)) return new Response('Origin not allowed.', { status: 403 })

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin ?? '', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'Authorization,Content-Type', 'access-control-max-age': '600', vary: 'Origin' } })

    let response: Response

    try {

      const url = new URL(request.url), path = url.pathname

      if (path === '/.well-known/assetlinks.json') {
        if (request.method !== 'GET') {
          response = new Response('Method not allowed.', { status: 405, headers: { allow: 'GET' } })
        } else {
          response = Response.json([
            {
              relation: ['delegate_permission/common.handle_all_urls'],
              target: {
                namespace: 'android_app',
                package_name: 'com.example.overseer',
                sha256_cert_fingerprints: [
                  'B9:E4:0B:FF:81:A5:B9:A9:0F:AA:A7:53:9D:95:47:75:FD:37:40:35:08:2B:27:E3:8A:AF:9F:02:05:94:DF:36'
                ]
              }
            }
          ])
        }
      }
      else if (path === '/oauth/callback' && request.method === 'GET') response = await finishWeb(request, env)

      else if (path === '/v1/google/web/authorize' && request.method === 'POST') response = await begin(request, env, 'web')

      else if (path === '/v1/google/native/android/authorize' && request.method === 'POST') response = await begin(request, env, 'android')

      else if (path === '/v1/google/native/android/complete' && request.method === 'POST') response = await completeNative(request, env)

      else {

       const match = /^\/v1\/google\/(calendar|classroom)\/(status|events|courses)$/.exec(path) ?? /^\/v1\/google\/(calendar|classroom)$/.exec(path)

        if (!match) response = json({ error: 'Not found.' }, 404)

        else {

          const uid = await authenticated(request, env)

          const provider = match[1] as Provider

          const endpoint = match[2]

          if (!validProvider(provider)) throw new Response('Invalid integration.', { status: 400 })

          if ((provider === 'calendar' && endpoint === 'courses') || (provider === 'classroom' && endpoint === 'events')) throw new Response('Not found.', { status: 404 })

          response = await api(request, env, uid, provider)

        }

      }

    } catch (error) {

  if (error instanceof Response) {
    response = error
  } else {
    console.error('Google integration request failed:', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message.slice(0, 300) : 'Unknown error',
    })

    response = json({ error: 'Google integration request could not be completed.' }, 500)
  }

}

    const headers = new Headers(response.headers)

    if (origin) { headers.set('access-control-allow-origin', origin); headers.append('vary', 'Origin') }

    headers.set('access-control-allow-headers', 'Authorization,Content-Type')

    headers.set('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS')

    headers.set('cache-control', 'no-store')

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })

  },

}

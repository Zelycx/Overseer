import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { getAdminApp } from './admin.js'
import {
  createOAuthState, createPkceChallenge, createPkceVerifier, hashOAuthState,
  hasRequiredScopes, GOOGLE_INTEGRATIONS, type GoogleIntegration,
  validateOAuthAttempt, validateNativeOAuthAttempt, type OAuthAttempt,
} from './google-oauth-core.js'

const googleClientId = defineString('GOOGLE_OAUTH_CLIENT_ID')
const googleClientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET')
const googleCallbackUrl = defineString('GOOGLE_OAUTH_CALLBACK_URL')
const googleKmsKeyName = defineString('GOOGLE_OAUTH_KMS_KEY_NAME')
const allowedReturnOrigins = defineString('GOOGLE_OAUTH_RETURN_ORIGINS')
const androidOAuthClientId = defineString('GOOGLE_ANDROID_OAUTH_CLIENT_ID')
const androidOAuthRedirectUri = defineString('GOOGLE_ANDROID_OAUTH_REDIRECT_URI')
const iosOAuthClientId = defineString('GOOGLE_IOS_OAUTH_CLIENT_ID')
const iosOAuthRedirectUri = defineString('GOOGLE_IOS_OAUTH_REDIRECT_URI')
const ATTEMPT_TTL_MS = 10 * 60 * 1000
const firestore = () => getFirestore(getAdminApp())
const privateAttempts = () => firestore().collection('_googleOAuthAttempts')
const privateCredentials = () => firestore().collection('_googleIntegrationCredentials')

function authenticatedUid(request: { auth?: { uid?: string } | null }): string {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before connecting Google services.')
  return uid
}

function parseProvider(value: unknown): GoogleIntegration {
  if (value === 'calendar' || value === 'classroom') return value
  throw new HttpsError('invalid-argument', 'Choose Calendar or Classroom.')
}

function assertReturnUrl(value: unknown): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'A valid app return URL is required.')
  let url: URL
  try { url = new URL(value) } catch { throw new HttpsError('invalid-argument', 'A valid app return URL is required.') }
  const origins = allowedReturnOrigins.value().split(',').map((origin) => origin.trim()).filter(Boolean)
  if (url.protocol !== 'https:' || !origins.includes(url.origin)) throw new HttpsError('invalid-argument', 'The app return URL is not allowed.')
  return url.toString()
}

function callbackUri(): string {
  const value = googleCallbackUrl.value()
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('OAuth callback must use HTTPS.')
  return url.toString()
}

function attemptId(state: string): string { return hashOAuthState(state) }
function credentialId(uid: string, provider: GoogleIntegration): string {
  return createHash('sha256').update(`${uid}\0${provider}`).digest('hex')
}

async function accessTokenForKms(): Promise<string> {
  const credential = getAdminApp().options.credential
  if (!credential) throw new Error('Cloud Functions service identity is unavailable.')
  const token = await credential.getAccessToken()
  if (!token.access_token) throw new Error('Cloud KMS authorization is unavailable.')
  return token.access_token
}

async function kms(method: 'encrypt' | 'decrypt', body: Record<string, string>): Promise<string> {
  const keyName = googleKmsKeyName.value()
  if (!keyName.startsWith('projects/') || !keyName.includes('/cryptoKeys/')) throw new Error('Cloud KMS key is not configured.')
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:${method}`, {
    method: 'POST', headers: { authorization: `Bearer ${await accessTokenForKms()}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Cloud KMS ${method} request failed (${response.status}).`)
  const result = await response.json() as { ciphertext?: string; plaintext?: string }
  const value = method === 'encrypt' ? result.ciphertext : result.plaintext
  if (!value) throw new Error(`Cloud KMS ${method} returned no data.`)
  return value
}

function aad(uid: string, provider: GoogleIntegration): string { return `overseer|${uid}|${provider}|google-refresh-token|v1` }

async function encryptRefreshToken(uid: string, provider: GoogleIntegration, refreshToken: string) {
  const key = randomBytes(32)
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(aad(uid, provider)))
  const ciphertext = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()])
  const wrappedKey = await kms('encrypt', { plaintext: key.toString('base64'), additionalAuthenticatedData: Buffer.from(aad(uid, provider)).toString('base64') })
  return { ciphertext: ciphertext.toString('base64'), nonce: nonce.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), wrappedKey, kmsKeyName: googleKmsKeyName.value(), tokenVersion: 1 }
}

async function decryptRefreshToken(uid: string, provider: GoogleIntegration, record: Record<string, unknown>): Promise<string> {
  const context = aad(uid, provider)
  const rawKey = await kms('decrypt', { ciphertext: String(record.wrappedKey), additionalAuthenticatedData: Buffer.from(context).toString('base64') })
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(rawKey, 'base64'), Buffer.from(String(record.nonce), 'base64'))
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(String(record.authTag), 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(String(record.ciphertext), 'base64')), decipher.final()]).toString('utf8')
}

export const beginGoogleAuthorization = onCall(async (request) => {
  const uid = authenticatedUid(request)
  const provider = parseProvider(request.data?.provider)
  const returnUrl = assertReturnUrl(request.data?.returnUrl)
  const state = createOAuthState()
  const verifier = createPkceVerifier()
  const uri = callbackUri()
  const expiresAtMillis = Date.now() + ATTEMPT_TTL_MS
  const attempt: OAuthAttempt = { uid, integration: provider, stateHash: hashOAuthState(state), codeVerifier: verifier, redirectUri: uri, expiresAtMillis, consumed: false, returnUrl }
  await privateAttempts().doc(attemptId(state)).create({ ...attempt, expiresAt: Timestamp.fromMillis(expiresAtMillis), createdAt: FieldValue.serverTimestamp() })
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.search = new URLSearchParams({ client_id: googleClientId.value(), redirect_uri: uri, response_type: 'code', scope: [...GOOGLE_INTEGRATIONS[provider].scopes, 'openid', 'email'].join(' '), state, code_challenge: createPkceChallenge(verifier), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false' }).toString()
  return { authorizationUrl: authUrl.toString(), expiresAt: expiresAtMillis }
})

type NativePlatform = 'android' | 'ios'
function nativePlatform(value: unknown): NativePlatform {
  if (value === 'android' || value === 'ios') return value
  throw new HttpsError('invalid-argument', 'Choose a supported native platform.')
}
function nativeConfiguration(platform: NativePlatform): { clientId: string; redirectUri: string } {
  const clientId = platform === 'android' ? androidOAuthClientId.value() : iosOAuthClientId.value()
  const redirectUri = platform === 'android' ? androidOAuthRedirectUri.value() : iosOAuthRedirectUri.value()
  let parsed: URL
  try { parsed = new URL(redirectUri) } catch { throw new HttpsError('failed-precondition', `The ${platform} OAuth redirect is not configured.`) }
  if (!clientId || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new HttpsError('failed-precondition', `The ${platform} OAuth client and exact HTTPS redirect are not configured.`)
  return { clientId, redirectUri: parsed.toString() }
}

export const beginNativeGoogleAuthorization = onCall(async (request) => {
  const uid = authenticatedUid(request)
  const provider = parseProvider(request.data?.provider)
  const platform = nativePlatform(request.data?.platform)
  const codeChallenge = request.data?.codeChallenge
  if (typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) throw new HttpsError('invalid-argument', 'A valid S256 PKCE challenge is required.')
  const { clientId, redirectUri } = nativeConfiguration(platform)
  const state = createOAuthState()
  const expiresAtMillis = Date.now() + ATTEMPT_TTL_MS
  const attempt: OAuthAttempt = { uid, integration: provider, platform, codeChallenge, stateHash: hashOAuthState(state), codeVerifier: '', redirectUri, expiresAtMillis, consumed: false }
  await privateAttempts().doc(attemptId(state)).create({ ...attempt, clientId, expiresAt: Timestamp.fromMillis(expiresAtMillis), createdAt: FieldValue.serverTimestamp() })
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: [...GOOGLE_INTEGRATIONS[provider].scopes, 'openid', 'email'].join(' '), state, code_challenge: codeChallenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false' }).toString()
  return { authorizationUrl: authUrl.toString(), state, redirectUri, expiresAt: expiresAtMillis }
})

export const completeNativeGoogleAuthorization = onCall({ secrets: [googleClientSecret] }, async (request) => {
  const uid = authenticatedUid(request)
  const provider = parseProvider(request.data?.provider)
  const platform = nativePlatform(request.data?.platform)
  const state = request.data?.state
  const code = request.data?.code
  const verifier = request.data?.codeVerifier
  if (typeof state !== 'string' || typeof code !== 'string' || !code || typeof verifier !== 'string') throw new HttpsError('invalid-argument', 'Authorization response is incomplete.')
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new HttpsError('invalid-argument', 'PKCE verifier is invalid.')
  const attemptRef = privateAttempts().doc(attemptId(state))
  const { clientId, redirectUri } = nativeConfiguration(platform)
  let attempt: OAuthAttempt & { clientId?: string }
  try {
    attempt = await firestore().runTransaction(async (transaction) => {
      const snap = await transaction.get(attemptRef)
      const value = snap.data() as (OAuthAttempt & { clientId?: string; expiresAt?: Timestamp }) | undefined
      const valid = validateNativeOAuthAttempt({ attempt: value, state, uid, integration: provider, platform, redirectUri, codeVerifier: verifier, nowMillis: Date.now() })
      if (value?.clientId !== clientId) throw new Error('Native OAuth client mismatch.')
      if (!value.expiresAt || value.expiresAt.toMillis() <= Date.now()) throw new Error('Authorization attempt expired.')
      transaction.update(attemptRef, { consumed: true, consumedAt: FieldValue.serverTimestamp() })
      return valid as OAuthAttempt & { clientId?: string }
    })
  } catch {
    throw new HttpsError('failed-precondition', 'Authorization attempt is invalid, expired, already used, or bound to another account.')
  }
  let tokens: Record<string, unknown>
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }) })
    tokens = await response.json() as Record<string, unknown>
    if (!response.ok) throw new Error('exchange failed')
  } catch {
    throw new HttpsError('failed-precondition', 'Google authorization could not be completed. Start a new connection attempt.')
  }
  if (typeof tokens.access_token !== 'string') throw new HttpsError('failed-precondition', 'Google did not return a valid authorization result.')
  let identity: { sub: string; email?: string }
  try { identity = await providerAccount(tokens.access_token) } catch { throw new HttpsError('failed-precondition', 'Google account identity could not be verified.') }
  const scopes = typeof tokens.scope === 'string' ? tokens.scope : ''
  if (!hasRequiredScopes(scopes, provider)) throw new HttpsError('failed-precondition', 'Google did not grant all required permissions.')
  const ref = privateCredentials().doc(credentialId(uid, provider))
  try {
    await firestore().runTransaction(async (transaction) => {
      const existing = await transaction.get(ref)
      const previous = existing.data()
      let encrypted = previous?.accountSub === identity.sub ? previous.encryptedRefreshToken : undefined
      if (typeof tokens.refresh_token === 'string') encrypted = await encryptRefreshToken(uid, provider, tokens.refresh_token)
      if (!encrypted) throw new Error('missing refresh token')
      transaction.set(ref, { uid, provider, accountSub: identity.sub, ...(identity.email ? { accountEmail: identity.email } : {}), grantedScopes: scopes, encryptedRefreshToken: encrypted, accessTokenExpiresAt: Timestamp.fromMillis(Date.now() + Number(tokens.expires_in ?? 3600) * 1000), connectedAt: existing.exists && previous?.accountSub === identity.sub ? previous.connectedAt : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), tokenVersion: 1 })
    })
  } catch {
    throw new HttpsError('failed-precondition', 'Google did not return a reusable refresh token for this account. Start a new connection attempt and grant offline access.')
  }
  return { connected: true, provider, accountEmail: identity.email ?? null, grantedScopes: scopes }
})

async function exchangeCode(code: string, attempt: OAuthAttempt): Promise<Record<string, unknown>> {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: googleClientId.value(), client_secret: googleClientSecret.value(), redirect_uri: attempt.redirectUri, grant_type: 'authorization_code', code_verifier: attempt.codeVerifier }) })
  const result = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error('Google authorization-code exchange failed.')
  return result
}

async function providerAccount(accessToken: string): Promise<{ sub: string; email?: string }> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error('Google account identity could not be verified.')
  const data = await response.json() as { sub?: string; email?: string }
  if (!data.sub) throw new Error('Google account identity is missing.')
  return { sub: data.sub, email: data.email }
}

export const googleOAuthCallback = onRequest({ secrets: [googleClientSecret] }, async (request, response) => {
  const state = typeof request.query.state === 'string' ? request.query.state : ''
  const ref = privateAttempts().doc(attemptId(state))
  let safeReturn = 'https://localhost/'
  try {
    if (typeof request.query.error === 'string') throw new Error(request.query.error === 'access_denied' ? 'Google authorization was cancelled or denied.' : 'Google authorization failed.')
    const code = typeof request.query.code === 'string' ? request.query.code : ''
    if (!code || !state) throw new Error('Google authorization callback was incomplete.')
    const result = await firestore().runTransaction(async (transaction) => {
      const snap = await transaction.get(ref)
      const data = snap.data() as (OAuthAttempt & { expiresAt?: Timestamp }) | undefined
      const validated = validateOAuthAttempt({ attempt: data, state, uid: data?.uid ?? '', integration: data?.integration ?? 'calendar', redirectUri: callbackUri(), nowMillis: Date.now() })
      if (!data?.expiresAt || data.expiresAt.toMillis() <= Date.now()) throw new Error('Authorization attempt expired.')
      safeReturn = assertReturnUrl(validated.returnUrl)
      transaction.update(ref, { consumed: true, consumedAt: FieldValue.serverTimestamp() })
      return validated
    })
    const tokens = await exchangeCode(code, result)
    if (typeof tokens.access_token !== 'string') throw new Error('Google did not provide an access token.')
    const identity = await providerAccount(tokens.access_token)
    const credentialRef = privateCredentials().doc(credentialId(result.uid, result.integration))
    await firestore().runTransaction(async (transaction) => {
      const existing = await transaction.get(credentialRef)
      const previous = existing.data()
      let encrypted = previous?.accountSub === identity.sub ? previous.encryptedRefreshToken : undefined
      if (typeof tokens.refresh_token === 'string') encrypted = await encryptRefreshToken(result.uid, result.integration, tokens.refresh_token)
      if (!encrypted) throw new Error('Google did not return a refresh token. Reconnect with offline access or revoke the prior grant and try again.')
      const scopes = typeof tokens.scope === 'string' ? tokens.scope : ''
      if (!hasRequiredScopes(scopes, result.integration)) throw new Error('Google did not grant all required permissions.')
      transaction.set(credentialRef, { uid: result.uid, provider: result.integration, accountSub: identity.sub, ...(identity.email ? { accountEmail: identity.email } : {}), grantedScopes: typeof tokens.scope === 'string' ? tokens.scope : '', encryptedRefreshToken: encrypted, accessTokenExpiresAt: Timestamp.fromMillis(Date.now() + Number(tokens.expires_in ?? 3600) * 1000), connectedAt: existing.exists ? previous?.connectedAt : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), tokenVersion: 1 })
    })
    response.redirect(303, `${safeReturn}${safeReturn.includes('?') ? '&' : '?'}google=connected&provider=${result.integration}`)
  } catch {
    const url = new URL(safeReturn)
    url.searchParams.set('google', 'error')
    url.searchParams.set('message', 'Google connection could not be completed. Return to Settings and try again.')
    response.redirect(303, url.toString())
  }
})

async function freshAccessToken(uid: string, provider: GoogleIntegration): Promise<{ accessToken: string; scopes: string }> {
  const ref = privateCredentials().doc(credentialId(uid, provider))
  const snap = await ref.get()
  const record = snap.data()
  if (!snap.exists || !record || record.uid !== uid || record.provider !== provider) throw new HttpsError('failed-precondition', `${provider} is not connected.`)
  let token = ''
  try {
    const refresh = await decryptRefreshToken(uid, provider, record.encryptedRefreshToken as Record<string, unknown>)
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: googleClientId.value(), client_secret: googleClientSecret.value(), refresh_token: refresh, grant_type: 'refresh_token' }) })
    const payload = await response.json() as Record<string, unknown>
    if (!response.ok || typeof payload.access_token !== 'string') throw new Error('Google token refresh failed.')
    token = payload.access_token
    const scopes = typeof payload.scope === 'string' ? payload.scope : String(record.grantedScopes ?? '')
    if (!hasRequiredScopes(scopes, provider)) throw new HttpsError('failed-precondition', 'Google authorization is missing required permissions. Reconnect this service.')
    await ref.update({ grantedScopes: scopes, accessTokenExpiresAt: Timestamp.fromMillis(Date.now() + Number(payload.expires_in ?? 3600) * 1000), updatedAt: FieldValue.serverTimestamp() })
    return { accessToken: token, scopes }
  } catch (error) {
    if (error instanceof HttpsError) throw error
    throw new HttpsError('failed-precondition', 'Google authorization expired or was revoked. Reconnect this service.')
  }
}

export const getGoogleIntegrationStatus = onCall(async (request) => {
  const uid = authenticatedUid(request)
  const provider = parseProvider(request.data?.provider)
  const snap = await privateCredentials().doc(credentialId(uid, provider)).get()
  const value = snap.data()
  if (!snap.exists || !value || value.uid !== uid) return { connected: false }
  return { connected: true, provider, accountEmail: typeof value.accountEmail === 'string' ? value.accountEmail : null, grantedScopes: value.grantedScopes, connectedAt: value.connectedAt?.toMillis?.() ?? null }
})

async function listGooglePages(url: string, accessToken: string): Promise<Record<string, unknown>[]> {
  const values: Record<string, unknown>[] = []
  let next: string | null = url
  let pages = 0
  while (next && pages++ < 25) {
    const response = await fetch(next, { headers: { authorization: `Bearer ${accessToken}` } })
    if (response.status === 401 || response.status === 403) throw new HttpsError('failed-precondition', 'Google denied access. Reconnect this service or review its permissions.')
    if (response.status === 429 || response.status >= 500) throw new HttpsError('unavailable', 'Google is temporarily unavailable. Try again shortly.')
    if (!response.ok) throw new HttpsError('internal', 'Google data could not be loaded.')
    const body = await response.json() as Record<string, unknown>
    for (const item of (body.items as Record<string, unknown>[] | undefined) ?? []) values.push(item)
    const token = body.nextPageToken
    if (typeof token !== 'string') next = null
    else { const pageUrl = new URL(url); pageUrl.searchParams.set('pageToken', token); next = pageUrl.toString() }
  }
  if (next) throw new HttpsError('resource-exhausted', 'Google returned too many pages for one request. Narrow the date range and try again.')
  return values
}

export const getGoogleCalendarEvents = onCall({ secrets: [googleClientSecret] }, async (request) => {
  const uid = authenticatedUid(request)
  const { accessToken } = await freshAccessToken(uid, 'calendar')
  const timeMin = typeof request.data?.timeMin === 'string' ? request.data.timeMin : new Date(Date.now() - 7 * 86400000).toISOString()
  const timeMax = typeof request.data?.timeMax === 'string' ? request.data.timeMax : new Date(Date.now() + 31 * 86400000).toISOString()
  if (!Number.isFinite(Date.parse(timeMin)) || !Number.isFinite(Date.parse(timeMax)) || Date.parse(timeMax) <= Date.parse(timeMin)) throw new HttpsError('invalid-argument', 'Choose a valid Calendar date range.')
  const calendars = await listGooglePages('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', accessToken)
  const events = await Promise.all(calendars.filter((calendar) => typeof calendar.id === 'string').map(async (calendar) => ({ calendarId: calendar.id, calendarName: calendar.summary ?? 'Google Calendar', events: await listGooglePages(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(calendar.id))}/events?maxResults=250&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`, accessToken) })))
  return { calendars: events }
})

export const getGoogleClassroomData = onCall({ secrets: [googleClientSecret] }, async (request) => {
  const uid = authenticatedUid(request)
  const { accessToken } = await freshAccessToken(uid, 'classroom')
  const courses = await listGooglePages('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=100', accessToken)
  const records = await Promise.all(courses.filter((course) => typeof course.id === 'string').map(async (course) => {
    const id = encodeURIComponent(String(course.id))
    const [courseWork, announcements] = await Promise.all([
      listGooglePages(`https://classroom.googleapis.com/v1/courses/${id}/courseWork?pageSize=100`, accessToken).catch(() => []),
      listGooglePages(`https://classroom.googleapis.com/v1/courses/${id}/announcements?pageSize=100`, accessToken).catch(() => []),
    ])
    return { course, courseWork, announcements }
  }))
  return { courses: records }
})

export const disconnectGoogleIntegration = onCall({ secrets: [googleClientSecret] }, async (request) => {
  const uid = authenticatedUid(request)
  const provider = parseProvider(request.data?.provider)
  const ref = privateCredentials().doc(credentialId(uid, provider))
  const snap = await ref.get()
  const record = snap.data()
  if (!snap.exists || !record || record.uid !== uid) return { disconnected: true }
  // Revoke only this local connection. Google revocation can invalidate other
  // scopes granted to the same Google account and OAuth client, so it is not
  // safe to imply that provider-wide revocation is isolated by integration.
  await ref.delete()
  return { disconnected: true }
})

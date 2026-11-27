import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index.js'
import { decryptRefreshToken, randomUrlSafe, sha256Base64Url } from '../src/crypto.js'
import { SCOPES, type Env } from '../src/types.js'

const testEnv = {
  ...(env as unknown as Env),
  GOOGLE_WEB_CLIENT_ID: 'web-client-id',
  GOOGLE_WEB_CLIENT_SECRET: 'web-client-secret-for-test',
  GOOGLE_WEB_RETURN_ORIGINS: 'https://web.example.test,http://localhost:5173',
  TOKEN_ENCRYPTION_CURRENT_VERSION: 'test-v1',
  TOKEN_ENCRYPTION_KEYS: JSON.stringify({ 'test-v1': btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) }),
} as Env
const state = randomUrlSafe()
const verifier = randomUrlSafe()

beforeEach(async () => {
  await testEnv.DB.prepare('DELETE FROM oauth_attempts').run()
  await testEnv.DB.prepare('DELETE FROM google_credentials').run()
  vi.unstubAllGlobals()
})

async function addAttempt(uid = 'firebase-uid-a') {
  await testEnv.DB.prepare(`INSERT INTO oauth_attempts(state_hash,firebase_uid,provider,platform,redirect_uri,return_url,code_verifier,code_challenge,expires_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
    await sha256Base64Url(state), uid, 'calendar', 'web', 'https://worker.example.test/oauth/callback',
    'https://web.example.test/calendar?tab=events', verifier, await sha256Base64Url(verifier),
    Math.floor(Date.now() / 1000) + 600, Math.floor(Date.now() / 1000),
  ).run()
}

describe('Web OAuth callback', () => {
  it('rejects an untrusted non-local HTTP callback destination', async () => {
  await addAttempt()

  await testEnv.DB.prepare(
    'UPDATE oauth_attempts SET return_url=? WHERE state_hash=?'
  ).bind(
    'http://evil.example.test/steal',
    await sha256Base64Url(state),
  ).run()

  const response = await worker.fetch(
    new Request(`https://worker.example.test/oauth/callback?state=${state}&code=test-code`),
    testEnv,
  )

  expect(response.status).toBe(303)

  const destination = new URL(response.headers.get('location')!)
  expect(destination.origin).toBe('https://localhost')
  expect(destination.searchParams.get('google')).toBe('error')
})
  it('accepts an explicitly allowlisted localhost HTTP callback destination', async () => {
  await addAttempt()

  await testEnv.DB.prepare(
    'UPDATE oauth_attempts SET return_url=? WHERE state_hash=?'
  ).bind(
    'http://localhost:5173/calendar?tab=events',
    await sha256Base64Url(state),
  ).run()

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        scope: SCOPES.calendar.join(' '),
      })
    }

    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return Response.json({
        sub: 'google-subject-localhost',
        email: 'student@example.test',
      })
    }

    throw new Error('Unexpected external request')
  }))

  const response = await worker.fetch(
    new Request(`https://worker.example.test/oauth/callback?state=${state}&code=test-code`),
    testEnv,
  )

  expect(response.status).toBe(303)

  const destination = new URL(response.headers.get('location')!)
  expect(destination.origin).toBe('http://localhost:5173')
  expect(destination.pathname).toBe('/calendar')
  expect(destination.searchParams.get('google')).toBe('connected')
})
  it('exchanges a one-use code server-side, binds the grant to state UID and persists only encrypted refresh data', async () => {
    await addAttempt()
    const requests: Array<{ url: string; body?: string; authorization?: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, body: init?.body == null ? undefined : String(init.body), authorization: new Headers(init?.headers).get('authorization') ?? undefined })
      if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'short-lived-test-access', refresh_token: 'test-refresh-token', scope: SCOPES.calendar.join(' ') })
      if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return Response.json({ sub: 'google-subject-a', email: 'student@example.test' })
      throw new Error('Unexpected external request')
    }))

    const response = await worker.fetch(new Request(`https://worker.example.test/oauth/callback?state=${state}&code=authorization-code`), testEnv)
    expect(response.status).toBe(303)
    const destination = new URL(response.headers.get('location')!)
    expect(destination.origin).toBe('https://web.example.test')
    expect(destination.searchParams.get('google')).toBe('connected')
    expect(destination.searchParams.get('provider')).toBe('calendar')
    expect(destination.searchParams.has('code')).toBe(false)
    expect(destination.searchParams.has('state')).toBe(false)
    expect(response.headers.get('location')).not.toContain('short-lived-test-access')
    expect(response.headers.get('location')).not.toContain('test-refresh-token')
    expect(requests[0]?.body).toContain('client_secret=web-client-secret-for-test')
    expect(requests[0]?.body).toContain('code=authorization-code')
    expect(requests[1]?.authorization).toBe('Bearer short-lived-test-access')

    const saved = await testEnv.DB.prepare('SELECT * FROM google_credentials WHERE firebase_uid=? AND provider=?').bind('firebase-uid-a', 'calendar').first<any>()
    expect(saved.google_subject).toBe('google-subject-a')
    expect(saved.ciphertext).not.toContain('test-refresh-token')
    expect(await decryptRefreshToken(testEnv, 'firebase-uid-a', 'calendar', saved)).toBe('test-refresh-token')
    expect(await testEnv.DB.prepare('SELECT 1 FROM google_credentials WHERE firebase_uid=? AND provider=?').bind('firebase-uid-b', 'calendar').first()).toBeNull()
  })

  it('rejects replayed callbacks and does not expose authorization or token values', async () => {
    await addAttempt()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('A replay must be rejected before provider calls.') }))
    const response = await worker.fetch(new Request(`https://worker.example.test/oauth/callback?state=${state}&code=authorization-code`), testEnv)
    const location = response.headers.get('location') ?? ''
    expect(response.status).toBe(303)
    expect(location).toContain('google=error')
    expect(location).not.toContain('authorization-code')
    expect(await testEnv.DB.prepare('SELECT 1 FROM google_credentials').first()).toBeNull()
  })

  it('redirects cancellation to the stored allowlisted return destination without exchanging a code', async () => {
    await addAttempt()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Cancelled authorization must not exchange a code.') }))
    const response = await worker.fetch(new Request(`https://worker.example.test/oauth/callback?state=${state}&error=access_denied`), testEnv)
    const destination = new URL(response.headers.get('location')!)
    expect(response.status).toBe(303)
    expect(destination.origin).toBe('https://web.example.test')
    expect(destination.pathname).toBe('/calendar')
    expect(destination.searchParams.get('google')).toBe('error')
  })
})

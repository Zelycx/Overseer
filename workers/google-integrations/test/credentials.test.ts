import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptRefreshToken } from '../src/crypto.js'
import { disconnectCredential, freshAccessToken, persistCredential } from '../src/index.js'
import { SCOPES, type Env } from '../src/types.js'

const bindings = { ...(env as unknown as Env), GOOGLE_WEB_CLIENT_ID: 'web-client', GOOGLE_ANDROID_CLIENT_ID: 'android-client', GOOGLE_WEB_CLIENT_SECRET: 'server-only-secret', TOKEN_ENCRYPTION_CURRENT_VERSION: 'v1', TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) }) } as Env
beforeEach(async () => { await bindings.DB.prepare('DELETE FROM google_credentials').run() })

describe('D1 private credential persistence', () => {
  it('encrypts token records, preserves omitted refresh tokens only for the same account/client, and isolates UID/provider', async () => {
    const scopes = SCOPES.calendar.join(' ')
    await persistCredential(bindings, 'uid-a', 'calendar', 'android', { sub: 'google-a', email: 'a@example.test' }, scopes, 'refresh-token-value')
    const first = await bindings.DB.prepare('SELECT * FROM google_credentials WHERE firebase_uid=? AND provider=?').bind('uid-a','calendar').first<any>()
    expect(first.ciphertext).not.toContain('refresh-token-value')
    expect(await decryptRefreshToken(bindings,'uid-a','calendar',first)).toBe('refresh-token-value')
    await persistCredential(bindings, 'uid-a', 'calendar', 'android', { sub: 'google-a' }, scopes, null)
    const preserved = await bindings.DB.prepare('SELECT * FROM google_credentials WHERE firebase_uid=? AND provider=?').bind('uid-a','calendar').first<any>()
    expect(preserved.ciphertext).toBe(first.ciphertext)
    await expect(persistCredential(bindings, 'uid-a', 'calendar', 'android', { sub: 'google-b' }, scopes, null)).rejects.toBeInstanceOf(Response)
    await persistCredential(bindings, 'uid-b', 'calendar', 'android', { sub: 'google-a' }, scopes, 'other-refresh')
    await persistCredential(bindings, 'uid-a', 'classroom', 'android', { sub: 'google-a' }, SCOPES.classroom.join(' '), 'classroom-refresh')
    await disconnectCredential(bindings, 'uid-a', 'calendar')
    expect(await bindings.DB.prepare('SELECT 1 FROM google_credentials WHERE firebase_uid=? AND provider=?').bind('uid-a','calendar').first()).toBeNull()
    expect(await bindings.DB.prepare('SELECT 1 FROM google_credentials WHERE firebase_uid=? AND provider=?').bind('uid-a','classroom').first()).not.toBeNull()
    expect(await bindings.DB.prepare('SELECT 1 FROM google_credentials WHERE firebase_uid=? AND provider=?').bind('uid-b','calendar').first()).not.toBeNull()
  })
  it('refreshes Android grants using the Web OAuth client and server-side secret', async () => {
    await persistCredential(bindings, 'uid-a', 'calendar', 'android', { sub: 'google-a' }, SCOPES.calendar.join(' '), 'refresh-token-value')
    let posted = ''
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      posted = String(init?.body ?? '')
      return Response.json({ access_token: 'short-lived-access-token', scope: SCOPES.calendar.join(' '), expires_in: 3600 })
    }))
    await expect(freshAccessToken(bindings, 'uid-a', 'calendar')).resolves.toBe('short-lived-access-token')
    expect(posted).toContain('client_id=web-client')
    expect(posted).toContain('client_secret=server-only-secret')
    vi.unstubAllGlobals()
  })
  it('does not overwrite a newer connection when concurrent account authorization omits a refresh token', async () => {
    const scopes = SCOPES.calendar.join(' ')
    await persistCredential(bindings, 'uid-a', 'calendar', 'android', { sub: 'google-a' }, scopes, 'refresh-a')
    let selected!: () => void
    let resume!: () => void
    const didSelect = new Promise<void>((resolve) => { selected = resolve })
    const mayContinue = new Promise<void>((resolve) => { resume = resolve })
    const database = new Proxy(bindings.DB, {
      get(target, property) {
        if (property === 'prepare') return (sql: string) => {
          const statement = target.prepare(sql)
          if (!sql.startsWith('SELECT * FROM google_credentials')) return statement
          return { bind: (...values: unknown[]) => {
            const bound = statement.bind(...values)
            return { first: async <T>() => {
              const row = await bound.first<T>()
              if (values[0] === 'uid-a') { selected(); await mayContinue }
              return row
            } }
          } }
        }
        return Reflect.get(target, property, target)
      },
    }) as D1Database
    const racingEnv = { ...bindings, DB: database } as Env
    const staleAuthorization = persistCredential(racingEnv, 'uid-a', 'calendar', 'android', { sub: 'google-a' }, scopes, null)
    await didSelect
    await persistCredential(bindings, 'uid-a', 'calendar', 'android', { sub: 'google-b' }, scopes, 'refresh-b')
    resume()
    await expect(staleAuthorization).rejects.toBeInstanceOf(Response)
    const current = await bindings.DB.prepare('SELECT * FROM google_credentials WHERE firebase_uid=? AND provider=?').bind('uid-a', 'calendar').first<any>()
    expect(current.google_subject).toBe('google-b')
    expect(await decryptRefreshToken(bindings, 'uid-a', 'calendar', current)).toBe('refresh-b')
  })
  it('maps revoked refresh tokens to a reconnectable error without exposing credentials', async () => {
    await persistCredential(bindings, 'uid-a', 'calendar', 'android', { sub: 'google-a' }, SCOPES.calendar.join(' '), 'private-refresh-value')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'invalid_grant', error_description: 'do not expose provider details' }, { status: 400 })))
    let error: unknown
    try { await freshAccessToken(bindings, 'uid-a', 'calendar') } catch (cause) { error = cause }
    expect(error).toBeInstanceOf(Response)
    expect((error as Response).status).toBe(409)
    const message = await (error as Response).text()
    expect(message).toContain('Reconnect')
    expect(message).not.toContain('private-refresh-value')
    vi.unstubAllGlobals()
  })
})

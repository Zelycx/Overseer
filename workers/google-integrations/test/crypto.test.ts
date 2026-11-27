import { describe, expect, it } from 'vitest'
import { decryptRefreshToken, encryptRefreshToken, pkceChallenge, randomUrlSafe, validateScopes } from '../src/crypto.js'
import type { Env } from '../src/types.js'

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
const env = { TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: key }), TOKEN_ENCRYPTION_CURRENT_VERSION: 'v1' } as Env

describe('Worker credential crypto', () => {
  it('generates PKCE pairs and random URL-safe state', async () => {
    const verifier = randomUrlSafe()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await pkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
  it('encrypts refresh tokens with version and UID/provider AAD binding', async () => {
    const record = await encryptRefreshToken(env, 'u1', 'calendar', 'secret-refresh-token')
    expect(record.keyVersion).toBe('v1')
    expect(await decryptRefreshToken(env, 'u1', 'calendar', { ...record, key_version: record.keyVersion })).toBe('secret-refresh-token')
    await expect(decryptRefreshToken(env, 'u2', 'calendar', { ...record, key_version: record.keyVersion })).rejects.toThrow()
    await expect(decryptRefreshToken(env, 'u1', 'classroom', { ...record, key_version: record.keyVersion })).rejects.toThrow()
  })
  it('rejects tampered ciphertext and absent key versions', async () => {
    const record = await encryptRefreshToken(env, 'u1', 'classroom', 'token')
    const changed = { ...record, ciphertext: `${record.ciphertext.slice(0, -2)}AA`, key_version: 'v1' }
    await expect(decryptRefreshToken(env, 'u1', 'classroom', changed)).rejects.toThrow()
    await expect(decryptRefreshToken(env, 'u1', 'classroom', { ...record, key_version: 'missing' })).rejects.toThrow()
  })
  it('uses the active key for new writes while preserving old-key reads during rotation', async () => {
    const keyV2 = btoa(String.fromCharCode(...new Uint8Array(32).fill(8)))
    const staged = { ...env, TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: key, v2: keyV2 }), TOKEN_ENCRYPTION_CURRENT_VERSION: 'v1' }
    const oldRecord = await encryptRefreshToken(staged, 'rotate-user', 'calendar', 'old-token')
    const activeV2 = { ...staged, TOKEN_ENCRYPTION_CURRENT_VERSION: 'v2' }
    const newRecord = await encryptRefreshToken(activeV2, 'rotate-user', 'calendar', 'new-token')
    expect(oldRecord.keyVersion).toBe('v1')
    expect(newRecord.keyVersion).toBe('v2')
    expect(await decryptRefreshToken(activeV2, 'rotate-user', 'calendar', { ...oldRecord, key_version: oldRecord.keyVersion })).toBe('old-token')
    expect(await decryptRefreshToken(activeV2, 'rotate-user', 'calendar', { ...newRecord, key_version: newRecord.keyVersion })).toBe('new-token')
    const retiredV1 = { ...activeV2, TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v2: keyV2 }) }
    await expect(decryptRefreshToken(retiredV1, 'rotate-user', 'calendar', { ...oldRecord, key_version: oldRecord.keyVersion })).rejects.toThrow()
  })
  it('fails closed when key configuration is missing or malformed', async () => {
    await expect(encryptRefreshToken({ ...env, TOKEN_ENCRYPTION_KEYS: '' }, 'u', 'calendar', 't')).rejects.toThrow()
    await expect(encryptRefreshToken({ ...env, TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: btoa('short') }) }, 'u', 'calendar', 't')).rejects.toThrow()
  })
  it('requires the least-privilege provider scopes', () => {
    expect(validateScopes('https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'calendar')).toBe(true)
    expect(validateScopes('https://www.googleapis.com/auth/classroom.courses.readonly', 'classroom')).toBe(false)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { generateKeyPair, SignJWT } from 'jose'
import { resetFirebaseKeyCacheForTests, verifyFirebaseIdToken } from '../src/auth.js'
import type { Env } from '../src/types.js'

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env
describe('Firebase ID token verification', () => {
  it('verifies Firebase issuer, audience, expiry, subject and signature', async () => {
    const keys = await generateKeyPair('RS256', { modulusLength: 2048 })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ 'test-kid': 'test-certificate' }, { headers: { 'cache-control': 'public, max-age=60' } })))
    resetFirebaseKeyCacheForTests()
    const token = await new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 20 })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' }).setSubject('firebase-user')
      .setIssuer('https://securetoken.google.com/test-project').setAudience('test-project')
      .setIssuedAt().setExpirationTime('5m').sign(keys.privateKey)
    await expect(verifyFirebaseIdToken(env, token, async () => keys.publicKey)).resolves.toMatchObject({ sub: 'firebase-user' })
    vi.unstubAllGlobals()
  })
  it('rejects wrong audience and expired identity tokens', async () => {
    const keys = await generateKeyPair('RS256', { modulusLength: 2048 })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ 'test-kid': 'test-certificate' }, { headers: { 'cache-control': 'public, max-age=60' } })))
    resetFirebaseKeyCacheForTests()
    const base = new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 60 }).setProtectedHeader({ alg: 'RS256', kid: 'test-kid' }).setSubject('uid').setIssuer('https://securetoken.google.com/test-project')
    const wrongAudience = await base.setAudience('wrong-project').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey)
    await expect(verifyFirebaseIdToken(env, wrongAudience, async () => keys.publicKey)).rejects.toThrow()
    const expired = await new SignJWT({ auth_time: 1 }).setProtectedHeader({ alg: 'RS256', kid: 'test-kid' }).setSubject('uid').setIssuer('https://securetoken.google.com/test-project').setAudience('test-project').setIssuedAt(Math.floor(Date.now() / 1000) - 600).setExpirationTime(Math.floor(Date.now() / 1000) - 1).sign(keys.privateKey)
    await expect(verifyFirebaseIdToken(env, expired, async () => keys.publicKey)).rejects.toThrow()
    vi.unstubAllGlobals()
  })
})

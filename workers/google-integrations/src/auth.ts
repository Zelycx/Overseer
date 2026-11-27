import { importX509, jwtVerify, type JWTPayload } from 'jose'
import type { Env } from './types.js'
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
let cache: { certs: Record<string, string>; expiresAt: number } | undefined
export function resetFirebaseKeyCacheForTests() { cache = undefined }
async function publicKey(kid: string, certificateImporter: typeof importX509) {
  if (!cache || cache.expiresAt <= Date.now()) {
    const response = await fetch(CERTS_URL)
    if (!response.ok) throw new Error('Firebase signing keys unavailable.')
    const certs = await response.json() as Record<string, string>
    const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1] ?? 300)
    cache = { certs, expiresAt: Date.now() + Math.max(maxAge, 60) * 1000 }
  }
  const cert = cache.certs[kid]
  if (!cert) { cache = undefined; throw new Error('Unknown Firebase signing key.') }
  return certificateImporter(cert, 'RS256')
}
export async function verifyFirebaseIdToken(env: Env, token: string, certificateImporter: typeof importX509 = importX509): Promise<JWTPayload & { sub: string }> {
  const { payload, protectedHeader } = await jwtVerify(token, async (header) => {
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid Firebase token header.')
    return publicKey(header.kid, certificateImporter)
  }, { issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`, audience: env.FIREBASE_PROJECT_ID, algorithms: ['RS256'], clockTolerance: 30 })
  const now = Math.floor(Date.now() / 1000)
  if (protectedHeader.alg !== 'RS256' || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` || payload.aud !== env.FIREBASE_PROJECT_ID || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 || typeof payload.iat !== 'number' || payload.iat > now || typeof payload.exp !== 'number' || payload.exp <= now || typeof payload.auth_time !== 'number' || payload.auth_time > now) throw new Error('Invalid Firebase identity token claims.')
  return payload as JWTPayload & { sub: string }
}

import { SCOPES, type Env, type Provider } from './types.js'
const encoder = new TextEncoder()
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
export async function sha256Base64Url(value: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function randomUrlSafe(bytes = 32): string {
  const value = new Uint8Array(bytes); crypto.getRandomValues(value)
  return b64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function pkceChallenge(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error('Invalid PKCE verifier.')
  return sha256Base64Url(verifier)
}
function keyring(env: Env): Record<string, string> {
  try { return JSON.parse(env.TOKEN_ENCRYPTION_KEYS) as Record<string, string> }
  catch { throw new Error('Token encryption keys are not configured.') }
}
function aad(uid: string, provider: Provider, purpose: 'google-refresh-token' | 'google-pagination-cursor'): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(`overseer|${uid}|${provider}|${purpose}|v1`))
}
const base64UrlEncode = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const base64UrlDecode = (value: string) => unb64(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4))
function encryptionKey(env: Env, version: string): Uint8Array<ArrayBuffer> {
  const raw = keyring(env)[version]
  if (!version || !raw) throw new Error('Token encryption key version is unavailable.')
  const bytes = unb64(raw)
  if (bytes.byteLength !== 32) throw new Error('Token encryption key must be 32 bytes.')
  return bytes
}
export async function encryptRefreshToken(env: Env, uid: string, provider: Provider, token: string) {
  const version = env.TOKEN_ENCRYPTION_CURRENT_VERSION
  const bytes = encryptionKey(env, version)
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(uid, provider, 'google-refresh-token'), tagLength: 128 }, key, encoder.encode(token))
  return { ciphertext: b64(new Uint8Array(ciphertext)), iv: b64(iv), keyVersion: version }
}
export async function decryptRefreshToken(env: Env, uid: string, provider: Provider, record: { ciphertext: string; iv: string; key_version: string }): Promise<string> {
  const bytes = encryptionKey(env, record.key_version)
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(record.iv), additionalData: aad(uid, provider, 'google-refresh-token'), tagLength: 128 }, key, unb64(record.ciphertext))
  return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
}
export async function encryptPaginationCursor(env: Env, uid: string, provider: Provider, cursor: unknown): Promise<string> {
  const version = env.TOKEN_ENCRYPTION_CURRENT_VERSION
  const bytes = encryptionKey(env, version)
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(cursor))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(uid, provider, 'google-pagination-cursor'), tagLength: 128 }, key, plaintext)
  return base64UrlEncode(encoder.encode(JSON.stringify({ version, iv: base64UrlEncode(iv), ciphertext: base64UrlEncode(new Uint8Array(ciphertext)) })))
}
export async function decryptPaginationCursor(env: Env, uid: string, provider: Provider, value: string): Promise<unknown> {
  if (!value || value.length > 24_000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Pagination cursor is invalid.')
  const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlDecode(value))) as { version?: unknown; iv?: unknown; ciphertext?: unknown }
  if (typeof envelope.version !== 'string' || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') throw new Error('Pagination cursor is invalid.')
  const bytes = encryptionKey(env, envelope.version)
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecode(envelope.iv), additionalData: aad(uid, provider, 'google-pagination-cursor'), tagLength: 128 }, key, base64UrlDecode(envelope.ciphertext))
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) as unknown
}
export function validateScopes(scopes: string, provider: Provider): boolean {
  const granted = new Set(scopes.split(/\s+/).filter(Boolean))
  return SCOPES[provider].every((scope) => granted.has(scope))
}

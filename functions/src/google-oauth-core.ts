import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const GOOGLE_INTEGRATIONS = {
  calendar: {
    scopes: ['https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'],
  },
  classroom: {
    scopes: [
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
      'https://www.googleapis.com/auth/classroom.announcements.readonly',
    ],
  },
} as const

export type GoogleIntegration = keyof typeof GOOGLE_INTEGRATIONS

export interface OAuthAttempt {
  uid: string
  integration: GoogleIntegration
  stateHash: string
  codeVerifier: string
  redirectUri: string
  expiresAtMillis: number
  consumed: boolean
  returnUrl?: string
  platform?: 'web' | 'android' | 'ios'
  codeChallenge?: string
}

export function createOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('base64url')
}

export function createPkceVerifier(): string {
  return randomBytes(32).toString('base64url')
}

export function createPkceChallenge(verifier: string): string {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error('Invalid PKCE verifier.')
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

export function validateOAuthAttempt(input: {
  attempt: OAuthAttempt | undefined
  state: string
  uid: string
  integration: GoogleIntegration
  redirectUri: string
  nowMillis: number
}): OAuthAttempt {
  const { attempt, state, uid, integration, redirectUri, nowMillis } = input
  if (!attempt || attempt.consumed) throw new Error('Authorization attempt is invalid or already used.')
  if (attempt.uid !== uid || attempt.integration !== integration) throw new Error('Authorization attempt does not belong to this account or integration.')
  if (attempt.expiresAtMillis <= nowMillis) throw new Error('Authorization attempt expired.')
  if (attempt.redirectUri !== redirectUri) throw new Error('Authorization redirect URI mismatch.')
  const expected = Buffer.from(attempt.stateHash)
  const actual = Buffer.from(hashOAuthState(state))
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Authorization state is invalid.')
  return attempt
}

export function validateNativeOAuthAttempt(input: {
  attempt: OAuthAttempt | undefined
  state: string
  uid: string
  integration: GoogleIntegration
  platform: 'android' | 'ios'
  redirectUri: string
  codeVerifier: string
  nowMillis: number
}): OAuthAttempt {
  const base = validateOAuthAttempt(input)
  if (base.platform !== input.platform) throw new Error('Authorization attempt platform mismatch.')
  if (!base.codeChallenge || base.codeChallenge !== createPkceChallenge(input.codeVerifier)) throw new Error('PKCE verifier mismatch.')
  return base
}

export function hasRequiredScopes(grantedScopes: string, integration: GoogleIntegration): boolean {
  const granted = new Set(grantedScopes.split(/\s+/).filter(Boolean))
  return GOOGLE_INTEGRATIONS[integration].scopes.every((scope) => granted.has(scope))
}

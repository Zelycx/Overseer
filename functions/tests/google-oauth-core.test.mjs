import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createOAuthState,
  hashOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  validateOAuthAttempt,
  hasRequiredScopes,
  validateNativeOAuthAttempt,
} from '../lib/google-oauth-core.js'

test('state and PKCE material are unpredictable and verifier is never returned as challenge', () => {
  const state = createOAuthState()
  const verifier = createPkceVerifier()
  const challenge = createPkceChallenge(verifier)
  assert.equal(state.length >= 40, true)
  assert.equal(verifier.length >= 43, true)
  assert.notEqual(challenge, verifier)
  assert.equal(hashOAuthState(state), hashOAuthState(state))
  assert.throws(() => createPkceChallenge('short'))
})

test('native authorization validates platform and the PKCE verifier binding', () => {
  const state = createOAuthState()
  const verifier = createPkceVerifier()
  const attempt = {
    uid: 'native-user', integration: 'classroom', platform: 'android',
    codeChallenge: createPkceChallenge(verifier), stateHash: hashOAuthState(state),
    codeVerifier: '', redirectUri: 'https://links.example.test/oauth/android',
    expiresAtMillis: 50_000, consumed: false,
  }
  const input = { attempt, state, uid: 'native-user', integration: 'classroom', platform: 'android', redirectUri: attempt.redirectUri, codeVerifier: verifier, nowMillis: 10_000 }
  assert.equal(validateNativeOAuthAttempt(input), attempt)
  assert.throws(() => validateNativeOAuthAttempt({ ...input, codeVerifier: createPkceVerifier() }), /PKCE verifier mismatch/)
  assert.throws(() => validateNativeOAuthAttempt({ ...input, platform: 'ios' }), /platform mismatch/)
  assert.throws(() => validateNativeOAuthAttempt({ ...input, uid: 'other-user' }), /does not belong/)
})

test('authorization validation binds state, UID, provider, redirect and expiry', () => {
  const state = createOAuthState()
  const attempt = {
    uid: 'user-a', integration: 'calendar', stateHash: hashOAuthState(state),
    codeVerifier: createPkceVerifier(), redirectUri: 'https://example.test/callback',
    expiresAtMillis: 10_000, consumed: false,
  }
  const validate = (overrides = {}) => validateOAuthAttempt({
    attempt, state, uid: 'user-a', integration: 'calendar',
    redirectUri: 'https://example.test/callback', nowMillis: 5_000, ...overrides,
  })
  assert.equal(validate(), attempt)
  assert.throws(() => validate({ state: 'attacker-state' }), /state is invalid/)
  assert.throws(() => validate({ uid: 'user-b' }), /does not belong/)
  assert.throws(() => validate({ integration: 'classroom' }), /does not belong/)
  assert.throws(() => validate({ redirectUri: 'https://evil.test/callback' }), /redirect URI mismatch/)
  assert.throws(() => validate({ nowMillis: 10_000 }), /expired/)
  assert.throws(() => validate({ attempt: { ...attempt, consumed: true } }), /already used/)
})

test('Calendar and Classroom scopes are independent and checked as exact scope tokens', () => {
  const calendarScopes = 'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly'
  assert.equal(hasRequiredScopes(calendarScopes, 'calendar'), true)
  assert.equal(hasRequiredScopes(calendarScopes, 'classroom'), false)
  assert.equal(hasRequiredScopes(`${calendarScopes} https://www.googleapis.com/auth/classroom.courses.readonly`, 'calendar'), true)
})

import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, inMemoryPersistence, initializeAuth } from 'firebase/auth'
import { createServer } from 'vite'

let vite
let app
let auth
let authClient
let authRouting
let getAuthErrorMessage
let AuthActionGuard
let AUTH_ACTION_IN_PROGRESS_MESSAGE

before(async () => {
  vite = await createServer({
    configFile: false,
    envDir: false,
    root: new URL('..', import.meta.url).pathname,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  authClient = await vite.ssrLoadModule('/src/auth/authClient.ts')
  authRouting = await vite.ssrLoadModule('/src/auth/authRouting.ts')
  ;({ AuthActionGuard, AUTH_ACTION_IN_PROGRESS_MESSAGE } = await vite.ssrLoadModule('/src/auth/authActionGuard.ts'))
  ;({ getAuthErrorMessage } = await vite.ssrLoadModule('/src/auth/authErrors.ts'))

  app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: 'demo-overseer-web.firebaseapp.com',
    projectId: 'demo-overseer-web',
    appId: '1:123456789:web:auth-test',
  }, `auth-test-${Date.now()}`)
  auth = initializeAuth(app, { persistence: [inMemoryPersistence] })
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
})

after(async () => {
  await authClient?.signOutUser(auth).catch(() => {})
  if (app) await deleteApp(app)
  await vite?.close()
})

test('Auth Emulator supports signed-out, create, sign-in, rejection, sign-out, and listener cleanup', { timeout: 30000 }, async () => {
  const queuedStates = []
  const waiters = []
  const receivedStates = []
  const recordState = (user) => {
    const uid = user?.uid ?? null
    receivedStates.push(uid)
    const resolve = waiters.shift()
    if (resolve) resolve(uid)
    else queuedStates.push(uid)
  }
  const nextState = () => queuedStates.length
    ? Promise.resolve(queuedStates.shift())
    : new Promise((resolve) => waiters.push(resolve))

  const unsubscribe = authClient.observeAuthState(auth, recordState, (error) => {
    throw error
  })

  try {
    assert.equal(await nextState(), null)

    const email = `auth-${Date.now()}@example.test`
    const password = 'test-password-123'
    const createdState = nextState()
    const created = await authClient.createEmailAccount(auth, email, password)
    assert.ok(created.user.uid)
    assert.equal(await createdState, created.user.uid)

    await assert.rejects(
      authClient.createEmailAccount(auth, email, password),
      (error) => error.code === 'auth/email-already-in-use'
        && getAuthErrorMessage(error).includes('Sign in with the provider you originally used'),
    )

    const signedOutState = nextState()
    await authClient.signOutUser(auth)
    assert.equal(await signedOutState, null)

    const signedInState = nextState()
    const signedIn = await authClient.signInWithEmail(auth, email, password)
    assert.equal(signedIn.user.uid, created.user.uid)
    assert.equal(await signedInState, created.user.uid)

    const invalidCredentialsState = nextState()
    await authClient.signOutUser(auth)
    assert.equal(await invalidCredentialsState, null)
    await assert.rejects(
      authClient.signInWithEmail(auth, email, 'incorrect-password'),
      (error) => ['auth/invalid-credential', 'auth/wrong-password'].includes(error.code)
        && getAuthErrorMessage(error).includes('email or password is incorrect'),
    )

    const finalSignInState = nextState()
    await authClient.signInWithEmail(auth, email, password)
    assert.equal(await finalSignInState, created.user.uid)

    unsubscribe()
    const stateCountAfterUnsubscribe = receivedStates.length
    await authClient.signOutUser(auth)
    await authClient.signInWithEmail(auth, email, password)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(receivedStates.length, stateCountAfterUnsubscribe)
  } finally {
    unsubscribe()
  }
})

test('protected route decisions wait, redirect signed-out users, and allow authenticated users', () => {
  assert.equal(authRouting.getProtectedRouteDecision(true, false), 'loading')
  assert.equal(authRouting.getProtectedRouteDecision(false, false), 'redirect')
  assert.equal(authRouting.getProtectedRouteDecision(false, true), 'allow')
})

test('post-authentication redirects preserve safe internal paths and reject external or malformed destinations', () => {
  const trustedOrigin = 'https://overseer.example'
  assert.equal(
    authRouting.getPostAuthDestination({ from: { pathname: '/dashboard' } }, trustedOrigin),
    '/dashboard',
  )
  assert.equal(
    authRouting.getPostAuthDestination({ from: { pathname: '/tasks', search: '?filter=open' } }, trustedOrigin),
    '/tasks?filter=open',
  )
  assert.equal(
    authRouting.getPostAuthDestination({ from: { pathname: '/dashboard', hash: '#overview' } }, trustedOrigin),
    '/dashboard#overview',
  )
  assert.equal(authRouting.getPostAuthDestination({ from: { pathname: '//evil.example' } }, trustedOrigin), '/dashboard')
  assert.equal(authRouting.getPostAuthDestination({ from: { pathname: '/\\evil.example' } }, trustedOrigin), '/dashboard')
  assert.equal(authRouting.getPostAuthDestination({ from: { pathname: '/\\\\evil.example' } }, trustedOrigin), '/dashboard')
  assert.equal(
    authRouting.getPostAuthDestination({ from: { pathname: '/dashboard', search: '?next=\\evil.example' } }, trustedOrigin),
    '/dashboard',
  )
  assert.equal(
    authRouting.getPostAuthDestination({ from: { pathname: 'https://evil.example/path' } }, trustedOrigin),
    '/dashboard',
  )
  assert.equal(authRouting.getPostAuthDestination({ from: { pathname: '/%ZZ' } }, trustedOrigin), '/dashboard')
  assert.equal(authRouting.getPostAuthDestination(null, trustedOrigin), '/dashboard')
  assert.equal(authRouting.getPostAuthDestination({ from: { pathname: 42 } }, trustedOrigin), '/dashboard')
  assert.equal(
    authRouting.getPostAuthDestination({ from: { pathname: '/dashboard' } }, 'not a valid origin'),
    '/dashboard',
  )
})

test('provider collisions explain recovery without linking accounts', () => {
  const message = getAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' })
  assert.match(message, /sign in with the provider you originally used/i)
  assert.match(message, /not automatically linked/i)
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('auth action guard rejects a second action while the first is pending', async () => {
  const guard = new AuthActionGuard()
  const pending = deferred()
  let secondActionStarted = false
  const firstAction = guard.run(() => pending.promise)

  assert.equal(guard.isRunning, true)
  assert.deepEqual(await guard.run(async () => {
    secondActionStarted = true
  }), { status: 'busy' })
  assert.equal(secondActionStarted, false)
  assert.equal(AUTH_ACTION_IN_PROGRESS_MESSAGE, 'An authentication action is already in progress. Please wait for it to finish.')

  pending.resolve('signed-in')
  assert.deepEqual(await firstAction, { status: 'success', value: 'signed-in' })
  assert.equal(guard.isRunning, false)
})

test('auth action guard releases after success and permits the next action', async () => {
  const guard = new AuthActionGuard()

  assert.deepEqual(await guard.run(async () => 'created'), { status: 'success', value: 'created' })
  assert.equal(guard.isRunning, false)
  assert.deepEqual(await guard.run(async () => 'signed-in'), { status: 'success', value: 'signed-in' })
})

test('auth action guard releases after failure and preserves the mapped error', async () => {
  const guard = new AuthActionGuard()
  const failure = { code: 'auth/invalid-credential' }
  const outcome = await guard.run(async () => {
    throw failure
  })

  assert.deepEqual(outcome, { status: 'failure', error: failure })
  assert.match(getAuthErrorMessage(outcome.error), /email or password is incorrect/i)
  assert.equal(guard.isRunning, false)
  assert.deepEqual(await guard.run(async () => 'retry-succeeded'), { status: 'success', value: 'retry-succeeded' })
})

test('auth action guard blocks concurrent sign-out attempts', async () => {
  const guard = new AuthActionGuard()
  const pendingSignOut = deferred()
  let signOutCalls = 0
  const firstSignOut = guard.run(() => {
    signOutCalls += 1
    return pendingSignOut.promise
  })
  const repeatedSignOut = await guard.run(async () => {
    signOutCalls += 1
  })

  assert.deepEqual(repeatedSignOut, { status: 'busy' })
  assert.equal(signOutCalls, 1)
  pendingSignOut.resolve(undefined)
  assert.deepEqual(await firstSignOut, { status: 'success', value: undefined })
  assert.equal(guard.isRunning, false)
})

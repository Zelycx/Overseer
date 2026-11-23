import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  EMULATOR_PROJECT_ID,
  initializeIfConfigured,
  requireFirebaseConfiguration,
  resolveFirebaseConfiguration,
} from '../src/firebase/config.mjs'

const configuredEnvironment = {
  VITE_FIREBASE_API_KEY: 'test-api-key-placeholder',
  VITE_FIREBASE_AUTH_DOMAIN: 'test-project.invalid',
  VITE_FIREBASE_PROJECT_ID: 'overseer-f970c',
  VITE_FIREBASE_APP_ID: 'test-web-app-id',
}

test('emulator project namespace is demo-overseer-web throughout local setup', async () => {
  const result = resolveFirebaseConfiguration({
    ...configuredEnvironment,
    VITE_USE_FIREBASE_EMULATORS: 'true',
  }, false)
  const packageConfiguration = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const rulesTests = await readFile(new URL('./firestore-rules.test.mjs', import.meta.url), 'utf8')
  const client = await readFile(new URL('../src/firebase/client.ts', import.meta.url), 'utf8')

  assert.equal(EMULATOR_PROJECT_ID, 'demo-overseer-web')
  assert.equal(result.error, null)
  assert.equal(result.config.projectId, 'demo-overseer-web')
  assert.match(client, /projectId: configuration\.projectId/)
  assert.match(packageConfiguration.scripts.emulators, /--project demo-overseer-web/)
  assert.match(packageConfiguration.scripts['test:rules'], /--project demo-overseer-web/)
  assert.match(rulesTests, /const projectId = 'demo-overseer-web'/)
})

test('production mode uses the explicitly configured production project ID', () => {
  const result = resolveFirebaseConfiguration({
    ...configuredEnvironment,
    VITE_USE_FIREBASE_EMULATORS: 'false',
  }, true)

  assert.equal(result.error, null)
  assert.equal(result.config.projectId, 'overseer-f970c')
  assert.equal(result.config.useEmulators, false)
})

test('no Firebase configuration leaves the local application initialization path available', async () => {
  const result = resolveFirebaseConfiguration({}, false)
  let firebaseInitializerCalled = false
  const initialized = initializeIfConfigured(result, () => { firebaseInitializerCalled = true }, () => {})
  const entryPoint = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')

  assert.equal(result.config, null)
  assert.equal(result.error, null)
  assert.equal(initialized, false)
  assert.equal(firebaseInitializerCalled, false)
  assert.match(entryPoint, /<AppDataProvider>/)
  assert.match(entryPoint, /\.render\(/)
})

test('a Firebase-dependent operation fails clearly when Firebase is not configured', () => {
  const result = resolveFirebaseConfiguration({}, false)
  assert.throws(() => requireFirebaseConfiguration(result), /Firebase is unavailable.*no Firebase configuration/)
})

test('explicit Firebase selection without Firebase values reports missing configuration', () => {
  for (const value of ['true', 'false']) {
    const result = resolveFirebaseConfiguration({ VITE_USE_FIREBASE_EMULATORS: value }, false)
    assert.equal(result.config, null)
    assert.match(result.error, /Firebase configuration is missing/)
    assert.match(result.error, /no production fallback/)
  }
})

test('a partial Firebase configuration reports missing fields without fallback', () => {
  const result = resolveFirebaseConfiguration({
    VITE_FIREBASE_API_KEY: 'test-api-key-placeholder',
    VITE_USE_FIREBASE_EMULATORS: 'true',
  }, false)
  let firebaseInitializerCalled = false
  const initialized = initializeIfConfigured(result, () => { firebaseInitializerCalled = true }, () => {})

  assert.equal(result.config, null)
  assert.match(result.error, /incomplete/)
  assert.match(result.error, /No production fallback/)
  assert.equal(initialized, false)
  assert.equal(firebaseInitializerCalled, false)
  assert.throws(() => requireFirebaseConfiguration(result), /Firebase is unavailable.*incomplete/)
})

test('genuine Firebase initialization failures are not swallowed', () => {
  const result = resolveFirebaseConfiguration({
    ...configuredEnvironment,
    VITE_USE_FIREBASE_EMULATORS: 'false',
  }, true)
  const initializationError = new Error('Firebase SDK initialization failed')

  assert.throws(
    () => initializeIfConfigured(result, () => { throw initializationError }, () => {}),
    (error) => error === initializationError,
  )
})

test('development accepts exact true and false emulator selections', () => {
  for (const value of ['true', 'false']) {
    const result = resolveFirebaseConfiguration({
      ...configuredEnvironment,
      VITE_USE_FIREBASE_EMULATORS: value,
    }, false)
    assert.equal(result.error, null)
    assert.equal(result.config.useEmulators, value === 'true')
  }
})

test('development rejects a missing emulator selection when Firebase is configured', () => {
  const result = resolveFirebaseConfiguration(configuredEnvironment, false)
  assert.equal(result.config, null)
  assert.match(result.error, /must be explicitly set to "true" or "false"/)
})

test('emulator selection rejects all values except exact lowercase true and false', () => {
  for (const value of ['TRUE', 'False', 'true ', '', 'yes']) {
    const result = resolveFirebaseConfiguration({
      ...configuredEnvironment,
      VITE_USE_FIREBASE_EMULATORS: value,
    }, false)
    assert.equal(result.config, null, `expected ${JSON.stringify(value)} to be rejected`)
    assert.match(result.error, /must be exactly "true" or "false"/)
  }
})

test('production rejects emulator mode and accepts explicit production mode', () => {
  const emulatorResult = resolveFirebaseConfiguration({
    ...configuredEnvironment,
    VITE_USE_FIREBASE_EMULATORS: 'true',
  }, true)
  const productionResult = resolveFirebaseConfiguration({
    ...configuredEnvironment,
    VITE_USE_FIREBASE_EMULATORS: 'false',
  }, true)

  assert.equal(emulatorResult.config, null)
  assert.match(emulatorResult.error, /cannot be "true" in a production build/)
  assert.equal(productionResult.error, null)
  assert.equal(productionResult.config.projectId, 'overseer-f970c')
})

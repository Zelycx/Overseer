import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

// this is a comment

let vite
let storageModule
const values = new Map()

before(async () => {
  vite = await createServer({
    configFile: false,
    envDir: false,
    root: new URL('..', import.meta.url).pathname,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  storageModule = await vite.ssrLoadModule('/src/data/storage.ts')
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  }
})

after(async () => {
  delete globalThis.localStorage
  await vite?.close()
})

beforeEach(() => values.clear())

test('Firebase user IDs receive distinct encoded storage keys', () => {
  assert.equal(storageModule.getAppDataStorageKey('uid/a'), 'overseer.local-data.user.uid%2Fa')
  assert.notEqual(storageModule.getAppDataStorageKey('account-a'), storageModule.getAppDataStorageKey('account-b'))
  assert.equal(storageModule.getAppDataStorageKey(null), storageModule.STORAGE_KEY)
  assert.throws(() => storageModule.getAppDataStorageKey(''), /cannot be empty/)
})

test('a new signed-in account starts empty and does not inherit legacy local data', () => {
  const legacy = { version: 2, data: { previous: 'private legacy workspace' } }
  values.set(storageModule.STORAGE_KEY, JSON.stringify(legacy))

  const accountData = storageModule.loadAppData('firebase-uid-a')

  assert.deepEqual(accountData.courses, [])
  assert.deepEqual(accountData.tasks, [])
  assert.equal(values.get(storageModule.STORAGE_KEY), JSON.stringify(legacy))
  assert.equal(values.has(storageModule.getAppDataStorageKey('firebase-uid-a')), false)
})

test('legacy data remains available for an explicit backup without being reassigned', () => {
  const legacy = storageModule.createEmptyData()
  legacy.preferences.displayName = 'Legacy Student'
  values.set(storageModule.STORAGE_KEY, JSON.stringify({ version: 2, data: legacy }))

  assert.equal(storageModule.loadAppData('firebase-uid-a').preferences.displayName, 'Student')
  assert.equal(storageModule.loadLegacyAppData().preferences.displayName, 'Legacy Student')
  storageModule.saveAppData(storageModule.createEmptyData(), 'firebase-uid-a')
  assert.equal(storageModule.loadLegacyAppData().preferences.displayName, 'Legacy Student')
})

test('signed-in users load and save data only in their own browser partition', () => {
  const accountA = storageModule.createEmptyData()
  accountA.preferences.displayName = 'Account A'
  const accountB = storageModule.createEmptyData()
  accountB.preferences.displayName = 'Account B'

  storageModule.saveAppData(accountA, 'firebase-uid-a')
  storageModule.saveAppData(accountB, 'firebase-uid-b')

  assert.equal(storageModule.loadAppData('firebase-uid-a').preferences.displayName, 'Account A')
  assert.equal(storageModule.loadAppData('firebase-uid-b').preferences.displayName, 'Account B')
  assert.equal(storageModule.loadAppData(null).preferences.displayName, 'Student')
})

test('switching back to an account restores only that account partition', () => {
  const firstSession = storageModule.createEmptyData()
  firstSession.preferences.displayName = 'Student One'
  storageModule.saveAppData(firstSession, 'uid-one')

  const secondSession = storageModule.createEmptyData()
  secondSession.preferences.displayName = 'Student Two'
  storageModule.saveAppData(secondSession, 'uid-two')

  assert.equal(storageModule.loadAppData('uid-two').preferences.displayName, 'Student Two')
  assert.equal(storageModule.loadAppData('uid-one').preferences.displayName, 'Student One')
})

import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { deleteApp, getApps } from 'firebase-admin/app'

let appsBeforeTest

before(() => {
  appsBeforeTest = new Set(getApps())
  assert.deepEqual([...appsBeforeTest], [], 'Admin app registry must start empty')
})

after(async () => {
  for (const app of getApps()) {
    if (!appsBeforeTest.has(app)) await deleteApp(app)
  }
})

test('getAdminApp initializes once after import without credentials or network access', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = () => {
    fetchCalls += 1
    throw new Error('Unexpected network request')
  }

  try {
    assert.deepEqual(getApps(), [], 'Admin app registry must be empty before import')
    const { getAdminApp } = await import('../lib/index.js')
    assert.deepEqual(getApps(), [], 'import must not initialize an Admin app')

    const app = getAdminApp()
    assert.equal(app.name, '[DEFAULT]')
    assert.deepEqual(getApps(), [app], 'first call must initialize exactly one default app')
    assert.strictEqual(getAdminApp(), app)
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

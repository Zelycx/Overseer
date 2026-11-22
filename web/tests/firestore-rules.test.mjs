import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

const projectId = 'demo-overseer-web'
let testEnvironment

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  })
})

after(async () => {
  await testEnvironment?.cleanup()
})

test('Firestore denies reads to unauthenticated users', async () => {
  const db = testEnvironment.unauthenticatedContext().firestore()
  await assert.rejects(getDoc(doc(db, 'users/sample')), (error) => error.code === 'permission-denied')
})

test('Firestore denies writes to unauthenticated users', async () => {
  const db = testEnvironment.unauthenticatedContext().firestore()
  await assert.rejects(setDoc(doc(db, 'users/sample'), { name: 'sample' }), (error) => error.code === 'permission-denied')
})

test('Firestore denies reads to authenticated users until ownership rules are approved', async () => {
  const db = testEnvironment.authenticatedContext('sample-user').firestore()
  await assert.rejects(getDoc(doc(db, 'users/sample-user')), (error) => error.code === 'permission-denied')
})

test('Firestore denies writes to authenticated users until ownership rules are approved', async () => {
  const db = testEnvironment.authenticatedContext('sample-user').firestore()
  await assert.rejects(setDoc(doc(db, 'users/sample-user'), { name: 'sample' }), (error) => error.code === 'permission-denied')
})

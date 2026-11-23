import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import {
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore'
import { reconcileTaskDeletionJobs } from '../lib/task-deletion-worker.js'

const PROJECT_ID = 'demo-overseer-functions'
const AUTH_HOST = '127.0.0.1:9099'
const FIRESTORE_HOST = '127.0.0.1:8080'
const FUNCTIONS_HOST = '127.0.0.1:5001'

if (
  process.env.GCLOUD_PROJECT !== undefined &&
  process.env.GCLOUD_PROJECT !== PROJECT_ID
) {
  throw new Error(`Integration tests require project ${PROJECT_ID}.`)
}
for (const [name, expected] of [
  ['FIREBASE_AUTH_EMULATOR_HOST', AUTH_HOST],
  ['FIRESTORE_EMULATOR_HOST', FIRESTORE_HOST],
]) {
  if (process.env[name] !== undefined && process.env[name] !== expected) {
    throw new Error(`${name} must point to ${expected}.`)
  }
  process.env[name] = expected
}

let app
let auth
let firestore
const userIds = new Set()

before(() => {
  app = initializeApp(
    { projectId: PROJECT_ID },
    `functions-emulator-integration-${process.pid}`,
  )
  auth = getAuth(app)
  firestore = getFirestore(app)
})

after(async () => {
  if (!app) return
  for (const userId of userIds) {
    await firestore.recursiveDelete(firestore.collection('users').doc(userId))
    await auth.deleteUser(userId)
  }
  await deleteApp(app)
})

async function createAuthUser() {
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `integration-${randomUUID()}@example.invalid`,
        password: `Test-${randomUUID()}`,
        returnSecureToken: true,
      }),
    },
  )
  assert.equal(response.ok, true, 'Auth Emulator user creation failed')
  const result = await response.json()
  assert.equal(typeof result.localId, 'string')
  assert.equal(typeof result.idToken, 'string')
  userIds.add(result.localId)
  return { uid: result.localId, idToken: result.idToken }
}

async function callCallable(name, idToken, data) {
  const response = await fetch(
    `http://${FUNCTIONS_HOST}/${PROJECT_ID}/us-central1/${name}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ data }),
    },
  )
  return { response, body: await response.json() }
}

async function callableResult(name, idToken, data) {
  const { response, body } = await callCallable(name, idToken, data)
  assert.equal(
    response.ok,
    true,
    `${name} failed: ${JSON.stringify(body.error ?? body)}`,
  )
  assert.ok(Object.hasOwn(body, 'result'), `${name} omitted its callable result`)
  return body.result
}

async function assertCallableError(name, idToken, data, status) {
  const { body } = await callCallable(name, idToken, data)
  assert.equal(body.error?.status, status)
}

async function waitForStatus(name, idToken, jobId, predicate, description) {
  const deadline = Date.now() + 45_000
  let latest
  while (Date.now() < deadline) {
    latest = await callableResult(name, idToken, { jobId })
    if (predicate(latest)) return latest
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(
    `${description}; last status was ${JSON.stringify(latest)}`,
  )
}

function userRef(uid) {
  return firestore.collection('users').doc(uid)
}

function activeCourse() {
  const now = Timestamp.now()
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    name: 'Integration Course',
    code: 'INT',
    description: '',
    instructor: '',
    tint: 'mint',
    sortOrder: 0,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
  }
}

function activeTask(courseId = null) {
  const now = Timestamp.now()
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    title: 'Integration Task',
    dueDate: '2026-11-23',
    courseId,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
  }
}

function retryableTaskJob(taskId, createdAt, updatedAt) {
  return {
    jobSchemaVersion: 1,
    status: 'retryable',
    phase: 'clearPlannerBlockReferences',
    attempts: 1,
    leaseId: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    cursor: null,
    createdAt,
    updatedAt,
    taskId,
    sanitizedError: {
      code: 'TEMPORARY_FAILURE',
      message: 'A temporary service failure interrupted deletion.',
    },
  }
}

test('Course callable dispatches its worker and reports completed status', async () => {
  const user = await createAuthUser()
  const courseId = `course-${randomUUID()}`
  const courseRef = userRef(user.uid).collection('courses').doc(courseId)
  await courseRef.set(activeCourse())

  const request = await callableResult(
    'requestCourseDeletion',
    user.idToken,
    { courseId },
  )
  assert.equal(request.status, 'queued')

  const status = await waitForStatus(
    'getCourseDeletionStatus',
    user.idToken,
    request.jobId,
    (value) => value.completed,
    'Course deletion did not complete',
  )
  assert.equal(status.status, 'completed')
  assert.equal(status.phase, 'complete')
  assert.equal(status.courseId, courseId)
  assert.equal((await courseRef.get()).exists, false)
  assert.equal(
    (await userRef(user.uid)
      .collection('courseDeletionJobs')
      .doc(request.jobId)
      .get()).data().status,
    'completed',
  )
})

test('Task callable dispatches its worker and reports completed status', async () => {
  const user = await createAuthUser()
  const courseId = `course-${randomUUID()}`
  const taskId = `task-${randomUUID()}`
  const userDocument = userRef(user.uid)
  const courseRef = userDocument.collection('courses').doc(courseId)
  const taskRef = userDocument.collection('tasks').doc(taskId)
  await Promise.all([
    courseRef.set(activeCourse()),
    taskRef.set(activeTask(courseId)),
  ])

  const request = await callableResult(
    'requestTaskDeletion',
    user.idToken,
    { taskId },
  )
  assert.equal(request.status, 'queued')

  const status = await waitForStatus(
    'getTaskDeletionStatus',
    user.idToken,
    request.jobId,
    (value) => value.completed,
    'Task deletion did not complete',
  )
  assert.equal(status.status, 'completed')
  assert.equal(status.phase, 'complete')
  assert.equal(status.taskId, taskId)
  assert.equal((await taskRef.get()).exists, false)
  assert.equal((await courseRef.get()).exists, true)
})

test("a second authenticated user cannot request or poll another user's jobs", async () => {
  const owner = await createAuthUser()
  const other = await createAuthUser()
  const courseId = `course-${randomUUID()}`
  const taskId = `task-${randomUUID()}`
  const userDocument = userRef(owner.uid)
  await Promise.all([
    userDocument.collection('courses').doc(courseId).set(activeCourse()),
    userDocument.collection('tasks').doc(taskId).set(activeTask()),
  ])

  const courseRequest = await callableResult(
    'requestCourseDeletion',
    owner.idToken,
    { courseId },
  )
  const taskRequest = await callableResult(
    'requestTaskDeletion',
    owner.idToken,
    { taskId },
  )

  await assertCallableError(
    'requestCourseDeletion',
    other.idToken,
    { courseId },
    'NOT_FOUND',
  )
  await assertCallableError(
    'requestTaskDeletion',
    other.idToken,
    { taskId },
    'NOT_FOUND',
  )
  await assertCallableError(
    'getCourseDeletionStatus',
    other.idToken,
    { jobId: courseRequest.jobId },
    'NOT_FOUND',
  )
  await assertCallableError(
    'getTaskDeletionStatus',
    other.idToken,
    { jobId: taskRequest.jobId },
    'NOT_FOUND',
  )
})

test('Task request joins the Course deletion job when the Course lock wins', async () => {
  const user = await createAuthUser()
  const courseId = `course-${randomUUID()}`
  const taskId = `task-${randomUUID()}`
  const userDocument = userRef(user.uid)
  await Promise.all([
    userDocument.collection('courses').doc(courseId).set(activeCourse()),
    userDocument.collection('tasks').doc(taskId).set(activeTask(courseId)),
    userDocument.collection('lessons').doc(`invalid-${randomUUID()}`).set({
      courseId,
    }),
  ])

  const courseRequest = await callableResult(
    'requestCourseDeletion',
    user.idToken,
    { courseId },
  )
  const courseStatus = await waitForStatus(
    'getCourseDeletionStatus',
    user.idToken,
    courseRequest.jobId,
    (value) => value.status === 'failed' || value.completed,
    'Course worker did not settle on the race fixture',
  )
  assert.equal(courseStatus.status, 'failed')
  assert.equal(courseStatus.completed, false)

  const taskRequest = await callableResult(
    'requestTaskDeletion',
    user.idToken,
    { taskId },
  )
  assert.deepEqual(taskRequest, {
    jobId: courseRequest.jobId,
    status: 'failed',
  })
  assert.equal(
    (await userDocument.collection('taskDeletionJobs').get()).size,
    0,
  )
  assert.equal(
    (await userDocument.collection('tasks').doc(taskId).get()).exists,
    true,
  )
})

test('reconciliation recovers an eligible retryable Task job through its trigger', async () => {
  const user = await createAuthUser()
  const taskId = `task-${randomUUID()}`
  const jobId = `task-job-${randomUUID()}`
  const userDocument = userRef(user.uid)
  const taskRef = userDocument.collection('tasks').doc(taskId)
  const jobRef = userDocument.collection('taskDeletionJobs').doc(jobId)
  const old = Timestamp.fromMillis(Date.now() - 60_000)

  await Promise.all([
    taskRef.set({
      ...activeTask(),
      deletionStatus: 'deleting',
      deletionJobId: jobId,
      deletionStartedAt: Timestamp.now(),
    }),
    jobRef.set(retryableTaskJob(taskId, old, old)),
  ])

  const before = await callableResult(
    'getTaskDeletionStatus',
    user.idToken,
    { jobId },
  )
  assert.equal(before.status, 'retryable')
  assert.equal(before.completed, false)

  await reconcileTaskDeletionJobs(firestore)

  const completed = await waitForStatus(
    'getTaskDeletionStatus',
    user.idToken,
    jobId,
    (value) => value.completed,
    'Reconciled Task deletion did not complete',
  )
  assert.equal(completed.status, 'completed')
  const job = (await jobRef.get()).data()
  assert.equal(job.attempts, 2)
  assert.equal((await taskRef.get()).exists, false)
})

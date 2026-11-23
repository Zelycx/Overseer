import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, afterEach, before, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { createTaskDeletionApi } from '../lib/task-deletion-api.js'

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const emulatorTest = emulatorAvailable
  ? test
  : (name, callback) =>
      test(name, { skip: 'Requires the Firestore Emulator.' }, callback)

let app
let firestore
let api
const testUserIds = new Set()

before(() => {
  if (!emulatorAvailable) return

  app = initializeApp(
    { projectId: process.env.GCLOUD_PROJECT || 'demo-overseer-functions' },
    `task-deletion-api-tests-${process.pid}`,
  )
  firestore = getFirestore(app)
  api = createTaskDeletionApi(firestore)
})

afterEach(async () => {
  if (!firestore) return
  await Promise.all(
    [...testUserIds].map((userId) =>
      firestore.recursiveDelete(userRef(userId)),
    ),
  )
  testUserIds.clear()
})

after(async () => {
  if (app) await deleteApp(app)
})

function request(userId, data) {
  return { auth: { uid: userId }, data }
}

function uid() {
  const userId = `test-${randomUUID()}`
  testUserIds.add(userId)
  return userId
}

function userRef(userId) {
  return firestore.collection('users').doc(userId)
}

function activeTask(overrides = {}) {
  const now = Timestamp.now()
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    title: 'Task',
    dueDate: '2026-11-23',
    courseId: null,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
    ...overrides,
  }
}

function taskDeletionJob(taskId, overrides = {}) {
  const now = Timestamp.now()
  return {
    jobSchemaVersion: 1,
    status: 'queued',
    phase: 'clearPlannerBlockReferences',
    attempts: 0,
    leaseId: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    cursor: null,
    createdAt: now,
    updatedAt: now,
    taskId,
    ...overrides,
  }
}

function activeCourse(overrides = {}) {
  const now = Timestamp.now()
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
    ...overrides,
  }
}

function courseDeletionJob(courseId, overrides = {}) {
  const now = Timestamp.now()
  return {
    jobSchemaVersion: 1,
    status: 'queued',
    phase: 'deleteLessons',
    attempts: 0,
    leaseId: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    cursor: null,
    createdAt: now,
    updatedAt: now,
    courseId,
    ...overrides,
  }
}

test('rejects unauthenticated Task deletion requests and status lookups', async () => {
  const unauthenticatedApi = createTaskDeletionApi({})
  await assert.rejects(
    unauthenticatedApi.requestTaskDeletion({ data: { taskId: 'task-1' } }),
    { code: 'unauthenticated' },
  )
  await assert.rejects(
    unauthenticatedApi.getTaskDeletionStatus({ data: { jobId: 'job-1' } }),
    { code: 'unauthenticated' },
  )
})

test('rejects invalid payloads and unexpected fields', async () => {
  const unauthenticatedApi = createTaskDeletionApi({})
  for (const data of [
    { taskId: '' },
    { taskId: '  ' },
    { taskId: 'task/other' },
    { taskId: 'task-1', uid: 'other-user' },
    {},
    null,
  ]) {
    await assert.rejects(
      unauthenticatedApi.requestTaskDeletion(request('user-1', data)),
      { code: 'invalid-argument' },
    )
  }
  for (const data of [
    { jobId: '' },
    { jobId: 'job/other' },
    { jobId: 'job-1', uid: 'other-user' },
  ]) {
    await assert.rejects(
      unauthenticatedApi.getTaskDeletionStatus(request('user-1', data)),
      { code: 'invalid-argument' },
    )
  }
})

emulatorTest('creates one queued Task job and transactionally locks the Task', async () => {
  const userId = uid()
  const taskId = 'task-1'
  const taskRef = userRef(userId).collection('tasks').doc(taskId)
  const originalTask = activeTask({
    updatedAt: Timestamp.fromMillis(1),
    title: 'Preserved title',
    courseId: 'course-1',
  })
  await userRef(userId)
    .collection('courses')
    .doc('course-1')
    .set(activeCourse())
  await taskRef.set(originalTask)

  const response = await api.requestTaskDeletion(request(userId, { taskId }))

  assert.deepEqual(Object.keys(response).sort(), ['jobId', 'status'])
  assert.equal(response.status, 'queued')
  const [taskSnapshot, jobsSnapshot] = await Promise.all([
    taskRef.get(),
    userRef(userId).collection('taskDeletionJobs').get(),
  ])
  assert.equal(jobsSnapshot.size, 1)

  const task = taskSnapshot.data()
  assert.equal(task.deletionStatus, 'deleting')
  assert.equal(task.deletionJobId, response.jobId)
  assert.ok(task.deletionStartedAt instanceof Timestamp)
  assert.ok(task.updatedAt instanceof Timestamp)
  assert.equal(task.updatedAt.isEqual(originalTask.updatedAt), false)
  assert.equal(task.createdAt.isEqual(originalTask.createdAt), true)
  assert.equal(task.title, originalTask.title)
  assert.equal(task.dueDate, originalTask.dueDate)
  assert.equal(task.courseId, originalTask.courseId)

  const job = jobsSnapshot.docs[0].data()
  assert.deepEqual(Object.keys(job).sort(), [
    'attempts',
    'createdAt',
    'cursor',
    'heartbeatAt',
    'jobSchemaVersion',
    'leaseExpiresAt',
    'leaseId',
    'phase',
    'status',
    'taskId',
    'updatedAt',
  ])
  assert.equal(job.jobSchemaVersion, 1)
  assert.equal(job.taskId, taskId)
  assert.equal(job.status, 'queued')
  assert.equal(job.phase, 'clearPlannerBlockReferences')
  assert.equal(job.attempts, 0)
  assert.equal(job.leaseId, null)
  assert.equal(job.leaseExpiresAt, null)
  assert.equal(job.heartbeatAt, null)
  assert.equal(job.cursor, null)
  assert.ok(job.createdAt instanceof Timestamp)
  assert.ok(job.updatedAt instanceof Timestamp)
})

emulatorTest('reuses the existing matching Task deletion job', async () => {
  const userId = uid()
  const taskId = 'task-1'
  const taskRef = userRef(userId).collection('tasks').doc(taskId)
  const jobRef = userRef(userId)
    .collection('taskDeletionJobs')
    .doc('existing-task-job')
  await taskRef.set({
    ...activeTask(),
    deletionStatus: 'deleting',
    deletionJobId: jobRef.id,
    deletionStartedAt: Timestamp.now(),
  })
  await jobRef.set(taskDeletionJob(taskId, { status: 'retryable' }))

  const response = await api.requestTaskDeletion(request(userId, { taskId }))

  assert.deepEqual(response, { jobId: jobRef.id, status: 'retryable' })
  assert.equal(
    (await userRef(userId).collection('taskDeletionJobs').get()).size,
    1,
  )
})

emulatorTest('fails closed for malformed Task lifecycle metadata', async () => {
  const userId = uid()
  const tasksRef = userRef(userId).collection('tasks')
  await tasksRef.doc('missing-metadata').set({
    schemaVersion: 2,
    deletionStatus: 'active',
    deletionJobId: null,
  })
  await tasksRef.doc('malformed-metadata').set({
    ...activeTask(),
    deletionStatus: 'deleting',
    deletionJobId: '',
    deletionStartedAt: Timestamp.now(),
  })

  for (const taskId of ['missing-metadata', 'malformed-metadata']) {
    await assert.rejects(
      api.requestTaskDeletion(request(userId, { taskId })),
      { code: 'failed-precondition' },
    )
  }
  assert.equal(
    (await userRef(userId).collection('taskDeletionJobs').get()).size,
    0,
  )
})

emulatorTest('fails closed when a deleting Task has a missing or mismatched job', async () => {
  const userId = uid()
  const tasksRef = userRef(userId).collection('tasks')
  const jobsRef = userRef(userId).collection('taskDeletionJobs')
  await tasksRef.doc('missing-job').set({
    ...activeTask(),
    deletionStatus: 'deleting',
    deletionJobId: 'missing-task-job',
    deletionStartedAt: Timestamp.now(),
  })
  await tasksRef.doc('mismatched-job').set({
    ...activeTask(),
    deletionStatus: 'deleting',
    deletionJobId: 'wrong-task-job',
    deletionStartedAt: Timestamp.now(),
  })
  await jobsRef.doc('wrong-task-job').set(taskDeletionJob('another-task'))

  for (const taskId of ['missing-job', 'mismatched-job']) {
    await assert.rejects(
      api.requestTaskDeletion(request(userId, { taskId })),
      { code: 'failed-precondition' },
    )
  }
})

emulatorTest('returns the valid parent Course job instead of creating a Task job', async () => {
  const userId = uid()
  const taskId = 'course-task'
  const courseId = 'deleting-course'
  const courseJobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('parent-course-job')
  await userRef(userId)
    .collection('tasks')
    .doc(taskId)
    .set(activeTask({ courseId }))
  await userRef(userId)
    .collection('courses')
    .doc(courseId)
    .set({
      ...activeCourse(),
      deletionStatus: 'deleting',
      deletionJobId: courseJobRef.id,
      deletionStartedAt: Timestamp.now(),
    })
  await courseJobRef.set(courseDeletionJob(courseId))

  const response = await api.requestTaskDeletion(request(userId, { taskId }))

  assert.deepEqual(response, { jobId: courseJobRef.id, status: 'queued' })
  assert.equal(
    (await userRef(userId).collection('taskDeletionJobs').get()).size,
    0,
  )
  assert.equal(
    (await userRef(userId).collection('tasks').doc(taskId).get()).get(
      'deletionStatus',
    ),
    'active',
  )

  const alreadyDeletingTaskId = 'already-deleting-course-task'
  const existingTaskJobRef = userRef(userId)
    .collection('taskDeletionJobs')
    .doc('independent-task-job')
  await userRef(userId)
    .collection('tasks')
    .doc(alreadyDeletingTaskId)
    .set({
      ...activeTask({ courseId }),
      deletionStatus: 'deleting',
      deletionJobId: existingTaskJobRef.id,
      deletionStartedAt: Timestamp.now(),
    })
  await existingTaskJobRef.set(
    taskDeletionJob(alreadyDeletingTaskId, { status: 'retryable' }),
  )

  const existingTaskResponse = await api.requestTaskDeletion(
    request(userId, { taskId: alreadyDeletingTaskId }),
  )
  assert.deepEqual(existingTaskResponse, {
    jobId: courseJobRef.id,
    status: 'queued',
  })
  assert.equal((await existingTaskJobRef.get()).get('status'), 'retryable')
  assert.equal(
    (await userRef(userId).collection('taskDeletionJobs').get()).size,
    1,
  )
})

emulatorTest('fails closed for malformed parent Course lifecycle or job relationships', async () => {
  const userId = uid()
  const tasksRef = userRef(userId).collection('tasks')
  const coursesRef = userRef(userId).collection('courses')
  await tasksRef.doc('missing-course-lifecycle').set(
    activeTask({ courseId: 'missing-lifecycle' }),
  )
  await coursesRef.doc('missing-lifecycle').set({
    schemaVersion: 2,
    deletionStatus: 'active',
    deletionJobId: null,
  })

  await tasksRef.doc('missing-course-job').set(
    activeTask({ courseId: 'missing-job-course' }),
  )
  await coursesRef.doc('missing-job-course').set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: 'missing-course-job',
    deletionStartedAt: Timestamp.now(),
  })

  await tasksRef.doc('mismatched-course-job').set(
    activeTask({ courseId: 'mismatched-job-course' }),
  )
  const mismatchedCourseJobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('wrong-parent-course-job')
  await coursesRef.doc('mismatched-job-course').set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: mismatchedCourseJobRef.id,
    deletionStartedAt: Timestamp.now(),
  })
  await mismatchedCourseJobRef.set(courseDeletionJob('another-course'))

  for (const taskId of [
    'missing-course-lifecycle',
    'missing-course-job',
    'mismatched-course-job',
  ]) {
    await assert.rejects(
      api.requestTaskDeletion(request(userId, { taskId })),
      { code: 'failed-precondition' },
    )
  }
  assert.equal(
    (await userRef(userId).collection('taskDeletionJobs').get()).size,
    0,
  )
})

emulatorTest('rejects requests and status lookups that target another user', async () => {
  const callerId = uid()
  const ownerId = uid()
  const taskId = 'private-task'
  const jobId = 'private-task-job'
  await userRef(ownerId)
    .collection('tasks')
    .doc(taskId)
    .set(activeTask())
  await userRef(ownerId)
    .collection('taskDeletionJobs')
    .doc(jobId)
    .set(taskDeletionJob(taskId))

  await assert.rejects(
    api.requestTaskDeletion(request(callerId, { taskId })),
    { code: 'not-found' },
  )
  await assert.rejects(
    api.getTaskDeletionStatus(request(callerId, { jobId })),
    { code: 'not-found' },
  )
  assert.equal(
    (await userRef(ownerId).collection('taskDeletionJobs').doc(jobId).get())
      .exists,
    true,
  )
})

emulatorTest('returns exactly the approved Task deletion status fields', async () => {
  const userId = uid()
  const taskId = 'status-task'
  const jobRef = userRef(userId)
    .collection('taskDeletionJobs')
    .doc('status-task-job')
  await userRef(userId)
    .collection('tasks')
    .doc(taskId)
    .set({
      ...activeTask(),
      deletionStatus: 'deleting',
      deletionJobId: jobRef.id,
      deletionStartedAt: Timestamp.now(),
    })
  await jobRef.set(taskDeletionJob(taskId))

  const response = await api.getTaskDeletionStatus(
    request(userId, { jobId: jobRef.id }),
  )

  assert.deepEqual(response, {
    jobId: jobRef.id,
    taskId,
    status: 'queued',
    phase: 'clearPlannerBlockReferences',
    completed: false,
  })
  assert.deepEqual(Object.keys(response).sort(), [
    'completed',
    'jobId',
    'phase',
    'status',
    'taskId',
  ])
})

emulatorTest('rejects missing and malformed Task deletion jobs', async () => {
  const userId = uid()
  const jobsRef = userRef(userId).collection('taskDeletionJobs')
  await jobsRef.doc('malformed-job').set({
    ...taskDeletionJob('some-task'),
    unexpected: true,
  })

  await assert.rejects(
    api.getTaskDeletionStatus(request(userId, { jobId: 'missing-job' })),
    { code: 'not-found' },
  )
  await assert.rejects(
    api.getTaskDeletionStatus(request(userId, { jobId: 'malformed-job' })),
    { code: 'failed-precondition' },
  )
})

emulatorTest('fails closed for Task and job lifecycle mismatches', async () => {
  const userId = uid()
  const taskId = 'mismatched-task'
  const jobRef = userRef(userId)
    .collection('taskDeletionJobs')
    .doc('mismatched-task-job')
  await userRef(userId).collection('tasks').doc(taskId).set(activeTask())
  await jobRef.set(taskDeletionJob(taskId))

  await assert.rejects(
    api.getTaskDeletionStatus(request(userId, { jobId: jobRef.id })),
    { code: 'failed-precondition' },
  )
})

emulatorTest('reports a completed Task job only when the Task is absent', async () => {
  const userId = uid()
  const taskId = 'deleted-task'
  const jobRef = userRef(userId)
    .collection('taskDeletionJobs')
    .doc('completed-task-job')
  await jobRef.set(
    taskDeletionJob(taskId, {
      status: 'completed',
      phase: 'complete',
    }),
  )

  assert.deepEqual(
    await api.getTaskDeletionStatus(request(userId, { jobId: jobRef.id })),
    {
      jobId: jobRef.id,
      taskId,
      status: 'completed',
      phase: 'complete',
      completed: true,
    },
  )
})

emulatorTest('does not report Task completion while the Task still exists', async () => {
  const userId = uid()
  const taskId = 'still-existing-task'
  const jobRef = userRef(userId)
    .collection('taskDeletionJobs')
    .doc('inconsistent-completed-task-job')
  await userRef(userId)
    .collection('tasks')
    .doc(taskId)
    .set({
      ...activeTask(),
      deletionStatus: 'deleting',
      deletionJobId: jobRef.id,
      deletionStartedAt: Timestamp.now(),
    })
  await jobRef.set(
    taskDeletionJob(taskId, {
      status: 'completed',
      phase: 'complete',
      completedAt: FieldValue.serverTimestamp(),
    }),
  )

  await assert.rejects(
    api.getTaskDeletionStatus(request(userId, { jobId: jobRef.id })),
    { code: 'failed-precondition' },
  )
})

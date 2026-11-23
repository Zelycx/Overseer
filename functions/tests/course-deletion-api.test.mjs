import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { createCourseDeletionApi } from '../lib/course-deletion-api.js'

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const emulatorTest = emulatorAvailable
  ? test
  : (name, callback) =>
      test(name, { skip: 'Requires the Firestore Emulator.' }, callback)

let app
let firestore
let api

before(() => {
  if (!emulatorAvailable) return

  app = initializeApp(
    { projectId: process.env.GCLOUD_PROJECT || 'demo-overseer-functions' },
    `course-deletion-api-tests-${process.pid}`,
  )
  firestore = getFirestore(app)
  api = createCourseDeletionApi(firestore)
})

after(async () => {
  if (app) await deleteApp(app)
})

function request(uid, data) {
  return { auth: { uid }, data }
}

function uid() {
  return `test-${randomUUID()}`
}

function activeCourse() {
  const now = Timestamp.now()
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    name: 'Course',
    code: 'COURSE',
    description: '',
    instructor: '',
    tint: 'mint',
    sortOrder: 0,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
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

function userRef(userId) {
  return firestore.collection('users').doc(userId)
}

test('rejects unauthenticated Course deletion requests', async () => {
  const unauthenticatedApi = createCourseDeletionApi({})
  await assert.rejects(
    unauthenticatedApi.requestCourseDeletion({ data: { courseId: 'course-1' } }),
    { code: 'unauthenticated' },
  )
})

test('rejects invalid Course IDs', async () => {
  const unauthenticatedDatabaseApi = createCourseDeletionApi({})
  await assert.rejects(
    unauthenticatedDatabaseApi.requestCourseDeletion(
      request('user-1', { courseId: 'course/other' }),
    ),
    { code: 'invalid-argument' },
  )
  await assert.rejects(
    unauthenticatedDatabaseApi.requestCourseDeletion(
      request('user-1', { courseId: '  ' }),
    ),
    { code: 'invalid-argument' },
  )
  await assert.rejects(
    unauthenticatedDatabaseApi.requestCourseDeletion(
      request('user-1', { courseId: 'course-1', uid: 'other-user' }),
    ),
    { code: 'invalid-argument' },
  )
})

emulatorTest('returns not-found for a missing Course', async () => {
  await assert.rejects(
    api.requestCourseDeletion(request(uid(), { courseId: 'missing-course' })),
    { code: 'not-found' },
  )
})

emulatorTest('creates one queued job and transactionally locks the Course', async () => {
  const userId = uid()
  const courseId = 'course-1'
  const courseRef = userRef(userId).collection('courses').doc(courseId)
  const originalCourse = activeCourse()
  await courseRef.set(originalCourse)

  const response = await api.requestCourseDeletion(
    request(userId, { courseId }),
  )

  assert.deepEqual(Object.keys(response).sort(), ['jobId', 'status'])
  assert.equal(response.status, 'queued')
  assert.equal(typeof response.jobId, 'string')
  assert.ok(response.jobId.length > 0)
  const [courseSnapshot, jobsSnapshot] = await Promise.all([
    courseRef.get(),
    userRef(userId).collection('courseDeletionJobs').get(),
  ])
  assert.equal(jobsSnapshot.size, 1)

  const course = courseSnapshot.data()
  assert.equal(course.deletionStatus, 'deleting')
  assert.equal(course.deletionJobId, response.jobId)
  assert.ok(course.deletionStartedAt instanceof Timestamp)
  assert.ok(course.updatedAt instanceof Timestamp)
  assert.equal(course.updatedAt.isEqual(originalCourse.updatedAt), false)
  assert.equal(course.createdAt.isEqual(originalCourse.createdAt), true)
  for (const field of [
    'name',
    'code',
    'description',
    'instructor',
    'tint',
    'sortOrder',
  ]) {
    assert.equal(course[field], originalCourse[field])
  }

  const job = jobsSnapshot.docs[0].data()
  assert.deepEqual(Object.keys(job).sort(), [
    'attempts',
    'courseId',
    'createdAt',
    'cursor',
    'heartbeatAt',
    'jobSchemaVersion',
    'leaseExpiresAt',
    'leaseId',
    'phase',
    'status',
    'updatedAt',
  ])
  assert.equal(job.jobSchemaVersion, 1)
  assert.equal(job.courseId, courseId)
  assert.equal(job.status, 'queued')
  assert.equal(job.phase, 'deleteLessons')
  assert.equal(job.attempts, 0)
  assert.equal(job.leaseId, null)
  assert.equal(job.leaseExpiresAt, null)
  assert.equal(job.heartbeatAt, null)
  assert.equal(job.cursor, null)
  assert.ok(job.createdAt instanceof Timestamp)
  assert.ok(job.updatedAt instanceof Timestamp)
})

emulatorTest('reuses the existing matching job for a duplicate request', async () => {
  const userId = uid()
  const courseId = 'course-1'
  const courseRef = userRef(userId).collection('courses').doc(courseId)
  const jobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('existing-job')
  await courseRef.set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: jobRef.id,
    deletionStartedAt: Timestamp.now(),
  })
  await jobRef.set(courseDeletionJob(courseId, { status: 'retryable' }))

  const response = await api.requestCourseDeletion(
    request(userId, { courseId }),
  )

  assert.deepEqual(response, { jobId: jobRef.id, status: 'retryable' })
  assert.equal(
    (await userRef(userId).collection('courseDeletionJobs').get()).size,
    1,
  )
})

emulatorTest('concurrent requests create one job and reuse its ID', async () => {
  const userId = uid()
  const courseId = 'course-1'
  await userRef(userId)
    .collection('courses')
    .doc(courseId)
    .set(activeCourse())

  const [first, second] = await Promise.all([
    api.requestCourseDeletion(request(userId, { courseId })),
    api.requestCourseDeletion(request(userId, { courseId })),
  ])

  assert.equal(first.jobId, second.jobId)
  assert.equal(first.status, 'queued')
  assert.equal(second.status, 'queued')
  assert.equal(
    (await userRef(userId).collection('courseDeletionJobs').get()).size,
    1,
  )
})

emulatorTest('fails closed when a deleting Course has no matching job', async () => {
  const userId = uid()
  const courseRef = userRef(userId).collection('courses').doc('course-1')
  await courseRef.set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: 'missing-job',
    deletionStartedAt: Timestamp.now(),
  })

  await assert.rejects(
    api.requestCourseDeletion(request(userId, { courseId: 'course-1' })),
    { code: 'failed-precondition' },
  )
  assert.equal(
    (await userRef(userId).collection('courseDeletionJobs').get()).size,
    0,
  )
})

emulatorTest('fails closed when a deleting Course points to another Course job', async () => {
  const userId = uid()
  const courseRef = userRef(userId).collection('courses').doc('course-1')
  const jobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('mismatched-job')
  await courseRef.set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: jobRef.id,
    deletionStartedAt: Timestamp.now(),
  })
  await jobRef.set(courseDeletionJob('another-course'))

  await assert.rejects(
    api.requestCourseDeletion(request(userId, { courseId: 'course-1' })),
    { code: 'failed-precondition' },
  )
  assert.equal(
    (await userRef(userId).collection('courseDeletionJobs').get()).size,
    1,
  )
})

emulatorTest('fails closed for missing or malformed Course lifecycle metadata', async () => {
  const userId = uid()
  const coursesRef = userRef(userId).collection('courses')
  await coursesRef.doc('missing-metadata').set({
    schemaVersion: 2,
    deletionStatus: 'active',
    deletionJobId: null,
  })
  await coursesRef.doc('malformed-metadata').set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: '',
    deletionStartedAt: Timestamp.now(),
  })

  for (const courseId of ['missing-metadata', 'malformed-metadata']) {
    await assert.rejects(
      api.requestCourseDeletion(request(userId, { courseId })),
      { code: 'failed-precondition' },
    )
  }
})

test('rejects unauthenticated Course deletion status requests', async () => {
  const unauthenticatedApi = createCourseDeletionApi({})
  await assert.rejects(
    unauthenticatedApi.getCourseDeletionStatus({ data: { jobId: 'job-1' } }),
    { code: 'unauthenticated' },
  )
})

emulatorTest('returns exactly the approved status response fields', async () => {
  const userId = uid()
  const courseId = 'course-1'
  const jobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('status-job')
  await userRef(userId).collection('courses').doc(courseId).set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: jobRef.id,
    deletionStartedAt: Timestamp.now(),
  })
  await jobRef.set(courseDeletionJob(courseId))

  const response = await api.getCourseDeletionStatus(
    request(userId, { jobId: jobRef.id }),
  )

  assert.deepEqual(response, {
    jobId: jobRef.id,
    courseId,
    status: 'queued',
    phase: 'deleteLessons',
    completed: false,
  })
  assert.deepEqual(Object.keys(response).sort(), [
    'completed',
    'courseId',
    'jobId',
    'phase',
    'status',
  ])
})

emulatorTest('rejects missing and malformed Course deletion jobs', async () => {
  const userId = uid()
  const jobsRef = userRef(userId).collection('courseDeletionJobs')
  await jobsRef.doc('malformed-job').set({
    ...courseDeletionJob('course-1'),
    unexpected: true,
  })

  await assert.rejects(
    api.getCourseDeletionStatus(request(userId, { jobId: 'missing-job' })),
    { code: 'not-found' },
  )
  await assert.rejects(
    api.getCourseDeletionStatus(request(userId, { jobId: 'malformed-job' })),
    { code: 'failed-precondition' },
  )
})

emulatorTest('rejects Course and job lifecycle mismatches in status lookups', async () => {
  const userId = uid()
  const courseId = 'course-1'
  const jobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('mismatch-job')
  await userRef(userId).collection('courses').doc(courseId).set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: 'other-job',
    deletionStartedAt: Timestamp.now(),
  })
  await jobRef.set(courseDeletionJob(courseId))

  await assert.rejects(
    api.getCourseDeletionStatus(request(userId, { jobId: jobRef.id })),
    { code: 'failed-precondition' },
  )
})

emulatorTest('reports completion only for a retained completed job without its Course', async () => {
  const userId = uid()
  const courseId = 'deleted-course'
  const jobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('completed-job')
  await jobRef.set(
    courseDeletionJob(courseId, {
      status: 'completed',
      phase: 'complete',
      completedAt: FieldValue.serverTimestamp(),
    }),
  )

  assert.deepEqual(
    await api.getCourseDeletionStatus(request(userId, { jobId: jobRef.id })),
    {
      jobId: jobRef.id,
      courseId,
      status: 'completed',
      phase: 'complete',
      completed: true,
    },
  )
})

emulatorTest('reports completion for a valid completed job without completedAt', async () => {
  const userId = uid()
  const courseId = 'deleted-course-without-completed-at'
  const jobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('completed-job-without-timestamp')
  await jobRef.set(
    courseDeletionJob(courseId, {
      status: 'completed',
      phase: 'complete',
    }),
  )

  assert.deepEqual(
    await api.getCourseDeletionStatus(request(userId, { jobId: jobRef.id })),
    {
      jobId: jobRef.id,
      courseId,
      status: 'completed',
      phase: 'complete',
      completed: true,
    },
  )
})

emulatorTest('does not report completion while the Course still exists', async () => {
  const userId = uid()
  const courseId = 'course-still-exists'
  const jobRef = userRef(userId)
    .collection('courseDeletionJobs')
    .doc('inconsistent-completed-job')
  await userRef(userId).collection('courses').doc(courseId).set({
    ...activeCourse(),
    deletionStatus: 'deleting',
    deletionJobId: jobRef.id,
    deletionStartedAt: Timestamp.now(),
  })
  await jobRef.set(
    courseDeletionJob(courseId, {
      status: 'completed',
      phase: 'complete',
      completedAt: FieldValue.serverTimestamp(),
    }),
  )

  await assert.rejects(
    api.getCourseDeletionStatus(request(userId, { jobId: jobRef.id })),
    { code: 'failed-precondition' },
  )
})

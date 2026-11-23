import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, afterEach, before, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import {
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore'
import {
  claimTaskDeletionJob,
  failTaskDeletionUnderLease,
  isRelevantTaskDeletionWrite,
  processTaskDeletionContinuation,
  reconcileTaskDeletionJobs,
} from '../lib/task-deletion-worker.js'
import { isTaskDeletionJob } from '../lib/job-models.js'

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const emulatorTest = emulatorAvailable
  ? test
  : (name, callback) =>
      test(name, { skip: 'Requires the Firestore Emulator.' }, callback)

let app
let firestore
const testUserIds = new Set()

before(() => {
  if (!emulatorAvailable) return
  app = initializeApp(
    { projectId: process.env.GCLOUD_PROJECT || 'demo-overseer-functions' },
    `task-deletion-worker-tests-${process.pid}`,
  )
  firestore = getFirestore(app)
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

function uid() {
  const userId = `task-worker-test-${randomUUID()}`
  testUserIds.add(userId)
  return userId
}

function userRef(userId) {
  return firestore.collection('users').doc(userId)
}

function productMetadata(schemaVersion = 1, updatedAt = Timestamp.now()) {
  return {
    schemaVersion,
    createdAt: Timestamp.fromMillis(1),
    updatedAt,
  }
}

function courseRecord(overrides = {}) {
  return {
    ...productMetadata(2),
    title: 'Parent Course',
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
    ...overrides,
  }
}

function taskRecord(jobId, courseId = null, overrides = {}) {
  return {
    ...productMetadata(2),
    title: 'Task to delete',
    dueDate: '2026-11-23',
    courseId,
    deletionStatus: 'deleting',
    deletionJobId: jobId,
    deletionStartedAt: Timestamp.now(),
    ...overrides,
  }
}

function baseCourseDeletionJob(courseId, overrides = {}) {
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

function baseJob(taskId, overrides = {}) {
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

async function seedTaskJob({
  taskId = 'task-1',
  jobId = 'task-job-1',
  courseId = null,
  parentCourse = {},
  courseDeletionJob = null,
  task = {},
  job = {},
} = {}) {
  const userId = uid()
  const user = userRef(userId)
  const taskRef = user.collection('tasks').doc(taskId)
  const jobRef = user.collection('taskDeletionJobs').doc(jobId)
  if (courseId !== null && parentCourse !== null) {
    await user.collection('courses').doc(courseId).set(courseRecord(parentCourse))
  }
  if (courseDeletionJob !== null && courseId !== null) {
    const courseJobId = parentCourse.deletionJobId
    await user
      .collection('courseDeletionJobs')
      .doc(courseJobId)
      .set(courseDeletionJob)
  }
  await taskRef.set(taskRecord(jobId, courseId, task))
  await jobRef.set(baseJob(taskId, job))
  return { userId, user, taskId, jobId, taskRef, jobRef }
}

async function currentJob(seed) {
  const snapshot = await seed.jobRef.get()
  assert.ok(snapshot.exists)
  return snapshot.data()
}

async function runUntilStopped(seed, leaseId, maxSteps = 10) {
  let job = await currentJob(seed)
  for (let step = 0; step < maxSteps && job.status === 'running'; step += 1) {
    await processTaskDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      {
        leaseId,
        phase: job.phase,
        cursor: job.cursor,
      },
    )
    job = await currentJob(seed)
  }
  return job
}

emulatorTest('deletes a Task with an active parent Course and retains its completed job', async () => {
  const seed = await seedTaskJob({ courseId: 'course-1' })
  const plannerRef = seed.user.collection('plannerBlocks')
  const sessionRef = seed.user.collection('focusSessions')
  const oldUpdatedAt = Timestamp.fromMillis(2)
  const startedAt = Timestamp.fromMillis(3)
  const endedAt = Timestamp.fromMillis(4)
  await plannerRef.doc('block-a').set({
    ...productMetadata(1, oldUpdatedAt),
    title: 'Keep planner title',
    courseId: 'course-1',
    taskId: seed.taskId,
    startAt: Timestamp.fromMillis(5),
    endAt: Timestamp.fromMillis(6),
    isComplete: true,
  })
  await sessionRef.doc('session-a').set({
    ...productMetadata(1, oldUpdatedAt),
    courseId: 'course-1',
    taskId: seed.taskId,
    startedAt,
    endedAt,
    sessionNotes: 'Keep this history',
  })
  await plannerRef.doc('unrelated-block').set({
    ...productMetadata(),
    courseId: 'course-1',
    taskId: 'another-task',
  })
  await sessionRef.doc('unrelated-session').set({
    ...productMetadata(),
    courseId: 'course-1',
    taskId: 'another-task',
    startedAt,
    endedAt,
  })

  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)
  const completed = await runUntilStopped(seed, claimed.leaseId)

  assert.equal(completed.status, 'completed')
  assert.equal(completed.phase, 'complete')
  assert.ok(completed.completedAt instanceof Timestamp)
  assert.ok(isTaskDeletionJob(completed))
  assert.equal(completed.leaseId, claimed.leaseId)
  assert.equal(completed.leaseExpiresAt instanceof Timestamp, true)
  assert.equal(completed.heartbeatAt instanceof Timestamp, true)
  assert.equal(completed.cursor, null)
  assert.equal((await seed.taskRef.get()).exists, false)

  const plannerBlock = (await plannerRef.doc('block-a').get()).data()
  assert.equal(plannerBlock.taskId, null)
  assert.equal(plannerBlock.courseId, 'course-1')
  assert.equal(plannerBlock.title, 'Keep planner title')
  assert.equal(plannerBlock.isComplete, true)
  assert.ok(plannerBlock.updatedAt instanceof Timestamp)
  assert.equal(plannerBlock.updatedAt.isEqual(oldUpdatedAt), false)

  const session = (await sessionRef.doc('session-a').get()).data()
  assert.equal(session.taskId, null)
  assert.equal(session.courseId, 'course-1')
  assert.equal(session.sessionNotes, 'Keep this history')
  assert.equal(session.startedAt.isEqual(startedAt), true)
  assert.equal(session.endedAt.isEqual(endedAt), true)
  assert.ok(session.updatedAt instanceof Timestamp)
  assert.equal(session.updatedAt.isEqual(oldUpdatedAt), false)
  assert.equal(
    (await plannerRef.doc('unrelated-block').get()).get('taskId'),
    'another-task',
  )
  assert.equal(
    (await sessionRef.doc('unrelated-session').get()).get('taskId'),
    'another-task',
  )
})

emulatorTest('fails closed when the parent Course is missing', async () => {
  const seed = await seedTaskJob({
    courseId: 'missing-course',
    parentCourse: null,
  })

  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )

  assert.equal(claimed, null)
  assert.equal((await currentJob(seed)).status, 'failed')
  assert.equal((await seed.taskRef.get()).exists, true)
})

emulatorTest('fails closed when parent Course lifecycle metadata is malformed', async () => {
  const seed = await seedTaskJob({
    courseId: 'malformed-course',
    parentCourse: { deletionJobId: 'orphan-course-job' },
  })

  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )

  assert.equal(claimed, null)
  assert.equal((await currentJob(seed)).status, 'failed')
  assert.equal((await seed.taskRef.get()).exists, true)
})

emulatorTest('fails closed when a deleting parent Course job is inconsistent', async () => {
  const courseId = 'inconsistent-course'
  const courseJobId = 'parent-course-job'
  const seed = await seedTaskJob({
    courseId,
    parentCourse: {
      deletionStatus: 'deleting',
      deletionJobId: courseJobId,
      deletionStartedAt: Timestamp.now(),
    },
    courseDeletionJob: baseCourseDeletionJob('another-course'),
  })

  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )

  assert.equal(claimed, null)
  assert.equal((await currentJob(seed)).status, 'failed')
  assert.equal((await seed.taskRef.get()).exists, true)
})

emulatorTest('finishes a pre-existing Task deletion when Course deletion wins afterward', async () => {
  const courseId = 'racing-course'
  const seed = await seedTaskJob({ courseId })
  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)

  const courseJobId = 'racing-course-job'
  const courseJobRef = seed.user.collection('courseDeletionJobs').doc(courseJobId)
  await courseJobRef.set(baseCourseDeletionJob(courseId))
  await seed.user.collection('courses').doc(courseId).update({
    deletionStatus: 'deleting',
    deletionJobId: courseJobId,
    deletionStartedAt: Timestamp.now(),
  })

  const completed = await runUntilStopped(seed, claimed.leaseId)

  assert.equal(completed.status, 'completed')
  assert.equal((await seed.taskRef.get()).exists, false)
  assert.equal((await courseJobRef.get()).get('status'), 'queued')
  assert.equal(
    (await seed.user.collection('courses').doc(courseId).get()).get('deletionJobId'),
    courseJobId,
  )
})

emulatorTest('does not start independent Task deletion after the parent Course is deleting', async () => {
  const courseId = 'already-deleting-course'
  const courseJobId = 'already-deleting-course-job'
  const seed = await seedTaskJob({
    courseId,
    parentCourse: {
      deletionStatus: 'deleting',
      deletionJobId: courseJobId,
      deletionStartedAt: Timestamp.fromMillis(Date.now() - 10_000),
    },
    courseDeletionJob: baseCourseDeletionJob(courseId),
  })

  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )

  assert.equal(claimed, null)
  assert.equal((await currentJob(seed)).status, 'failed')
  assert.equal((await seed.taskRef.get()).exists, true)
  assert.equal(
    (await seed.user.collection('courseDeletionJobs').doc(courseJobId).get())
      .get('status'),
    'queued',
  )
})

emulatorTest('resumes bounded PlannerBlock cleanup from the saved cursor', async () => {
  const seed = await seedTaskJob()
  const plannerRef = seed.user.collection('plannerBlocks')
  const batch = firestore.batch()
  for (let index = 0; index < 200; index += 1) {
    batch.create(
      plannerRef.doc(`block-${String(index).padStart(3, '0')}`),
      {
        ...productMetadata(),
        courseId: null,
        taskId: seed.taskId,
      },
    )
  }
  await batch.commit()

  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)
  await processTaskDeletionContinuation(
    firestore,
    seed.userId,
    seed.jobId,
    claimed,
  )
  const afterFirstPage = await currentJob(seed)
  assert.equal(afterFirstPage.status, 'running')
  assert.equal(afterFirstPage.phase, 'clearPlannerBlockReferences')
  assert.equal(afterFirstPage.attempts, 1)
  assert.equal(typeof afterFirstPage.cursor, 'string')
  assert.equal(
    (await plannerRef.where('taskId', '==', seed.taskId).get()).size,
    1,
  )

  const completed = await runUntilStopped(seed, claimed.leaseId)
  assert.equal(completed.status, 'completed')
  assert.equal((await plannerRef.get()).size, 200)
  assert.equal((await plannerRef.where('taskId', '==', seed.taskId).get()).size, 0)
})

emulatorTest('duplicate delivery cannot commit the same reference page twice', async () => {
  const seed = await seedTaskJob()
  const blockRef = seed.user.collection('plannerBlocks').doc('block-a')
  await blockRef.set({
    ...productMetadata(),
    courseId: null,
    taskId: seed.taskId,
  })
  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)

  await Promise.all([
    processTaskDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      claimed,
    ),
    processTaskDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      claimed,
    ),
  ])

  const job = await currentJob(seed)
  assert.equal(job.phase, 'clearFocusSessionReferences')
  assert.equal(job.attempts, 1)
  assert.equal((await blockRef.get()).get('taskId'), null)
})

emulatorTest('reclaims expired leases and rejects stale worker checkpoints', async () => {
  const seed = await seedTaskJob({
    job: {
      status: 'running',
      attempts: 1,
      leaseId: 'old-lease',
      leaseExpiresAt: Timestamp.fromMillis(Date.now() - 10_000),
      heartbeatAt: Timestamp.fromMillis(Date.now() - 20_000),
    },
  })
  const reclaimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(reclaimed)
  assert.notEqual(reclaimed.leaseId, 'old-lease')
  assert.equal((await currentJob(seed)).attempts, 2)

  await processTaskDeletionContinuation(firestore, seed.userId, seed.jobId, {
    leaseId: 'old-lease',
    phase: 'clearPlannerBlockReferences',
    cursor: null,
  })
  const job = await currentJob(seed)
  assert.equal(job.status, 'running')
  assert.equal(job.leaseId, reclaimed.leaseId)
  assert.equal(job.attempts, 2)
})

emulatorTest('fails closed on malformed or inconsistent PlannerBlocks', async () => {
  const seed = await seedTaskJob({ courseId: 'course-1' })
  const malformedRef = seed.user
    .collection('plannerBlocks')
    .doc('malformed-block')
  await malformedRef.set({
    ...productMetadata(2),
    courseId: 'course-1',
    taskId: seed.taskId,
  })
  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)
  const failed = await runUntilStopped(seed, claimed.leaseId)

  assert.equal(failed.status, 'failed')
  assert.equal(failed.sanitizedError.code, 'PRODUCT_SCHEMA_INVALID')
  assert.equal((await seed.taskRef.get()).exists, true)
  assert.equal((await malformedRef.get()).get('taskId'), seed.taskId)

  const inconsistent = await seedTaskJob({
    courseId: 'course-1',
  })
  const inconsistentRef = inconsistent.user
    .collection('plannerBlocks')
    .doc('wrong-course-block')
  await inconsistentRef.set({
    ...productMetadata(),
    courseId: 'another-course',
    taskId: inconsistent.taskId,
  })
  const inconsistentLease = await claimTaskDeletionJob(
    firestore,
    inconsistent.userId,
    inconsistent.jobId,
  )
  assert.ok(inconsistentLease)
  const failedReference = await runUntilStopped(
    inconsistent,
    inconsistentLease.leaseId,
  )
  assert.equal(failedReference.status, 'failed')
  assert.equal(
    failedReference.sanitizedError.code,
    'PLANNER_BLOCK_REFERENCE_MISMATCH',
  )
  assert.equal((await inconsistent.taskRef.get()).exists, true)

  const malformedSessionSeed = await seedTaskJob()
  const malformedSessionRef = malformedSessionSeed.user
    .collection('focusSessions')
    .doc('malformed-session')
  await malformedSessionRef.set({
    ...productMetadata(2),
    courseId: null,
    taskId: malformedSessionSeed.taskId,
    startedAt: Timestamp.fromMillis(3),
    endedAt: Timestamp.fromMillis(4),
  })
  const sessionLease = await claimTaskDeletionJob(
    firestore,
    malformedSessionSeed.userId,
    malformedSessionSeed.jobId,
  )
  assert.ok(sessionLease)
  const failedSession = await runUntilStopped(
    malformedSessionSeed,
    sessionLease.leaseId,
  )
  assert.equal(failedSession.status, 'failed')
  assert.equal(failedSession.sanitizedError.code, 'PRODUCT_SCHEMA_INVALID')
  assert.equal((await malformedSessionSeed.taskRef.get()).exists, true)
  assert.equal(
    (await malformedSessionRef.get()).get('taskId'),
    malformedSessionSeed.taskId,
  )
})

emulatorTest('verification prevents Task deletion while a reference remains', async () => {
  const seed = await seedTaskJob({
    job: {
      status: 'running',
      phase: 'verify',
      attempts: 1,
      leaseId: 'verify-lease',
      leaseExpiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      heartbeatAt: Timestamp.now(),
    },
  })
  const blockRef = seed.user.collection('plannerBlocks').doc('late-reference')
  await blockRef.set({
    ...productMetadata(),
    courseId: null,
    taskId: seed.taskId,
  })

  await processTaskDeletionContinuation(firestore, seed.userId, seed.jobId, {
    leaseId: 'verify-lease',
    phase: 'verify',
    cursor: null,
  })

  const failed = await currentJob(seed)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.phase, 'verify')
  assert.equal(failed.sanitizedError.code, 'PLANNER_BLOCK_REFERENCES_REMAIN')
  assert.equal((await seed.taskRef.get()).exists, true)
  assert.equal((await blockRef.get()).get('taskId'), seed.taskId)
})

emulatorTest('Task completion preserves the valid lease tuple and opaque cursor', async () => {
  const seed = await seedTaskJob({
    job: {
      status: 'running',
      phase: 'verify',
      attempts: 1,
      leaseId: 'verify-lease',
      leaseExpiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      heartbeatAt: Timestamp.now(),
      cursor: 'verify-checkpoint',
    },
  })

  await processTaskDeletionContinuation(firestore, seed.userId, seed.jobId, {
    leaseId: 'verify-lease',
    phase: 'verify',
    cursor: 'verify-checkpoint',
  })

  const completed = await currentJob(seed)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.phase, 'complete')
  assert.equal(completed.cursor, 'verify-checkpoint')
  assert.equal(completed.leaseId, 'verify-lease')
  assert.ok(completed.leaseExpiresAt instanceof Timestamp)
  assert.ok(completed.heartbeatAt instanceof Timestamp)
  assert.ok(completed.completedAt instanceof Timestamp)
  assert.equal(isTaskDeletionJob(completed), true)
  assert.equal((await seed.taskRef.get()).exists, false)
})

emulatorTest('records transient failures as retryable and unknown failures as terminal', async () => {
  const retrySeed = await seedTaskJob()
  const retryLease = await claimTaskDeletionJob(
    firestore,
    retrySeed.userId,
    retrySeed.jobId,
  )
  assert.ok(retryLease)
  await failTaskDeletionUnderLease(
    firestore,
    retrySeed.userId,
    retrySeed.jobId,
    retryLease,
    Object.assign(new Error('not exposed'), { code: 'unavailable' }),
  )
  const retryable = await currentJob(retrySeed)
  assert.equal(retryable.status, 'retryable')
  assert.equal(retryable.leaseId, null)
  assert.equal(retryable.leaseExpiresAt, null)
  assert.equal(retryable.heartbeatAt, null)
  assert.equal(retryable.phase, retryLease.phase)
  assert.equal(retryable.cursor, retryLease.cursor)
  assert.equal(retryable.sanitizedError.code, 'TEMPORARY_FAILURE')

  const terminalSeed = await seedTaskJob()
  const terminalLease = await claimTaskDeletionJob(
    firestore,
    terminalSeed.userId,
    terminalSeed.jobId,
  )
  assert.ok(terminalLease)
  await failTaskDeletionUnderLease(
    firestore,
    terminalSeed.userId,
    terminalSeed.jobId,
    terminalLease,
    new Error('unclassified'),
  )
  const failed = await currentJob(terminalSeed)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.sanitizedError.code, 'UNCLASSIFIED_FAILURE')
  assert.equal(failed.leaseId, null)
})

test('job trigger ignores heartbeat-only changes and accepts progress or new leases', () => {
  const running = baseJob('task-1', {
    status: 'running',
    leaseId: 'lease-1',
    leaseExpiresAt: Timestamp.now(),
    heartbeatAt: Timestamp.now(),
  })
  assert.equal(
    isRelevantTaskDeletionWrite(
      running,
      {
        ...running,
        heartbeatAt: Timestamp.now(),
        leaseExpiresAt: Timestamp.fromMillis(Date.now() + 300_000),
      },
      false,
    ),
    false,
  )
  assert.equal(
    isRelevantTaskDeletionWrite(
      running,
      { ...running, cursor: 'block-a' },
      false,
    ),
    true,
  )
  assert.equal(
    isRelevantTaskDeletionWrite(
      running,
      { ...running, leaseId: 'lease-2' },
      false,
    ),
    true,
  )
})

emulatorTest('reconciliation claims queued Task jobs using the existing path', async () => {
  const seed = await seedTaskJob()
  await reconcileTaskDeletionJobs(firestore)

  const claimed = await currentJob(seed)
  assert.equal(claimed.status, 'running')
  assert.equal(claimed.attempts, 1)
  assert.equal(typeof claimed.leaseId, 'string')
  assert.ok(claimed.leaseExpiresAt instanceof Timestamp)
  assert.ok(claimed.heartbeatAt instanceof Timestamp)
})

emulatorTest('does not claim an eleventh Task deletion attempt', async () => {
  const seed = await seedTaskJob({
    job: { attempts: 10 },
  })
  const claimed = await claimTaskDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )

  assert.equal(claimed, null)
  const failed = await currentJob(seed)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.attempts, 10)
  assert.equal(failed.sanitizedError.code, 'MAX_ATTEMPTS_EXCEEDED')
  assert.equal((await seed.taskRef.get()).exists, true)
})

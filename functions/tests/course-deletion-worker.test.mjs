import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import {
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore'
import {
  claimCourseDeletionJob,
  courseDeletionRetryDelaySeconds,
  failUnderLease,
  isRelevantCourseDeletionWrite,
  isRetryableCourseDeletionFailure,
  processCourseDeletionContinuation,
} from '../lib/course-deletion-worker.js'

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const emulatorTest = emulatorAvailable
  ? test
  : (name, callback) =>
      test(name, { skip: 'Requires the Firestore Emulator.' }, callback)

let app
let firestore

before(() => {
  if (!emulatorAvailable) return
  app = initializeApp(
    { projectId: process.env.GCLOUD_PROJECT || 'demo-overseer-functions' },
    `course-deletion-worker-tests-${process.pid}`,
  )
  firestore = getFirestore(app)
})

after(async () => {
  if (app) await deleteApp(app)
})

function uid() {
  return `worker-test-${randomUUID()}`
}

function baseCourse() {
  const now = Timestamp.now()
  return {
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    name: 'Course to delete',
    code: 'DEL',
    description: 'Preserved only until deletion',
    instructor: 'Instructor',
    tint: 'mint',
    sortOrder: 2,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
  }
}

function baseJob(courseId, overrides = {}) {
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

function productMetadata(schemaVersion = 1) {
  const now = Timestamp.now()
  return {
    schemaVersion,
    createdAt: now,
    updatedAt: now,
  }
}

function taskRecord(courseId, overrides = {}) {
  return {
    ...productMetadata(2),
    title: 'Task',
    courseId,
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

function userRef(userId) {
  return firestore.collection('users').doc(userId)
}

async function seedCourseJob({
  userId = uid(),
  courseId = `course-${randomUUID()}`,
  jobId = `job-${randomUUID()}`,
  job = {},
  course = {},
} = {}) {
  const user = userRef(userId)
  const courseRef = user.collection('courses').doc(courseId)
  const jobRef = user.collection('courseDeletionJobs').doc(jobId)
  await courseRef.set({
    ...baseCourse(),
    ...course,
    deletionStatus: 'deleting',
    deletionJobId: jobId,
    deletionStartedAt: Timestamp.now(),
  })
  await jobRef.set(baseJob(courseId, job))
  return { userId, courseId, jobId, user, courseRef, jobRef }
}

async function currentJob(seed) {
  const snapshot = await seed.jobRef.get()
  assert.ok(snapshot.exists)
  return snapshot.data()
}

async function runOneStep(seed, leaseId) {
  const job = await currentJob(seed)
  assert.equal(job.status, 'running')
  await processCourseDeletionContinuation(firestore, seed.userId, seed.jobId, {
    leaseId,
    phase: job.phase,
    cursor: job.cursor,
  })
  return currentJob(seed)
}

async function runToTerminal(seed, maxSteps = 80) {
  let claimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed, 'Course deletion job should be claimable')

  for (let step = 0; step < maxSteps; step += 1) {
    const job = await currentJob(seed)
    if (job.status !== 'running') return job
    await processCourseDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      {
        leaseId: job.leaseId,
        phase: job.phase,
        cursor: job.cursor,
      },
    )
  }
  throw new Error('Course deletion did not reach a terminal state')
}

async function advanceToTaskDeletion(seed, leaseId) {
  for (let step = 0; step < 12; step += 1) {
    const job = await currentJob(seed)
    if (job.phase === 'deleteTasks') {
      const cursor = job.cursor === null ? null : JSON.parse(job.cursor)
      if (cursor?.stage === 'deleteTasks') return job
    }
    await processCourseDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      { leaseId, phase: job.phase, cursor: job.cursor },
    )
  }
  throw new Error('Course worker did not reach Task deletion')
}

async function advanceToVerify(seed, leaseId) {
  for (let step = 0; step < 30; step += 1) {
    const job = await currentJob(seed)
    if (job.phase === 'verify') return job
    await processCourseDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      { leaseId, phase: job.phase, cursor: job.cursor },
    )
  }
  throw new Error('Course worker did not reach verification')
}

function focusTimer(overrides = {}) {
  const now = Timestamp.now()
  return {
    ...productMetadata(),
    status: 'running',
    mode: 'focus',
    durationSeconds: 1_500,
    remainingSeconds: 700,
    elapsedSeconds: 800,
    generation: 4,
    writeGeneration: 3,
    startedAt: now,
    segmentStartedAt: now,
    endsAt: Timestamp.fromMillis(now.toMillis() + 700_000),
    courseId: null,
    taskId: null,
    runId: 'run-1',
    ...overrides,
  }
}

emulatorTest('deletes all Course data and retains the completed job and manifest', async () => {
  const seed = await seedCourseJob()
  const taskRef = seed.user.collection('tasks').doc('task-a')
  await taskRef.set(taskRecord(seed.courseId))
  await seed.user.collection('lessons').doc('lesson-a').set({
    ...productMetadata(),
    courseId: seed.courseId,
  })
  await seed.user.collection('materials').doc('material-a').set({
    ...productMetadata(),
    courseId: seed.courseId,
  })
  await seed.user.collection('events').doc('event-a').set({
    ...productMetadata(),
    courseId: seed.courseId,
  })
  await seed.user.collection('plannerBlocks').doc('planner-by-course').set({
    ...productMetadata(),
    courseId: seed.courseId,
    taskId: null,
  })
  await seed.user.collection('plannerBlocks').doc('planner-by-manifest').set({
    ...productMetadata(),
    courseId: 'legacy-inconsistent-course',
    taskId: taskRef.id,
  })
  const courseSessionRef = seed.user.collection('focusSessions').doc('session-course')
  const taskSessionRef = seed.user.collection('focusSessions').doc('session-task')
  const historyStart = Timestamp.fromMillis(1_700_000_000_000)
  await courseSessionRef.set({
    ...productMetadata(),
    courseId: seed.courseId,
    taskId: null,
    startedAt: historyStart,
    endedAt: Timestamp.fromMillis(1_700_000_060_000),
    summary: 'historical session',
  })
  await taskSessionRef.set({
    ...productMetadata(),
    courseId: null,
    taskId: taskRef.id,
    startedAt: historyStart,
    endedAt: Timestamp.fromMillis(1_700_000_030_000),
    summary: 'task-linked session',
  })
  await seed.user.collection('settings').doc('focusTimer').set(
    focusTimer({ courseId: seed.courseId, taskId: taskRef.id }),
  )
  const timerPreferencesRef = seed.user
    .collection('settings')
    .doc('timerPreferences')
  const timerPreferences = {
    ...productMetadata(),
    focusSeconds: 1_500,
    shortBreakSeconds: 300,
    longBreakSeconds: 900,
  }
  await timerPreferencesRef.set(timerPreferences)

  const completed = await runToTerminal(seed)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.phase, 'complete')
  assert.ok(completed.completedAt instanceof Timestamp)
  assert.equal((await seed.courseRef.get()).exists, false)
  assert.equal((await seed.jobRef.get()).exists, true)
  assert.equal((await taskRef.get()).exists, false)
  assert.equal(
    (await seed.user.collection('lessons').get()).size,
    0,
  )
  assert.equal(
    (await seed.user.collection('materials').get()).size,
    0,
  )
  assert.equal(
    (await seed.user.collection('events').get()).size,
    0,
  )
  assert.equal(
    (await seed.user.collection('plannerBlocks').get()).size,
    0,
  )

  const courseSession = (await courseSessionRef.get()).data()
  assert.equal(courseSession.courseId, null)
  assert.equal(courseSession.startedAt.isEqual(historyStart), true)
  assert.equal(courseSession.summary, 'historical session')
  const taskSession = (await taskSessionRef.get()).data()
  assert.equal(taskSession.courseId, null)
  assert.equal(taskSession.taskId, null)
  assert.equal(taskSession.startedAt.isEqual(historyStart), true)
  assert.equal(taskSession.endedAt.isEqual(Timestamp.fromMillis(1_700_000_030_000)), true)
  assert.equal(taskSession.summary, 'task-linked session')

  const timer = (
    await seed.user.collection('settings').doc('focusTimer').get()
  ).data()
  assert.equal(timer.status, 'idle')
  assert.equal(timer.mode, 'focus')
  assert.equal(timer.durationSeconds, 1_500)
  assert.equal(timer.remainingSeconds, 1_500)
  assert.equal(timer.elapsedSeconds, 0)
  assert.equal(timer.generation, 5)
  assert.equal(timer.writeGeneration, 3)
  assert.equal(timer.startedAt, null)
  assert.equal(timer.segmentStartedAt, null)
  assert.equal(timer.endsAt, null)
  assert.equal(timer.courseId, null)
  assert.equal(timer.taskId, null)
  assert.equal(timer.runId, null)
  assert.deepEqual((await timerPreferencesRef.get()).data(), timerPreferences)

  const manifestRef = seed.jobRef.collection('taskIds').doc(taskRef.id)
  const manifest = await manifestRef.get()
  assert.equal(manifest.exists, true)
  assert.deepEqual(Object.keys(manifest.data()).sort(), ['createdAt'])
  assert.ok(manifest.data().createdAt instanceof Timestamp)
})

emulatorTest('resets a Course-referencing timer even when no Tasks remain', async () => {
  const seed = await seedCourseJob()
  await seed.user.collection('settings').doc('focusTimer').set(
    focusTimer({ courseId: seed.courseId }),
  )

  const completed = await runToTerminal(seed)
  assert.equal(completed.status, 'completed')
  const timer = (
    await seed.user.collection('settings').doc('focusTimer').get()
  ).data()
  assert.equal(timer.generation, 5)
  assert.equal(timer.writeGeneration, 3)
  assert.equal(timer.courseId, null)
  assert.equal(timer.remainingSeconds, timer.durationSeconds)
})

emulatorTest('duplicate worker delivery commits a page only once', async () => {
  const seed = await seedCourseJob()
  await seed.user.collection('lessons').doc('lesson-a').set({
    ...productMetadata(),
    courseId: seed.courseId,
  })
  const claimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)

  await Promise.all([
    processCourseDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      claimed,
    ),
    processCourseDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      claimed,
    ),
  ])

  const job = await currentJob(seed)
  assert.equal(job.phase, 'deleteMaterials')
  assert.equal((await seed.user.collection('lessons').get()).size, 0)
  assert.equal(job.attempts, 1)
})

emulatorTest('reclaims an expired lease and rejects the stale worker token', async () => {
  const seed = await seedCourseJob({
    job: {
      status: 'running',
      attempts: 1,
      leaseId: 'old-lease',
      leaseExpiresAt: Timestamp.fromMillis(Date.now() - 10_000),
      heartbeatAt: Timestamp.fromMillis(Date.now() - 20_000),
    },
  })
  const reclaimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(reclaimed)
  assert.notEqual(reclaimed.leaseId, 'old-lease')
  assert.equal((await currentJob(seed)).attempts, 2)

  await processCourseDeletionContinuation(firestore, seed.userId, seed.jobId, {
    leaseId: 'old-lease',
    phase: 'deleteLessons',
    cursor: null,
  })
  const job = await currentJob(seed)
  assert.equal(job.status, 'running')
  assert.equal(job.leaseId, reclaimed.leaseId)
  assert.equal(job.attempts, 2)
})

emulatorTest('records transient failures as retryable and unknown failures as terminal', async () => {
  const retrySeed = await seedCourseJob()
  const retryLease = await claimCourseDeletionJob(
    firestore,
    retrySeed.userId,
    retrySeed.jobId,
  )
  assert.ok(retryLease)
  await failUnderLease(
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

  const terminalSeed = await seedCourseJob()
  const terminalLease = await claimCourseDeletionJob(
    firestore,
    terminalSeed.userId,
    terminalSeed.jobId,
  )
  assert.ok(terminalLease)
  await failUnderLease(
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
  const running = {
    ...baseJob('course-1'),
    status: 'running',
    leaseId: 'lease-1',
    leaseExpiresAt: Timestamp.now(),
    heartbeatAt: Timestamp.now(),
  }
  assert.equal(
    isRelevantCourseDeletionWrite(
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
    isRelevantCourseDeletionWrite(
      running,
      { ...running, cursor: 'lesson-1' },
      false,
    ),
    true,
  )
  assert.equal(
    isRelevantCourseDeletionWrite(
      running,
      { ...running, leaseId: 'lease-2' },
      false,
    ),
    true,
  )
})

emulatorTest('resumes bounded work from the saved cursor without a new attempt', async () => {
  const seed = await seedCourseJob()
  const batch = firestore.batch()
  for (let index = 0; index < 200; index += 1) {
    const lessonId = `lesson-${String(index).padStart(3, '0')}`
    batch.create(seed.user.collection('lessons').doc(lessonId), {
      ...productMetadata(),
      courseId: seed.courseId,
    })
  }
  await batch.commit()

  const claimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)
  await processCourseDeletionContinuation(
    firestore,
    seed.userId,
    seed.jobId,
    claimed,
  )

  const interrupted = await currentJob(seed)
  assert.equal(interrupted.phase, 'deleteLessons')
  assert.equal(typeof interrupted.cursor, 'string')
  assert.equal(interrupted.attempts, 1)
  await processCourseDeletionContinuation(
    firestore,
    seed.userId,
    seed.jobId,
    {
      leaseId: interrupted.leaseId,
      phase: interrupted.phase,
      cursor: interrupted.cursor,
    },
  )

  const resumed = await currentJob(seed)
  assert.equal(resumed.phase, 'deleteMaterials')
  assert.equal(resumed.attempts, 1)
  assert.equal((await seed.user.collection('lessons').get()).size, 0)
})

emulatorTest('defers without changing Course phase or cursor during independent Task deletion', async () => {
  const seed = await seedCourseJob()
  const taskRef = seed.user.collection('tasks').doc('independent-task')
  const taskJobId = 'independent-task-job'
  await taskRef.set(
    taskRecord(seed.courseId, {
      deletionStatus: 'deleting',
      deletionJobId: taskJobId,
      deletionStartedAt: Timestamp.now(),
    }),
  )
  await seed.user.collection('taskDeletionJobs').doc(taskJobId).set(
    taskDeletionJob(taskRef.id),
  )

  const claimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)
  const ready = await advanceToTaskDeletion(seed, claimed.leaseId)
  const previousCursor = ready.cursor
  const deferred = await runOneStep(seed, claimed.leaseId)

  assert.equal(deferred.status, 'retryable')
  assert.equal(deferred.phase, 'deleteTasks')
  assert.equal(deferred.cursor, previousCursor)
  assert.equal(deferred.leaseId, null)
  assert.equal(deferred.leaseExpiresAt, null)
  assert.equal(deferred.heartbeatAt, null)
  assert.equal((await taskRef.get()).exists, true)
  assert.equal(
    (await seed.user.collection('courses').doc(seed.courseId).get()).data()
      .deletionStatus,
    'deleting',
  )
})

emulatorTest('fails and keeps Course locked for missing or malformed Task deletion jobs', async () => {
  for (const scenario of ['missing', 'malformed']) {
    const seed = await seedCourseJob()
    const taskRef = seed.user.collection('tasks').doc(`task-${scenario}`)
    const taskJobId = `task-job-${scenario}`
    await taskRef.set(
      taskRecord(seed.courseId, {
        deletionStatus: 'deleting',
        deletionJobId: taskJobId,
        deletionStartedAt: Timestamp.now(),
      }),
    )
    if (scenario === 'malformed') {
      await seed.user.collection('taskDeletionJobs').doc(taskJobId).set({
        ...taskDeletionJob(taskRef.id),
        extra: true,
      })
    }

    const claimed = await claimCourseDeletionJob(
      firestore,
      seed.userId,
      seed.jobId,
    )
    assert.ok(claimed)
    await advanceToTaskDeletion(seed, claimed.leaseId)
    const failed = await runOneStep(seed, claimed.leaseId)

    assert.equal(failed.status, 'failed')
    assert.equal(failed.sanitizedError.code, 'TASK_JOB_RELATIONSHIP_INVALID')
    assert.equal((await seed.courseRef.get()).exists, true)
    assert.equal((await taskRef.get()).exists, true)
  }
})

emulatorTest('verification prevents Course deletion when a reference remains', async () => {
  const seed = await seedCourseJob()
  const claimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)
  await advanceToVerify(seed, claimed.leaseId)
  await seed.user.collection('plannerBlocks').doc('late-reference').set({
    ...productMetadata(),
    courseId: seed.courseId,
    taskId: null,
  })

  const failed = await runOneStep(seed, claimed.leaseId)
  assert.equal(failed.status, 'failed')
  assert.equal((await seed.courseRef.get()).exists, true)
  assert.equal(failed.phase, 'verify')
})

emulatorTest('classifies retryable infrastructure failures separately from terminal ones', async () => {
  assert.equal(isRetryableCourseDeletionFailure({ code: 'unavailable' }), true)
  assert.equal(isRetryableCourseDeletionFailure({ code: 14 }), true)
  assert.equal(isRetryableCourseDeletionFailure({ code: 'aborted' }), true)
  assert.equal(
    isRetryableCourseDeletionFailure({ code: 'resource-exhausted' }),
    true,
  )
  assert.equal(
    isRetryableCourseDeletionFailure({ code: 'permission-denied' }),
    false,
  )
  assert.equal(isRetryableCourseDeletionFailure(new Error('unknown')), false)
  for (let attempts = 1; attempts <= 10; attempts += 1) {
    const maximum = Math.min(5 * 2 ** (attempts - 1), 3_600)
    const delay = courseDeletionRetryDelaySeconds('job-1', attempts)
    assert.ok(Number.isInteger(delay))
    assert.ok(delay >= 0 && delay <= maximum)
    assert.equal(
      courseDeletionRetryDelaySeconds('job-1', attempts),
      delay,
    )
  }
  const jobSamples = ['job-1', 'job-2', 'job-3', 'job-4'].map((jobId) =>
    courseDeletionRetryDelaySeconds(jobId, 5),
  )
  const attemptSamples = Array.from({ length: 10 }, (_, index) =>
    courseDeletionRetryDelaySeconds('job-1', index + 1),
  )
  assert.ok(new Set(jobSamples).size > 1)
  assert.ok(new Set(attemptSamples).size > 1)
  assert.throws(
    () => courseDeletionRetryDelaySeconds('job-1', 0),
    /RETRY_ATTEMPT_COUNT_INVALID/,
  )
})

emulatorTest('fails malformed child records and records sanitized terminal errors', async () => {
  const seed = await seedCourseJob()
  await seed.user.collection('lessons').doc('malformed-lesson').set({
    ...productMetadata(2),
    courseId: seed.courseId,
  })
  const claimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)

  const failed = await runOneStep(seed, claimed.leaseId)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.sanitizedError.code, 'PRODUCT_SCHEMA_INVALID')
  assert.equal(
    failed.sanitizedError.message,
    'Deletion stopped because trusted recovery is required.',
  )
  assert.equal((await seed.courseRef.get()).exists, true)
  assert.equal(
    (await seed.user.collection('lessons').doc('malformed-lesson').get()).exists,
    true,
  )
})

emulatorTest('does not claim an eleventh attempt', async () => {
  const seed = await seedCourseJob({
    job: { attempts: 10 },
  })
  const claimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )

  assert.equal(claimed, null)
  const failed = await currentJob(seed)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.attempts, 10)
  assert.equal(failed.sanitizedError.code, 'MAX_ATTEMPTS_EXCEEDED')
  assert.equal((await seed.courseRef.get()).exists, true)
})

emulatorTest('handles more than 30 Task IDs in bounded PlannerBlock query groups', async () => {
  const seed = await seedCourseJob()
  const taskIds = []
  const batch = firestore.batch()
  for (let index = 0; index < 31; index += 1) {
    const taskRef = seed.user
      .collection('tasks')
      .doc(`task-${String(index).padStart(2, '0')}`)
    taskIds.push(taskRef.id)
    batch.create(taskRef, taskRecord(seed.courseId))
    batch.create(
      seed.user.collection('plannerBlocks').doc(`block-${String(index).padStart(2, '0')}`),
      {
        ...productMetadata(),
        courseId: null,
        taskId: taskRef.id,
      },
    )
  }
  await batch.commit()

  const completed = await runToTerminal(seed, 100)
  assert.equal(completed.status, 'completed')
  assert.equal((await seed.user.collection('plannerBlocks').get()).size, 0)
  const manifest = await seed.jobRef.collection('taskIds').get()
  assert.equal(manifest.size, taskIds.length)
})

emulatorTest('rejects malformed active timer state without changing the Course', async () => {
  const seed = await seedCourseJob()
  await seed.user.collection('settings').doc('focusTimer').set({
    ...focusTimer({ courseId: seed.courseId }),
    generation: -1,
  })
  const claimed = await claimCourseDeletionJob(
    firestore,
    seed.userId,
    seed.jobId,
  )
  assert.ok(claimed)

  let readyForTimerReset = await currentJob(seed)
  for (let step = 0; step < 12; step += 1) {
    if (
      readyForTimerReset.phase === 'deleteTasks' &&
      readyForTimerReset.cursor !== null &&
      JSON.parse(readyForTimerReset.cursor).stage === 'manifestComplete'
    ) {
      break
    }
    await processCourseDeletionContinuation(
      firestore,
      seed.userId,
      seed.jobId,
      {
        leaseId: claimed.leaseId,
        phase: readyForTimerReset.phase,
        cursor: readyForTimerReset.cursor,
      },
    )
    readyForTimerReset = await currentJob(seed)
  }
  assert.equal(readyForTimerReset.phase, 'deleteTasks')
  assert.equal(
    JSON.parse(readyForTimerReset.cursor).stage,
    'manifestComplete',
  )
  const failure = await runOneStep(seed, claimed.leaseId)
  assert.equal(failure.status, 'failed')
  assert.equal(failure.sanitizedError.code, 'FOCUS_TIMER_INVALID')
  assert.equal((await seed.courseRef.get()).exists, true)
})

emulatorTest('does not change an unrelated focus timer', async () => {
  const seed = await seedCourseJob()
  const timerRef = seed.user.collection('settings').doc('focusTimer')
  const unrelatedTimer = focusTimer({
    courseId: 'another-course',
    taskId: 'another-task',
  })
  await timerRef.set(unrelatedTimer)

  const completed = await runToTerminal(seed)
  assert.equal(completed.status, 'completed')
  const storedTimer = (await timerRef.get()).data()
  assert.equal(storedTimer.generation, unrelatedTimer.generation)
  assert.equal(storedTimer.courseId, unrelatedTimer.courseId)
  assert.equal(storedTimer.taskId, unrelatedTimer.taskId)
})

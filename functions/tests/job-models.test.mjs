import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Timestamp } from 'firebase-admin/firestore'
import {
  COURSE_DELETION_PHASES,
  MIGRATION_PHASES,
  TASK_DELETION_PHASES,
  isCourseDeletionJob,
  isCourseDeletionTaskIdManifestEntry,
  isCourseLifecycleMetadata,
  isMigrationJob,
  isTaskDeletionJob,
  isTaskLifecycleMetadata,
} from '../lib/job-models.js'

const createdAt = Timestamp.fromMillis(1_700_000_000_000)
const updatedAt = Timestamp.fromMillis(1_700_000_001_000)

const jobTypes = [
  {
    name: 'Course deletion',
    validate: isCourseDeletionJob,
    phases: COURSE_DELETION_PHASES,
    target: { courseId: 'course-1' },
    courseCompletedLeaseMustBeNull: true,
  },
  {
    name: 'Task deletion',
    validate: isTaskDeletionJob,
    phases: TASK_DELETION_PHASES,
    target: { taskId: 'task-1' },
    courseCompletedLeaseMustBeNull: false,
  },
  {
    name: 'Migration',
    validate: isMigrationJob,
    phases: MIGRATION_PHASES,
    target: { sourceTimeZoneId: 'Asia/Tokyo' },
    courseCompletedLeaseMustBeNull: false,
  },
]

function baseJob(target = {}) {
  return {
    jobSchemaVersion: 1,
    status: 'queued',
    attempts: 0,
    leaseId: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    cursor: null,
    createdAt,
    updatedAt,
    ...target,
  }
}

function makeJob(type, status, phase, overrides = {}) {
  const lease =
    status === 'running'
      ? {
          leaseId: 'lease-1',
          leaseExpiresAt: updatedAt,
          heartbeatAt: createdAt,
        }
      : {
          leaseId: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
        }

  return {
    ...baseJob(type.target),
    ...lease,
    status,
    phase,
    ...(status === 'completed' && type.courseCompletedLeaseMustBeNull
      ? { cursor: null }
      : {}),
    ...overrides,
  }
}

test('exports the exact contract phase enums', () => {
  assert.deepEqual(COURSE_DELETION_PHASES, [
    'deleteLessons',
    'deleteMaterials',
    'deleteTasks',
    'deleteEvents',
    'deletePlannerBlocks',
    'clearFocusSessionReferences',
    'verify',
    'complete',
  ])
  assert.deepEqual(TASK_DELETION_PHASES, [
    'clearPlannerBlockReferences',
    'clearFocusSessionReferences',
    'verify',
    'complete',
  ])
  assert.deepEqual(MIGRATION_PHASES, [
    'validate',
    'import',
    'verify',
    'complete',
  ])
})

test('validates Course and Task lifecycle metadata and their state invariants', () => {
  const active = {
    schemaVersion: 2,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
  }
  const deleting = {
    ...active,
    deletionStatus: 'deleting',
    deletionJobId: 'delete-job',
    deletionStartedAt: createdAt,
  }

  assert.equal(isCourseLifecycleMetadata(active), true)
  assert.equal(isTaskLifecycleMetadata(deleting), true)
  assert.equal(
    isCourseLifecycleMetadata({ ...active, deletionJobId: 'stale-job' }),
    false,
  )
  assert.equal(
    isTaskLifecycleMetadata({ ...deleting, deletionStartedAt: null }),
    false,
  )
  assert.equal(
    isCourseLifecycleMetadata({ ...active, schemaVersion: 1 }),
    false,
  )
  assert.equal(
    isTaskLifecycleMetadata({ ...active, extra: true }),
    false,
  )
})

test('validates the minimal manifest shape without duplicated identifiers', () => {
  assert.equal(
    isCourseDeletionTaskIdManifestEntry({ createdAt }),
    true,
  )
  assert.equal(
    isCourseDeletionTaskIdManifestEntry({ createdAt, taskId: 'task-1' }),
    false,
  )
  assert.equal(
    isCourseDeletionTaskIdManifestEntry({ createdAt: new Date() }),
    false,
  )
})

test('validates Course deletion job schema, phases, and completed invariants', () => {
  const job = {
    ...baseJob({ courseId: 'course-1' }),
    phase: 'deleteLessons',
  }
  assert.equal(isCourseDeletionJob(job), true)
  assert.equal(
    isCourseDeletionJob({ ...job, phase: 'deleteTasks', extra: true }),
    false,
  )
  assert.equal(isCourseDeletionJob({ ...job, attempts: -1 }), false)
  assert.equal(isCourseDeletionJob({ ...job, attempts: 1.5 }), false)
  assert.equal(isCourseDeletionJob({ ...job, courseId: '' }), false)
  assert.equal(isCourseDeletionJob({ ...job, status: 'unknown' }), false)
  const missingTarget = { ...job }
  delete missingTarget.courseId
  assert.equal(isCourseDeletionJob(missingTarget), false)

  const running = {
    ...job,
    status: 'running',
    leaseId: 'lease-1',
    leaseExpiresAt: updatedAt,
    heartbeatAt: createdAt,
  }
  assert.equal(isCourseDeletionJob(running), true)
  assert.equal(isCourseDeletionJob({ ...running, leaseId: null }), false)

  const retryable = {
    ...job,
    status: 'retryable',
  }
  assert.equal(isCourseDeletionJob(retryable), true)
  assert.equal(
    isCourseDeletionJob({ ...retryable, heartbeatAt: createdAt }),
    false,
  )

  const completed = {
    ...job,
    status: 'completed',
    phase: 'complete',
    completedAt: updatedAt,
  }
  assert.equal(isCourseDeletionJob(completed), true)
  assert.equal(
    isCourseDeletionJob({ ...completed, completedAt: undefined }),
    false,
  )
  assert.equal(
    isCourseDeletionJob({ ...completed, cursor: 'not-cleared' }),
    false,
  )
  assert.equal(
    isCourseDeletionJob({ ...job, status: 'completed' }),
    false,
  )
  assert.equal(
    isCourseDeletionJob({ ...completed, status: 'failed' }),
    false,
  )
})

test('validates Task deletion and migration jobs with their own schemas', () => {
  const taskJob = {
    ...baseJob({ taskId: 'task-1' }),
    phase: 'clearPlannerBlockReferences',
  }
  assert.equal(isTaskDeletionJob(taskJob), true)
  assert.equal(
    isTaskDeletionJob({ ...taskJob, phase: 'deleteLessons' }),
    false,
  )
  assert.equal(
    isTaskDeletionJob({ ...taskJob, jobSchemaVersion: 2 }),
    false,
  )
  const completedTaskJob = {
    ...taskJob,
    status: 'completed',
    phase: 'complete',
  }
  assert.equal(isTaskDeletionJob(completedTaskJob), true)
  assert.equal(
    isTaskDeletionJob({ ...completedTaskJob, completedAt: 'not-a-timestamp' }),
    false,
  )

  const migrationJob = {
    ...baseJob({ sourceTimeZoneId: 'Asia/Tokyo' }),
    phase: 'validate',
  }
  assert.equal(isMigrationJob(migrationJob), true)
  assert.equal(
    isMigrationJob({ ...migrationJob, sourceTimeZoneId: 'Mars/Olympus' }),
    false,
  )
  assert.equal(
    isMigrationJob({ ...migrationJob, phase: 'deleteTasks' }),
    false,
  )
})

test('rejects invalid sanitized error maps and malformed records', () => {
  const job = {
    ...baseJob({ courseId: 'course-1' }),
    phase: 'verify',
  }
  assert.equal(
    isCourseDeletionJob({
      ...job,
      sanitizedError: { code: 'UNAVAILABLE', message: 'Try again' },
    }),
    true,
  )
  assert.equal(
    isCourseDeletionJob({
      ...job,
      sanitizedError: {
        code: 'UNAVAILABLE',
        message: 'Try again',
        stack: 'private',
      },
    }),
    false,
  )
  assert.equal(
    isCourseDeletionJob({ ...job, createdAt: '2023-11-14T22:13:20Z' }),
    false,
  )
  assert.equal(isCourseDeletionJob(null), false)
  assert.equal(isCourseDeletionJob([]), false)
})

test('accepts each approved status and phase for all job types', () => {
  for (const type of jobTypes) {
    for (const status of [
      'queued',
      'running',
      'retryable',
      'failed',
      'completed',
    ]) {
      const phase = status === 'completed' ? 'complete' : type.phases[0]
      assert.equal(
        type.validate(makeJob(type, status, phase)),
        true,
        `${type.name} should accept status ${status}`,
      )
    }

    for (const phase of type.phases) {
      const status = phase === 'complete' ? 'completed' : 'queued'
      assert.equal(
        type.validate(makeJob(type, status, phase)),
        true,
        `${type.name} should accept phase ${phase}`,
      )
    }
  }
})

test('allows completedAt only on completed jobs, where it is optional', () => {
  for (const type of jobTypes) {
    const completedWithoutTimestamp = makeJob(
      type,
      'completed',
      'complete',
    )
    const completedWithTimestamp = makeJob(
      type,
      'completed',
      'complete',
      { completedAt: updatedAt },
    )

    assert.equal(type.validate(completedWithoutTimestamp), true, type.name)
    assert.equal(type.validate(completedWithTimestamp), true, type.name)
    for (const status of ['queued', 'running', 'retryable', 'failed']) {
      assert.equal(
        type.validate({
          ...makeJob(type, status, type.phases[0]),
          completedAt: updatedAt,
        }),
        false,
        `${type.name} ${status} jobs must reject completedAt`,
      )
    }
    assert.equal(
      type.validate({
        ...completedWithTimestamp,
        completedAt: 'not-a-timestamp',
      }),
      false,
      `${type.name} must reject a malformed completedAt`,
    )
  }
})

test('enforces the inclusive attempts range for all job types', () => {
  for (const type of jobTypes) {
    for (const attempts of [0, 10]) {
      assert.equal(
        type.validate(
          makeJob(type, 'queued', type.phases[0], { attempts }),
        ),
        true,
        `${type.name} should accept attempts=${attempts}`,
      )
    }

    for (const attempts of [-1, 11, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(
        type.validate(
          makeJob(type, 'queued', type.phases[0], { attempts }),
        ),
        false,
        `${type.name} should reject attempts=${attempts}`,
      )
    }
  }
})

test('enforces required and internally consistent lease metadata', () => {
  const partialLeaseValues = [
    { leaseId: 'lease-1', leaseExpiresAt: null, heartbeatAt: null },
    { leaseId: null, leaseExpiresAt: updatedAt, heartbeatAt: null },
    { leaseId: null, leaseExpiresAt: null, heartbeatAt: createdAt },
    { leaseId: '', leaseExpiresAt: updatedAt, heartbeatAt: createdAt },
    { leaseId: 'lease-1', leaseExpiresAt: 'not-a-timestamp', heartbeatAt: createdAt },
  ]

  for (const type of jobTypes) {
    const running = makeJob(type, 'running', type.phases[0])
    assert.equal(type.validate(running), true, `${type.name} running lease`)
    for (const lease of partialLeaseValues) {
      assert.equal(
        type.validate({ ...running, ...lease }),
        false,
        `${type.name} running jobs must reject partial or malformed leases`,
      )
    }

    const retryable = makeJob(type, 'retryable', type.phases[0])
    assert.equal(type.validate(retryable), true, `${type.name} retryable null lease`)
    for (const lease of [
      { leaseId: 'lease-1' },
      { leaseExpiresAt: updatedAt },
      { heartbeatAt: createdAt },
    ]) {
      assert.equal(
        type.validate({ ...retryable, ...lease }),
        false,
        `${type.name} retryable jobs must have null lease fields`,
      )
    }

    for (const status of ['queued', 'failed']) {
      const noLease = makeJob(type, status, type.phases[0])
      const fullLease = makeJob(type, status, type.phases[0], {
        leaseId: 'lease-1',
        leaseExpiresAt: updatedAt,
        heartbeatAt: createdAt,
      })
      assert.equal(type.validate(noLease), true, `${type.name} ${status} null lease`)
      assert.equal(type.validate(fullLease), true, `${type.name} ${status} full lease`)
      for (const lease of partialLeaseValues) {
        assert.equal(
          type.validate({ ...noLease, ...lease }),
          false,
          `${type.name} ${status} must reject partial lease metadata`,
        )
      }
    }

    const completed = makeJob(type, 'completed', 'complete')
    assert.equal(type.validate(completed), true, `${type.name} completed null lease`)
    const completedWithLease = {
      ...completed,
      leaseId: 'lease-1',
      leaseExpiresAt: updatedAt,
      heartbeatAt: createdAt,
    }
    assert.equal(
      type.validate(completedWithLease),
      !type.courseCompletedLeaseMustBeNull,
      `${type.name} completed lease policy`,
    )
  }
})

test('rejects partial leases on completed Task and migration jobs', () => {
  const partialLeases = [
    { leaseId: 'lease-1', leaseExpiresAt: null, heartbeatAt: null },
    { leaseId: null, leaseExpiresAt: updatedAt, heartbeatAt: null },
    { leaseId: null, leaseExpiresAt: null, heartbeatAt: createdAt },
  ]

  for (const type of jobTypes.filter(
    (jobType) => !jobType.courseCompletedLeaseMustBeNull,
  )) {
    const completed = makeJob(type, 'completed', 'complete')

    for (const lease of partialLeases) {
      assert.equal(
        type.validate({ ...completed, ...lease }),
        false,
        `${type.name} completed jobs must reject partial lease metadata`,
      )
    }
  }
})

test('rejects invalid completed status and phase combinations', () => {
  for (const type of jobTypes) {
    assert.equal(
      type.validate(makeJob(type, 'completed', type.phases[0])),
      false,
      `${type.name} cannot be completed before its complete phase`,
    )
    assert.equal(
      type.validate(makeJob(type, 'queued', 'complete')),
      false,
      `${type.name} cannot be queued in its complete phase`,
    )
  }
})

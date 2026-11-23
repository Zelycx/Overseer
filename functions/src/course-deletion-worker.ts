import { createHash, randomUUID } from 'node:crypto'
import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getAdminApp } from './admin.js'
import {
  COURSE_DELETION_CONFIG,
  COURSE_DELETION_PAGE_SIZE,
} from './course-deletion-config.js'
import {
  COURSE_DELETION_PHASES,
  isCourseDeletionJob,
  isCourseDeletionTaskIdManifestEntry,
  isCourseLifecycleMetadata,
  isTaskDeletionJob,
  isTaskLifecycleMetadata,
  type CourseDeletionJob,
  type CourseDeletionPhase,
  type TaskDeletionJob,
} from './job-models.js'

type RecordData = Record<string, unknown>

interface FocusTimerData extends RecordData {
  schemaVersion: 1
  createdAt: Timestamp
  updatedAt: Timestamp
  status: 'idle' | 'running' | 'paused'
  mode: 'focus' | 'shortBreak' | 'longBreak'
  durationSeconds: number
  remainingSeconds: number
  elapsedSeconds: number
  generation: number
  writeGeneration: number
  startedAt: Timestamp | null
  segmentStartedAt: Timestamp | null
  endsAt: Timestamp | null
  courseId: string | null
  taskId: string | null
  runId: string | null
}

interface Continuation {
  leaseId: string
  phase: CourseDeletionPhase
  cursor: string | null
}

interface ClaimedJob extends Continuation {}

type TaskPhaseCursor =
  | { stage: 'manifest'; after: string | null }
  | { stage: 'manifestComplete' }
  | { stage: 'deleteTasks'; after: string | null }

type ReferencePhaseCursor =
  | { stage: 'course'; after: string | null }
  | {
      stage: 'tasks'
      manifestAfter: string | null
      referenceAfter: string | null
    }

type VerificationCursor =
  | { stage: 'manifest'; after: string | null }
  | { stage: 'done' }

class TerminalWorkerError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

class LeaseLostError extends Error {}
class WorkBudgetExhaustedError extends Error {}

const TERMINAL_ERROR_MESSAGE =
  'Deletion stopped because trusted recovery is required.'
const RETRYABLE_ERROR_MESSAGE =
  'A temporary service failure interrupted deletion; the job will retry.'

function isRecord(value: unknown): value is RecordData {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function isDocumentId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('/')
  )
}

function jobReference(
  firestore: Firestore,
  uid: string,
  jobId: string,
): DocumentReference {
  if (!isDocumentId(uid) || !isDocumentId(jobId)) {
    throw new TerminalWorkerError('INVALID_JOB_PATH')
  }
  return firestore
    .collection('users')
    .doc(uid)
    .collection('courseDeletionJobs')
    .doc(jobId)
}

function courseReference(
  firestore: Firestore,
  uid: string,
  courseId: string,
): DocumentReference {
  if (!isDocumentId(courseId)) {
    throw new TerminalWorkerError('INVALID_COURSE_ID')
  }
  return firestore
    .collection('users')
    .doc(uid)
    .collection('courses')
    .doc(courseId)
}

function taskJobReference(
  firestore: Firestore,
  uid: string,
  jobId: string,
): DocumentReference {
  if (!isDocumentId(jobId)) {
    throw new TerminalWorkerError('INVALID_TASK_JOB_ID')
  }
  return firestore
    .collection('users')
    .doc(uid)
    .collection('taskDeletionJobs')
    .doc(jobId)
}

function userCollection(
  firestore: Firestore,
  uid: string,
  collection: string,
) {
  if (!isDocumentId(uid)) {
    throw new TerminalWorkerError('INVALID_USER_PATH')
  }
  return firestore.collection('users').doc(uid).collection(collection)
}

function lifecycleMetadata(data: RecordData): unknown {
  return {
    schemaVersion: data.schemaVersion,
    deletionStatus: data.deletionStatus,
    deletionJobId: data.deletionJobId,
    deletionStartedAt: data.deletionStartedAt,
  }
}

function assertCourseTarget(
  data: unknown,
  jobId: string,
  courseId: string,
): asserts data is RecordData {
  if (
    !isRecord(data) ||
    !isCourseLifecycleMetadata(lifecycleMetadata(data)) ||
    data.deletionStatus !== 'deleting' ||
    data.deletionJobId !== jobId
  ) {
    throw new TerminalWorkerError('COURSE_JOB_RELATIONSHIP_INVALID')
  }
  if (
    !isTimestamp(data.createdAt) ||
    !isTimestamp(data.updatedAt) ||
    data.schemaVersion !== 2 ||
    !isDocumentId(courseId)
  ) {
    throw new TerminalWorkerError('COURSE_SCHEMA_INVALID')
  }
}

function assertCourseJob(
  value: unknown,
  jobId: string,
): asserts value is CourseDeletionJob {
  if (
    !isCourseDeletionJob(value) ||
    !isDocumentId(jobId) ||
    !isDocumentId(value.courseId)
  ) {
    throw new TerminalWorkerError('COURSE_JOB_SCHEMA_INVALID')
  }
}

function assertProductMetadata(
  data: unknown,
  schemaVersion: 1 | 2,
): asserts data is RecordData {
  if (
    !isRecord(data) ||
    data.schemaVersion !== schemaVersion ||
    !isTimestamp(data.createdAt) ||
    !isTimestamp(data.updatedAt)
  ) {
    throw new TerminalWorkerError('PRODUCT_SCHEMA_INVALID')
  }
}

function assertCourseOwnedRecord(
  data: unknown,
  courseId: string,
  schemaVersion: 1 | 2,
): asserts data is RecordData {
  assertProductMetadata(data, schemaVersion)
  if (data.courseId !== courseId) {
    throw new TerminalWorkerError('COURSE_REFERENCE_MISMATCH')
  }
}

function assertTaskLifecycle(
  data: unknown,
  courseId: string,
): asserts data is RecordData {
  assertProductMetadata(data, 2)
  if (
    data.courseId !== courseId ||
    !isTaskLifecycleMetadata(lifecycleMetadata(data))
  ) {
    throw new TerminalWorkerError('TASK_LIFECYCLE_INVALID')
  }
}

function encodeCursor(value: unknown): string {
  return JSON.stringify(value)
}

function decodeCursor<T>(
  cursor: string | null,
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  if (cursor === null) return fallback
  try {
    const value: unknown = JSON.parse(cursor)
    if (validate(value)) return value
  } catch {
    // The persisted cursor is untrusted data and is handled as a terminal invariant below.
  }
  throw new TerminalWorkerError('JOB_CURSOR_INVALID')
}

function isTaskPhaseCursor(value: unknown): value is TaskPhaseCursor {
  if (!isRecord(value)) return false
  if (value.stage === 'manifestComplete') {
    return Object.keys(value).length === 1
  }
  return (
    Object.keys(value).length === 2 &&
    (value.stage === 'manifest' || value.stage === 'deleteTasks') &&
    (value.after === null || isDocumentId(value.after))
  )
}

function isReferencePhaseCursor(
  value: unknown,
): value is ReferencePhaseCursor {
  if (!isRecord(value)) return false
  if (value.stage === 'course') {
    return (
      Object.keys(value).length === 2 &&
      (value.after === null || isDocumentId(value.after))
    )
  }
  return (
    value.stage === 'tasks' &&
    Object.keys(value).length === 3 &&
    (value.manifestAfter === null || isDocumentId(value.manifestAfter)) &&
    (value.referenceAfter === null || isDocumentId(value.referenceAfter))
  )
}

function isVerificationCursor(value: unknown): value is VerificationCursor {
  if (!isRecord(value)) return false
  if (value.stage === 'done') return Object.keys(value).length === 1
  return (
    value.stage === 'manifest' &&
    Object.keys(value).length === 2 &&
    (value.after === null || isDocumentId(value.after))
  )
}

function errorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (typeof error.code === 'string' || typeof error.code === 'number')
  ) {
    return String(error.code).toLowerCase()
  }
  return 'unknown'
}

const RETRYABLE_FIRESTORE_CODES = new Set([
  'aborted',
  'unavailable',
  'resource-exhausted',
  'deadline-exceeded',
  '4',
  '8',
  '10',
  '14',
])

export function isRetryableCourseDeletionFailure(error: unknown): boolean {
  const code = errorCode(error).replaceAll('_', '-')
  return (
    RETRYABLE_FIRESTORE_CODES.has(code) ||
    [...RETRYABLE_FIRESTORE_CODES].some((candidate) =>
      code.endsWith(` ${candidate}`),
    )
  )
}

export function courseDeletionRetryDelaySeconds(
  jobId: string,
  attempts: number,
): number {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new TerminalWorkerError('RETRY_ATTEMPT_COUNT_INVALID')
  }
  const maximum = Math.min(
    COURSE_DELETION_CONFIG.retryBaseSeconds * 2 ** (attempts - 1),
    COURSE_DELETION_CONFIG.maxBackoffSeconds,
  )
  const range = maximum + 1
  const sampleSpace = 2 ** 32
  const rejectionLimit = Math.floor(sampleSpace / range) * range

  for (let counter = 0; ; counter += 1) {
    const sample = createHash('sha256')
      .update(JSON.stringify([jobId, attempts, counter]))
      .digest()
      .readUInt32BE(0)
    if (sample < rejectionLimit) return sample % range
  }
}

function retryEligible(job: CourseDeletionJob, jobId: string): boolean {
  if (job.status !== 'retryable') return false
  const delaySeconds = courseDeletionRetryDelaySeconds(jobId, job.attempts)
  return Date.now() >= job.updatedAt.toMillis() + delaySeconds * 1_000
}

function nextLeaseExpiry(): Timestamp {
  return Timestamp.fromMillis(
    Date.now() + COURSE_DELETION_CONFIG.leaseDurationMs,
  )
}

function checkpointFields(
  nextPhase: CourseDeletionPhase,
  nextCursor: string | null,
) {
  return {
    phase: nextPhase,
    cursor: nextCursor,
    heartbeatAt: FieldValue.serverTimestamp(),
    leaseExpiresAt: nextLeaseExpiry(),
    updatedAt: FieldValue.serverTimestamp(),
  }
}

async function validateCurrentLease(
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
): Promise<{ job: CourseDeletionJob; courseRef: DocumentReference }> {
  const jobRef = jobReference(firestore, uid, jobId)
  const jobSnapshot = await transaction.get(jobRef)
  if (!jobSnapshot.exists) {
    throw new TerminalWorkerError('COURSE_JOB_MISSING')
  }
  const value: unknown = jobSnapshot.data()
  assertCourseJob(value, jobId)
  if (
    jobSnapshot.id !== jobId ||
    value.status !== 'running' ||
    value.leaseId !== expected.leaseId ||
    value.phase !== expected.phase ||
    value.cursor !== expected.cursor
  ) {
    throw new LeaseLostError()
  }

  const courseRef = courseReference(firestore, uid, value.courseId)
  const courseSnapshot = await transaction.get(courseRef)
  if (!courseSnapshot.exists) {
    throw new TerminalWorkerError('COURSE_TARGET_MISSING')
  }
  assertCourseTarget(courseSnapshot.data(), jobId, value.courseId)
  return { job: value, courseRef }
}

export async function claimCourseDeletionJob(
  firestore: Firestore,
  uid: string,
  jobId: string,
): Promise<ClaimedJob | null> {
  const jobRef = jobReference(firestore, uid, jobId)
  return firestore.runTransaction(async (transaction) => {
    const jobSnapshot = await transaction.get(jobRef)
    if (!jobSnapshot.exists) return null

    const value: unknown = jobSnapshot.data()
    try {
      assertCourseJob(value, jobId)
    } catch (error) {
      logger.error('Malformed Course deletion job; trusted recovery required.', {
        reason: error instanceof TerminalWorkerError ? error.code : 'INVALID_JOB',
      })
      return null
    }
    const job = value
    if (job.status === 'failed' || job.status === 'completed') return null

    if (job.status === 'retryable' && job.attempts < 1) {
      transaction.update(jobRef, {
        status: 'failed',
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        sanitizedError: {
          code: 'RETRY_ATTEMPT_COUNT_INVALID',
          message: TERMINAL_ERROR_MESSAGE,
        },
      })
      logger.error('Retryable Course deletion job has no prior attempt.', {
        operation: 'claim',
      })
      return null
    }

    const now = Date.now()
    const eligible =
      job.status === 'queued' ||
      retryEligible(job, jobId) ||
      (job.status === 'running' &&
        job.leaseExpiresAt.toMillis() <= now)
    if (!eligible) return null

    if (job.attempts >= COURSE_DELETION_CONFIG.maxAttempts) {
      transaction.update(jobRef, {
        status: 'failed',
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        sanitizedError: {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: TERMINAL_ERROR_MESSAGE,
        },
      })
      logger.error('Course deletion exhausted its configured attempts.', {
        operation: 'claim',
      })
      return null
    }

    const courseRef = courseReference(firestore, uid, job.courseId)
    const courseSnapshot = await transaction.get(courseRef)
    let targetIsValid = courseSnapshot.exists
    try {
      if (!courseSnapshot.exists) {
        throw new TerminalWorkerError('COURSE_TARGET_MISSING')
      }
      assertCourseTarget(courseSnapshot.data(), jobId, job.courseId)
    } catch {
      targetIsValid = false
    }
    if (!targetIsValid) {
      transaction.update(jobRef, {
        status: 'failed',
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        sanitizedError: {
          code: 'INVALID_TARGET_RELATIONSHIP',
          message: TERMINAL_ERROR_MESSAGE,
        },
      })
      logger.error('Course deletion target relationship is invalid.', {
        operation: 'claim',
      })
      return null
    }

    const leaseId = randomUUID()
    const phase = job.phase
    const cursor = job.cursor
    transaction.update(jobRef, {
      status: 'running',
      attempts: job.attempts + 1,
      leaseId,
      leaseExpiresAt: nextLeaseExpiry(),
      heartbeatAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { leaseId, phase, cursor }
  })
}

async function refreshLeaseHeartbeat(
  firestore: Firestore,
  uid: string,
  jobId: string,
  leaseId: string,
): Promise<void> {
  const jobRef = jobReference(firestore, uid, jobId)
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef)
    const value: unknown = snapshot.data()
    if (
      !snapshot.exists ||
      !isCourseDeletionJob(value) ||
      value.status !== 'running' ||
      value.leaseId !== leaseId
    ) {
      return
    }
    transaction.update(jobRef, {
      heartbeatAt: FieldValue.serverTimestamp(),
      leaseExpiresAt: nextLeaseExpiry(),
    })
  })
}

export async function failUnderLease(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  error: unknown,
): Promise<void> {
  const retryable =
    !(error instanceof TerminalWorkerError) &&
    isRetryableCourseDeletionFailure(error)
  const jobRef = jobReference(firestore, uid, jobId)
  try {
    const changed = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef)
      const value: unknown = snapshot.data()
      if (
        !snapshot.exists ||
        !isCourseDeletionJob(value) ||
        value.status !== 'running' ||
        value.leaseId !== expected.leaseId ||
        value.phase !== expected.phase ||
        value.cursor !== expected.cursor
      ) {
        return false
      }

      const shouldRetry =
        retryable && value.attempts < COURSE_DELETION_CONFIG.maxAttempts
      transaction.update(jobRef, {
        status: shouldRetry ? 'retryable' : 'failed',
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        sanitizedError: {
          code: shouldRetry
            ? 'TEMPORARY_FAILURE'
            : error instanceof TerminalWorkerError
              ? error.code
              : 'UNCLASSIFIED_FAILURE',
          message: shouldRetry
            ? RETRYABLE_ERROR_MESSAGE
            : TERMINAL_ERROR_MESSAGE,
        },
      })
      return shouldRetry ? 'retryable' : 'failed'
    })

    if (changed === 'failed') {
      logger.error('Course deletion entered failed state; trusted recovery required.', {
        operation: 'worker',
      })
    } else if (changed === 'retryable') {
      logger.warn('Course deletion will retry after backoff.', {
        operation: 'worker',
      })
    }
  } catch {
    logger.error('Could not safely record Course deletion failure.', {
      operation: 'worker',
    })
  }
}

function assertExecutionBudget(startedAt: number): void {
  if (Date.now() - startedAt >= COURSE_DELETION_CONFIG.maxWorkerExecutionMs) {
    throw new WorkBudgetExhaustedError()
  }
}

function nextPhase(phase: CourseDeletionPhase): CourseDeletionPhase {
  const index = COURSE_DELETION_PHASES.indexOf(phase)
  const next = COURSE_DELETION_PHASES[index + 1]
  if (!next || next === 'complete') {
    throw new TerminalWorkerError('INVALID_PHASE_TRANSITION')
  }
  return next
}

function advanceJob(
  transaction: Transaction,
  jobRef: DocumentReference,
  job: CourseDeletionJob,
): void {
  transaction.update(
    jobRef,
    checkpointFields(nextPhase(job.phase), null),
  )
}

async function processOwnedCollection(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
  collectionName: 'lessons' | 'materials' | 'events',
): Promise<void> {
  const jobSnapshot = await jobReference(firestore, uid, jobId).get()
  const jobValue: unknown = jobSnapshot.data()
  assertCourseJob(jobValue, jobId)
  if (
    !jobSnapshot.exists ||
    jobValue.status !== 'running' ||
    jobValue.leaseId !== expected.leaseId ||
    jobValue.phase !== expected.phase ||
    jobValue.cursor !== expected.cursor
  ) {
    throw new LeaseLostError()
  }
  if (expected.cursor !== null && !isDocumentId(expected.cursor)) {
    throw new TerminalWorkerError('JOB_CURSOR_INVALID')
  }

  const query = userCollection(firestore, uid, collectionName)
    .where('courseId', '==', jobValue.courseId)
    .orderBy(FieldPath.documentId())
  const pageQuery =
    expected.cursor === null
      ? query.limit(COURSE_DELETION_PAGE_SIZE)
      : query
          .startAfter(expected.cursor)
          .limit(COURSE_DELETION_PAGE_SIZE)
  const page = await pageQuery.get()
  assertExecutionBudget(startedAt)

  const jobRef = jobReference(firestore, uid, jobId)
  await firestore.runTransaction(async (transaction) => {
    const { job } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )
    const snapshots = page.docs.length
      ? await transaction.getAll(...page.docs.map((document) => document.ref))
      : []

    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue
      assertCourseOwnedRecord(snapshot.data(), job.courseId, 1)
    }
    assertExecutionBudget(startedAt)

    for (const snapshot of snapshots) {
      if (snapshot.exists) transaction.delete(snapshot.ref)
    }

    if (page.size < COURSE_DELETION_PAGE_SIZE) {
      advanceJob(transaction, jobRef, job)
    } else {
      transaction.update(
        jobRef,
        checkpointFields(job.phase, page.docs.at(-1)!.id),
      )
    }
  })
}

function parseTaskCursor(cursor: string | null): TaskPhaseCursor {
  return decodeCursor(
    cursor,
    { stage: 'manifest', after: null },
    isTaskPhaseCursor,
  )
}

async function enumerateTaskManifest(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
  cursor: Extract<TaskPhaseCursor, { stage: 'manifest' }>,
): Promise<void> {
  const jobSnapshot = await jobReference(firestore, uid, jobId).get()
  const value: unknown = jobSnapshot.data()
  assertCourseJob(value, jobId)
  if (
    value.status !== 'running' ||
    value.leaseId !== expected.leaseId ||
    value.phase !== expected.phase ||
    value.cursor !== expected.cursor
  ) {
    throw new LeaseLostError()
  }

  const tasksQuery = userCollection(firestore, uid, 'tasks')
    .where('courseId', '==', value.courseId)
    .orderBy(FieldPath.documentId())
  const pageQuery =
    cursor.after === null
      ? tasksQuery.limit(COURSE_DELETION_PAGE_SIZE)
      : tasksQuery
          .startAfter(cursor.after)
          .limit(COURSE_DELETION_PAGE_SIZE)
  const page = await pageQuery.get()
  const manifest = userCollection(firestore, uid, 'courseDeletionJobs')
    .doc(jobId)
    .collection('taskIds')
  assertExecutionBudget(startedAt)

  const jobRef = jobReference(firestore, uid, jobId)
  await firestore.runTransaction(async (transaction) => {
    const { job } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )
    const taskSnapshots = page.docs.length
      ? await transaction.getAll(...page.docs.map((document) => document.ref))
      : []
    for (const snapshot of taskSnapshots) {
      if (snapshot.exists) assertTaskLifecycle(snapshot.data(), job.courseId)
    }

    const manifestRefs = page.docs.map((document) => manifest.doc(document.id))
    const manifestSnapshots = manifestRefs.length
      ? await transaction.getAll(...manifestRefs)
      : []
    for (const snapshot of manifestSnapshots) {
      if (
        snapshot.exists &&
        !isCourseDeletionTaskIdManifestEntry(snapshot.data())
      ) {
        throw new TerminalWorkerError('TASK_MANIFEST_RECORD_INVALID')
      }
    }
    assertExecutionBudget(startedAt)

    for (let index = 0; index < manifestRefs.length; index += 1) {
      if (!manifestSnapshots[index]!.exists) {
        transaction.create(manifestRefs[index]!, {
          createdAt: FieldValue.serverTimestamp(),
        })
      }
    }

    const nextCursor: TaskPhaseCursor =
      page.size < COURSE_DELETION_PAGE_SIZE
        ? { stage: 'manifestComplete' }
        : { stage: 'manifest', after: page.docs.at(-1)!.id }
    transaction.update(jobRef, checkpointFields(job.phase, encodeCursor(nextCursor)))
  })
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function nullableTimestamp(value: unknown): value is Timestamp | null {
  return value === null || isTimestamp(value)
}

function assertFocusTimer(data: unknown): asserts data is FocusTimerData {
  if (
    !isRecord(data) ||
    data.schemaVersion !== 1 ||
    !isTimestamp(data.createdAt) ||
    !isTimestamp(data.updatedAt) ||
    !['idle', 'running', 'paused'].includes(String(data.status)) ||
    !['focus', 'shortBreak', 'longBreak'].includes(String(data.mode)) ||
    !isSafeInteger(data.durationSeconds) ||
    data.durationSeconds <= 0 ||
    !isSafeInteger(data.remainingSeconds) ||
    data.remainingSeconds < 0 ||
    data.remainingSeconds > data.durationSeconds ||
    !isSafeInteger(data.elapsedSeconds) ||
    data.elapsedSeconds < 0 ||
    !isSafeInteger(data.generation) ||
    data.generation < 0 ||
    !isSafeInteger(data.writeGeneration) ||
    data.writeGeneration < 0 ||
    !nullableTimestamp(data.startedAt) ||
    !nullableTimestamp(data.segmentStartedAt) ||
    !nullableTimestamp(data.endsAt) ||
    !nullableString(data.courseId) ||
    !nullableString(data.taskId) ||
    !nullableString(data.runId)
  ) {
    throw new TerminalWorkerError('FOCUS_TIMER_INVALID')
  }
}

async function prepareTaskDeletion(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
): Promise<void> {
  const jobRef = jobReference(firestore, uid, jobId)
  const timerRef = userCollection(firestore, uid, 'settings').doc('focusTimer')
  const manifestRef = userCollection(firestore, uid, 'courseDeletionJobs')
    .doc(jobId)
    .collection('taskIds')

  await firestore.runTransaction(async (transaction) => {
    const { job } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )
    const timerSnapshot = await transaction.get(timerRef)
    const timer = timerSnapshot.data()
    let taskManifestExists = false

    if (timerSnapshot.exists) {
      assertFocusTimer(timer)
      if (typeof timer.taskId === 'string') {
        const taskManifestSnapshot = await transaction.get(
          manifestRef.doc(timer.taskId),
        )
        if (
          taskManifestSnapshot.exists &&
          !isCourseDeletionTaskIdManifestEntry(taskManifestSnapshot.data())
        ) {
          throw new TerminalWorkerError('TASK_MANIFEST_RECORD_INVALID')
        }
        taskManifestExists = taskManifestSnapshot.exists
      }

      const affected =
        timer.courseId === job.courseId || taskManifestExists
      if (
        affected &&
        !Number.isSafeInteger(timer.generation + 1)
      ) {
        throw new TerminalWorkerError('FOCUS_TIMER_GENERATION_INVALID')
      }

      if (affected) {
        transaction.update(timerRef, {
          status: 'idle',
          remainingSeconds: timer.durationSeconds,
          elapsedSeconds: 0,
          generation: timer.generation + 1,
          startedAt: null,
          segmentStartedAt: null,
          endsAt: null,
          courseId: null,
          taskId: null,
          runId: null,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    assertExecutionBudget(startedAt)
    transaction.update(
      jobRef,
      checkpointFields(
        job.phase,
        encodeCursor({ stage: 'deleteTasks', after: null }),
      ),
    )
  })
}

async function deleteTaskPage(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
  cursor: Extract<TaskPhaseCursor, { stage: 'deleteTasks' }>,
): Promise<void> {
  const jobSnapshot = await jobReference(firestore, uid, jobId).get()
  const value: unknown = jobSnapshot.data()
  assertCourseJob(value, jobId)
  if (
    !jobSnapshot.exists ||
    value.status !== 'running' ||
    value.leaseId !== expected.leaseId ||
    value.phase !== expected.phase ||
    value.cursor !== expected.cursor
  ) {
    throw new LeaseLostError()
  }

  const tasksQuery = userCollection(firestore, uid, 'tasks')
    .where('courseId', '==', value.courseId)
    .orderBy(FieldPath.documentId())
  const query =
    cursor.after === null
      ? tasksQuery.limit(COURSE_DELETION_PAGE_SIZE)
      : tasksQuery
          .startAfter(cursor.after)
          .limit(COURSE_DELETION_PAGE_SIZE)
  const page = await query.get()
  const taskJobCollection = userCollection(
    firestore,
    uid,
    'taskDeletionJobs',
  )
  const manifestCollection = userCollection(
    firestore,
    uid,
    'courseDeletionJobs',
  )
    .doc(jobId)
    .collection('taskIds')
  assertExecutionBudget(startedAt)

  const jobRef = jobReference(firestore, uid, jobId)
  await firestore.runTransaction(async (transaction) => {
    const { job } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )
    const taskSnapshots = page.docs.length
      ? await transaction.getAll(...page.docs.map((document) => document.ref))
      : []

    const activeTaskJobs: Array<{
      taskId: string
      jobId: string
      ref: DocumentReference
    }> = []
    for (const snapshot of taskSnapshots) {
      if (!snapshot.exists) continue
      assertTaskLifecycle(snapshot.data(), job.courseId)
      const task = snapshot.data()!
      if (task.deletionStatus === 'deleting') {
        if (!isDocumentId(task.deletionJobId)) {
          throw new TerminalWorkerError('TASK_JOB_RELATIONSHIP_INVALID')
        }
        activeTaskJobs.push({
          taskId: snapshot.id,
          jobId: task.deletionJobId,
          ref: taskJobReference(firestore, uid, task.deletionJobId),
        })
      }
    }

    const manifestRefs = page.docs.map((document) =>
      manifestCollection.doc(document.id),
    )
    const manifestSnapshots = manifestRefs.length
      ? await transaction.getAll(...manifestRefs)
      : []
    for (let index = 0; index < manifestSnapshots.length; index += 1) {
      if (
        !manifestSnapshots[index]!.exists ||
        !isCourseDeletionTaskIdManifestEntry(
          manifestSnapshots[index]!.data(),
        )
      ) {
        throw new TerminalWorkerError('TASK_MANIFEST_INCOMPLETE')
      }
    }

    const taskJobSnapshots = activeTaskJobs.length
      ? await transaction.getAll(...activeTaskJobs.map((item) => item.ref))
      : []
    let defer = false
    for (let index = 0; index < activeTaskJobs.length; index += 1) {
      const relationship = activeTaskJobs[index]!
      const taskJobSnapshot = taskJobSnapshots[index]!
      const taskJob: unknown = taskJobSnapshot.data()
      if (
        !taskJobSnapshot.exists ||
        !isTaskDeletionJob(taskJob) ||
        taskJobSnapshot.id !== relationship.jobId ||
        taskJob.taskId !== relationship.taskId
      ) {
        throw new TerminalWorkerError('TASK_JOB_RELATIONSHIP_INVALID')
      }
      if (taskJob.status === 'failed' || taskJob.status === 'completed') {
        throw new TerminalWorkerError('TASK_JOB_NOT_RESUMABLE')
      }
      defer = true
    }

    assertExecutionBudget(startedAt)
    if (defer) {
      transaction.update(jobRef, {
        status: 'retryable',
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        sanitizedError: {
          code: 'TASK_DELETION_IN_PROGRESS',
          message: 'Waiting for an independent Task deletion to finish.',
        },
      })
      return
    }

    for (const snapshot of taskSnapshots) {
      if (snapshot.exists) transaction.delete(snapshot.ref)
    }

    if (page.size < COURSE_DELETION_PAGE_SIZE) {
      advanceJob(transaction, jobRef, job)
    } else {
      const nextCursor = encodeCursor({
        stage: 'deleteTasks',
        after: page.docs.at(-1)!.id,
      })
      transaction.update(
        jobRef,
        checkpointFields(job.phase, nextCursor),
      )
    }
  })
}

async function processDeleteTasks(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
): Promise<void> {
  const cursor = parseTaskCursor(expected.cursor)
  if (cursor.stage === 'manifest') {
    return enumerateTaskManifest(
      firestore,
      uid,
      jobId,
      expected,
      startedAt,
      cursor,
    )
  }
  if (cursor.stage === 'manifestComplete') {
    return prepareTaskDeletion(firestore, uid, jobId, expected, startedAt)
  }
  return deleteTaskPage(
    firestore,
    uid,
    jobId,
    expected,
    startedAt,
    cursor,
  )
}

function parseReferenceCursor(cursor: string | null): ReferencePhaseCursor {
  return decodeCursor(
    cursor,
    { stage: 'course', after: null },
    isReferencePhaseCursor,
  )
}

function validatePlannerBlock(
  data: unknown,
): asserts data is RecordData {
  assertProductMetadata(data, 1)
  if (!nullableString(data.courseId) || !nullableString(data.taskId)) {
    throw new TerminalWorkerError('PLANNER_BLOCK_REFERENCE_INVALID')
  }
}

function validateFocusSession(data: unknown): asserts data is RecordData {
  assertProductMetadata(data, 1)
  if (!nullableString(data.courseId) || !nullableString(data.taskId)) {
    throw new TerminalWorkerError('FOCUS_SESSION_REFERENCE_INVALID')
  }
}

async function processReferencePage(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
  cursor: ReferencePhaseCursor,
  collectionName: 'plannerBlocks' | 'focusSessions',
): Promise<void> {
  const jobSnapshot = await jobReference(firestore, uid, jobId).get()
  const value: unknown = jobSnapshot.data()
  assertCourseJob(value, jobId)
  if (
    !jobSnapshot.exists ||
    value.status !== 'running' ||
    value.leaseId !== expected.leaseId ||
    value.phase !== expected.phase ||
    value.cursor !== expected.cursor
  ) {
    throw new LeaseLostError()
  }

  const referenceCollection = userCollection(firestore, uid, collectionName)
  const manifest = userCollection(firestore, uid, 'courseDeletionJobs')
    .doc(jobId)
    .collection('taskIds')
  const manifestPage =
    cursor.stage === 'tasks'
      ? await (cursor.manifestAfter === null
          ? manifest.orderBy(FieldPath.documentId())
          : manifest
              .orderBy(FieldPath.documentId())
              .startAfter(cursor.manifestAfter)
        )
          .limit(COURSE_DELETION_CONFIG.maxTaskIdsPerInQuery)
          .get()
      : null
  const taskIds = manifestPage?.docs.map((document) => document.id) ?? []
  for (const document of manifestPage?.docs ?? []) {
    if (!isCourseDeletionTaskIdManifestEntry(document.data())) {
      throw new TerminalWorkerError('TASK_MANIFEST_RECORD_INVALID')
    }
  }

  let pageQuery
  if (cursor.stage === 'course') {
    const query = referenceCollection
      .where('courseId', '==', value.courseId)
      .orderBy(FieldPath.documentId())
    pageQuery =
      cursor.after === null
        ? query.limit(COURSE_DELETION_PAGE_SIZE)
        : query.startAfter(cursor.after).limit(COURSE_DELETION_PAGE_SIZE)
  } else if (taskIds.length > 0) {
    const query = referenceCollection
      .where('taskId', 'in', taskIds)
      .orderBy(FieldPath.documentId())
    pageQuery =
      cursor.referenceAfter === null
        ? query.limit(COURSE_DELETION_PAGE_SIZE)
        : query
            .startAfter(cursor.referenceAfter)
            .limit(COURSE_DELETION_PAGE_SIZE)
  } else {
    pageQuery = null
  }

  const page = pageQuery ? await pageQuery.get() : null
  assertExecutionBudget(startedAt)
  const jobRef = jobReference(firestore, uid, jobId)

  await firestore.runTransaction(async (transaction) => {
    const { job } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )
    const manifestRefs = manifestPage?.docs.map((document) =>
      manifest.doc(document.id),
    ) ?? []
    const manifestSnapshots = manifestRefs.length
      ? await transaction.getAll(...manifestRefs)
      : []
    for (const snapshot of manifestSnapshots) {
      if (
        !snapshot.exists ||
        !isCourseDeletionTaskIdManifestEntry(snapshot.data())
      ) {
        throw new TerminalWorkerError('TASK_MANIFEST_RECORD_INVALID')
      }
    }

    const referenceSnapshots =
      page && page.docs.length > 0
        ? await transaction.getAll(
            ...page.docs.map((document) => document.ref),
          )
        : []
    for (const snapshot of referenceSnapshots) {
      if (!snapshot.exists) continue
      if (collectionName === 'plannerBlocks') {
        validatePlannerBlock(snapshot.data())
      } else {
        validateFocusSession(snapshot.data())
      }
    }
    assertExecutionBudget(startedAt)

    for (const snapshot of referenceSnapshots) {
      if (!snapshot.exists) continue
      const data = snapshot.data()!
      const affected =
        cursor.stage === 'course'
          ? data.courseId === job.courseId
          : typeof data.taskId === 'string' &&
            taskIds.includes(data.taskId)
      if (!affected) continue

      if (collectionName === 'plannerBlocks') {
        transaction.delete(snapshot.ref)
      } else {
        const updates: RecordData = {
          updatedAt: FieldValue.serverTimestamp(),
        }
        if (data.courseId === job.courseId) updates.courseId = null
        if (
          cursor.stage === 'tasks' &&
          typeof data.taskId === 'string' &&
          taskIds.includes(data.taskId)
        ) {
          updates.taskId = null
        }
        transaction.update(snapshot.ref, updates)
      }
    }

    if (cursor.stage === 'course') {
      if (page === null || page.size < COURSE_DELETION_PAGE_SIZE) {
        transaction.update(
          jobRef,
          checkpointFields(
            job.phase,
            encodeCursor({ stage: 'tasks', manifestAfter: null, referenceAfter: null }),
          ),
        )
      } else {
        transaction.update(
          jobRef,
          checkpointFields(
            job.phase,
            encodeCursor({
              stage: 'course',
              after: page.docs.at(-1)!.id,
            }),
          ),
        )
      }
      return
    }

    if (
      page === null ||
      page.size < COURSE_DELETION_PAGE_SIZE
    ) {
      const manifestPageIsLast =
        manifestPage === null ||
        manifestPage.size < COURSE_DELETION_CONFIG.maxTaskIdsPerInQuery
      if (manifestPageIsLast) {
        advanceJob(transaction, jobRef, job)
      } else {
        transaction.update(
          jobRef,
          checkpointFields(
            job.phase,
            encodeCursor({
              stage: 'tasks',
              manifestAfter: manifestPage.docs.at(-1)!.id,
              referenceAfter: null,
            }),
          ),
        )
      }
      return
    }

    transaction.update(
      jobRef,
      checkpointFields(
        job.phase,
        encodeCursor({
          stage: 'tasks',
          manifestAfter: cursor.manifestAfter,
          referenceAfter: page.docs.at(-1)!.id,
        }),
      ),
    )
  })
}

function parseVerificationCursor(cursor: string | null): VerificationCursor {
  return decodeCursor(
    cursor,
    { stage: 'manifest', after: null },
    isVerificationCursor,
  )
}

async function assertNoCourseReferences(
  firestore: Firestore,
  uid: string,
  courseId: string,
): Promise<void> {
  const checks = [
    ['lessons', 'COURSE_LESSONS_REMAIN'],
    ['materials', 'COURSE_MATERIALS_REMAIN'],
    ['tasks', 'COURSE_TASKS_REMAIN'],
    ['events', 'COURSE_EVENTS_REMAIN'],
    ['plannerBlocks', 'COURSE_PLANNER_BLOCKS_REMAIN'],
    ['focusSessions', 'COURSE_FOCUS_SESSIONS_REMAIN'],
  ] as const

  for (const [collectionName, errorCode] of checks) {
    const snapshot = await userCollection(firestore, uid, collectionName)
      .where('courseId', '==', courseId)
      .limit(1)
      .get()
    if (!snapshot.empty) throw new TerminalWorkerError(errorCode)
  }
}

async function assertTimerHasNoCourseReferences(
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  jobId: string,
  courseId: string,
  timerRef: DocumentReference,
): Promise<void> {
  const timerSnapshot = await transaction.get(timerRef)
  if (!timerSnapshot.exists) return
  const timer = timerSnapshot.data()
  assertFocusTimer(timer)

  if (timer.courseId === courseId) {
    throw new TerminalWorkerError('FOCUS_TIMER_REFERENCE_REMAINS')
  }
  if (typeof timer.taskId === 'string') {
    const taskManifestRef = userCollection(
      firestore,
      uid,
      'courseDeletionJobs',
    )
      .doc(jobId)
      .collection('taskIds')
      .doc(timer.taskId)
    const taskManifestSnapshot = await transaction.get(taskManifestRef)
    if (
      taskManifestSnapshot.exists &&
      !isCourseDeletionTaskIdManifestEntry(taskManifestSnapshot.data())
    ) {
      throw new TerminalWorkerError('TASK_MANIFEST_RECORD_INVALID')
    }
    if (taskManifestSnapshot.exists) {
      throw new TerminalWorkerError('FOCUS_TIMER_REFERENCE_REMAINS')
    }
  }
}

async function assertTimerHasNoCourseReferencesOutsideTransaction(
  firestore: Firestore,
  uid: string,
  jobId: string,
  courseId: string,
): Promise<void> {
  const timerSnapshot = await userCollection(
    firestore,
    uid,
    'settings',
  )
    .doc('focusTimer')
    .get()
  if (!timerSnapshot.exists) return
  const timer = timerSnapshot.data()
  assertFocusTimer(timer)
  if (timer.courseId === courseId) {
    throw new TerminalWorkerError('FOCUS_TIMER_REFERENCE_REMAINS')
  }
  if (typeof timer.taskId === 'string') {
    const taskManifestSnapshot = await userCollection(
      firestore,
      uid,
      'courseDeletionJobs',
    )
      .doc(jobId)
      .collection('taskIds')
      .doc(timer.taskId)
      .get()
    if (
      taskManifestSnapshot.exists &&
      !isCourseDeletionTaskIdManifestEntry(taskManifestSnapshot.data())
    ) {
      throw new TerminalWorkerError('TASK_MANIFEST_RECORD_INVALID')
    }
    if (taskManifestSnapshot.exists) {
      throw new TerminalWorkerError('FOCUS_TIMER_REFERENCE_REMAINS')
    }
  }
}

async function verifyManifestTaskReferences(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
  cursor: Extract<VerificationCursor, { stage: 'manifest' }>,
): Promise<void> {
  const manifest = userCollection(firestore, uid, 'courseDeletionJobs')
    .doc(jobId)
    .collection('taskIds')
  const query =
    cursor.after === null
      ? manifest.orderBy(FieldPath.documentId())
      : manifest
          .orderBy(FieldPath.documentId())
          .startAfter(cursor.after)
  const page = await query
    .limit(COURSE_DELETION_CONFIG.maxTaskIdsPerInQuery)
    .get()
  const taskIds = page.docs.map((document) => document.id)
  for (const document of page.docs) {
    if (!isCourseDeletionTaskIdManifestEntry(document.data())) {
      throw new TerminalWorkerError('TASK_MANIFEST_RECORD_INVALID')
    }
  }

  if (taskIds.length > 0) {
    const [plannerBlocks, focusSessions] = await Promise.all([
      userCollection(firestore, uid, 'plannerBlocks')
        .where('taskId', 'in', taskIds)
        .limit(1)
        .get(),
      userCollection(firestore, uid, 'focusSessions')
        .where('taskId', 'in', taskIds)
        .limit(1)
        .get(),
    ])
    if (!plannerBlocks.empty) {
      throw new TerminalWorkerError('TASK_PLANNER_BLOCK_REFERENCES_REMAIN')
    }
    if (!focusSessions.empty) {
      throw new TerminalWorkerError('TASK_FOCUS_SESSION_REFERENCES_REMAIN')
    }
  }

  assertExecutionBudget(startedAt)
  const jobRef = jobReference(firestore, uid, jobId)
  await firestore.runTransaction(async (transaction) => {
    const { job } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )
    const manifestRefs = page.docs.map((document) =>
      manifest.doc(document.id),
    )
    const manifestSnapshots = manifestRefs.length
      ? await transaction.getAll(...manifestRefs)
      : []
    for (const snapshot of manifestSnapshots) {
      if (
        !snapshot.exists ||
        !isCourseDeletionTaskIdManifestEntry(snapshot.data())
      ) {
        throw new TerminalWorkerError('TASK_MANIFEST_RECORD_INVALID')
      }
    }
    assertExecutionBudget(startedAt)

    const nextCursor: VerificationCursor =
      page.size < COURSE_DELETION_CONFIG.maxTaskIdsPerInQuery
        ? { stage: 'done' }
        : { stage: 'manifest', after: page.docs.at(-1)!.id }
    transaction.update(
      jobRef,
      checkpointFields(job.phase, encodeCursor(nextCursor)),
    )
  })
}

async function finishCourseDeletion(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
): Promise<void> {
  const jobRef = jobReference(firestore, uid, jobId)
  const timerRef = userCollection(firestore, uid, 'settings').doc('focusTimer')
  await firestore.runTransaction(async (transaction) => {
    const { job, courseRef } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )

    const checks = [
      'lessons',
      'materials',
      'tasks',
      'events',
      'plannerBlocks',
      'focusSessions',
    ] as const
    for (const collectionName of checks) {
      const querySnapshot = await transaction.get(
        userCollection(firestore, uid, collectionName)
          .where('courseId', '==', job.courseId)
          .limit(1),
      )
      if (!querySnapshot.empty) {
        throw new TerminalWorkerError('COURSE_REFERENCES_REMAIN')
      }
    }
    await assertTimerHasNoCourseReferences(
      transaction,
      firestore,
      uid,
      jobId,
      job.courseId,
      timerRef,
    )
    assertExecutionBudget(startedAt)

    transaction.delete(courseRef)
    transaction.update(jobRef, {
      status: 'completed',
      phase: 'complete',
      cursor: null,
      leaseId: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
}

async function processVerify(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
): Promise<void> {
  const cursor = parseVerificationCursor(expected.cursor)
  const jobSnapshot = await jobReference(firestore, uid, jobId).get()
  const value: unknown = jobSnapshot.data()
  assertCourseJob(value, jobId)
  if (
    !jobSnapshot.exists ||
    value.status !== 'running' ||
    value.leaseId !== expected.leaseId ||
    value.phase !== expected.phase ||
    value.cursor !== expected.cursor
  ) {
    throw new LeaseLostError()
  }

  await assertNoCourseReferences(firestore, uid, value.courseId)
  if (cursor.stage === 'done') {
    return finishCourseDeletion(firestore, uid, jobId, expected, startedAt)
  }
  await assertTimerHasNoCourseReferencesOutsideTransaction(
    firestore,
    uid,
    jobId,
    value.courseId,
  )
  await verifyManifestTaskReferences(
    firestore,
    uid,
    jobId,
    expected,
    startedAt,
    cursor,
  )
}

export async function processCourseDeletionContinuation(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
): Promise<void> {
  const startedAt = Date.now()
  let heartbeat: NodeJS.Timeout | undefined
  try {
    const jobSnapshot = await jobReference(firestore, uid, jobId).get()
    const value: unknown = jobSnapshot.data()
    assertCourseJob(value, jobId)
    if (
      !jobSnapshot.exists ||
      value.status !== 'running' ||
      value.leaseId !== expected.leaseId ||
      value.phase !== expected.phase ||
      value.cursor !== expected.cursor
    ) {
      return
    }

    const courseSnapshot = await courseReference(
      firestore,
      uid,
      value.courseId,
    ).get()
    if (!courseSnapshot.exists) {
      throw new TerminalWorkerError('COURSE_TARGET_MISSING')
    }
    assertCourseTarget(courseSnapshot.data(), jobId, value.courseId)
    assertExecutionBudget(startedAt)

    heartbeat = setInterval(() => {
      void refreshLeaseHeartbeat(firestore, uid, jobId, expected.leaseId).catch(
        () => {
          logger.warn('Course deletion heartbeat refresh failed.', {
            operation: 'heartbeat',
          })
        },
      )
    }, COURSE_DELETION_CONFIG.heartbeatIntervalMs)
    heartbeat.unref()

    switch (value.phase) {
      case 'deleteLessons':
        await processOwnedCollection(
          firestore,
          uid,
          jobId,
          expected,
          startedAt,
          'lessons',
        )
        break
      case 'deleteMaterials':
        await processOwnedCollection(
          firestore,
          uid,
          jobId,
          expected,
          startedAt,
          'materials',
        )
        break
      case 'deleteTasks':
        await processDeleteTasks(
          firestore,
          uid,
          jobId,
          expected,
          startedAt,
        )
        break
      case 'deleteEvents':
        await processOwnedCollection(
          firestore,
          uid,
          jobId,
          expected,
          startedAt,
          'events',
        )
        break
      case 'deletePlannerBlocks':
      case 'clearFocusSessionReferences': {
        const cursor = parseReferenceCursor(expected.cursor)
        await processReferencePage(
          firestore,
          uid,
          jobId,
          expected,
          startedAt,
          cursor,
          value.phase === 'deletePlannerBlocks'
            ? 'plannerBlocks'
            : 'focusSessions',
        )
        break
      }
      case 'verify':
        await processVerify(firestore, uid, jobId, expected, startedAt)
        break
    }
  } catch (error) {
    if (error instanceof LeaseLostError || error instanceof WorkBudgetExhaustedError) {
      return
    }
    if (error instanceof TerminalWorkerError) {
      logger.error('Course deletion encountered a terminal invariant failure.', {
        reason: error.code,
      })
    }
    await failUnderLease(firestore, uid, jobId, expected, error)
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

export function isRelevantCourseDeletionWrite(
  before: CourseDeletionJob | undefined,
  after: CourseDeletionJob,
  created: boolean,
): boolean {
  if (created) return after.status === 'queued' || after.status === 'running'
  if (after.status !== 'running' || before === undefined) return false
  if (before.status !== 'running') {
    return after.leaseId !== before.leaseId
  }
  return (
    after.leaseId !== before.leaseId ||
    (after.leaseId === before.leaseId &&
      (after.phase !== before.phase || after.cursor !== before.cursor))
  )
}

async function dispatchCourseDeletionWrite(
  firestore: Firestore,
  uid: string,
  jobId: string,
  beforeValue: unknown,
  afterValue: unknown,
  created: boolean,
): Promise<void> {
  if (!isCourseDeletionJob(afterValue)) {
    logger.error('Malformed Course deletion job write; trusted recovery required.', {
      operation: 'trigger',
    })
    return
  }
  const after = afterValue
  const before = isCourseDeletionJob(beforeValue) ? beforeValue : undefined

  if (after.status === 'failed') {
    if (created || before?.status !== 'failed') {
      logger.error('Course deletion job entered failed state.', {
        operation: 'trigger',
      })
    }
    return
  }
  if (!isRelevantCourseDeletionWrite(before, after, created)) return

  if (after.status === 'queued') {
    const claimed = await claimCourseDeletionJob(firestore, uid, jobId)
    if (claimed) {
      await processCourseDeletionContinuation(
        firestore,
        uid,
        jobId,
        claimed,
      )
    }
    return
  }

  if (typeof after.leaseId !== 'string') return
  await processCourseDeletionContinuation(firestore, uid, jobId, {
    leaseId: after.leaseId,
    phase: after.phase,
    cursor: after.cursor,
  })
}

function parseJobPath(path: string): { uid: string; jobId: string } | null {
  const segments = path.split('/')
  if (
    segments.length !== 4 ||
    segments[0] !== 'users' ||
    segments[2] !== 'courseDeletionJobs' ||
    !isDocumentId(segments[1]) ||
    !isDocumentId(segments[3])
  ) {
    return null
  }
  return { uid: segments[1], jobId: segments[3] }
}

export async function reconcileCourseDeletionJobs(
  firestore: Firestore,
): Promise<void> {
  const startedAt = Date.now()
  const statuses = ['queued', 'retryable', 'running'] as const

  for (const status of statuses) {
    let last: QueryDocumentSnapshot | undefined
    while (
      Date.now() - startedAt < COURSE_DELETION_CONFIG.maxWorkerExecutionMs
    ) {
      let query = firestore
        .collectionGroup('courseDeletionJobs')
        .where('status', '==', status)
        .orderBy(FieldPath.documentId())
        .limit(COURSE_DELETION_PAGE_SIZE)
      if (last) query = query.startAfter(last)
      const page = await query.get()
      if (page.empty) break

      for (const document of page.docs) {
        last = document
        const path = parseJobPath(document.ref.path)
        if (!path) {
          logger.error('Invalid Course deletion job path during reconciliation.', {
            operation: 'reconciliation',
          })
          continue
        }
        await claimCourseDeletionJob(
          firestore,
          path.uid,
          path.jobId,
        )
        if (
          Date.now() - startedAt >=
          COURSE_DELETION_CONFIG.maxWorkerExecutionMs
        ) {
          return
        }
      }
      if (page.size < COURSE_DELETION_PAGE_SIZE) break
    }
  }
}

export const dispatchCourseDeletionJob = onDocumentWritten(
  {
    document: 'users/{uid}/courseDeletionJobs/{jobId}',
    timeoutSeconds: COURSE_DELETION_CONFIG.functionTimeoutSeconds,
  },
  async (event) => {
    const { uid, jobId } = event.params
    const snapshot = event.data?.after
    if (!snapshot?.exists) return

    const parsedPath = parseJobPath(snapshot.ref.path)
    if (!parsedPath || parsedPath.uid !== uid || parsedPath.jobId !== jobId) {
      logger.error('Course deletion trigger path is invalid.', {
        operation: 'trigger',
      })
      return
    }

    await dispatchCourseDeletionWrite(
      getFirestore(getAdminApp()),
      uid,
      jobId,
      event.data?.before.exists ? event.data.before.data() : undefined,
      snapshot.data(),
      !event.data?.before.exists,
    )
  },
)

export const reconcileCourseDeletionJobsSchedule = onSchedule(
  {
    schedule: COURSE_DELETION_CONFIG.reconciliationSchedule,
    timeoutSeconds: COURSE_DELETION_CONFIG.functionTimeoutSeconds,
  },
  async () => {
    await reconcileCourseDeletionJobs(getFirestore(getAdminApp()))
  },
)

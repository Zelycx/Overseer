import { randomUUID } from 'node:crypto'
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
  TASK_DELETION_CONFIG,
  TASK_DELETION_PAGE_SIZE,
} from './course-deletion-config.js'
import {
  courseDeletionRetryDelaySeconds,
  isRetryableCourseDeletionFailure,
} from './course-deletion-worker.js'
import {
  TASK_DELETION_PHASES,
  isCourseDeletionJob,
  isCourseLifecycleMetadata,
  isTaskDeletionJob,
  isTaskLifecycleMetadata,
  type TaskDeletionJob,
  type TaskDeletionPhase,
} from './job-models.js'

type RecordData = Record<string, unknown>

interface Continuation {
  leaseId: string
  phase: TaskDeletionPhase
  cursor: string | null
}

interface ClaimedJob extends Continuation {}

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

function timestampIsAfter(left: Timestamp, right: Timestamp): boolean {
  return (
    left.seconds > right.seconds ||
    (left.seconds === right.seconds && left.nanoseconds > right.nanoseconds)
  )
}

function isDocumentId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('/')
  )
}

function isNullableDocumentId(value: unknown): value is string | null {
  return value === null || isDocumentId(value)
}

function jobReference(
  firestore: Firestore,
  uid: string,
  jobId: string,
): DocumentReference {
  if (!isDocumentId(uid) || !isDocumentId(jobId)) {
    throw new TerminalWorkerError('INVALID_TASK_JOB_PATH')
  }
  return firestore
    .collection('users')
    .doc(uid)
    .collection('taskDeletionJobs')
    .doc(jobId)
}

function taskReference(
  firestore: Firestore,
  uid: string,
  taskId: string,
): DocumentReference {
  if (!isDocumentId(uid) || !isDocumentId(taskId)) {
    throw new TerminalWorkerError('INVALID_TASK_TARGET_PATH')
  }
  return firestore.collection('users').doc(uid).collection('tasks').doc(taskId)
}

function userCollection(
  firestore: Firestore,
  uid: string,
  collectionName: 'plannerBlocks' | 'focusSessions',
) {
  if (!isDocumentId(uid)) {
    throw new TerminalWorkerError('INVALID_USER_PATH')
  }
  return firestore.collection('users').doc(uid).collection(collectionName)
}

function lifecycleMetadata(data: RecordData): unknown {
  return {
    schemaVersion: data.schemaVersion,
    deletionStatus: data.deletionStatus,
    deletionJobId: data.deletionJobId,
    deletionStartedAt: data.deletionStartedAt,
  }
}

function taskCourseId(task: RecordData): string | null {
  if (!isNullableDocumentId(task.courseId)) {
    throw new TerminalWorkerError('TASK_COURSE_REFERENCE_INVALID')
  }
  return task.courseId
}

async function assertParentCourse(
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  courseId: string | null,
  taskJobCreatedAt: Timestamp,
): Promise<void> {
  if (courseId === null) return

  const userRef = firestore.collection('users').doc(uid)
  const courseRef = userRef.collection('courses').doc(courseId)
  const courseSnapshot = await transaction.get(courseRef)
  const course: unknown = courseSnapshot.data()
  if (
    !courseSnapshot.exists ||
    !isRecord(course) ||
    !isTimestamp(course.createdAt) ||
    !isTimestamp(course.updatedAt) ||
    !isCourseLifecycleMetadata(lifecycleMetadata(course))
  ) {
    throw new TerminalWorkerError('TASK_PARENT_COURSE_INVALID')
  }

  if (course.deletionStatus === 'active') return

  const courseJobId = course.deletionJobId
  if (!isDocumentId(courseJobId)) {
    throw new TerminalWorkerError('TASK_PARENT_COURSE_JOB_INVALID')
  }
  const courseJobRef = userRef
    .collection('courseDeletionJobs')
    .doc(courseJobId)
  const courseJobSnapshot = await transaction.get(courseJobRef)
  const courseJob: unknown = courseJobSnapshot.data()
  if (
    !courseJobSnapshot.exists ||
    courseJobSnapshot.id !== courseJobId ||
    !isCourseDeletionJob(courseJob) ||
    courseJob.courseId !== courseId ||
    courseJob.status === 'completed'
  ) {
    throw new TerminalWorkerError('TASK_PARENT_COURSE_JOB_INVALID')
  }
  if (
    !(course.deletionStartedAt instanceof Timestamp) ||
    timestampIsAfter(taskJobCreatedAt, course.deletionStartedAt)
  ) {
    throw new TerminalWorkerError('TASK_PARENT_COURSE_DELETION_ALREADY_STARTED')
  }
}

function assertTaskJob(
  value: unknown,
  jobId: string,
): asserts value is TaskDeletionJob {
  if (
    !isTaskDeletionJob(value) ||
    !isDocumentId(jobId) ||
    !isDocumentId(value.taskId)
  ) {
    throw new TerminalWorkerError('TASK_JOB_SCHEMA_INVALID')
  }
}

function assertTaskTarget(
  data: unknown,
  jobId: string,
  taskId: string,
): asserts data is RecordData {
  if (
    !isRecord(data) ||
    !isTaskLifecycleMetadata(lifecycleMetadata(data)) ||
    data.deletionStatus !== 'deleting' ||
    data.deletionJobId !== jobId
  ) {
    throw new TerminalWorkerError('TASK_JOB_RELATIONSHIP_INVALID')
  }
  if (
    data.schemaVersion !== 2 ||
    !isTimestamp(data.createdAt) ||
    !isTimestamp(data.updatedAt) ||
    !isDocumentId(taskId)
  ) {
    throw new TerminalWorkerError('TASK_SCHEMA_INVALID')
  }
  taskCourseId(data)
}

function assertProductMetadata(data: unknown): asserts data is RecordData {
  if (
    !isRecord(data) ||
    data.schemaVersion !== 1 ||
    !isTimestamp(data.createdAt) ||
    !isTimestamp(data.updatedAt)
  ) {
    throw new TerminalWorkerError('PRODUCT_SCHEMA_INVALID')
  }
}

function assertTaskReference(
  data: unknown,
  collectionName: 'plannerBlocks' | 'focusSessions',
  taskId: string,
  courseId: string | null,
): boolean {
  const codePrefix =
    collectionName === 'plannerBlocks' ? 'PLANNER_BLOCK' : 'FOCUS_SESSION'
  assertProductMetadata(data)
  if (
    !isNullableDocumentId(data.courseId) ||
    !isNullableDocumentId(data.taskId)
  ) {
    throw new TerminalWorkerError(`${codePrefix}_REFERENCE_INVALID`)
  }
  if (data.taskId === null) return false
  if (data.taskId !== taskId || data.courseId !== courseId) {
    throw new TerminalWorkerError(`${codePrefix}_REFERENCE_MISMATCH`)
  }
  return true
}

function encodeCursor(value: string): string {
  return value
}

function decodeCursor(cursor: string | null): string | null {
  if (cursor === null) return null
  if (!isDocumentId(cursor)) {
    throw new TerminalWorkerError('JOB_CURSOR_INVALID')
  }
  return cursor
}

function nextLeaseExpiry(): Timestamp {
  return Timestamp.fromMillis(
    Date.now() + TASK_DELETION_CONFIG.leaseDurationMs,
  )
}

function checkpointFields(
  phase: TaskDeletionPhase,
  cursor: string | null,
) {
  return {
    phase,
    cursor,
    heartbeatAt: FieldValue.serverTimestamp(),
    leaseExpiresAt: nextLeaseExpiry(),
    updatedAt: FieldValue.serverTimestamp(),
  }
}

function nextPhase(phase: TaskDeletionPhase): TaskDeletionPhase {
  const index = TASK_DELETION_PHASES.indexOf(phase)
  const next = TASK_DELETION_PHASES[index + 1]
  if (!next || next === 'complete') {
    throw new TerminalWorkerError('INVALID_PHASE_TRANSITION')
  }
  return next
}

function retryEligible(job: TaskDeletionJob, jobId: string): boolean {
  if (job.status !== 'retryable') return false
  const delaySeconds = courseDeletionRetryDelaySeconds(jobId, job.attempts)
  return Date.now() >= job.updatedAt.toMillis() + delaySeconds * 1_000
}

function assertExecutionBudget(startedAt: number): void {
  if (Date.now() - startedAt >= TASK_DELETION_CONFIG.maxWorkerExecutionMs) {
    throw new WorkBudgetExhaustedError()
  }
}

async function validateCurrentLease(
  transaction: Transaction,
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
): Promise<{
  job: TaskDeletionJob
  jobRef: DocumentReference
  taskRef: DocumentReference
  task: RecordData
}> {
  const jobRef = jobReference(firestore, uid, jobId)
  const jobSnapshot = await transaction.get(jobRef)
  if (!jobSnapshot.exists) {
    throw new TerminalWorkerError('TASK_JOB_MISSING')
  }
  const value: unknown = jobSnapshot.data()
  assertTaskJob(value, jobId)
  if (
    jobSnapshot.id !== jobId ||
    value.status !== 'running' ||
    value.leaseId !== expected.leaseId ||
    value.phase !== expected.phase ||
    value.cursor !== expected.cursor
  ) {
    throw new LeaseLostError()
  }

  const taskRef = taskReference(firestore, uid, value.taskId)
  const taskSnapshot = await transaction.get(taskRef)
  if (!taskSnapshot.exists) {
    throw new TerminalWorkerError('TASK_TARGET_MISSING')
  }
  const task: unknown = taskSnapshot.data()
  assertTaskTarget(task, jobId, value.taskId)
  await assertParentCourse(
    transaction,
    firestore,
    uid,
    taskCourseId(task),
    value.createdAt,
  )
  return { job: value, jobRef, taskRef, task }
}

export async function claimTaskDeletionJob(
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
      assertTaskJob(value, jobId)
    } catch (error) {
      logger.error('Malformed Task deletion job; trusted recovery required.', {
        reason:
          error instanceof TerminalWorkerError ? error.code : 'INVALID_JOB',
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
      logger.error('Retryable Task deletion job has no prior attempt.', {
        operation: 'claim',
      })
      return null
    }

    const now = Date.now()
    const eligible =
      job.status === 'queued' ||
      retryEligible(job, jobId) ||
      (job.status === 'running' && job.leaseExpiresAt.toMillis() <= now)
    if (!eligible) return null

    if (job.attempts >= TASK_DELETION_CONFIG.maxAttempts) {
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
      logger.error('Task deletion exhausted its configured attempts.', {
        operation: 'claim',
      })
      return null
    }

    const taskRef = taskReference(firestore, uid, job.taskId)
    const taskSnapshot = await transaction.get(taskRef)
    let targetIsValid = taskSnapshot.exists
    try {
      if (!taskSnapshot.exists) {
        throw new TerminalWorkerError('TASK_TARGET_MISSING')
      }
      assertTaskTarget(taskSnapshot.data(), jobId, job.taskId)
      await assertParentCourse(
        transaction,
        firestore,
        uid,
        taskCourseId(taskSnapshot.data()!),
        job.createdAt,
      )
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
      logger.error('Task deletion target relationship is invalid.', {
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
      !isTaskDeletionJob(value) ||
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

export async function failTaskDeletionUnderLease(
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
        !isTaskDeletionJob(value) ||
        value.status !== 'running' ||
        value.leaseId !== expected.leaseId ||
        value.phase !== expected.phase ||
        value.cursor !== expected.cursor
      ) {
        return false
      }

      const shouldRetry =
        retryable && value.attempts < TASK_DELETION_CONFIG.maxAttempts
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
      logger.error('Task deletion entered failed state; trusted recovery required.', {
        operation: 'worker',
      })
    } else if (changed === 'retryable') {
      logger.warn('Task deletion will retry after backoff.', {
        operation: 'worker',
      })
    }
  } catch {
    logger.error('Could not safely record Task deletion failure.', {
      operation: 'worker',
    })
  }
}

async function processReferencePage(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
  collectionName: 'plannerBlocks' | 'focusSessions',
): Promise<void> {
  const cursor = decodeCursor(expected.cursor)
  const jobRef = jobReference(firestore, uid, jobId)
  await firestore.runTransaction(async (transaction) => {
    const { job, task } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )
    if (
      job.phase !== 'clearPlannerBlockReferences' &&
      job.phase !== 'clearFocusSessionReferences'
    ) {
      throw new TerminalWorkerError('INVALID_REFERENCE_PHASE')
    }
    const courseId = taskCourseId(task)
    const query = userCollection(firestore, uid, collectionName)
      .where('taskId', '==', job.taskId)
      .orderBy(FieldPath.documentId())
    const pageQuery =
      cursor === null
        ? query.limit(TASK_DELETION_PAGE_SIZE)
        : query.startAfter(cursor).limit(TASK_DELETION_PAGE_SIZE)
    const page = await transaction.get(pageQuery)
    assertExecutionBudget(startedAt)

    for (const document of page.docs) {
      if (
        !assertTaskReference(
          document.data(),
          collectionName,
          job.taskId,
          courseId,
        )
      ) {
        continue
      }
      transaction.update(document.ref, {
        taskId: null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    if (page.size < TASK_DELETION_PAGE_SIZE) {
      transaction.update(
        jobRef,
        checkpointFields(nextPhase(job.phase), null),
      )
    } else {
      transaction.update(
        jobRef,
        checkpointFields(
          job.phase,
          encodeCursor(page.docs.at(-1)!.id),
        ),
      )
    }
  })
}

async function verifyAndCompleteTaskDeletion(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
  startedAt: number,
): Promise<void> {
  if (expected.cursor !== null) decodeCursor(expected.cursor)
  const jobRef = jobReference(firestore, uid, jobId)

  await firestore.runTransaction(async (transaction) => {
    const { job, taskRef, task } = await validateCurrentLease(
      transaction,
      firestore,
      uid,
      jobId,
      expected,
    )
    if (job.phase !== 'verify') {
      throw new TerminalWorkerError('INVALID_VERIFICATION_PHASE')
    }
    const courseId = taskCourseId(task)
    const plannerBlocks = await transaction.get(
      userCollection(firestore, uid, 'plannerBlocks')
        .where('taskId', '==', job.taskId)
        .limit(1),
    )
    const focusSessions = await transaction.get(
      userCollection(firestore, uid, 'focusSessions')
        .where('taskId', '==', job.taskId)
        .limit(1),
    )
    assertExecutionBudget(startedAt)

    if (!plannerBlocks.empty) {
      for (const document of plannerBlocks.docs) {
        assertTaskReference(
          document.data(),
          'plannerBlocks',
          job.taskId,
          courseId,
        )
      }
      throw new TerminalWorkerError('PLANNER_BLOCK_REFERENCES_REMAIN')
    }
    if (!focusSessions.empty) {
      for (const document of focusSessions.docs) {
        assertTaskReference(
          document.data(),
          'focusSessions',
          job.taskId,
          courseId,
        )
      }
      throw new TerminalWorkerError('FOCUS_SESSION_REFERENCES_REMAIN')
    }

    transaction.delete(taskRef)
    transaction.update(jobRef, {
      status: 'completed',
      phase: 'complete',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
}

export async function processTaskDeletionContinuation(
  firestore: Firestore,
  uid: string,
  jobId: string,
  expected: Continuation,
): Promise<void> {
  const startedAt = Date.now()
  let heartbeat: NodeJS.Timeout | undefined
  try {
    const jobSnapshot = await jobReference(firestore, uid, jobId).get()
    if (!jobSnapshot.exists) return
    const value: unknown = jobSnapshot.data()
    assertTaskJob(value, jobId)
    if (
      value.status !== 'running' ||
      value.leaseId !== expected.leaseId ||
      value.phase !== expected.phase ||
      value.cursor !== expected.cursor
    ) {
      return
    }

    const taskSnapshot = await taskReference(
      firestore,
      uid,
      value.taskId,
    ).get()
    if (!taskSnapshot.exists) {
      throw new TerminalWorkerError('TASK_TARGET_MISSING')
    }
    assertTaskTarget(taskSnapshot.data(), jobId, value.taskId)
    assertExecutionBudget(startedAt)

    heartbeat = setInterval(() => {
      void refreshLeaseHeartbeat(firestore, uid, jobId, expected.leaseId).catch(
        () => {
          logger.warn('Task deletion heartbeat refresh failed.', {
            operation: 'heartbeat',
          })
        },
      )
    }, TASK_DELETION_CONFIG.heartbeatIntervalMs)
    heartbeat.unref()

    switch (value.phase) {
      case 'clearPlannerBlockReferences':
      case 'clearFocusSessionReferences':
        await processReferencePage(
          firestore,
          uid,
          jobId,
          expected,
          startedAt,
          value.phase === 'clearPlannerBlockReferences'
            ? 'plannerBlocks'
            : 'focusSessions',
        )
        break
      case 'verify':
        await verifyAndCompleteTaskDeletion(
          firestore,
          uid,
          jobId,
          expected,
          startedAt,
        )
        break
    }
  } catch (error) {
    if (
      error instanceof LeaseLostError ||
      error instanceof WorkBudgetExhaustedError
    ) {
      return
    }
    if (error instanceof TerminalWorkerError) {
      logger.error('Task deletion encountered a terminal invariant failure.', {
        reason: error.code,
      })
    }
    await failTaskDeletionUnderLease(firestore, uid, jobId, expected, error)
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

export function isRelevantTaskDeletionWrite(
  before: TaskDeletionJob | undefined,
  after: TaskDeletionJob,
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

async function dispatchTaskDeletionWrite(
  firestore: Firestore,
  uid: string,
  jobId: string,
  beforeValue: unknown,
  afterValue: unknown,
  created: boolean,
): Promise<void> {
  if (!isTaskDeletionJob(afterValue)) {
    logger.error('Malformed Task deletion job write; trusted recovery required.', {
      operation: 'trigger',
    })
    return
  }
  const after = afterValue
  const before = isTaskDeletionJob(beforeValue) ? beforeValue : undefined

  if (after.status === 'failed') {
    if (created || before?.status !== 'failed') {
      logger.error('Task deletion job entered failed state.', {
        operation: 'trigger',
      })
    }
    return
  }
  if (!isRelevantTaskDeletionWrite(before, after, created)) return

  if (after.status === 'queued') {
    const claimed = await claimTaskDeletionJob(firestore, uid, jobId)
    if (claimed) {
      await processTaskDeletionContinuation(
        firestore,
        uid,
        jobId,
        claimed,
      )
    }
    return
  }

  if (typeof after.leaseId !== 'string') return
  await processTaskDeletionContinuation(firestore, uid, jobId, {
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
    segments[2] !== 'taskDeletionJobs' ||
    !isDocumentId(segments[1]) ||
    !isDocumentId(segments[3])
  ) {
    return null
  }
  return { uid: segments[1], jobId: segments[3] }
}

export async function reconcileTaskDeletionJobs(
  firestore: Firestore,
): Promise<void> {
  const startedAt = Date.now()
  const statuses = ['queued', 'retryable', 'running'] as const

  for (const status of statuses) {
    let last: QueryDocumentSnapshot | undefined
    while (
      Date.now() - startedAt < TASK_DELETION_CONFIG.maxWorkerExecutionMs
    ) {
      let query = firestore
        .collectionGroup('taskDeletionJobs')
        .where('status', '==', status)
        .orderBy(FieldPath.documentId())
        .limit(TASK_DELETION_PAGE_SIZE)
      if (last) query = query.startAfter(last)
      const page = await query.get()
      if (page.empty) break

      for (const document of page.docs) {
        last = document
        const path = parseJobPath(document.ref.path)
        if (!path) {
          logger.error('Invalid Task deletion job path during reconciliation.', {
            operation: 'reconciliation',
          })
          continue
        }
        await claimTaskDeletionJob(firestore, path.uid, path.jobId)
        if (
          Date.now() - startedAt >=
          TASK_DELETION_CONFIG.maxWorkerExecutionMs
        ) {
          return
        }
      }
      if (page.size < TASK_DELETION_PAGE_SIZE) break
    }
  }
}

export const dispatchTaskDeletionJob = onDocumentWritten(
  {
    document: 'users/{uid}/taskDeletionJobs/{jobId}',
    timeoutSeconds: TASK_DELETION_CONFIG.functionTimeoutSeconds,
  },
  async (event) => {
    const { uid, jobId } = event.params
    const snapshot = event.data?.after
    if (!snapshot?.exists) return

    const parsedPath = parseJobPath(snapshot.ref.path)
    if (!parsedPath || parsedPath.uid !== uid || parsedPath.jobId !== jobId) {
      logger.error('Task deletion trigger path is invalid.', {
        operation: 'trigger',
      })
      return
    }

    await dispatchTaskDeletionWrite(
      getFirestore(getAdminApp()),
      uid,
      jobId,
      event.data?.before.exists ? event.data.before.data() : undefined,
      snapshot.data(),
      !event.data?.before.exists,
    )
  },
)

export const reconcileTaskDeletionJobsSchedule = onSchedule(
  {
    schedule: TASK_DELETION_CONFIG.reconciliationSchedule,
    timeoutSeconds: TASK_DELETION_CONFIG.functionTimeoutSeconds,
  },
  async () => {
    await reconcileTaskDeletionJobs(getFirestore(getAdminApp()))
  },
)

import { Timestamp } from 'firebase-admin/firestore'

export const JOB_STATUSES = [
  'queued',
  'running',
  'retryable',
  'failed',
  'completed',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export const MAX_JOB_ATTEMPTS = 10

export const COURSE_DELETION_PHASES = [
  'deleteLessons',
  'deleteMaterials',
  'deleteTasks',
  'deleteEvents',
  'deletePlannerBlocks',
  'clearFocusSessionReferences',
  'verify',
  'complete',
] as const

export type CourseDeletionPhase = (typeof COURSE_DELETION_PHASES)[number]

export const TASK_DELETION_PHASES = [
  'clearPlannerBlockReferences',
  'clearFocusSessionReferences',
  'verify',
  'complete',
] as const

export type TaskDeletionPhase = (typeof TASK_DELETION_PHASES)[number]

export const MIGRATION_PHASES = [
  'validate',
  'import',
  'verify',
  'complete',
] as const

export type MigrationPhase = (typeof MIGRATION_PHASES)[number]

export type DeletionStatus = 'active' | 'deleting'

export interface CourseLifecycleMetadata {
  schemaVersion: 2
  deletionStatus: DeletionStatus
  deletionJobId: string | null
  deletionStartedAt: Timestamp | null
}

export interface TaskLifecycleMetadata {
  schemaVersion: 2
  deletionStatus: DeletionStatus
  deletionJobId: string | null
  deletionStartedAt: Timestamp | null
}

export type LeaseMetadata =
  | {
      leaseId: null
      leaseExpiresAt: null
      heartbeatAt: null
    }
  | {
      leaseId: string
      leaseExpiresAt: Timestamp
      heartbeatAt: Timestamp
    }

export interface SanitizedJobError {
  code: string
  message: string
}

export interface CourseDeletionTaskIdManifestEntry {
  createdAt: Timestamp
}

interface JobCommonFields {
  jobSchemaVersion: 1
  attempts: number
  createdAt: Timestamp
  updatedAt: Timestamp
  sanitizedError?: SanitizedJobError
}

type IncompleteJobFields<Phase extends string> =
  | {
      status: 'running'
      phase: Exclude<Phase, 'complete'>
      leaseId: string
      leaseExpiresAt: Timestamp
      heartbeatAt: Timestamp
      cursor: string | null
      completedAt?: never
    }
  | {
      status: 'retryable'
      phase: Exclude<Phase, 'complete'>
      leaseId: null
      leaseExpiresAt: null
      heartbeatAt: null
      cursor: string | null
      completedAt?: never
    }
  | {
      status: 'queued' | 'failed'
      phase: Exclude<Phase, 'complete'>
      cursor: string | null
      completedAt?: never
    }
    & LeaseMetadata

type CompletedJobFields<CourseCompletion extends boolean> =
  CourseCompletion extends true
    ? {
        status: 'completed'
        phase: 'complete'
        leaseId: null
        leaseExpiresAt: null
        heartbeatAt: null
        cursor: null
        completedAt?: Timestamp
      }
    : {
        status: 'completed'
        phase: 'complete'
        cursor: string | null
        completedAt?: Timestamp
      } & LeaseMetadata

type JobFields<Phase extends string, CourseCompletion extends boolean> =
  | IncompleteJobFields<Phase>
  | CompletedJobFields<CourseCompletion>

export type CourseDeletionJob = JobCommonFields &
  JobFields<CourseDeletionPhase, true> & {
    jobSchemaVersion: 1
    courseId: string
  }

export type TaskDeletionJob = JobCommonFields &
  JobFields<TaskDeletionPhase, false> & {
    jobSchemaVersion: 1
    taskId: string
  }

export type MigrationJob = JobCommonFields &
  JobFields<MigrationPhase, false> & {
    jobSchemaVersion: 1
    sourceTimeZoneId: string
  }

type UnknownRecord = Record<string, unknown>

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return false
  }

  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') {
      return false
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor !== undefined && 'value' in descriptor
  })
}

function hasExactKeys(
  value: UnknownRecord,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): boolean {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys])
  const keys = Reflect.ownKeys(value)

  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => typeof key === 'string' && allowedKeys.has(key))
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isJobStatus(value: unknown): value is JobStatus {
  return (
    typeof value === 'string' &&
    JOB_STATUSES.some((status) => status === value)
  )
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    typeof value === 'number' &&
    value >= 0 &&
    value <= MAX_JOB_ATTEMPTS
  )
}

function isTimestamp(value: unknown): value is Timestamp {
  return value instanceof Timestamp
}

function isNullableTimestamp(value: unknown): value is Timestamp | null {
  return value === null || isTimestamp(value)
}

function hasConsistentLeaseMetadata(value: UnknownRecord): boolean {
  const allNull =
    value.leaseId === null &&
    value.leaseExpiresAt === null &&
    value.heartbeatAt === null
  if (allNull) {
    return true
  }

  return (
    isNonEmptyString(value.leaseId) &&
    isTimestamp(value.leaseExpiresAt) &&
    isTimestamp(value.heartbeatAt)
  )
}

function isSanitizedJobError(value: unknown): value is SanitizedJobError {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['code', 'message'])
  ) {
    return false
  }

  return typeof value.code === 'string' && typeof value.message === 'string'
}

function isLifecycleMetadata(
  value: unknown,
): value is CourseLifecycleMetadata {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'deletionStatus',
      'deletionJobId',
      'deletionStartedAt',
    ])
  ) {
    return false
  }

  if (
    value.schemaVersion !== 2 ||
    (value.deletionStatus !== 'active' &&
      value.deletionStatus !== 'deleting') ||
    (value.deletionJobId !== null &&
      typeof value.deletionJobId !== 'string') ||
    !isNullableTimestamp(value.deletionStartedAt)
  ) {
    return false
  }

  if (value.deletionStatus === 'active') {
    return value.deletionJobId === null && value.deletionStartedAt === null
  }

  return (
    isNonEmptyString(value.deletionJobId) &&
    isTimestamp(value.deletionStartedAt)
  )
}

function isPhase(value: unknown, phases: readonly string[]): value is string {
  return typeof value === 'string' && phases.includes(value)
}

function isJobRecord(
  value: unknown,
  targetKey: 'courseId' | 'taskId' | 'sourceTimeZoneId',
  phases: readonly string[],
): boolean {
  const requiredKeys = [
    'jobSchemaVersion',
    'status',
    'phase',
    'attempts',
    'leaseId',
    'leaseExpiresAt',
    'heartbeatAt',
    'cursor',
    'createdAt',
    'updatedAt',
    targetKey,
  ]
  const optionalKeys = ['completedAt', 'sanitizedError']

  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, requiredKeys, optionalKeys)
  ) {
    return false
  }

  if (
    value.jobSchemaVersion !== 1 ||
    !isJobStatus(value.status) ||
    !isPhase(value.phase, phases) ||
    !isNonNegativeSafeInteger(value.attempts) ||
    !hasConsistentLeaseMetadata(value) ||
    (value.cursor !== null && typeof value.cursor !== 'string') ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    !isNonEmptyString(value[targetKey])
  ) {
    return false
  }

  if (
    Object.hasOwn(value, 'sanitizedError') &&
    !isSanitizedJobError(value.sanitizedError)
  ) {
    return false
  }

  const isCompleted = value.status === 'completed'
  if (isCompleted !== isPhase(value.phase, ['complete'])) {
    return false
  }

  if (isCompleted) {
    if (
      Object.hasOwn(value, 'completedAt') &&
      !isTimestamp(value.completedAt)
    ) {
      return false
    }

    if (
      targetKey === 'courseId' &&
      (value.leaseId !== null ||
        value.leaseExpiresAt !== null ||
        value.heartbeatAt !== null ||
        value.cursor !== null)
    ) {
      return false
    }
  } else if (Object.hasOwn(value, 'completedAt')) {
    return false
  }

  if (value.status === 'running') {
    return (
      isNonEmptyString(value.leaseId) &&
      isTimestamp(value.leaseExpiresAt) &&
      isTimestamp(value.heartbeatAt)
    )
  }

  if (value.status === 'retryable') {
    return (
      value.leaseId === null &&
      value.leaseExpiresAt === null &&
      value.heartbeatAt === null
    )
  }

  return true
}

function isIanaTimeZoneIdentifier(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch (error) {
    if (error instanceof RangeError) {
      return false
    }

    throw error
  }
}

export function isCourseLifecycleMetadata(
  value: unknown,
): value is CourseLifecycleMetadata {
  return isLifecycleMetadata(value)
}

export function isTaskLifecycleMetadata(
  value: unknown,
): value is TaskLifecycleMetadata {
  return isLifecycleMetadata(value)
}

export function isCourseDeletionTaskIdManifestEntry(
  value: unknown,
): value is CourseDeletionTaskIdManifestEntry {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ['createdAt']) &&
    isTimestamp(value.createdAt)
  )
}

export function isCourseDeletionJob(
  value: unknown,
): value is CourseDeletionJob {
  return isJobRecord(
    value,
    'courseId',
    COURSE_DELETION_PHASES,
  )
}

export function isTaskDeletionJob(
  value: unknown,
): value is TaskDeletionJob {
  return isJobRecord(value, 'taskId', TASK_DELETION_PHASES)
}

export function isMigrationJob(value: unknown): value is MigrationJob {
  return (
    isJobRecord(value, 'sourceTimeZoneId', MIGRATION_PHASES) &&
    isPlainRecord(value) &&
    isIanaTimeZoneIdentifier(value.sourceTimeZoneId)
  )
}

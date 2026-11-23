import { MAX_JOB_ATTEMPTS } from './job-models.js'

export const COURSE_DELETION_CONFIG = Object.freeze({
  maxWritesPerBatch: 200,
  maxTaskIdsPerInQuery: 30,
  maxWorkerExecutionMs: 90_000,
  functionTimeoutSeconds: 120,
  heartbeatIntervalMs: 60_000,
  leaseDurationMs: 5 * 60_000,
  maxAttempts: MAX_JOB_ATTEMPTS,
  retryBaseSeconds: 5,
  maxBackoffSeconds: 60 * 60,
  reconciliationSchedule: 'every 5 minutes',
})

export const COURSE_DELETION_PAGE_SIZE =
  COURSE_DELETION_CONFIG.maxWritesPerBatch - 1

export const TASK_DELETION_CONFIG = COURSE_DELETION_CONFIG
export const TASK_DELETION_PAGE_SIZE = COURSE_DELETION_PAGE_SIZE

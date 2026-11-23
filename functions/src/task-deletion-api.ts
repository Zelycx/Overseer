import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Firestore,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from 'firebase-functions/v2/https'
import { getAdminApp } from './admin.js'
import {
  isCourseDeletionJob,
  isCourseLifecycleMetadata,
  isTaskDeletionJob,
  isTaskLifecycleMetadata,
  type JobStatus,
  type TaskDeletionJob,
} from './job-models.js'

interface TaskDeletionRequestResponse {
  jobId: string
  status: JobStatus
}

interface TaskDeletionStatusResponse extends TaskDeletionRequestResponse {
  taskId: string
  phase: TaskDeletionJob['phase']
  completed: boolean
}

type RecordData = Record<string, unknown>

function isRecord(value: unknown): value is RecordData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  )
}

function requireAuthenticatedUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpsError('unauthenticated', 'Authentication is required.')
  }
  return uid
}

function isFirestoreDocumentId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !value.includes('/')
  )
}

function parseDocumentId(data: unknown, key: 'taskId' | 'jobId'): string {
  if (!isRecord(data)) {
    throw new HttpsError('invalid-argument', `Expected { ${key}: string }.`)
  }

  const keys = Reflect.ownKeys(data)
  const descriptor = Object.getOwnPropertyDescriptor(data, key)
  if (
    keys.length !== 1 ||
    keys[0] !== key ||
    descriptor === undefined ||
    !('value' in descriptor) ||
    !isFirestoreDocumentId(descriptor.value)
  ) {
    throw new HttpsError('invalid-argument', `Expected { ${key}: string }.`)
  }

  return descriptor.value
}

function lifecycleMetadata(data: RecordData): RecordData {
  return {
    schemaVersion: data.schemaVersion,
    deletionStatus: data.deletionStatus,
    deletionJobId: data.deletionJobId,
    deletionStartedAt: data.deletionStartedAt,
  }
}

function failClosed(reason: string): never {
  logger.error('Task deletion invariant violation', { reason })
  throw new HttpsError('failed-precondition', 'Task deletion state is invalid.')
}

function errorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (typeof error.code === 'string' || typeof error.code === 'number')
  ) {
    return String(error.code)
  }
  return 'unknown'
}

async function withSanitizedErrors<T>(
  operation: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error('Task deletion callable failed', {
      operation,
      errorCode: errorCode(error),
    })
    throw new HttpsError(
      'internal',
      'Unable to process the Task deletion operation.',
    )
  }
}

function requireTaskRecord(value: unknown): RecordData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !(value.createdAt instanceof Timestamp) ||
    !(value.updatedAt instanceof Timestamp) ||
    !isTaskLifecycleMetadata(lifecycleMetadata(value))
  ) {
    return failClosed('invalid_task_lifecycle')
  }
  return value
}

function taskParentCourseId(task: RecordData): string | null {
  if (task.courseId === null) return null
  if (!isFirestoreDocumentId(task.courseId)) {
    return failClosed('invalid_task_course_reference')
  }
  return task.courseId
}

export function createTaskDeletionApi(firestore: Firestore) {
  return {
    requestTaskDeletion(
      request: CallableRequest<unknown>,
    ): Promise<TaskDeletionRequestResponse> {
      return withSanitizedErrors('requestTaskDeletion', async () => {
        const uid = requireAuthenticatedUid(request)
        const taskId = parseDocumentId(request.data, 'taskId')
        const userRef = firestore.collection('users').doc(uid)
        const taskRef = userRef.collection('tasks').doc(taskId)
        const taskJobsRef = userRef.collection('taskDeletionJobs')
        const courseJobsRef = userRef.collection('courseDeletionJobs')
        const newTaskJobRef = taskJobsRef.doc()

        return firestore.runTransaction(async (transaction) => {
          const taskSnapshot = await transaction.get(taskRef)
          if (!taskSnapshot.exists) {
            throw new HttpsError('not-found', 'Task not found.')
          }

          const task = requireTaskRecord(taskSnapshot.data())
          const taskLifecycleValue = lifecycleMetadata(task)
          if (!isTaskLifecycleMetadata(taskLifecycleValue)) {
            return failClosed('invalid_task_lifecycle')
          }
          const taskLifecycle = taskLifecycleValue
          const parentCourseId = taskParentCourseId(task)

          let existingTaskJob:
            | { jobId: string; status: JobStatus }
            | undefined
          if (taskLifecycle.deletionStatus === 'deleting') {
            if (!isFirestoreDocumentId(taskLifecycle.deletionJobId)) {
              return failClosed('invalid_task_lifecycle')
            }
            const existingTaskJobRef = taskJobsRef.doc(
              taskLifecycle.deletionJobId,
            )
            const existingTaskJobSnapshot =
              await transaction.get(existingTaskJobRef)
            const job: unknown = existingTaskJobSnapshot.data()
            if (
              !existingTaskJobSnapshot.exists ||
              !isTaskDeletionJob(job) ||
              job.taskId !== taskId ||
              existingTaskJobRef.id !== taskLifecycle.deletionJobId ||
              job.status === 'completed'
            ) {
              return failClosed('invalid_existing_task_deletion_job')
            }
            existingTaskJob = {
              jobId: existingTaskJobRef.id,
              status: job.status,
            }
          }

          let parentCourseJob:
            | { jobId: string; status: JobStatus }
            | undefined
          if (parentCourseId !== null) {
            const courseRef = userRef.collection('courses').doc(parentCourseId)
            const courseSnapshot = await transaction.get(courseRef)
            const courseData: unknown = courseSnapshot.data()
            if (!courseSnapshot.exists || !isRecord(courseData)) {
              return failClosed('task_parent_course_missing')
            }

            const courseLifecycle = lifecycleMetadata(courseData)
            if (!isCourseLifecycleMetadata(courseLifecycle)) {
              return failClosed('invalid_parent_course_lifecycle')
            }

            if (courseLifecycle.deletionStatus === 'deleting') {
              if (!isFirestoreDocumentId(courseLifecycle.deletionJobId)) {
                return failClosed('invalid_parent_course_lifecycle')
              }
              const courseJobRef = courseJobsRef.doc(
                courseLifecycle.deletionJobId,
              )
              const courseJobSnapshot = await transaction.get(courseJobRef)
              const courseJob: unknown = courseJobSnapshot.data()
              if (
                !courseJobSnapshot.exists ||
                !isCourseDeletionJob(courseJob) ||
                courseJob.courseId !== parentCourseId ||
                courseJobRef.id !== courseLifecycle.deletionJobId ||
                courseJob.status === 'completed'
              ) {
                return failClosed('invalid_parent_course_deletion_job')
              }
              parentCourseJob = {
                jobId: courseJobRef.id,
                status: courseJob.status,
              }
            }
          }

          if (parentCourseJob !== undefined) return parentCourseJob
          if (existingTaskJob !== undefined) return existingTaskJob

          const generatedJobSnapshot = await transaction.get(newTaskJobRef)
          if (generatedJobSnapshot.exists) {
            return failClosed('generated_task_job_id_collision')
          }

          const serverTimestamp = FieldValue.serverTimestamp()
          const job = {
            jobSchemaVersion: 1,
            status: 'queued',
            phase: 'clearPlannerBlockReferences',
            attempts: 0,
            leaseId: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            cursor: null,
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp,
            taskId,
          }

          transaction.update(taskRef, {
            deletionStatus: 'deleting',
            deletionJobId: newTaskJobRef.id,
            deletionStartedAt: serverTimestamp,
            updatedAt: serverTimestamp,
          })
          transaction.create(newTaskJobRef, job)

          return { jobId: newTaskJobRef.id, status: 'queued' }
        })
      })
    },

    getTaskDeletionStatus(
      request: CallableRequest<unknown>,
    ): Promise<TaskDeletionStatusResponse> {
      return withSanitizedErrors('getTaskDeletionStatus', async () => {
        const uid = requireAuthenticatedUid(request)
        const jobId = parseDocumentId(request.data, 'jobId')
        const userRef = firestore.collection('users').doc(uid)
        const jobRef = userRef.collection('taskDeletionJobs').doc(jobId)

        return firestore.runTransaction(async (transaction) => {
          const jobSnapshot = await transaction.get(jobRef)
          const job: unknown = jobSnapshot.data()
          if (!jobSnapshot.exists) {
            throw new HttpsError('not-found', 'Task deletion operation not found.')
          }
          if (
            !isTaskDeletionJob(job) ||
            jobRef.id !== jobId ||
            !isFirestoreDocumentId(job.taskId)
          ) {
            return failClosed('invalid_task_deletion_job')
          }

          const taskRef = userRef.collection('tasks').doc(job.taskId)
          const taskSnapshot = await transaction.get(taskRef)
          if (job.status === 'completed') {
            if (taskSnapshot.exists) {
              return failClosed('invalid_completed_task_deletion_evidence')
            }
            return {
              jobId,
              taskId: job.taskId,
              status: job.status,
              phase: job.phase,
              completed: true,
            }
          }

          if (!taskSnapshot.exists) {
            return failClosed('task_job_lifecycle_mismatch')
          }
          const task = requireTaskRecord(taskSnapshot.data())
          const lifecycle = lifecycleMetadata(task)
          if (
            !isTaskLifecycleMetadata(lifecycle) ||
            lifecycle.deletionStatus !== 'deleting' ||
            lifecycle.deletionJobId !== jobId
          ) {
            return failClosed('task_job_lifecycle_mismatch')
          }

          return {
            jobId,
            taskId: job.taskId,
            status: job.status,
            phase: job.phase,
            completed: false,
          }
        })
      })
    },
  }
}

export const requestTaskDeletion = onCall((request) =>
  createTaskDeletionApi(getFirestore(getAdminApp())).requestTaskDeletion(
    request,
  ),
)

export const getTaskDeletionStatus = onCall((request) =>
  createTaskDeletionApi(getFirestore(getAdminApp())).getTaskDeletionStatus(
    request,
  ),
)

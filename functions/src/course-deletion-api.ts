import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore'
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
  type CourseDeletionJob,
  type JobStatus,
} from './job-models.js'

interface DeletionRequestResponse {
  jobId: string
  status: JobStatus
}

interface DeletionStatusResponse extends DeletionRequestResponse {
  courseId: string
  phase: CourseDeletionJob['phase']
  completed: boolean
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

function parseDocumentId(data: unknown, key: 'courseId' | 'jobId'): string {
  if (
    typeof data !== 'object' ||
    data === null ||
    Array.isArray(data) ||
    (Object.getPrototypeOf(data) !== Object.prototype &&
      Object.getPrototypeOf(data) !== null)
  ) {
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

function lifecycleMetadata(
  course: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schemaVersion: course.schemaVersion,
    deletionStatus: course.deletionStatus,
    deletionJobId: course.deletionJobId,
    deletionStartedAt: course.deletionStartedAt,
  }
}

function failClosed(reason: string): never {
  logger.error('Course deletion invariant violation', { reason })
  throw new HttpsError(
    'failed-precondition',
    'Course deletion state is invalid.',
  )
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

    logger.error('Course deletion callable failed', {
      operation,
      errorCode: errorCode(error),
    })
    throw new HttpsError(
      'internal',
      'Unable to process the Course deletion operation.',
    )
  }
}

export function createCourseDeletionApi(firestore: Firestore) {
  return {
    requestCourseDeletion(
      request: CallableRequest<unknown>,
    ): Promise<DeletionRequestResponse> {
      return withSanitizedErrors('requestCourseDeletion', async () => {
        const uid = requireAuthenticatedUid(request)
        const courseId = parseDocumentId(request.data, 'courseId')
        const userRef = firestore.collection('users').doc(uid)
        const courseRef = userRef.collection('courses').doc(courseId)
        const jobsRef = userRef.collection('courseDeletionJobs')
        const newJobRef = jobsRef.doc()

        return firestore.runTransaction(async (transaction) => {
          const courseSnapshot = await transaction.get(courseRef)
          if (!courseSnapshot.exists) {
            throw new HttpsError('not-found', 'Course not found.')
          }

          const course = courseSnapshot.data()
          if (course === undefined) {
            return failClosed('invalid_course_lifecycle')
          }

          const lifecycle = lifecycleMetadata(course)
          if (!isCourseLifecycleMetadata(lifecycle)) {
            return failClosed('invalid_course_lifecycle')
          }

          if (lifecycle.deletionStatus === 'deleting') {
            if (!isFirestoreDocumentId(lifecycle.deletionJobId)) {
              return failClosed('invalid_course_lifecycle')
            }
            const existingJobRef = jobsRef.doc(lifecycle.deletionJobId)
            const existingJobSnapshot = await transaction.get(existingJobRef)
            const existingJob: unknown = existingJobSnapshot.data()
            if (
              !existingJobSnapshot.exists ||
              !isCourseDeletionJob(existingJob) ||
              existingJob.courseId !== courseId ||
              existingJobRef.id !== lifecycle.deletionJobId ||
              existingJob.status === 'completed'
            ) {
              return failClosed('invalid_existing_deletion_job')
            }

            return {
              jobId: existingJobRef.id,
              status: existingJob.status,
            }
          }

          const generatedJobSnapshot = await transaction.get(newJobRef)
          if (generatedJobSnapshot.exists) {
            return failClosed('generated_job_id_collision')
          }

          const serverTimestamp = FieldValue.serverTimestamp()
          const job = {
            jobSchemaVersion: 1,
            status: 'queued',
            phase: 'deleteLessons',
            attempts: 0,
            leaseId: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            cursor: null,
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp,
            courseId,
          }

          transaction.update(courseRef, {
            deletionStatus: 'deleting',
            deletionJobId: newJobRef.id,
            deletionStartedAt: serverTimestamp,
            updatedAt: serverTimestamp,
          })
          transaction.create(newJobRef, job)

          return { jobId: newJobRef.id, status: 'queued' }
        })
      })
    },

    getCourseDeletionStatus(
      request: CallableRequest<unknown>,
    ): Promise<DeletionStatusResponse> {
      return withSanitizedErrors('getCourseDeletionStatus', async () => {
        const uid = requireAuthenticatedUid(request)
        const jobId = parseDocumentId(request.data, 'jobId')
        const jobsRef = firestore
          .collection('users')
          .doc(uid)
          .collection('courseDeletionJobs')
        const jobRef = jobsRef.doc(jobId)

        return firestore.runTransaction(async (transaction) => {
          const jobSnapshot = await transaction.get(jobRef)
          const job: unknown = jobSnapshot.data()
          if (!jobSnapshot.exists) {
            throw new HttpsError(
              'not-found',
              'Course deletion operation not found.',
            )
          }
          if (
            !isCourseDeletionJob(job) ||
            jobRef.id !== jobId ||
            !isFirestoreDocumentId(job.courseId)
          ) {
            return failClosed('invalid_course_deletion_job')
          }

          const courseRef = firestore
            .collection('users')
            .doc(uid)
            .collection('courses')
            .doc(job.courseId)
          const courseSnapshot = await transaction.get(courseRef)

          if (job.status === 'completed') {
            if (courseSnapshot.exists) {
              return failClosed('invalid_completed_deletion_evidence')
            }

            return {
              jobId,
              courseId: job.courseId,
              status: job.status,
              phase: job.phase,
              completed: true,
            }
          }

          const course = courseSnapshot.data()
          if (!courseSnapshot.exists || course === undefined) {
            return failClosed('course_job_lifecycle_mismatch')
          }
          const lifecycle = lifecycleMetadata(course)
          if (
            !isCourseLifecycleMetadata(lifecycle) ||
            lifecycle.deletionStatus !== 'deleting' ||
            lifecycle.deletionJobId !== jobId
          ) {
            return failClosed('course_job_lifecycle_mismatch')
          }

          return {
            jobId,
            courseId: job.courseId,
            status: job.status,
            phase: job.phase,
            completed: false,
          }
        })
      })
    },
  }
}

export const requestCourseDeletion = onCall((request) =>
  createCourseDeletionApi(getFirestore(getAdminApp())).requestCourseDeletion(
    request,
  ),
)

export const getCourseDeletionStatus = onCall((request) =>
  createCourseDeletionApi(getFirestore(getAdminApp())).getCourseDeletionStatus(
    request,
  ),
)

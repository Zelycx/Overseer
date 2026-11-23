import type { DocumentSnapshot } from 'firebase/firestore'
import {
  FIRESTORE_SCHEMA_VERSION,
  isActiveFocusTimerDocument,
  isAssistantConversationDocument,
  isAssistantMessageDocument,
  isCourseDocument,
  isFocusSessionDocument,
  isLessonDocument,
  isPlannerBlockDocument,
  isRecord,
  isScheduleEventDocument,
  isStudyMaterialDocument,
  isTaskDocument,
  isTimerPreferencesDocument,
  isUserPreferencesDocument,
  isUserProfileDocument,
  type ActiveFocusTimer,
  type AssistantConversation,
  type AssistantMessage,
  type Course,
  type FocusSession,
  type Lesson,
  type PlannerBlock,
  type ScheduleEvent,
  type StudyMaterial,
  type Task,
  type TimerPreferences,
  type UserPreferences,
  type UserProfile,
} from './models'

export type FirestoreDocument<T extends { id: string }> = Omit<T, 'id'>

const metadataFields = ['schemaVersion', 'createdAt', 'updatedAt'] as const
const profileFields = [...metadataFields, 'displayName'] as const
const courseFields = [...metadataFields, 'name', 'code', 'description', 'instructor', 'tint', 'sortOrder', 'deletionStatus', 'deletionJobId', 'deletionStartedAt'] as const
const lessonFields = [...metadataFields, 'courseId', 'title', 'description', 'content', 'completed', 'sortOrder'] as const
const materialFields = [...metadataFields, 'title', 'content', 'fileName', 'courseId', 'sortOrder'] as const
const taskFields = [...metadataFields, 'title', 'description', 'dueAt', 'dueDate', 'timeZoneId', 'priority', 'courseId', 'completed', 'completedAt', 'sortOrder', 'deletionStatus', 'deletionJobId', 'deletionStartedAt'] as const
const eventFields = [...metadataFields, 'title', 'description', 'startAt', 'endAt', 'timeZoneId', 'type', 'courseId', 'location', 'color', 'startTimeDisambiguation', 'endTimeDisambiguation'] as const
const plannerBlockFields = [...metadataFields, 'title', 'startAt', 'endAt', 'timeZoneId', 'taskId', 'courseId', 'completed', 'sortOrder'] as const
const focusSessionFields = [...metadataFields, 'mode', 'startedAt', 'endedAt', 'durationSeconds', 'courseId', 'taskId', 'completed'] as const
const preferencesFields = [...metadataFields, 'displayName', 'timeFormat', 'firstDayOfWeek', 'timeZoneId', 'aiWorkspaceContextConsent', 'consentedAt', 'revokedAt', 'consentVersion'] as const
const timerPreferencesFields = [...metadataFields, 'focusDurationSeconds', 'shortBreakDurationSeconds', 'longBreakDurationSeconds'] as const
const activeTimerFields = [...metadataFields, 'status', 'mode', 'durationSeconds', 'remainingSeconds', 'elapsedSeconds', 'generation', 'writeGeneration', 'startedAt', 'segmentStartedAt', 'endsAt', 'courseId', 'taskId', 'runId'] as const
const conversationFields = [...metadataFields, 'title'] as const
const messageFields = [...metadataFields, 'role', 'content'] as const

function pickFields(value: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, value[field]]))
}

function decode<T extends { id: string }>(
  documentId: string,
  rawData: unknown,
  isValidDocument: (value: unknown) => boolean,
  fields: readonly string[],
  documentType: string,
  schemaVersion: 1 | 2 = FIRESTORE_SCHEMA_VERSION,
): T {
  if (!documentId.trim()) throw new Error(`Cannot decode ${documentType}: Firestore document ID is empty.`)
  if (!isRecord(rawData) || !isValidDocument(rawData)) {
    throw new Error(`Cannot decode ${documentType} document "${documentId}": Firestore data does not match schema version ${schemaVersion}.`)
  }
  return { id: documentId, ...pickFields(rawData, fields) } as T
}

function encode<T extends { id: string }>(
  model: T,
  isValidDocument: (value: unknown) => boolean,
  fields: readonly string[],
  documentType: string,
  schemaVersion: 1 | 2 = FIRESTORE_SCHEMA_VERSION,
): FirestoreDocument<T> {
  if (!isRecord(model) || typeof model.id !== 'string' || !model.id.trim()) {
    throw new Error(`Cannot encode ${documentType}: application model has no valid document ID.`)
  }
  const documentData = pickFields(model, fields)
  if (!isValidDocument(documentData)) {
    throw new Error(`Cannot encode ${documentType} document "${model.id}": application model does not match schema version ${schemaVersion}.`)
  }
  // `id` deliberately comes from the destination document path, never document data.
  return documentData as FirestoreDocument<T>
}

export type SnapshotLike = Pick<DocumentSnapshot, 'id' | 'data'>

export function decodeSnapshot<T>(
  snapshot: SnapshotLike,
  decoder: (documentId: string, rawData: unknown) => T,
): T {
  const data = snapshot.data()
  if (data === undefined) throw new Error(`Cannot decode missing Firestore document "${snapshot.id}".`)
  return decoder(snapshot.id, data)
}

export const decodeUserProfile = (id: string, data: unknown) => decode<UserProfile>(id, data, isUserProfileDocument, profileFields, 'user profile')
export const encodeUserProfile = (model: UserProfile) => encode(model, isUserProfileDocument, profileFields, 'user profile')

export const decodeCourse = (id: string, data: unknown) => decode<Course>(id, data, isCourseDocument, courseFields, 'course', 2)
export const encodeCourse = (model: Course) => encode(model, isCourseDocument, courseFields, 'course', 2)

export const decodeLesson = (id: string, data: unknown) => decode<Lesson>(id, data, isLessonDocument, lessonFields, 'lesson')
export const encodeLesson = (model: Lesson) => encode(model, isLessonDocument, lessonFields, 'lesson')

export const decodeStudyMaterial = (id: string, data: unknown) => decode<StudyMaterial>(id, data, isStudyMaterialDocument, materialFields, 'study material')
export const encodeStudyMaterial = (model: StudyMaterial) => encode(model, isStudyMaterialDocument, materialFields, 'study material')

export const decodeTask = (id: string, data: unknown) => decode<Task>(id, data, isTaskDocument, taskFields, 'task', 2)
export const encodeTask = (model: Task) => encode(model, isTaskDocument, taskFields, 'task', 2)

export const decodeScheduleEvent = (id: string, data: unknown) => decode<ScheduleEvent>(id, data, isScheduleEventDocument, eventFields, 'schedule event')
export const encodeScheduleEvent = (model: ScheduleEvent) => encode(model, isScheduleEventDocument, eventFields, 'schedule event')

export const decodePlannerBlock = (id: string, data: unknown) => decode<PlannerBlock>(id, data, isPlannerBlockDocument, plannerBlockFields, 'planner block')
export const encodePlannerBlock = (model: PlannerBlock) => encode(model, isPlannerBlockDocument, plannerBlockFields, 'planner block')

export const decodeFocusSession = (id: string, data: unknown) => decode<FocusSession>(id, data, isFocusSessionDocument, focusSessionFields, 'focus session')
export const encodeFocusSession = (model: FocusSession) => encode(model, isFocusSessionDocument, focusSessionFields, 'focus session')

export const decodeUserPreferences = (id: string, data: unknown) => decode<UserPreferences>(id, data, isUserPreferencesDocument, preferencesFields, 'user preferences')
export const encodeUserPreferences = (model: UserPreferences) => encode(model, isUserPreferencesDocument, preferencesFields, 'user preferences')

export const decodeTimerPreferences = (id: string, data: unknown) => decode<TimerPreferences>(id, data, isTimerPreferencesDocument, timerPreferencesFields, 'timer preferences')
export const encodeTimerPreferences = (model: TimerPreferences) => encode(model, isTimerPreferencesDocument, timerPreferencesFields, 'timer preferences')

export const decodeActiveFocusTimer = (id: string, data: unknown) => decode<ActiveFocusTimer>(id, data, isActiveFocusTimerDocument, activeTimerFields, 'active focus timer')
export const encodeActiveFocusTimer = (model: ActiveFocusTimer) => encode(model, isActiveFocusTimerDocument, activeTimerFields, 'active focus timer')

export const decodeAssistantConversation = (id: string, data: unknown) => decode<AssistantConversation>(id, data, isAssistantConversationDocument, conversationFields, 'assistant conversation')
export const encodeAssistantConversation = (model: AssistantConversation) => encode(model, isAssistantConversationDocument, conversationFields, 'assistant conversation')

export const decodeAssistantMessage = (id: string, data: unknown) => decode<AssistantMessage>(id, data, isAssistantMessageDocument, messageFields, 'assistant message')
export const encodeAssistantMessage = (model: AssistantMessage) => encode(model, isAssistantMessageDocument, messageFields, 'assistant message')

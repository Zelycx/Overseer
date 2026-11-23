import { Timestamp } from 'firebase/firestore'

export const FIRESTORE_SCHEMA_VERSION = 1 as const
export const DEFAULT_AI_WORKSPACE_CONTEXT_CONSENT = false as const

export type Priority = 'Low' | 'Medium' | 'High'
export type CourseTint = 'lavender' | 'mint' | 'sand'
export type EventType = 'class' | 'study' | 'personal' | 'other'
export type EventColor = 'navy' | 'lime' | 'blue' | 'amber'
export type FocusMode = 'focus' | 'shortBreak' | 'longBreak'
export type TimerStatus = 'idle' | 'running' | 'paused'
export type AssistantRole = 'user' | 'assistant'
export type EndpointDisambiguation = 'earlier' | 'later'
export type DeletionStatus = 'active' | 'deleting'

export interface FirestoreDocumentMetadata {
  schemaVersion: typeof FIRESTORE_SCHEMA_VERSION
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface FirestoreModel extends FirestoreDocumentMetadata {
  /** Authoritative Firestore document ID; never stored as a document field. */
  id: string
}

interface FirestoreModelV2 extends Omit<FirestoreModel, 'schemaVersion'> {
  schemaVersion: 2
}

export interface UserProfile extends FirestoreModel {
  displayName: string
}

export interface Course extends FirestoreModelV2 {
  name: string
  code: string
  description: string
  instructor: string
  tint: CourseTint
  sortOrder: number
  deletionStatus: DeletionStatus
  deletionJobId: string | null
  deletionStartedAt: Timestamp | null
}

export interface Lesson extends FirestoreModel {
  courseId: string
  title: string
  description: string
  content: string
  completed: boolean
  sortOrder: number
}

export interface StudyMaterial extends FirestoreModel {
  title: string
  content: string
  fileName: string
  courseId: string | null
  sortOrder: number
}

export interface Task extends FirestoreModelV2 {
  title: string
  description: string
  dueAt: Timestamp | null
  dueDate: string | null
  timeZoneId: string | null
  priority: Priority
  courseId: string | null
  completed: boolean
  completedAt: Timestamp | null
  sortOrder: number
  deletionStatus: DeletionStatus
  deletionJobId: string | null
  deletionStartedAt: Timestamp | null
}

/**
 * `startAt` and `endAt` are authoritative instants. Disambiguation metadata
 * records the user's choice when resolving each endpoint's local wall time;
 * decoders must never recalculate either Timestamp from these fields.
 */
export interface ScheduleEvent extends FirestoreModel {
  title: string
  description: string
  startAt: Timestamp
  endAt: Timestamp
  timeZoneId: string
  type: EventType
  courseId: string | null
  location: string
  color: EventColor
  startTimeDisambiguation: EndpointDisambiguation | null
  endTimeDisambiguation: EndpointDisambiguation | null
}

export interface PlannerBlock extends FirestoreModel {
  title: string
  startAt: Timestamp
  endAt: Timestamp
  timeZoneId: string
  taskId: string | null
  courseId: string | null
  completed: boolean
  sortOrder: number
}

export interface FocusSession extends FirestoreModel {
  mode: FocusMode
  startedAt: Timestamp
  endedAt: Timestamp
  durationSeconds: number
  courseId: string | null
  taskId: string | null
  completed: true
}

export interface UserPreferences extends FirestoreModel {
  displayName: string
  timeFormat: '12h' | '24h'
  firstDayOfWeek: 0 | 1
  timeZoneId: string
  aiWorkspaceContextConsent: boolean
  consentedAt: Timestamp | null
  revokedAt: Timestamp | null
  consentVersion: string | null
}

export interface TimerPreferences extends FirestoreModel {
  focusDurationSeconds: number
  shortBreakDurationSeconds: number
  longBreakDurationSeconds: number
}

export interface ActiveFocusTimer extends FirestoreModel {
  status: TimerStatus
  mode: FocusMode
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

export interface AssistantConversation extends FirestoreModel {
  title: string
}

export interface AssistantMessage extends FirestoreModel {
  role: AssistantRole
  content: string
}

type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isFirestoreTimestamp(value: unknown): value is Timestamp {
  if (!(value instanceof Timestamp)) return false
  return Number.isInteger(value.seconds)
    && Number.isInteger(value.nanoseconds)
    && value.nanoseconds >= 0
    && value.nanoseconds < 1_000_000_000
    && Number.isFinite(value.toMillis())
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isTimestampOrNull(value: unknown): value is Timestamp | null {
  return value === null || isFirestoreTimestamp(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

export function hasFirestoreMetadata(value: unknown): value is UnknownRecord & FirestoreDocumentMetadata {
  return isRecord(value)
    && value.schemaVersion === FIRESTORE_SCHEMA_VERSION
    && isFirestoreTimestamp(value.createdAt)
    && isFirestoreTimestamp(value.updatedAt)
}

export function hasModelId(value: unknown): value is UnknownRecord & { id: string } {
  return isRecord(value) && isNonEmptyString(value.id)
}

function hasBaseDocument(value: unknown): value is UnknownRecord & FirestoreDocumentMetadata {
  return hasFirestoreMetadata(value)
}

function hasVersion2BaseDocument(
  value: unknown,
): value is UnknownRecord & Omit<FirestoreDocumentMetadata, 'schemaVersion'> & { schemaVersion: 2 } {
  return isRecord(value)
    && value.schemaVersion === 2
    && isFirestoreTimestamp(value.createdAt)
    && isFirestoreTimestamp(value.updatedAt)
}

function hasValidDeletionLifecycle(value: UnknownRecord): boolean {
  if (!Object.hasOwn(value, 'deletionStatus')
    || !Object.hasOwn(value, 'deletionJobId')
    || !Object.hasOwn(value, 'deletionStartedAt')) return false

  if (value.deletionStatus === 'active') {
    return value.deletionJobId === null && value.deletionStartedAt === null
  }
  if (value.deletionStatus === 'deleting') {
    return isNonEmptyString(value.deletionJobId) && isFirestoreTimestamp(value.deletionStartedAt)
  }
  return false
}

function isEnum(value: unknown, entries: readonly string[]): boolean {
  return typeof value === 'string' && entries.includes(value)
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= (monthDays[month - 1] ?? 0)
}

function timestampIsAfter(left: Timestamp, right: Timestamp): boolean {
  return left.seconds > right.seconds
    || (left.seconds === right.seconds && left.nanoseconds > right.nanoseconds)
}

export function isUserProfileDocument(value: unknown): value is Omit<UserProfile, 'id'> {
  return hasBaseDocument(value) && isString(value.displayName)
}

export function isCourseDocument(value: unknown): value is Omit<Course, 'id'> {
  return hasVersion2BaseDocument(value)
    && hasValidDeletionLifecycle(value)
    && isString(value.name)
    && isString(value.code)
    && isString(value.description)
    && isString(value.instructor)
    && isEnum(value.tint, ['lavender', 'mint', 'sand'])
    && isFiniteNumber(value.sortOrder)
}

export function isLessonDocument(value: unknown): value is Omit<Lesson, 'id'> {
  return hasBaseDocument(value)
    && isNonEmptyString(value.courseId)
    && isString(value.title)
    && isString(value.description)
    && isString(value.content)
    && typeof value.completed === 'boolean'
    && isFiniteNumber(value.sortOrder)
}

export function isStudyMaterialDocument(value: unknown): value is Omit<StudyMaterial, 'id'> {
  return hasBaseDocument(value)
    && isString(value.title)
    && isString(value.content)
    && isString(value.fileName)
    && isNullableString(value.courseId)
    && isFiniteNumber(value.sortOrder)
}

export function isTaskDocument(value: unknown): value is Omit<Task, 'id'> {
  if (!hasVersion2BaseDocument(value)
    || !hasValidDeletionLifecycle(value)
    || !isString(value.title)
    || !isString(value.description)
    || !isTimestampOrNull(value.dueAt)
    || !(value.dueDate === null || isDateOnly(value.dueDate))
    || !isNullableString(value.timeZoneId)
    || !isEnum(value.priority, ['Low', 'Medium', 'High'])
    || !isNullableString(value.courseId)
    || typeof value.completed !== 'boolean'
    || !isTimestampOrNull(value.completedAt)
    || !isFiniteNumber(value.sortOrder)) return false

  if (value.dueAt !== null) return value.dueDate === null && isNonEmptyString(value.timeZoneId)
  if (value.dueDate !== null) return value.timeZoneId === null
  return value.timeZoneId === null
}

function isEndpointDisambiguation(value: unknown): value is EndpointDisambiguation | null {
  return value === null || value === 'earlier' || value === 'later'
}

export function isScheduleEventDocument(value: unknown): value is Omit<ScheduleEvent, 'id'> {
  return hasBaseDocument(value)
    && isString(value.title)
    && isString(value.description)
    && isFirestoreTimestamp(value.startAt)
    && isFirestoreTimestamp(value.endAt)
    && timestampIsAfter(value.endAt, value.startAt)
    && isNonEmptyString(value.timeZoneId)
    && isEnum(value.type, ['class', 'study', 'personal', 'other'])
    && isNullableString(value.courseId)
    && isString(value.location)
    && isEnum(value.color, ['navy', 'lime', 'blue', 'amber'])
    && Object.hasOwn(value, 'startTimeDisambiguation')
    && isEndpointDisambiguation(value.startTimeDisambiguation)
    && Object.hasOwn(value, 'endTimeDisambiguation')
    && isEndpointDisambiguation(value.endTimeDisambiguation)
}

export function isPlannerBlockDocument(value: unknown): value is Omit<PlannerBlock, 'id'> {
  return hasBaseDocument(value)
    && isString(value.title)
    && isFirestoreTimestamp(value.startAt)
    && isFirestoreTimestamp(value.endAt)
    && timestampIsAfter(value.endAt, value.startAt)
    && isNonEmptyString(value.timeZoneId)
    && isNullableString(value.taskId)
    && isNullableString(value.courseId)
    && typeof value.completed === 'boolean'
    && isFiniteNumber(value.sortOrder)
}

export function isFocusSessionDocument(value: unknown): value is Omit<FocusSession, 'id'> {
  return hasBaseDocument(value)
    && isEnum(value.mode, ['focus', 'shortBreak', 'longBreak'])
    && isFirestoreTimestamp(value.startedAt)
    && isFirestoreTimestamp(value.endedAt)
    && isPositiveInteger(value.durationSeconds)
    && isNullableString(value.courseId)
    && isNullableString(value.taskId)
    && value.completed === true
}

export function isUserPreferencesDocument(value: unknown): value is Omit<UserPreferences, 'id'> {
  return hasBaseDocument(value)
    && isString(value.displayName)
    && isEnum(value.timeFormat, ['12h', '24h'])
    && (value.firstDayOfWeek === 0 || value.firstDayOfWeek === 1)
    && isNonEmptyString(value.timeZoneId)
    && typeof value.aiWorkspaceContextConsent === 'boolean'
    && isTimestampOrNull(value.consentedAt)
    && isTimestampOrNull(value.revokedAt)
    && isNullableString(value.consentVersion)
}

export function isTimerPreferencesDocument(value: unknown): value is Omit<TimerPreferences, 'id'> {
  return hasBaseDocument(value)
    && isPositiveInteger(value.focusDurationSeconds)
    && isPositiveInteger(value.shortBreakDurationSeconds)
    && isPositiveInteger(value.longBreakDurationSeconds)
}

export function isActiveFocusTimerDocument(value: unknown): value is Omit<ActiveFocusTimer, 'id'> {
  return hasBaseDocument(value)
    && isEnum(value.status, ['idle', 'running', 'paused'])
    && isEnum(value.mode, ['focus', 'shortBreak', 'longBreak'])
    && isPositiveInteger(value.durationSeconds)
    && isNonNegativeInteger(value.remainingSeconds)
    && isNonNegativeInteger(value.elapsedSeconds)
    && isNonNegativeInteger(value.generation)
    && isNonNegativeInteger(value.writeGeneration)
    && isTimestampOrNull(value.startedAt)
    && isTimestampOrNull(value.segmentStartedAt)
    && isTimestampOrNull(value.endsAt)
    && isNullableString(value.courseId)
    && isNullableString(value.taskId)
    && isNullableString(value.runId)
}

export function isAssistantConversationDocument(value: unknown): value is Omit<AssistantConversation, 'id'> {
  return hasBaseDocument(value) && isString(value.title)
}

export function isAssistantMessageDocument(value: unknown): value is Omit<AssistantMessage, 'id'> {
  return hasBaseDocument(value)
    && isEnum(value.role, ['user', 'assistant'])
    && isString(value.content)
}

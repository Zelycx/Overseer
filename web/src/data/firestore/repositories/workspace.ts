import type { Auth } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import type {
  AppData,
  Course,
  FocusSession,
  Lesson,
  PlannerBlock,
  ScheduleEvent,
  StudyMaterial,
  Task,
} from '../../../types/app'
import { dateTimeTimestamp } from '../../dates'
import { httpsCallable, type Functions } from 'firebase/functions'

function uid(auth: Auth): string {
  const value = auth.currentUser?.uid
  if (!value) throw new Error('Sign in before accessing cloud workspace data.')
  return value
}

function userCollection(firestore: Firestore, auth: Auth, name: string) {
  return collection(firestore, 'users', uid(auth), name)
}

function listen<T>(
  firestore: Firestore,
  auth: Auth,
  name: string,
  decode: (id: string, value: Record<string, unknown>) => T,
  onValue: (values: T[], fromCache: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const ownerUid = uid(auth)
  return onSnapshot(
    userCollection(firestore, auth, name),
    (snapshot) => {
      if (auth.currentUser?.uid !== ownerUid) return
      try {
        onValue(snapshot.docs.map((item) => decode(item.id, item.data())), snapshot.metadata.fromCache)
      } catch (error) {
        onError(error instanceof Error ? error : new Error(`Invalid cloud ${name} data.`))
      }
    },
    (error) => onError(error),
  )
}

function dateAndTime(value: Timestamp, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value.toDate())
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export interface CloudWorkspaceStatus {
  loading: boolean
  error: string | null
  fromCache: boolean
}

export function subscribeWorkspace(
  auth: Auth,
  firestore: Firestore,
  onValue: (patch: Partial<AppData>, fromCache: boolean) => void,
  onError: (error: Error) => void,
): () => void {
  const ownerUid = uid(auth)
  let latest: Partial<AppData> = {}

  const publish = (key: keyof AppData, value: unknown, fromCache: boolean) => {
    if (auth.currentUser?.uid !== ownerUid) return
    latest[key] = value as never
    onValue(latest, fromCache)
  }

  const unsubscribes: Unsubscribe[] = [
    listen(firestore, auth, 'courses', (id, row) => ({ id, name: String(row.name), code: String(row.code), description: String(row.description), instructor: String(row.instructor), tint: row.tint as Course['tint'], createdAt: row.createdAt instanceof Timestamp ? row.createdAt.toDate().toISOString() : '' }),
      (values, fromCache) => publish('courses', values, fromCache), onError),
    listen(firestore, auth, 'lessons', (id, row) => ({ id, courseId: String(row.courseId), title: String(row.title), description: String(row.description), content: String(row.content), completed: Boolean(row.completed), updatedAt: row.updatedAt instanceof Timestamp ? row.updatedAt.toDate().toISOString() : '' }),
      (values, fromCache) => publish('lessons', values, fromCache), onError),
    listen(firestore, auth, 'materials', (id, row) => ({ id, title: String(row.title), courseId: row.courseId as string | null, content: String(row.content), fileName: String(row.fileName), createdAt: row.createdAt instanceof Timestamp ? row.createdAt.toDate().toISOString() : '', updatedAt: row.updatedAt instanceof Timestamp ? row.updatedAt.toDate().toISOString() : '' }),
      (values, fromCache) => publish('materials', values, fromCache), onError),
    listen(firestore, auth, 'tasks', (id, row) => {
      const dueAt = row.dueAt instanceof Timestamp ? row.dueAt : null
      const dueDate = typeof row.dueDate === 'string' ? row.dueDate : null
      const zone = typeof row.timeZoneId === 'string' ? row.timeZoneId : null
      const local = dueAt && zone ? dateAndTime(dueAt, zone) : null
      return { id, title: String(row.title), description: String(row.description), dueDate: dueDate ?? local?.date ?? null, dueTime: local?.time ?? null, priority: row.priority as Task['priority'], courseId: row.courseId as string | null, completed: Boolean(row.completed), createdAt: row.createdAt instanceof Timestamp ? row.createdAt.toDate().toISOString() : '', completedAt: row.completedAt instanceof Timestamp ? row.completedAt.toDate().toISOString() : null }
    }, (values, fromCache) => publish('tasks', values, fromCache), onError),
    listen(firestore, auth, 'events', (id, row) => {
      if (!(row.startAt instanceof Timestamp) || !(row.endAt instanceof Timestamp) || typeof row.timeZoneId !== 'string') throw new Error('Invalid schedule event timestamps.')
      const start = dateAndTime(row.startAt, row.timeZoneId)
      const end = dateAndTime(row.endAt, row.timeZoneId)
      return { id, title: String(row.title), description: String(row.description), date: start.date, startTime: start.time, endTime: end.time, type: row.type as ScheduleEvent['type'], courseId: row.courseId as string | null, location: String(row.location), color: row.color as ScheduleEvent['color'], createdAt: row.createdAt instanceof Timestamp ? row.createdAt.toDate().toISOString() : '' }
    }, (values, fromCache) => publish('events', values, fromCache), onError),
    listen(firestore, auth, 'plannerBlocks', (id, row) => {
      if (!(row.startAt instanceof Timestamp) || !(row.endAt instanceof Timestamp) || typeof row.timeZoneId !== 'string') throw new Error('Invalid planner block timestamps.')
      const start = dateAndTime(row.startAt, row.timeZoneId)
      const end = dateAndTime(row.endAt, row.timeZoneId)
      return { id, date: start.date, title: String(row.title), startTime: start.time, endTime: end.time, taskId: row.taskId as string | null, courseId: row.courseId as string | null, completed: Boolean(row.completed), order: Number(row.sortOrder), createdAt: row.createdAt instanceof Timestamp ? row.createdAt.toDate().toISOString() : '' }
    }, (values, fromCache) => publish('plannerBlocks', values, fromCache), onError),
    listen(firestore, auth, 'focusSessions', (id, row) => ({ id, mode: row.mode as FocusSession['mode'], startedAt: row.startedAt instanceof Timestamp ? row.startedAt.toDate().toISOString() : '', endedAt: row.endedAt instanceof Timestamp ? row.endedAt.toDate().toISOString() : '', durationSeconds: Number(row.durationSeconds), courseId: row.courseId as string | null, taskId: row.taskId as string | null, completed: true }),
      (values, fromCache) => publish('focusSessions', values, fromCache), onError),
    onSnapshot(doc(firestore, 'users', ownerUid, 'focusTimer', 'active'), (snapshot) => {
      if (auth.currentUser?.uid !== ownerUid) return
      if (!snapshot.exists()) return
      const row = snapshot.data()
      publish('focusTimer', {
        status: row.status as AppData['focusTimer']['status'],
        mode: row.mode as AppData['focusTimer']['mode'],
        durationSeconds: Number(row.durationSeconds),
        remainingSeconds: Number(row.remainingSeconds),
        elapsedSeconds: Number(row.elapsedSeconds),
        startedAt: row.startedAt instanceof Timestamp ? row.startedAt.toDate().toISOString() : null,
        segmentStartedAt: row.segmentStartedAt instanceof Timestamp ? row.segmentStartedAt.toDate().toISOString() : null,
        endsAt: row.endsAt instanceof Timestamp ? row.endsAt.toMillis() : null,
        courseId: row.courseId as string | null,
        taskId: row.taskId as string | null,
      }, snapshot.metadata.fromCache)
    }, onError),
  ]

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
}

async function removeDocument(auth: Auth, firestore: Firestore, collectionName: string, id: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before deleting workspace data.')
  await deleteDoc(doc(firestore, 'users', auth.currentUser.uid, collectionName, id))
}

export async function saveCourse(auth: Auth, firestore: Firestore, value: Course): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before saving courses.')
  const reference = doc(firestore, 'users', auth.currentUser.uid, 'courses', value.id)
  const existing = await getDoc(reference)
  if (existing.exists()) {
    await setDoc(reference, { name: value.name, code: value.code, description: value.description, instructor: value.instructor, tint: value.tint, sortOrder: 0, updatedAt: serverTimestamp() }, { merge: true })
  } else {
    await setDoc(reference, { schemaVersion: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), name: value.name, code: value.code, description: value.description, instructor: value.instructor, tint: value.tint, sortOrder: 0, deletionStatus: 'active', deletionJobId: null, deletionStartedAt: null })
  }
}

export async function deleteCourse(auth: Auth, firestore: Firestore, id: string): Promise<void> {
  await removeDocument(auth, firestore, 'courses', id)
}

export async function saveTask(auth: Auth, firestore: Firestore, value: Task, timeZoneId: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before saving tasks.')
  const reference = doc(firestore, 'users', auth.currentUser.uid, 'tasks', value.id)
  const existing = await getDoc(reference)
  const dueAt = value.dueDate && value.dueTime
    ? Timestamp.fromMillis(dateTimeTimestamp(value.dueDate, value.dueTime))
    : null
  const mutable = {
    title: value.title,
    description: value.description,
    dueAt,
    dueDate: value.dueDate && !value.dueTime ? value.dueDate : null,
    timeZoneId: dueAt ? timeZoneId : null,
    priority: value.priority,
    courseId: value.courseId,
    completed: value.completed,
    completedAt: value.completedAt ? timestampAt(value.completedAt) : null,
    sortOrder: 0,
    updatedAt: serverTimestamp(),
  }
  if (existing.exists()) {
    await setDoc(reference, mutable, { merge: true })
    return
  }
  await setDoc(reference, {
    schemaVersion: 2,
    createdAt: serverTimestamp(),
    ...mutable,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
  })
}

export async function deleteTask(auth: Auth, firestore: Firestore, id: string): Promise<void> {
  await removeDocument(auth, firestore, 'tasks', id)
}

function timestampAt(iso: string): Timestamp {
  return Timestamp.fromMillis(new Date(iso).getTime())
}

export async function saveEvent(auth: Auth, firestore: Firestore, value: ScheduleEvent, timeZoneId: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before saving events.')
  const reference = doc(firestore, 'users', auth.currentUser.uid, 'events', value.id)
  const existing = await getDoc(reference)
  const mutable = {
    title: value.title,
    description: value.description,
    startAt: Timestamp.fromMillis(dateTimeTimestamp(value.date, value.startTime)),
    endAt: Timestamp.fromMillis(dateTimeTimestamp(value.date, value.endTime)),
    timeZoneId,
    type: value.type,
    courseId: value.courseId,
    location: value.location,
    color: value.color,
    startTimeDisambiguation: null,
    endTimeDisambiguation: null,
    updatedAt: serverTimestamp(),
  }
  if (existing.exists()) {
    await setDoc(reference, mutable, { merge: true })
  } else {
    await setDoc(reference, { schemaVersion: 1, createdAt: serverTimestamp(), ...mutable })
  }
}

export async function deleteEvent(auth: Auth, firestore: Firestore, id: string): Promise<void> {
  await removeDocument(auth, firestore, 'events', id)
}

export async function saveLesson(auth: Auth, firestore: Firestore, value: Lesson): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before saving lessons.')
  const reference = doc(firestore, 'users', auth.currentUser.uid, 'lessons', value.id)
  const existing = await getDoc(reference)
  const mutable = {
    courseId: value.courseId,
    title: value.title,
    description: value.description,
    content: value.content,
    completed: value.completed,
    sortOrder: 0,
    updatedAt: serverTimestamp(),
  }
  if (existing.exists()) {
    await setDoc(reference, mutable, { merge: true })
  } else {
    await setDoc(reference, { schemaVersion: 1, createdAt: serverTimestamp(), ...mutable })
  }
}

export async function deleteLesson(auth: Auth, firestore: Firestore, id: string): Promise<void> {
  await removeDocument(auth, firestore, 'lessons', id)
}

export async function saveMaterial(auth: Auth, firestore: Firestore, value: StudyMaterial): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before saving study materials.')
  const reference = doc(firestore, 'users', auth.currentUser.uid, 'materials', value.id)
  const existing = await getDoc(reference)
  const mutable = {
    title: value.title,
    content: value.content,
    fileName: value.fileName,
    courseId: value.courseId,
    sortOrder: 0,
    updatedAt: serverTimestamp(),
  }
  if (existing.exists()) {
    await setDoc(reference, mutable, { merge: true })
  } else {
    await setDoc(reference, { schemaVersion: 1, createdAt: serverTimestamp(), ...mutable })
  }
}

export async function deleteMaterial(auth: Auth, firestore: Firestore, id: string): Promise<void> {
  await removeDocument(auth, firestore, 'materials', id)
}

export async function savePlannerBlock(auth: Auth, firestore: Firestore, value: PlannerBlock, timeZoneId: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before saving planner blocks.')
  const reference = doc(firestore, 'users', auth.currentUser.uid, 'plannerBlocks', value.id)
  const existing = await getDoc(reference)
  const mutable = {
    title: value.title,
    startAt: Timestamp.fromMillis(dateTimeTimestamp(value.date, value.startTime)),
    endAt: Timestamp.fromMillis(dateTimeTimestamp(value.date, value.endTime)),
    timeZoneId,
    taskId: value.taskId,
    courseId: value.courseId,
    completed: value.completed,
    sortOrder: value.order,
    updatedAt: serverTimestamp(),
  }
  if (existing.exists()) {
    await setDoc(reference, mutable, { merge: true })
  } else {
    await setDoc(reference, { schemaVersion: 1, createdAt: serverTimestamp(), ...mutable })
  }
}

export async function deletePlannerBlock(auth: Auth, firestore: Firestore, id: string): Promise<void> {
  await removeDocument(auth, firestore, 'plannerBlocks', id)
}

export async function saveFocusSession(auth: Auth, firestore: Firestore, value: FocusSession): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before saving focus sessions.')
  await setDoc(doc(firestore, 'users', auth.currentUser.uid, 'focusSessions', value.id), {
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    mode: value.mode,
    startedAt: timestampAt(value.startedAt),
    endedAt: timestampAt(value.endedAt),
    durationSeconds: value.durationSeconds,
    courseId: value.courseId,
    taskId: value.taskId,
    completed: true,
  })
}

export async function saveFocusTimer(auth: Auth, firestore: Firestore, value: AppData['focusTimer']): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in before saving focus timer state.')
  const reference = doc(firestore, 'users', auth.currentUser.uid, 'focusTimer', 'active')
  const existing = await getDoc(reference)
  const mutable = {
    status: value.status,
    mode: value.mode,
    durationSeconds: value.durationSeconds,
    remainingSeconds: value.remainingSeconds,
    elapsedSeconds: value.elapsedSeconds,
    generation: 1,
    writeGeneration: 1,
    startedAt: value.startedAt ? timestampAt(value.startedAt) : null,
    segmentStartedAt: value.segmentStartedAt ? timestampAt(value.segmentStartedAt) : null,
    endsAt: value.endsAt === null ? null : Timestamp.fromMillis(value.endsAt),
    courseId: value.courseId,
    taskId: value.taskId,
    runId: value.startedAt ? createTimerRunId(value.startedAt) : null,
    updatedAt: serverTimestamp(),
  }
  if (existing.exists()) {
    await setDoc(reference, mutable, { merge: true })
  } else {
    await setDoc(reference, { schemaVersion: 1, createdAt: serverTimestamp(), ...mutable })
  }
}

function createTimerRunId(startedAt: string): string {
  return `run-${Timestamp.fromMillis(new Date(startedAt).getTime()).seconds}-${createRunNonce()}`
}

let runNonce = 0
function createRunNonce(): number {
  runNonce += 1
  return runNonce
}

export interface DeletionStatus {
  jobId: string
  status: 'queued' | 'running' | 'retryable' | 'completed' | 'failed'
  completed: boolean
  phase: string
}

export async function requestTrustedTaskDeletion(functions: Functions, taskId: string): Promise<DeletionStatus> {
  const callable = httpsCallable(functions, 'requestTaskDeletion')
  const result = await callable({ taskId })
  const data = result.data as DeletionStatus
  return data
}

export async function getTrustedTaskDeletionStatus(functions: Functions, taskId: string, jobId: string): Promise<DeletionStatus> {
  const callable = httpsCallable(functions, 'getTaskDeletionStatus')
  const result = await callable({ taskId, jobId })
  return result.data as DeletionStatus
}

export async function requestTrustedCourseDeletion(functions: Functions, courseId: string): Promise<DeletionStatus> {
  const callable = httpsCallable(functions, 'requestCourseDeletion')
  const result = await callable({ courseId })
  const data = result.data as DeletionStatus
  return data
}

export async function getTrustedCourseDeletionStatus(functions: Functions, courseId: string, jobId: string): Promise<DeletionStatus> {
  const callable = httpsCallable(functions, 'getCourseDeletionStatus')
  const result = await callable({ courseId, jobId })
  return result.data as DeletionStatus
}

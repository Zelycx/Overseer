import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'

const projectId = 'demo-overseer-web'
let testEnvironment
let uidCounter = 0

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  })
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
})

after(async () => {
  await testEnvironment?.cleanup()
})

const storedAt = Timestamp.fromMillis(1_700_000_000_000)
const anotherStoredAt = Timestamp.fromMillis(1_700_000_001_000)

function nextUid(prefix = 'rules-test') {
  uidCounter += 1
  return `${prefix}-${uidCounter}`
}

function dbFor(uid) {
  return testEnvironment.authenticatedContext(uid).firestore()
}

function unauthenticatedDb() {
  return testEnvironment.unauthenticatedContext().firestore()
}

function clientDocument(fields, schemaVersion = 1) {
  return {
    schemaVersion,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...fields,
  }
}

function storedDocument(fields, schemaVersion = 1) {
  return {
    schemaVersion,
    createdAt: storedAt,
    updatedAt: anotherStoredAt,
    ...fields,
  }
}

function courseFields(lifecycle = 'active') {
  return {
    name: 'Biology',
    code: 'BIO-1',
    description: '',
    instructor: 'Instructor',
    tint: 'mint',
    sortOrder: 3,
    deletionStatus: lifecycle,
    deletionJobId: lifecycle === 'active' ? null : 'course-job',
    deletionStartedAt: lifecycle === 'active' ? null : storedAt,
  }
}

function courseDocument(overrides = {}) {
  return clientDocument({ ...courseFields(), ...overrides }, 2)
}

function taskFields(overrides = {}) {
  return {
    title: 'Read chapter',
    description: '',
    dueAt: null,
    dueDate: null,
    timeZoneId: null,
    priority: 'Medium',
    courseId: null,
    completed: false,
    completedAt: null,
    sortOrder: 0,
    deletionStatus: 'active',
    deletionJobId: null,
    deletionStartedAt: null,
    ...overrides,
  }
}

function taskDocument(overrides = {}) {
  return clientDocument(taskFields(overrides), 2)
}

function eventFields(overrides = {}) {
  return {
    title: 'Class',
    description: '',
    startAt: storedAt,
    endAt: anotherStoredAt,
    timeZoneId: 'America/New_York',
    type: 'class',
    courseId: null,
    location: '',
    color: 'navy',
    startTimeDisambiguation: null,
    endTimeDisambiguation: null,
    ...overrides,
  }
}

function eventDocument(overrides = {}) {
  return clientDocument(eventFields(overrides))
}

function plannerFields(overrides = {}) {
  return {
    title: 'Study',
    startAt: storedAt,
    endAt: anotherStoredAt,
    timeZoneId: 'America/New_York',
    taskId: null,
    courseId: null,
    completed: false,
    sortOrder: 1,
    ...overrides,
  }
}

function plannerDocument(overrides = {}) {
  return clientDocument(plannerFields(overrides))
}

function focusSessionFields(overrides = {}) {
  return {
    mode: 'focus',
    startedAt: storedAt,
    endedAt: anotherStoredAt,
    durationSeconds: 25,
    courseId: null,
    taskId: null,
    completed: true,
    ...overrides,
  }
}

function focusSessionDocument(overrides = {}) {
  return clientDocument(focusSessionFields(overrides))
}

function preferencesFields(overrides = {}) {
  return {
    displayName: 'Student',
    timeFormat: '12h',
    firstDayOfWeek: 1,
    timeZoneId: 'UTC',
    aiWorkspaceContextConsent: false,
    consentedAt: null,
    revokedAt: null,
    consentVersion: null,
    ...overrides,
  }
}

function preferencesDocument(overrides = {}) {
  return clientDocument(preferencesFields(overrides))
}

function timerPreferencesFields(overrides = {}) {
  return {
    focusDurationSeconds: 1500,
    shortBreakDurationSeconds: 300,
    longBreakDurationSeconds: 900,
    ...overrides,
  }
}

function timerPreferencesDocument(overrides = {}) {
  return clientDocument(timerPreferencesFields(overrides))
}

function timerFields(overrides = {}) {
  return {
    status: 'idle',
    mode: 'focus',
    durationSeconds: 1500,
    remainingSeconds: 1500,
    elapsedSeconds: 0,
    generation: 0,
    writeGeneration: 0,
    startedAt: null,
    segmentStartedAt: null,
    endsAt: null,
    courseId: null,
    taskId: null,
    runId: null,
    ...overrides,
  }
}

function timerDocument(overrides = {}) {
  return clientDocument(timerFields(overrides))
}

function conversationFields(overrides = {}) {
  return { title: 'Study', ...overrides }
}

function conversationDocument(overrides = {}) {
  return clientDocument(conversationFields(overrides))
}

function messageFields(overrides = {}) {
  return { role: 'user', content: 'Help me study', ...overrides }
}

function messageDocument(overrides = {}) {
  return clientDocument(messageFields(overrides))
}

async function seed(uid, path, data) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${uid}/${path}`), data)
  })
}

async function seedCourse(uid, courseId, lifecycle = 'active') {
  await seed(uid, `courses/${courseId}`, storedDocument(courseFields(lifecycle), 2))
}

async function seedTask(uid, taskId, courseId = null, lifecycle = 'active') {
  await seed(uid, `tasks/${taskId}`, storedDocument(taskFields({
    courseId,
    deletionStatus: lifecycle,
    deletionJobId: lifecycle === 'active' ? null : `${taskId}-job`,
    deletionStartedAt: lifecycle === 'active' ? null : storedAt,
  }), 2))
}

async function seedTimerPreferences(uid, overrides = {}) {
  await seed(uid, 'settings/timerPreferences', storedDocument(timerPreferencesFields(overrides)))
}

async function seedConversation(uid, conversationId) {
  await seed(uid, `assistantConversations/${conversationId}`, storedDocument(conversationFields()))
}

test('profile owner can create, read, and update displayName only', async () => {
  const uid = nextUid('profile')
  const db = dbFor(uid)
  const ref = doc(db, `users/${uid}`)

  await assertSucceeds(setDoc(ref, clientDocument({ displayName: 'Student' })))
  assert.equal((await assertSucceeds(getDoc(ref))).data().displayName, 'Student')
  await assertSucceeds(updateDoc(ref, {
    displayName: 'Learner',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(ref, {
    schemaVersion: 2,
    updatedAt: serverTimestamp(),
  }))
  await assertFails(deleteDoc(ref))
  await assertFails(getDoc(doc(db, `users/${nextUid('other-profile')}`)))
  await assertFails(getDoc(doc(unauthenticatedDb(), `users/${uid}`)))
})

test('owner CRUD follows the approved ordinary collection matrix', async () => {
  const uid = nextUid('ordinary')
  const db = dbFor(uid)
  await seedCourse(uid, 'course-a')
  await seedTask(uid, 'task-a', 'course-a')

  const lesson = doc(db, `users/${uid}/lessons/lesson-a`)
  await assertSucceeds(setDoc(lesson, clientDocument({
    courseId: 'course-a',
    title: 'Chapter',
    description: '',
    content: '',
    completed: false,
    sortOrder: 0,
  })))
  await assertSucceeds(getDoc(lesson))
  await assertSucceeds(updateDoc(lesson, { title: 'Updated', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(lesson))

  const material = doc(db, `users/${uid}/materials/material-a`)
  await assertSucceeds(setDoc(material, clientDocument({
    title: 'Notes',
    content: '',
    fileName: 'notes.txt',
    courseId: 'course-a',
    sortOrder: 0,
  })))
  await assertSucceeds(updateDoc(material, { title: 'Notes 2', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(material))

  const task = doc(db, `users/${uid}/tasks/task-client`)
  await assertSucceeds(setDoc(task, taskDocument({ courseId: 'course-a' })))
  await assertSucceeds(getDoc(task))
  await assertSucceeds(updateDoc(task, { title: 'Updated task', updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(task))

  const event = doc(db, `users/${uid}/events/event-a`)
  await assertSucceeds(setDoc(event, eventDocument({ courseId: 'course-a' })))
  await assertSucceeds(getDoc(event))
  await assertSucceeds(updateDoc(event, { title: 'Updated event', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(event))

  const block = doc(db, `users/${uid}/plannerBlocks/block-a`)
  await assertSucceeds(setDoc(block, plannerDocument({
    taskId: 'task-a',
    courseId: 'course-a',
  })))
  await assertSucceeds(getDoc(block))
  await assertSucceeds(updateDoc(block, { title: 'Updated block', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(block))

  const course = doc(db, `users/${uid}/courses/course-client`)
  await assertSucceeds(setDoc(course, courseDocument()))
  await assertSucceeds(getDoc(course))
  await assertSucceeds(updateDoc(course, { name: 'Biology II', updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(course))

  const strangerDb = dbFor(nextUid('stranger'))
  await assertFails(getDoc(doc(strangerDb, `users/${uid}/courses/course-client`)))
  await assertFails(getDoc(doc(strangerDb, `users/${uid}/tasks/task-client`)))
})

test('unauthenticated users cannot access owner-protected products', async () => {
  const uid = nextUid('unauth')
  const db = unauthenticatedDb()
  await assertFails(setDoc(doc(db, `users/${uid}/courses/course-a`), courseDocument()))
  await assertFails(getDoc(doc(db, `users/${uid}/tasks/task-a`)))
  await assertFails(setDoc(doc(db, `users/${uid}/events/event-a`), eventDocument()))
})

test('Course and Task lifecycle is strict and legacy v1 documents fail closed', async () => {
  const uid = nextUid('lifecycle')
  const db = dbFor(uid)
  const validCourse = doc(db, `users/${uid}/courses/course-valid`)
  const validTask = doc(db, `users/${uid}/tasks/task-valid`)
  await assertSucceeds(setDoc(validCourse, courseDocument()))
  await assertSucceeds(setDoc(validTask, taskDocument()))

  const invalidCourseStates = [
    { deletionStatus: 'deleting', deletionJobId: 'job', deletionStartedAt: storedAt },
    { deletionStatus: 'active', deletionJobId: 'job', deletionStartedAt: null },
    { deletionStatus: 'active', deletionJobId: null, deletionStartedAt: storedAt },
    { deletionStatus: 'deleting', deletionJobId: null, deletionStartedAt: storedAt },
    { deletionStatus: 'deleting', deletionJobId: '   ', deletionStartedAt: storedAt },
    { deletionStatus: 'deleting', deletionJobId: 'job', deletionStartedAt: null },
    { deletionStatus: 'pending', deletionJobId: null, deletionStartedAt: null },
  ]
  for (const [index, lifecycle] of invalidCourseStates.entries()) {
    await assertFails(setDoc(
      doc(db, `users/${uid}/courses/invalid-${index}`),
      courseDocument(lifecycle),
    ))
    await assertFails(setDoc(
      doc(db, `users/${uid}/tasks/invalid-${index}`),
      taskDocument(lifecycle),
    ))
  }

  const nonTimestampCourse = courseDocument({
    deletionStatus: 'deleting',
    deletionJobId: 'job',
    deletionStartedAt: '2025-01-01T00:00:00Z',
  })
  const nonTimestampTask = taskDocument({
    deletionStatus: 'deleting',
    deletionJobId: 'job',
    deletionStartedAt: '2025-01-01T00:00:00Z',
  })
  await assertFails(setDoc(doc(db, `users/${uid}/courses/non-timestamp`), nonTimestampCourse))
  await assertFails(setDoc(doc(db, `users/${uid}/tasks/non-timestamp`), nonTimestampTask))

  await assertFails(updateDoc(validCourse, {
    deletionStatus: 'deleting',
    deletionJobId: 'job',
    deletionStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(validTask, {
    deletionStatus: 'deleting',
    deletionJobId: 'job',
    deletionStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))
  await assertFails(setDoc(doc(db, `users/${uid}/courses/v1`), courseDocument({ schemaVersion: 1 })))
  await assertFails(setDoc(doc(db, `users/${uid}/tasks/v1`), taskDocument({ schemaVersion: 1 })))

  await seed(uid, 'courses/legacy', storedDocument(courseFields(), 1))
  await seed(uid, 'tasks/legacy', storedDocument(taskFields(), 1))
  await assertFails(getDoc(doc(db, `users/${uid}/courses/legacy`)))
  await assertFails(getDoc(doc(db, `users/${uid}/tasks/legacy`)))

  await seed(uid, 'courses/deleting', storedDocument(courseFields('deleting'), 2))
  await seed(uid, 'tasks/deleting', storedDocument(taskFields({
    deletionStatus: 'deleting',
    deletionJobId: 'deleting-job',
    deletionStartedAt: storedAt,
  }), 2))
  assert.equal((await assertSucceeds(getDoc(doc(db, `users/${uid}/courses/deleting`)))).exists(), true)
  assert.equal((await assertSucceeds(getDoc(doc(db, `users/${uid}/tasks/deleting`)))).exists(), true)

  const courseList = query(
    collection(db, `users/${uid}/courses`),
    where('schemaVersion', '==', 2),
    where('deletionStatus', '==', 'active'),
    where('deletionJobId', '==', null),
    where('deletionStartedAt', '==', null),
  )
  const taskList = query(
    collection(db, `users/${uid}/tasks`),
    where('schemaVersion', '==', 2),
    where('deletionStatus', '==', 'active'),
    where('deletionJobId', '==', null),
    where('deletionStartedAt', '==', null),
  )
  assert.equal((await assertSucceeds(getDocs(courseList))).docs.length, 1)
  assert.equal((await assertSucceeds(getDocs(taskList))).docs.length, 1)
  await assertFails(getDocs(collection(db, `users/${uid}/courses`)))
  await assertFails(getDocs(collection(db, `users/${uid}/tasks`)))
})

test('all canonical product create paths enforce required keys, allowlists, versions, and server timestamps', async () => {
  const fixtures = [
    {
      label: 'profile',
      path: (uid) => `users/${uid}`,
      schemaVersion: 1,
      missing: 'displayName',
      fields: () => ({ displayName: 'Student' }),
    },
    {
      label: 'course',
      path: (uid, suffix) => `users/${uid}/courses/${suffix}`,
      schemaVersion: 2,
      missing: 'name',
      fields: () => courseFields(),
    },
    {
      label: 'lesson',
      path: (uid, suffix) => `users/${uid}/lessons/${suffix}`,
      schemaVersion: 1,
      missing: 'title',
      fields: () => ({ courseId: 'course', title: 'Lesson', description: '', content: '', completed: false, sortOrder: 0 }),
      prerequisite: async (uid) => seedCourse(uid, 'course'),
    },
    {
      label: 'material',
      path: (uid, suffix) => `users/${uid}/materials/${suffix}`,
      schemaVersion: 1,
      missing: 'fileName',
      fields: () => ({ title: 'Notes', content: '', fileName: 'notes.txt', courseId: null, sortOrder: 0 }),
    },
    {
      label: 'task',
      path: (uid, suffix) => `users/${uid}/tasks/${suffix}`,
      schemaVersion: 2,
      missing: 'title',
      fields: () => taskFields(),
    },
    {
      label: 'event',
      path: (uid, suffix) => `users/${uid}/events/${suffix}`,
      schemaVersion: 1,
      missing: 'startTimeDisambiguation',
      fields: () => eventFields(),
    },
    {
      label: 'planner block',
      path: (uid, suffix) => `users/${uid}/plannerBlocks/${suffix}`,
      schemaVersion: 1,
      missing: 'taskId',
      fields: () => plannerFields(),
    },
    {
      label: 'focus session',
      path: (uid, suffix) => `users/${uid}/focusSessions/${suffix}`,
      schemaVersion: 1,
      missing: 'completed',
      fields: () => focusSessionFields(),
    },
    {
      label: 'preferences',
      path: (uid) => `users/${uid}/settings/preferences`,
      schemaVersion: 1,
      missing: 'consentedAt',
      fields: () => preferencesFields(),
    },
    {
      label: 'timer preferences',
      path: (uid) => `users/${uid}/settings/timerPreferences`,
      schemaVersion: 1,
      missing: 'focusDurationSeconds',
      fields: () => timerPreferencesFields(),
    },
    {
      label: 'focus timer',
      path: (uid) => `users/${uid}/settings/focusTimer`,
      schemaVersion: 1,
      missing: 'generation',
      fields: () => timerFields(),
      prerequisite: async (uid) => seedTimerPreferences(uid),
    },
    {
      label: 'assistant conversation',
      path: (uid, suffix) => `users/${uid}/assistantConversations/${suffix}`,
      schemaVersion: 1,
      missing: 'title',
      fields: () => conversationFields(),
    },
    {
      label: 'assistant message',
      path: (uid, suffix) => `users/${uid}/assistantConversations/parent/messages/${suffix}`,
      schemaVersion: 1,
      missing: 'role',
      fields: () => messageFields(),
      prerequisite: async (uid) => seedConversation(uid, 'parent'),
    },
  ]

  for (const fixture of fixtures) {
    const attempt = async (suffix, makeData, succeeds) => {
      const uid = nextUid(fixture.label.replaceAll(' ', '-'))
      await fixture.prerequisite?.(uid)
      const db = dbFor(uid)
      const path = fixture.path(uid, suffix)
      const write = setDoc(doc(db, path), makeData())
      if (succeeds) {
        await assertSucceeds(write, `${fixture.label} ${suffix}`)
      } else {
        await assertFails(write, `${fixture.label} ${suffix}`)
      }
    }
    const validFields = fixture.fields()
    await attempt('valid', () => clientDocument(validFields, fixture.schemaVersion), true)
    await attempt('extra', () => ({
      ...clientDocument(validFields, fixture.schemaVersion),
      unexpected: true,
    }), false)
    await attempt('id-field', () => ({
      ...clientDocument(validFields, fixture.schemaVersion),
      id: 'forged',
    }), false)
    await attempt('missing', () => {
      const data = clientDocument(validFields, fixture.schemaVersion)
      delete data[fixture.missing]
      return data
    }, false)
    await attempt('version', () => clientDocument(
      validFields,
      fixture.schemaVersion === 1 ? 2 : 1,
    ), false)
    await attempt('historical', () => ({
      ...clientDocument(validFields, fixture.schemaVersion),
      createdAt: storedAt,
      updatedAt: storedAt,
    }), false)
  }
})

test('reference creates reject missing, cross-user, and deleting targets', async () => {
  const uid = nextUid('refs')
  const otherUid = nextUid('refs-other')
  const db = dbFor(uid)
  await seedCourse(uid, 'active-course')
  await seedCourse(uid, 'deleting-course', 'deleting')
  await seedTask(uid, 'active-task', 'active-course')
  await seedTask(uid, 'deleting-task', 'active-course', 'deleting')
  await seedCourse(otherUid, 'foreign-course')

  await assertSucceeds(setDoc(
    doc(db, `users/${uid}/lessons/good`),
    clientDocument({
      courseId: 'active-course', title: 'Lesson', description: '',
      content: '', completed: false, sortOrder: 0,
    }),
  ))
  for (const courseId of ['missing-course', 'deleting-course']) {
    await assertFails(setDoc(
      doc(db, `users/${uid}/materials/${courseId}`),
      clientDocument({ title: 'Notes', content: '', fileName: '', courseId, sortOrder: 0 }),
    ))
    await assertFails(setDoc(
      doc(db, `users/${uid}/events/event-${courseId}`),
      eventDocument({ courseId }),
    ))
  }
  await assertFails(setDoc(
    doc(db, `users/${uid}/tasks/foreign-course`),
    taskDocument({ courseId: 'foreign-course' }),
  ))
  await assertFails(setDoc(
    doc(db, `users/${uid}/tasks/deleting-course`),
    taskDocument({ courseId: 'deleting-course' }),
  ))
  await assertFails(setDoc(
    doc(db, `users/${uid}/plannerBlocks/missing-task`),
    plannerDocument({ taskId: 'missing-task', courseId: 'active-course' }),
  ))
  await assertFails(setDoc(
    doc(db, `users/${uid}/plannerBlocks/deleting-task`),
    plannerDocument({ taskId: 'deleting-task', courseId: 'active-course' }),
  ))
  await assertFails(setDoc(
    doc(db, `users/${uid}/plannerBlocks/mismatched-course`),
    plannerDocument({ taskId: 'active-task', courseId: null }),
  ))
  await assertSucceeds(setDoc(
    doc(db, `users/${uid}/plannerBlocks/null-course`),
    plannerDocument({ courseId: 'active-course' }),
  ))
  await assertSucceeds(setDoc(
    doc(db, `users/${uid}/plannerBlocks/null-refs`),
    plannerDocument(),
  ))
  await assertFails(setDoc(
    doc(db, `users/${uid}/focusSessions/mismatched-course`),
    focusSessionDocument({ taskId: 'active-task', courseId: null }),
  ))
  await assertSucceeds(setDoc(
    doc(db, `users/${uid}/focusSessions/valid`),
    focusSessionDocument({ taskId: 'active-task', courseId: 'active-course' }),
  ))
})

test('Task and PlannerBlock may change references only between active targets', async () => {
  const uid = nextUid('active-reference-change')
  const db = dbFor(uid)
  await seedCourse(uid, 'course-a')
  await seedCourse(uid, 'course-b')
  await seedTask(uid, 'task-a', 'course-a')
  await seedTask(uid, 'task-b', 'course-b')

  const task = doc(db, `users/${uid}/tasks/move-course`)
  await assertSucceeds(setDoc(task, taskDocument({ courseId: 'course-a' })))
  await assertSucceeds(updateDoc(task, {
    courseId: 'course-b',
    updatedAt: serverTimestamp(),
  }))

  const block = doc(db, `users/${uid}/plannerBlocks/move-references`)
  await assertSucceeds(setDoc(block, plannerDocument({
    taskId: 'task-a',
    courseId: 'course-a',
  })))
  await assertSucceeds(updateDoc(block, {
    taskId: 'task-b',
    courseId: 'course-b',
    updatedAt: serverTimestamp(),
  }))
})

test('clients cannot edit, detach, or switch away from existing deleting references', async () => {
  const uid = nextUid('old-reference')
  const db = dbFor(uid)
  await seedCourse(uid, 'deleting-course', 'deleting')
  await seedCourse(uid, 'active-course')
  await seedTask(uid, 'deleting-task', null, 'deleting')
  await seedTask(uid, 'active-task')
  await seed(uid, 'plannerBlocks/course-reference', storedDocument(plannerFields({
    courseId: 'deleting-course',
  })))
  await seed(uid, 'plannerBlocks/task-reference', storedDocument(plannerFields({
    taskId: 'deleting-task',
  })))
  await seed(uid, 'tasks/course-reference', storedDocument(taskFields({
    courseId: 'deleting-course',
  }), 2))
  await seed(uid, 'events/course-reference', storedDocument(eventFields({
    courseId: 'deleting-course',
  })))
  await seed(uid, 'materials/course-reference', storedDocument({
    title: 'Notes', content: '', fileName: '', courseId: 'deleting-course', sortOrder: 0,
  }))
  await seed(uid, 'lessons/course-reference', storedDocument({
    courseId: 'deleting-course', title: 'Lesson', description: '',
    content: '', completed: false, sortOrder: 0,
  }))

  const blockCourse = doc(db, `users/${uid}/plannerBlocks/course-reference`)
  await assertFails(updateDoc(blockCourse, { title: 'Title only', updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(blockCourse, { courseId: null, updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(blockCourse, { courseId: 'active-course', updatedAt: serverTimestamp() }))

  const blockTask = doc(db, `users/${uid}/plannerBlocks/task-reference`)
  await assertFails(updateDoc(blockTask, { title: 'Title only', updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(blockTask, { taskId: null, updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(blockTask, { taskId: 'active-task', updatedAt: serverTimestamp() }))

  for (const path of [
    'tasks/course-reference',
    'events/course-reference',
    'materials/course-reference',
    'lessons/course-reference',
  ]) {
    const ref = doc(db, `users/${uid}/${path}`)
    const field = path.startsWith('tasks/') ? 'courseId' : 'courseId'
    await assertFails(updateDoc(ref, { title: 'Title only', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { [field]: null, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { [field]: 'active-course', updatedAt: serverTimestamp() }))
  }
})

test('Task deadline variants and date-only calendar values are validated', async () => {
  const uid = nextUid('deadlines')
  const db = dbFor(uid)
  await assertSucceeds(setDoc(
    doc(db, `users/${uid}/tasks/no-deadline`),
    taskDocument(),
  ))
  await assertSucceeds(setDoc(
    doc(db, `users/${uid}/tasks/timed`),
    taskDocument({ dueAt: storedAt, timeZoneId: 'Asia/Manila' }),
  ))
  await assertSucceeds(setDoc(
    doc(db, `users/${uid}/tasks/date-only-leap`),
    taskDocument({ dueDate: '2024-02-29' }),
  ))
  for (const [id, fields] of [
    ['invalid-leap-day', { dueDate: '2025-02-29' }],
    ['invalid-month-day', { dueDate: '2025-04-31' }],
    ['mixed-timed-and-date', { dueAt: storedAt, dueDate: '2025-01-02', timeZoneId: 'UTC' }],
    ['timed-no-timezone', { dueAt: storedAt }],
    ['date-only-with-timezone', { dueDate: '2025-01-02', timeZoneId: 'UTC' }],
  ]) {
    await assertFails(setDoc(
      doc(db, `users/${uid}/tasks/${id}`),
      taskDocument(fields),
    ))
  }
})

test('focus sessions are append-only and remain readable during deletion', async () => {
  const uid = nextUid('sessions')
  const db = dbFor(uid)
  await seedCourse(uid, 'deleting-course', 'deleting')
  const ref = doc(db, `users/${uid}/focusSessions/session-a`)
  await assertFails(setDoc(ref, focusSessionDocument({ courseId: 'deleting-course' })))
  await assertSucceeds(setDoc(ref, focusSessionDocument()))
  await assertSucceeds(getDoc(ref))
  await assertFails(updateDoc(ref, { courseId: 'deleting-course', updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(ref))
})

test('settings permissions and consent state transitions are enforced', async () => {
  const uid = nextUid('settings')
  const db = dbFor(uid)
  const preferences = doc(db, `users/${uid}/settings/preferences`)

  await assertSucceeds(setDoc(preferences, preferencesDocument()))
  await assertSucceeds(getDoc(preferences))
  await assertSucceeds(updateDoc(preferences, {
    displayName: 'Learner',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(deleteDoc(preferences))

  const uidOptInCreate = nextUid('settings-opt-in-create')
  await assertFails(setDoc(
    doc(dbFor(uidOptInCreate), `users/${uidOptInCreate}/settings/preferences`),
    preferencesDocument({
      aiWorkspaceContextConsent: true,
      consentedAt: storedAt,
      consentVersion: 'test-version',
    }),
  ))

  await assertSucceeds(updateDoc(preferences, {
    aiWorkspaceContextConsent: true,
    consentedAt: serverTimestamp(),
    revokedAt: null,
    consentVersion: 'test-version',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(preferences, {
    displayName: 'Unrelated update cannot imply consent',
    aiWorkspaceContextConsent: false,
    revokedAt: null,
    updatedAt: serverTimestamp(),
  }))
  await assertSucceeds(updateDoc(preferences, {
    aiWorkspaceContextConsent: false,
    revokedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))
  await assertSucceeds(updateDoc(preferences, {
    aiWorkspaceContextConsent: true,
    consentedAt: serverTimestamp(),
    revokedAt: null,
    consentVersion: 'next-test-version',
    updatedAt: serverTimestamp(),
  }))

  const invalidConsentStates = [
    { aiWorkspaceContextConsent: true, consentedAt: null, revokedAt: null, consentVersion: 'v' },
    { aiWorkspaceContextConsent: true, consentedAt: storedAt, revokedAt: storedAt, consentVersion: 'v' },
    { aiWorkspaceContextConsent: false, consentedAt: null, revokedAt: storedAt, consentVersion: 'v' },
    { aiWorkspaceContextConsent: true, consentedAt: storedAt, revokedAt: null, consentVersion: '' },
    { aiWorkspaceContextConsent: false, consentedAt: storedAt, revokedAt: storedAt, consentVersion: '' },
  ]
  for (const [index, state] of invalidConsentStates.entries()) {
    const invalidUid = nextUid(`invalid-consent-${index}`)
    const invalidDb = dbFor(invalidUid)
    const invalidRef = doc(invalidDb, `users/${invalidUid}/settings/preferences`)
    await assertSucceeds(setDoc(invalidRef, preferencesDocument()))
    await assertFails(setDoc(
      invalidRef,
      preferencesDocument({ ...preferencesFields(), ...state, updatedAt: serverTimestamp() }),
    ))
  }
})

test('timer preferences are explicit and focus timer initialization uses the selected setting', async () => {
  const uid = nextUid('timer')
  const db = dbFor(uid)
  const preferences = doc(db, `users/${uid}/settings/timerPreferences`)
  await assertSucceeds(setDoc(preferences, timerPreferencesDocument()))
  await assertSucceeds(getDoc(preferences))
  await assertSucceeds(updateDoc(preferences, {
    focusDurationSeconds: 1800,
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(preferences, { focusDurationSeconds: 0, updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(preferences))

  const focusTimer = doc(db, `users/${uid}/settings/focusTimer`)
  await assertSucceeds(setDoc(focusTimer, timerDocument({ durationSeconds: 1800, remainingSeconds: 1800 })))
  await assertSucceeds(getDoc(focusTimer))
  const uidNoPreferences = nextUid('timer-no-preferences')
  await assertFails(setDoc(
    doc(dbFor(uidNoPreferences), `users/${uidNoPreferences}/settings/focusTimer`),
    timerDocument(),
  ))
  const uidHardcoded = nextUid('timer-hardcoded')
  await seedTimerPreferences(uidHardcoded)
  await assertFails(setDoc(
    doc(dbFor(uidHardcoded), `users/${uidHardcoded}/settings/focusTimer`),
    timerDocument({ durationSeconds: 1234 }),
  ))
  await assertFails(deleteDoc(focusTimer))

  const uidSameBatch = nextUid('timer-batch')
  const batchDb = dbFor(uidSameBatch)
  const batch = writeBatch(batchDb)
  batch.set(
    doc(batchDb, `users/${uidSameBatch}/settings/timerPreferences`),
    timerPreferencesDocument(),
  )
  batch.set(
    doc(batchDb, `users/${uidSameBatch}/settings/focusTimer`),
    timerDocument({ mode: 'shortBreak', durationSeconds: 300, remainingSeconds: 300 }),
  )
  await assertSucceeds(batch.commit())

  const uidMismatch = nextUid('timer-batch-mismatch')
  const mismatchDb = dbFor(uidMismatch)
  const mismatchBatch = writeBatch(mismatchDb)
  mismatchBatch.set(
    doc(mismatchDb, `users/${uidMismatch}/settings/timerPreferences`),
    timerPreferencesDocument(),
  )
  mismatchBatch.set(
    doc(mismatchDb, `users/${uidMismatch}/settings/focusTimer`),
    timerDocument({ durationSeconds: 1234 }),
  )
  await assertFails(mismatchBatch.commit())
})

test('timer generation fence rejects increments and stale writeGeneration', async () => {
  const uid = nextUid('generation')
  const db = dbFor(uid)
  await seedTimerPreferences(uid)
  await seed(uid, 'settings/focusTimer', storedDocument(timerFields({
    generation: 7,
    writeGeneration: 6,
  })))
  const ref = doc(db, `users/${uid}/settings/focusTimer`)

  await assertSucceeds(updateDoc(ref, {
    status: 'paused',
    generation: 7,
    writeGeneration: 7,
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(ref, {
    generation: 8,
    writeGeneration: 7,
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(ref, {
    generation: 7,
    writeGeneration: 6,
    updatedAt: serverTimestamp(),
  }))
})

test('focus timer references require active same-user targets and matching Task course', async () => {
  const uid = nextUid('timer-references')
  const db = dbFor(uid)
  await seedTimerPreferences(uid)
  await seedCourse(uid, 'course-a')
  await seedTask(uid, 'task-a', 'course-a')
  await assertSucceeds(setDoc(
    doc(db, `users/${uid}/settings/focusTimer`),
    timerDocument({ taskId: 'task-a', courseId: 'course-a' }),
  ))

  const mismatchUid = nextUid('timer-reference-mismatch')
  await seedTimerPreferences(mismatchUid)
  await seedCourse(mismatchUid, 'course-a')
  await seedTask(mismatchUid, 'task-a', 'course-a')
  await assertFails(setDoc(
    doc(dbFor(mismatchUid), `users/${mismatchUid}/settings/focusTimer`),
    timerDocument({ taskId: 'task-a', courseId: null }),
  ))
})

test('assistant conversations and messages follow approved lifecycle', async () => {
  const uid = nextUid('assistant')
  const db = dbFor(uid)
  const conversation = doc(db, `users/${uid}/assistantConversations/conversation-a`)
  await assertSucceeds(setDoc(conversation, conversationDocument()))
  await assertSucceeds(getDoc(conversation))
  await assertSucceeds(updateDoc(conversation, {
    title: 'Updated title',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(conversation, {
    title: 'Change with extra field',
    extra: true,
    updatedAt: serverTimestamp(),
  }))
  await assertFails(deleteDoc(conversation))

  const message = doc(db, `users/${uid}/assistantConversations/conversation-a/messages/message-a`)
  await assertSucceeds(setDoc(message, messageDocument()))
  await assertSucceeds(getDoc(message))
  await assertFails(updateDoc(message, { content: 'Edited', updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(message))
  await assertFails(setDoc(
    doc(db, `users/${uid}/assistantConversations/missing/messages/message-a`),
    messageDocument(),
  ))
  await assertFails(getDoc(doc(
    dbFor(nextUid('assistant-other')),
    `users/${uid}/assistantConversations/conversation-a/messages/message-a`,
  )))
})

test('all deletion and migration job paths are server-only', async () => {
  const uid = nextUid('jobs')
  const db = dbFor(uid)
  const jobPaths = [
    `courseDeletionJobs/job-a`,
    `taskDeletionJobs/job-a`,
    `migrationJobs/job-a`,
  ]

  for (const path of jobPaths) {
    await seed(uid, path, storedDocument({
      jobSchemaVersion: 1,
      status: 'queued',
    }))
    const ref = doc(db, `users/${uid}/${path}`)
    await assertFails(setDoc(ref, { jobSchemaVersion: 1 }))
    await assertFails(getDoc(ref))
    await assertFails(updateDoc(ref, { status: 'running' }))
    await assertFails(deleteDoc(ref))
  }
  await assertFails(getDocs(collection(db, `users/${uid}/migrationJobs`)))
})

test('cross-user paths and unauthenticated writes are denied across collections', async () => {
  const owner = nextUid('owner')
  const intruder = nextUid('intruder')
  await seedCourse(owner, 'course-a')
  await seedTask(owner, 'task-a')
  await seedConversation(owner, 'conversation-a')
  const intruderDb = dbFor(intruder)
  const ownerPaths = [
    `users/${owner}/courses/course-a`,
    `users/${owner}/tasks/task-a`,
    `users/${owner}/assistantConversations/conversation-a`,
  ]
  for (const path of ownerPaths) {
    await assertFails(getDoc(doc(intruderDb, path)))
    await assertFails(setDoc(doc(intruderDb, path), courseDocument()))
  }

  const unauthDb = unauthenticatedDb()
  await assertFails(setDoc(
    doc(unauthDb, `users/${owner}/settings/preferences`),
    preferencesDocument(),
  ))
  await assertFails(getDoc(doc(unauthDb, `users/${owner}/assistantConversations/conversation-a`)))
})

test('reference writes respect the 20-call batch limit without relying on cache', async () => {
  const uidAtLimit = nextUid('batch-limit')
  const dbAtLimit = dbFor(uidAtLimit)
  for (let index = 0; index < 20; index += 1) {
    await seedCourse(uidAtLimit, `course-${index}`)
  }
  const atLimit = writeBatch(dbAtLimit)
  for (let index = 0; index < 20; index += 1) {
    atLimit.set(
      doc(dbAtLimit, `users/${uidAtLimit}/tasks/task-${index}`),
      taskDocument({ courseId: `course-${index}` }),
    )
  }
  await assertSucceeds(atLimit.commit())

  const uidOverLimit = nextUid('batch-over-limit')
  const dbOverLimit = dbFor(uidOverLimit)
  for (let index = 0; index < 21; index += 1) {
    await seedCourse(uidOverLimit, `course-${index}`)
  }
  const overLimit = writeBatch(dbOverLimit)
  for (let index = 0; index < 21; index += 1) {
    overLimit.set(
      doc(dbOverLimit, `users/${uidOverLimit}/tasks/task-${index}`),
      taskDocument({ courseId: `course-${index}` }),
    )
  }
  await assertFails(overLimit.commit())
})

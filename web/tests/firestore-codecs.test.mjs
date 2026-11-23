import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { Timestamp } from 'firebase/firestore'

let vite
let models
let codecs

before(async () => {
  vite = await createServer({
    configFile: false,
    envDir: false,
    root: new URL('..', import.meta.url).pathname,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  models = await vite.ssrLoadModule('/src/data/firestore/models.ts')
  codecs = await vite.ssrLoadModule('/src/data/firestore/codecs.ts')
})

after(async () => {
  await vite?.close()
})

const createdAt = Timestamp.fromMillis(1_700_000_000_000)
const updatedAt = Timestamp.fromMillis(1_700_000_010_000)
const instant = (seconds) => new Timestamp(seconds, 123_000_000)
const metadata = (schemaVersion = 1) => ({ schemaVersion, createdAt, updatedAt })

function course(overrides = {}) {
  return {
    id: 'course-a', ...metadata(2), name: 'Biology', code: 'BIO-1', description: '',
    instructor: 'Instructor', tint: 'mint', sortOrder: 3, deletionStatus: 'active',
    deletionJobId: null, deletionStartedAt: null, ...overrides,
  }
}

function task(overrides = {}) {
  return {
    id: 'task-a', ...metadata(2), title: 'Read chapter', description: '', dueAt: null,
    dueDate: null, timeZoneId: null, priority: 'Medium', courseId: null,
    completed: false, completedAt: null, sortOrder: 0, deletionStatus: 'active',
    deletionJobId: null, deletionStartedAt: null, ...overrides,
  }
}

function assertDeletionLifecycleCodec({ id, create, validate, encode, decode }) {
  const active = create()
  const activeData = encode(active)
  assert.equal(validate(activeData), true)
  assert.equal(activeData.schemaVersion, 2)
  assert.equal(activeData.deletionStatus, 'active')
  assert.equal(activeData.deletionJobId, null)
  assert.equal(activeData.deletionStartedAt, null)
  assert.equal(Object.hasOwn(activeData, 'id'), false)

  const deletionStartedAt = instant(300)
  const deleting = create({
    deletionStatus: 'deleting',
    deletionJobId: 'deletion-job-a',
    deletionStartedAt,
  })
  const deletingData = encode(deleting)
  assert.equal(validate(deletingData), true)
  assert.equal(deletingData.schemaVersion, 2)
  assert.equal(deletingData.deletionStatus, 'deleting')
  assert.equal(deletingData.deletionJobId, 'deletion-job-a')
  assert.strictEqual(deletingData.deletionStartedAt, deletionStartedAt)
  assert.ok(deletingData.deletionStartedAt instanceof Timestamp)
  assert.equal(Object.hasOwn(deletingData, 'id'), false)
  assert.strictEqual(decode(id, deletingData).deletionStartedAt, deletionStartedAt)

  const missingField = (field) => {
    const data = { ...activeData }
    delete data[field]
    return data
  }
  const invalidDocuments = [
    ['missing deletionStatus', missingField('deletionStatus')],
    ['missing deletionJobId', missingField('deletionJobId')],
    ['missing deletionStartedAt', missingField('deletionStartedAt')],
    ['invalid status enum', { ...activeData, deletionStatus: 'queued' }],
    ['empty deleting job ID', { ...deletingData, deletionJobId: '' }],
    ['whitespace deleting job ID', { ...deletingData, deletionJobId: '   ' }],
    ['deleting with null job ID', { ...deletingData, deletionJobId: null }],
    ['deleting with null start timestamp', { ...deletingData, deletionStartedAt: null }],
    ['active with non-null job ID', { ...activeData, deletionJobId: 'deletion-job-a' }],
    ['active with non-null start timestamp', { ...activeData, deletionStartedAt }],
    ['invalid start timestamp type', { ...deletingData, deletionStartedAt: '2025-01-01T00:00:00Z' }],
    ['schema version one', { ...activeData, schemaVersion: 1 }],
  ]

  for (const [description, data] of invalidDocuments) {
    assert.equal(validate(data), false, `${description} must fail model validation`)
    assert.throws(() => decode(id, data), /does not match schema version 2/, description)
  }

  assert.throws(
    () => encode(create({ deletionStatus: 'active', deletionJobId: 'deletion-job-a' })),
    /does not match schema version 2/,
    'encoder must reject invalid lifecycle combinations',
  )
}

function event(overrides = {}) {
  return {
    id: 'event-a', ...metadata(), title: 'Class', description: '', startAt: instant(100),
    endAt: instant(200), timeZoneId: 'America/New_York', type: 'class', courseId: null,
    location: '', color: 'navy', startTimeDisambiguation: null, endTimeDisambiguation: null,
    ...overrides,
  }
}

function plannerBlock(overrides = {}) {
  return {
    id: 'block-a', ...metadata(), title: 'Study', startAt: instant(100), endAt: instant(200),
    timeZoneId: 'America/New_York', taskId: null, courseId: null, completed: false,
    sortOrder: 1, ...overrides,
  }
}

function timerPreferences(overrides = {}) {
  return {
    id: 'timer-preferences', ...metadata(), focusDurationSeconds: 1500,
    shortBreakDurationSeconds: 300, longBreakDurationSeconds: 900, ...overrides,
  }
}

function activeTimer(overrides = {}) {
  return {
    id: 'focus-timer', ...metadata(), status: 'idle', mode: 'focus', durationSeconds: 1500,
    remainingSeconds: 1500, elapsedSeconds: 0, generation: 0, writeGeneration: 0,
    startedAt: null, segmentStartedAt: null, endsAt: null, courseId: null,
    taskId: null, runId: null, ...overrides,
  }
}

test('Timestamp codec round trips preserve the exact Firestore Timestamp', () => {
  const encoded = codecs.encodeCourse(course())
  const decoded = codecs.decodeCourse('course-a', encoded)

  assert.ok(encoded.createdAt instanceof Timestamp)
  assert.ok(encoded.updatedAt instanceof Timestamp)
  assert.equal(encoded.createdAt.seconds, createdAt.seconds)
  assert.equal(encoded.createdAt.nanoseconds, createdAt.nanoseconds)
  assert.equal(decoded.updatedAt.seconds, updatedAt.seconds)
  assert.equal(decoded.updatedAt.nanoseconds, updatedAt.nanoseconds)
})

test('nullable timestamps remain null through serialization and deserialization', () => {
  const taskDocument = codecs.encodeTask(task())
  const decodedTask = codecs.decodeTask('task-a', taskDocument)
  const preferences = {
    id: 'preferences', ...metadata(), displayName: 'Student', timeFormat: '12h',
    firstDayOfWeek: 1, timeZoneId: 'UTC', aiWorkspaceContextConsent: false,
    consentedAt: null, revokedAt: null, consentVersion: null,
  }
  const decodedPreferences = codecs.decodeUserPreferences('preferences', codecs.encodeUserPreferences(preferences))

  assert.equal(taskDocument.dueAt, null)
  assert.equal(taskDocument.completedAt, null)
  assert.equal(decodedTask.dueAt, null)
  assert.equal(decodedTask.completedAt, null)
  assert.equal(decodedPreferences.consentedAt, null)
  assert.equal(decodedPreferences.revokedAt, null)
  assert.equal(decodedPreferences.consentVersion, null)
})

test('snapshot document ID is authoritative and never serialized as a mutable field', () => {
  const raw = { ...codecs.encodeCourse(course()), id: 'forged-document-field' }
  const decoded = codecs.decodeSnapshot({ id: 'path-course-id', data: () => raw }, codecs.decodeCourse)
  const encoded = codecs.encodeCourse(decoded)

  assert.equal(decoded.id, 'path-course-id')
  assert.equal(Object.hasOwn(encoded, 'id'), false)
  assert.equal(Object.hasOwn(encoded, 'forged-document-field'), false)
})

test('Course schema version two enforces and encodes deletion lifecycle fields', () => {
  assertDeletionLifecycleCodec({
    id: 'course-a',
    create: course,
    validate: models.isCourseDocument,
    encode: codecs.encodeCourse,
    decode: codecs.decodeCourse,
  })
})

test('Task schema version two enforces and encodes deletion lifecycle fields', () => {
  assertDeletionLifecycleCodec({
    id: 'task-a',
    create: task,
    validate: models.isTaskDocument,
    encode: codecs.encodeTask,
    decode: codecs.decodeTask,
  })
})

test('timed tasks require dueAt, no dueDate, and a timezone', () => {
  const valid = task({ dueAt: instant(500), timeZoneId: 'Asia/Manila' })
  assert.equal(models.isTaskDocument(valid), true)
  assert.equal(models.isTaskDocument(task({ dueAt: instant(500), dueDate: '2025-01-02', timeZoneId: 'UTC' })), false)
  assert.equal(models.isTaskDocument(task({ dueAt: instant(500), timeZoneId: null })), false)
  assert.equal(models.isTaskDocument(task({ dueAt: null, dueDate: '2025-01-02', timeZoneId: 'UTC' })), false)
})

test('date-only deadlines stay strings and never gain artificial timestamps', () => {
  const dateTask = task({ dueDate: '2025-02-28' })
  const encoded = codecs.encodeTask(dateTask)
  const decoded = codecs.decodeTask('task-a', encoded)

  assert.equal(encoded.dueDate, '2025-02-28')
  assert.equal(encoded.dueAt, null)
  assert.equal(decoded.dueDate, '2025-02-28')
  assert.equal(decoded.dueAt, null)
  assert.equal(models.isTaskDocument(task({ dueDate: '2025-02-29' })), false)
})

test('tasks with no deadline are valid and preserve all deadline fields as null', () => {
  const noDeadline = task()
  const decoded = codecs.decodeTask(noDeadline.id, codecs.encodeTask(noDeadline))
  assert.equal(models.isTaskDocument(noDeadline), true)
  assert.equal(decoded.dueAt, null)
  assert.equal(decoded.dueDate, null)
  assert.equal(decoded.timeZoneId, null)
})

test('enum values and event disambiguation values are validated', () => {
  assert.equal(models.isCourseDocument({ ...codecs.encodeCourse(course()), tint: 'red' }), false)
  assert.equal(models.isTaskDocument(task({ priority: 'Urgent' })), false)
  assert.equal(models.isScheduleEventDocument(event({ type: 'exam' })), false)
  assert.equal(models.isScheduleEventDocument(event({ startTimeDisambiguation: 'closest' })), false)
  assert.equal(models.isAssistantMessageDocument({ ...metadata(), role: 'system', content: 'x' }), false)
  assert.equal(models.isScheduleEventDocument(event({ endTimeDisambiguation: undefined })), false)
  const shorterNameOnly = event()
  delete shorterNameOnly.startTimeDisambiguation
  delete shorterNameOnly.endTimeDisambiguation
  shorterNameOnly.startDisambiguation = null
  shorterNameOnly.endDisambiguation = null
  assert.equal(models.isScheduleEventDocument(shorterNameOnly), false)
})

test('durations require positive integers, with no implied timer preferences', () => {
  const focusSession = {
    ...metadata(), mode: 'focus', startedAt: instant(10), endedAt: instant(20),
    durationSeconds: 1, courseId: null, taskId: null, completed: true,
  }
  assert.equal(models.isFocusSessionDocument(focusSession), true)
  assert.equal(models.isFocusSessionDocument({ ...focusSession, durationSeconds: 0 }), false)
  for (const duration of [0, -1, 1.5]) {
    assert.equal(models.isTimerPreferencesDocument(timerPreferences({ focusDurationSeconds: duration })), false)
  }

  const missingConfiguration = { ...metadata() }
  assert.equal(models.isTimerPreferencesDocument(missingConfiguration), false)
  assert.throws(() => codecs.decodeTimerPreferences('timer-preferences', missingConfiguration), /does not match schema/)
})

test('events and planner blocks require strictly increasing instants', () => {
  assert.equal(models.isScheduleEventDocument(event({ endAt: instant(100) })), false)
  assert.equal(models.isScheduleEventDocument(event({ endAt: instant(99) })), false)
  assert.equal(models.isPlannerBlockDocument(plannerBlock({ endAt: instant(100) })), false)
  assert.equal(models.isPlannerBlockDocument(plannerBlock({ endAt: instant(99) })), false)
})

test('cross-midnight event and planner intervals are valid when the end instant is later', () => {
  const start = Timestamp.fromDate(new Date('2025-03-09T23:30:00Z'))
  const end = Timestamp.fromDate(new Date('2025-03-10T00:15:00Z'))
  assert.equal(models.isScheduleEventDocument(event({ startAt: start, endAt: end })), true)
  assert.equal(models.isPlannerBlockDocument(plannerBlock({ startAt: start, endAt: end })), true)
})

test('focus timer generation fields are non-negative integers and round trip without reinterpretation', () => {
  const timer = activeTimer({ generation: 7, writeGeneration: 6 })
  const decoded = codecs.decodeActiveFocusTimer(timer.id, codecs.encodeActiveFocusTimer(timer))

  assert.equal(decoded.generation, 7)
  assert.equal(decoded.writeGeneration, 6)
  assert.equal(models.isActiveFocusTimerDocument(activeTimer({ generation: -1 })), false)
  assert.equal(models.isActiveFocusTimerDocument(activeTimer({ writeGeneration: 1.2 })), false)
})

test('event endpoint choices are independent metadata and timestamps remain authoritative', () => {
  const authored = event({ startTimeDisambiguation: 'earlier', endTimeDisambiguation: null })
  const startAt = authored.startAt
  const endAt = authored.endAt
  const decoded = codecs.decodeScheduleEvent(authored.id, codecs.encodeScheduleEvent(authored))

  assert.equal(decoded.startTimeDisambiguation, 'earlier')
  assert.equal(decoded.endTimeDisambiguation, null)
  assert.equal(decoded.startAt, startAt)
  assert.equal(decoded.endAt, endAt)
  assert.equal(models.isScheduleEventDocument(event({ startTimeDisambiguation: null, endTimeDisambiguation: 'later' })), true)
})

test('Course and Task require schema version two; other product metadata remains version one', () => {
  assert.equal(models.isCourseDocument(course()), true)
  assert.equal(models.isCourseDocument(course({ schemaVersion: 1 })), false)
  assert.equal(models.isTaskDocument(task({ schemaVersion: 2 })), true)
  assert.equal(models.isTaskDocument(task({ schemaVersion: 1 })), false)
  assert.equal(models.isUserProfileDocument({ ...metadata(), displayName: 'Student' }), true)
  assert.equal(models.isCourseDocument(course({ createdAt: new Date() })), false)
  assert.equal(models.isCourseDocument(course({ updatedAt: '2025-01-01T00:00:00Z' })), false)
  assert.throws(() => codecs.decodeCourse('invalid-course', { ...codecs.encodeCourse(course()), updatedAt: null }), /schema version 2/)
})

test('all canonical document codecs remove application IDs from Firestore payloads', () => {
  const fixtures = [
    { model: { id: 'uid', ...metadata(), displayName: 'Student' }, encode: codecs.encodeUserProfile, decode: codecs.decodeUserProfile },
    { model: course(), encode: codecs.encodeCourse, decode: codecs.decodeCourse },
    { model: { id: 'lesson', ...metadata(), courseId: 'course', title: 'Lesson', description: '', content: '', completed: false, sortOrder: 0 }, encode: codecs.encodeLesson, decode: codecs.decodeLesson },
    { model: { id: 'material', ...metadata(), title: 'Notes', content: '', fileName: 'notes.txt', courseId: null, sortOrder: 0 }, encode: codecs.encodeStudyMaterial, decode: codecs.decodeStudyMaterial },
    { model: task(), encode: codecs.encodeTask, decode: codecs.decodeTask },
    { model: event(), encode: codecs.encodeScheduleEvent, decode: codecs.decodeScheduleEvent },
    { model: plannerBlock(), encode: codecs.encodePlannerBlock, decode: codecs.decodePlannerBlock },
    { model: { id: 'session', ...metadata(), mode: 'focus', startedAt: instant(10), endedAt: instant(20), durationSeconds: 10, courseId: null, taskId: null, completed: true }, encode: codecs.encodeFocusSession, decode: codecs.decodeFocusSession },
    { model: { id: 'preferences', ...metadata(), displayName: 'Student', timeFormat: '12h', firstDayOfWeek: 1, timeZoneId: 'UTC', aiWorkspaceContextConsent: models.DEFAULT_AI_WORKSPACE_CONTEXT_CONSENT, consentedAt: null, revokedAt: null, consentVersion: null }, encode: codecs.encodeUserPreferences, decode: codecs.decodeUserPreferences },
    { model: timerPreferences(), encode: codecs.encodeTimerPreferences, decode: codecs.decodeTimerPreferences },
    { model: activeTimer(), encode: codecs.encodeActiveFocusTimer, decode: codecs.decodeActiveFocusTimer },
    { model: { id: 'conversation', ...metadata(), title: 'Study' }, encode: codecs.encodeAssistantConversation, decode: codecs.decodeAssistantConversation },
    { model: { id: 'message', ...metadata(), role: 'assistant', content: 'Hello' }, encode: codecs.encodeAssistantMessage, decode: codecs.decodeAssistantMessage },
  ]

  for (const fixture of fixtures) {
    const documentData = fixture.encode(fixture.model)
    assert.equal(Object.hasOwn(documentData, 'id'), false, `payload for ${fixture.model.id} must not duplicate its path ID`)
    assert.equal(fixture.decode(fixture.model.id, documentData).id, fixture.model.id)
  }
})

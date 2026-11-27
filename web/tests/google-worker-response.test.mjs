import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let vite
let responseModule
before(async () => {
  vite = await createServer({ configFile: false, envDir: false, root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' })
  responseModule = await vite.ssrLoadModule('/src/google/workerResponse.ts')
})
after(async () => vite?.close())

test('legacy responses without pagination metadata remain usable', () => {
  assert.equal(responseModule.paginationInfo({ calendars: [{ calendarId: 'primary', events: [] }] }), null)
})

test('valid pagination metadata is normalized without losing completion state', () => {
  assert.deepEqual(responseModule.paginationInfo({ pagination: { hasMore: true, nextCursor: 'opaque', complete: false } }), { hasMore: true, nextCursor: 'opaque', complete: false })
})

test('structured Worker errors preserve code and message without object coercion', () => {
  const error = responseModule.workerFailure(503, { error: { code: 'GOOGLE_RATE_LIMITED', message: 'Retry this page.', retryable: true } })
  assert.equal(error.code, 'GOOGLE_RATE_LIMITED')
  assert.equal(error.message, 'Retry this page.')
})

test('legacy string errors remain readable while structured errors keep their retry flag', () => {
  assert.deepEqual(responseModule.workerErrorInfo({ error: 'Permission denied.' }), {
    code: 'GOOGLE_WORKER_ERROR', message: 'Permission denied.', retryable: false,
  })
})

test('invalid and expired cursor responses retain their explicit code', () => {
  for (const message of ['Cursor is invalid.', 'Cursor expired.']) {
    const error = responseModule.workerFailure(400, { error: { code: 'INVALID_PAGE_CURSOR', message, retryable: false } })
    assert.equal(error.code, 'INVALID_PAGE_CURSOR')
    assert.equal(error.message, message)
  }
})

test('partial records and structured errors are both available to the panel', () => {
  const payload = { calendars: [{ calendarId: 'primary', calendarName: 'Main', events: [{ id: 'e1' }] }], pagination: { hasMore: true, nextCursor: 'continue' }, error: { code: 'GOOGLE_UPSTREAM_UNAVAILABLE', message: 'Retry this page.', retryable: true } }
  assert.equal(responseModule.workerErrorInfo(payload).code, 'GOOGLE_UPSTREAM_UNAVAILABLE')
  assert.deepEqual(responseModule.partialPage(new responseModule.GoogleWorkerError(503, 'GOOGLE_UPSTREAM_UNAVAILABLE', 'Retry this page.', payload)), payload)
})

test('Calendar and Classroom continuation merges are idempotent by provider IDs', () => {
  const event = { calendarId: 'primary', calendar: 'Main', event: { id: 'e1', summary: 'One' } }
  assert.equal(responseModule.mergeCalendarItems([event], [event], true).length, 1)
  const course = { course: { id: 'c1', name: 'Course' }, courseWork: [{ id: 'w1' }], announcements: [{ id: 'a1' }] }
  const merged = responseModule.mergeClassroomCourses([course], [{ ...course, courseWork: [{ id: 'w1' }, { id: 'w2' }] }], true)
  assert.equal(merged.length, 1)
  assert.deepEqual(merged[0].courseWork.map((work) => work.id), ['w1', 'w2'])
})

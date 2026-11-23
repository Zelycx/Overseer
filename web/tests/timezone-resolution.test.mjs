import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let vite
let timezone
let fixtures

before(async () => {
  vite = await createServer({
    configFile: false,
    envDir: false,
    root: new URL('..', import.meta.url).pathname,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  timezone = await vite.ssrLoadModule('/src/data/timezone/resolve.ts')
  fixtures = JSON.parse(await readFile(new URL('../../shared/test-vectors/timezone-v1.json', import.meta.url), 'utf8'))
})

after(async () => {
  await vite?.close()
})

function runVector(vector) {
  const { input, expected } = vector
  switch (vector.operation) {
    case 'localToUtc':
      return timezone.resolveLocalWallClock(input)
    case 'utcToLocal':
      return timezone.utcInstantToLocalWallClock(input.utcInstant, input.timeZoneId)
    case 'eventEndpoints':
      return timezone.resolveEventEndpoints(input)
    case 'deviceTimezoneIndependence': {
      const previousTz = process.env.TZ
      const results = []
      try {
        for (const deviceTimeZone of input.deviceTimeZones) {
          process.env.TZ = deviceTimeZone
          results.push(timezone.resolveLocalWallClock({
            date: input.date,
            time: input.time,
            timeZoneId: input.timeZoneId,
          }))
        }
      } finally {
        if (previousTz === undefined) delete process.env.TZ
        else process.env.TZ = previousTz
      }
      for (const result of results) assert.equal(result.utcInstant, expected.utcInstant)
      return results[0]
    }
    case 'eventTimezoneChange':
      return timezone.previewEventTimeZoneChange({
        timeZoneId: input.new.timeZoneId,
        start: input.new.start,
        end: input.new.end,
      })
    default:
      throw new Error(`Unsupported timezone vector operation: ${vector.operation}`)
  }
}

function assertResolved(vector, result) {
  const { expected } = vector
  assert.equal(expected.status, 'resolved')
  if (vector.operation === 'eventEndpoints') {
    assert.equal(result.startAt, expected.startAt)
    assert.equal(result.endAt, expected.endAt)
    assert.equal(result.startTimeDisambiguation, expected.startTimeDisambiguation)
    assert.equal(result.endTimeDisambiguation, expected.endTimeDisambiguation)
  } else if (vector.operation === 'eventTimezoneChange') {
    assert.deepEqual({ date: result.start.date, time: result.start.time }, expected.preservedStart)
    assert.deepEqual({ date: result.end.date, time: result.end.time }, expected.preservedEnd)
    assert.equal(result.timeZoneId, expected.timeZoneId)
    assert.equal(result.startAt, expected.startAt)
    assert.equal(result.endAt, expected.endAt)
    assert.equal(result.startTimeDisambiguation, expected.startTimeDisambiguation)
    assert.equal(result.endTimeDisambiguation, expected.endTimeDisambiguation)
  } else if (vector.operation === 'utcToLocal') {
    assert.equal(result.utcInstant, expected.utcInstant)
    assert.equal(result.date, expected.date)
    assert.equal(result.time, expected.time)
    assert.equal(result.timeZoneId, expected.timeZoneId)
  } else {
    assert.equal(result.utcInstant, expected.utcInstant)
    assert.equal(result.disambiguation, expected.disambiguation)
  }
}

test('all shared timezone vectors match their expected results', async (t) => {
  assert.equal(fixtures.version, 1)
  assert.equal(fixtures.format, 'overseer-timezone-test-vectors')

  for (const vector of fixtures.cases) {
    await t.test(vector.id, () => {
      if (vector.expected.status === 'error') {
        assert.throws(() => runVector(vector), (error) => {
          assert.ok(error instanceof timezone.TimezoneResolutionError)
          assert.equal(error.code, vector.expected.code)
          if (vector.expected.choices) assert.deepEqual(error.choices, vector.expected.choices)
          return true
        })
        return
      }
      assertResolved(vector, runVector(vector))
    })
  }
})

test('overlap choices are never implicit and produce distinct instants', () => {
  const input = { date: '2025-11-02', time: '01:30', timeZoneId: 'America/New_York' }
  assert.throws(() => timezone.resolveLocalWallClock(input), (error) => error.code === 'ambiguous_local_time')

  const earlier = timezone.resolveLocalWallClock({ ...input, disambiguation: 'earlier' })
  const later = timezone.resolveLocalWallClock({ ...input, disambiguation: 'later' })
  assert.notEqual(earlier.utcInstant, later.utcInstant)
})

test('disambiguation accepts only earlier, later, or null for unambiguous times', () => {
  const overlap = { date: '2025-11-02', time: '01:30', timeZoneId: 'America/New_York' }
  for (const disambiguation of ['middle', '']) {
    assert.throws(() => timezone.resolveLocalWallClock({ ...overlap, disambiguation }), (error) => (
      error instanceof timezone.TimezoneResolutionError
      && error.code === 'invalid_disambiguation'
    ))
  }

  for (const disambiguation of ['earlier', 'later']) {
    const result = timezone.resolveLocalWallClock({ ...overlap, disambiguation })
    assert.equal(result.disambiguation, disambiguation)
  }

  const unambiguous = timezone.resolveLocalWallClock({
    date: '2025-11-02',
    time: '03:30',
    timeZoneId: 'America/New_York',
    disambiguation: null,
  })
  assert.equal(unambiguous.disambiguation, null)

  assert.throws(() => timezone.resolveLocalWallClock({ ...overlap, disambiguation: null }), (error) => (
    error instanceof timezone.TimezoneResolutionError
    && error.code === 'ambiguous_local_time'
  ))
})

test('event start and end ambiguity choices are resolved independently', () => {
  const result = timezone.resolveEventEndpoints({
    timeZoneId: 'America/New_York',
    start: { date: '2025-11-02', time: '01:30', disambiguation: 'earlier' },
    end: { date: '2025-11-02', time: '01:30', disambiguation: 'later' },
  })
  assert.equal(result.startAt, '2025-11-02T05:30:00Z')
  assert.equal(result.endAt, '2025-11-02T06:30:00Z')
  assert.equal(result.startTimeDisambiguation, 'earlier')
  assert.equal(result.endTimeDisambiguation, 'later')
})

test('event ambiguity errors identify which endpoint requires a choice', () => {
  assert.throws(() => timezone.resolveEventEndpoints({
    timeZoneId: 'America/New_York',
    start: { date: '2025-11-02', time: '01:30' },
    end: { date: '2025-11-02', time: '02:30' },
  }), (error) => error.code === 'ambiguous_local_time' && error.endpoint === 'start')

  assert.throws(() => timezone.resolveEventEndpoints({
    timeZoneId: 'America/New_York',
    start: { date: '2025-11-02', time: '01:30', disambiguation: 'earlier' },
    end: { date: '2025-11-02', time: '01:45' },
  }), (error) => error.code === 'ambiguous_local_time' && error.endpoint === 'end')
})

test('invalid or nonexistent local values never produce an instant', () => {
  for (const input of [
    { date: '2025-03-09', time: '02:30', timeZoneId: 'America/New_York' },
    { date: '2025-02-30', time: '12:00', timeZoneId: 'UTC' },
    { date: '2025-01-01', time: '24:00', timeZoneId: 'UTC' },
  ]) {
    assert.throws(() => timezone.resolveLocalWallClock(input), timezone.TimezoneResolutionError)
  }
})

test('UTC-to-local conversion round-trips without consulting the device timezone', () => {
  const utcInstant = '2025-11-02T06:30:00Z'
  const local = timezone.utcInstantToLocalWallClock(utcInstant, 'America/New_York')
  const back = timezone.resolveLocalWallClock({
    date: local.date,
    time: local.time,
    timeZoneId: local.timeZoneId,
    disambiguation: 'later',
  })
  assert.equal(back.utcInstant, utcInstant)
})

test('explicit timezone change ignores old endpoint choices and re-evaluates ambiguity', () => {
  const previousRecord = {
    timeZoneId: 'Asia/Tokyo',
    startTimeDisambiguation: 'earlier',
    endTimeDisambiguation: 'later',
  }
  assert.equal(previousRecord.timeZoneId, 'Asia/Tokyo')

  assert.throws(() => timezone.previewEventTimeZoneChange({
    timeZoneId: 'America/New_York',
    start: { date: '2025-11-02', time: '01:30' },
    end: { date: '2025-11-02', time: '02:30' },
    previousTimeZoneId: previousRecord.timeZoneId,
    startTimeDisambiguation: previousRecord.startTimeDisambiguation,
    endTimeDisambiguation: previousRecord.endTimeDisambiguation,
  }), (error) => error.code === 'ambiguous_local_time' && error.endpoint === 'start')

  const resolved = timezone.resolveEventEndpoints({
    timeZoneId: 'America/New_York',
    start: { date: '2025-11-02', time: '01:30', disambiguation: 'later' },
    end: { date: '2025-11-02', time: '02:30' },
  })
  assert.equal(resolved.start.date, '2025-11-02')
  assert.equal(resolved.start.time, '01:30')
  assert.equal(resolved.startAt, '2025-11-02T06:30:00Z')
  assert.equal(resolved.startTimeDisambiguation, 'later')
  assert.equal(resolved.endTimeDisambiguation, null)
})

test('invalid timezone and instant inputs use distinct typed errors', () => {
  assert.throws(() => timezone.resolveLocalWallClock({ date: '2025-01-01', time: '12:00', timeZoneId: 'Mars/Olympus_Mons' }), (error) => error.code === 'invalid_time_zone')
  assert.throws(() => timezone.utcInstantToLocalWallClock('2025-01-01T12:00', 'UTC'), (error) => error.code === 'invalid_instant')
})

test('supplied disambiguation on an unambiguous time is not persisted as metadata', () => {
  const result = timezone.resolveLocalWallClock({
    date: '2025-11-02',
    time: '03:30',
    timeZoneId: 'America/New_York',
    disambiguation: 'later',
  })
  assert.equal(result.disambiguation, null)
})

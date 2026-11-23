import { Temporal } from '@js-temporal/polyfill'

export type TimeDisambiguation = 'earlier' | 'later'
export type UtcInstant = string
export type EventEndpoint = 'start' | 'end'

export type TimezoneResolutionErrorCode =
  | 'invalid_date'
  | 'invalid_time'
  | 'invalid_time_zone'
  | 'invalid_instant'
  | 'invalid_disambiguation'
  | 'nonexistent_local_time'
  | 'ambiguous_local_time'
  | 'event_end_not_after_start'

export interface AmbiguousTimeChoices {
  earlier: UtcInstant
  later: UtcInstant
}

export class TimezoneResolutionError extends Error {
  readonly code: TimezoneResolutionErrorCode
  readonly endpoint?: EventEndpoint
  readonly choices?: AmbiguousTimeChoices

  constructor(
    code: TimezoneResolutionErrorCode,
    message: string,
    options: { endpoint?: EventEndpoint; choices?: AmbiguousTimeChoices } = {},
  ) {
    super(message)
    this.name = 'TimezoneResolutionError'
    this.code = code
    this.endpoint = options.endpoint
    this.choices = options.choices
  }
}

export interface LocalWallClockInput {
  date: string
  time: string
  timeZoneId: string
  disambiguation?: TimeDisambiguation | null
}

export interface ResolvedLocalWallClock {
  date: string
  time: string
  timeZoneId: string
  utcInstant: UtcInstant
  disambiguation: TimeDisambiguation | null
}

export interface UtcToLocalResult {
  utcInstant: UtcInstant
  date: string
  time: string
  timeZoneId: string
}

export interface EventEndpointInput {
  date: string
  time: string
  disambiguation?: TimeDisambiguation | null
}

export interface EventEndpointResolutionInput {
  timeZoneId: string
  start: EventEndpointInput
  end: EventEndpointInput
}

export interface ResolvedEventEndpoints {
  timeZoneId: string
  start: ResolvedLocalWallClock
  end: ResolvedLocalWallClock
  startAt: UtcInstant
  endAt: UtcInstant
  startTimeDisambiguation: TimeDisambiguation | null
  endTimeDisambiguation: TimeDisambiguation | null
}

/**
 * Resolve a local calendar date and wall-clock time in an explicit IANA zone.
 * Ambiguous overlaps require a caller choice; nonexistent gap times always fail.
 */
export function resolveLocalWallClock(input: LocalWallClockInput): ResolvedLocalWallClock {
  const localDateTime = parseLocalDateTime(input.date, input.time)
  validateTimeZone(input.timeZoneId)
  validateDisambiguation(input.disambiguation)

  let earlier: Temporal.ZonedDateTime
  let later: Temporal.ZonedDateTime
  try {
    earlier = localDateTime.toZonedDateTime(input.timeZoneId, { disambiguation: 'earlier' })
    later = localDateTime.toZonedDateTime(input.timeZoneId, { disambiguation: 'later' })
  } catch {
    throw invalidTimeZone(input.timeZoneId)
  }

  const earlierMatchesWallClock = earlier.toPlainDateTime().equals(localDateTime)
  const laterMatchesWallClock = later.toPlainDateTime().equals(localDateTime)

  if (!earlierMatchesWallClock || !laterMatchesWallClock) {
    throw new TimezoneResolutionError(
      'nonexistent_local_time',
      `${input.date} ${input.time} does not exist in ${input.timeZoneId} because of a timezone transition.`,
    )
  }

  const ambiguous = earlier.epochNanoseconds !== later.epochNanoseconds
  if (ambiguous && input.disambiguation !== 'earlier' && input.disambiguation !== 'later') {
    throw new TimezoneResolutionError(
      'ambiguous_local_time',
      `${input.date} ${input.time} occurs twice in ${input.timeZoneId}; choose "earlier" or "later".`,
      {
        choices: {
          earlier: earlier.toInstant().toString(),
          later: later.toInstant().toString(),
        },
      },
    )
  }

  const resolved = ambiguous && input.disambiguation === 'later' ? later : earlier
  return {
    date: input.date,
    time: input.time,
    timeZoneId: input.timeZoneId,
    utcInstant: resolved.toInstant().toString(),
    disambiguation: ambiguous ? input.disambiguation ?? null : null,
  }
}

/** Convert an explicit instant to local wall-clock values in the supplied zone. */
export function utcInstantToLocalWallClock(utcInstant: UtcInstant, timeZoneId: string): UtcToLocalResult {
  validateTimeZone(timeZoneId)
  let instant: Temporal.Instant
  try {
    instant = Temporal.Instant.from(utcInstant)
  } catch {
    throw new TimezoneResolutionError('invalid_instant', 'The UTC instant must be a valid ISO-8601 timestamp with an explicit offset.')
  }

  const zoned = instant.toZonedDateTimeISO(timeZoneId)
  return {
    utcInstant: instant.toString(),
    date: zoned.toPlainDate().toString(),
    time: zoned.toPlainTime().toString({ smallestUnit: 'minute' }),
    timeZoneId,
  }
}

/** Resolve event endpoints independently and enforce strict instant ordering. */
export function resolveEventEndpoints(input: EventEndpointResolutionInput): ResolvedEventEndpoints {
  validateTimeZone(input.timeZoneId)
  const start = resolveEndpoint(input.start, input.timeZoneId, 'start')
  const end = resolveEndpoint(input.end, input.timeZoneId, 'end')

  if (Temporal.Instant.compare(start.utcInstant, end.utcInstant) >= 0) {
    throw new TimezoneResolutionError(
      'event_end_not_after_start',
      'The event end instant must be strictly later than the start instant.',
      { endpoint: 'end' },
    )
  }

  return {
    timeZoneId: input.timeZoneId,
    start,
    end,
    startAt: start.utcInstant,
    endAt: end.utcInstant,
    startTimeDisambiguation: start.disambiguation,
    endTimeDisambiguation: end.disambiguation,
  }
}

export interface EventTimeZoneChangeInput {
  /** Newly selected authored timezone. Prior endpoint choices are intentionally absent. */
  timeZoneId: string
  start: Pick<EventEndpointInput, 'date' | 'time'>
  end: Pick<EventEndpointInput, 'date' | 'time'>
}

/**
 * Preview an explicit event timezone change while retaining the entered local
 * wall-clock date/time. New DST choices must be evaluated for the new zone.
 */
export function previewEventTimeZoneChange(input: EventTimeZoneChangeInput): ResolvedEventEndpoints {
  return resolveEventEndpoints({
    timeZoneId: input.timeZoneId,
    start: input.start,
    end: input.end,
  })
}

function resolveEndpoint(input: EventEndpointInput, timeZoneId: string, endpoint: EventEndpoint): ResolvedLocalWallClock {
  try {
    return resolveLocalWallClock({ ...input, timeZoneId })
  } catch (error) {
    if (error instanceof TimezoneResolutionError) {
      throw new TimezoneResolutionError(error.code, error.message, { endpoint, choices: error.choices })
    }
    throw error
  }
}

function parseLocalDateTime(date: string, time: string): Temporal.PlainDateTime {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) {
    throw new TimezoneResolutionError('invalid_date', 'Date must be a valid calendar date in YYYY-MM-DD format.')
  }
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new TimezoneResolutionError('invalid_time', 'Time must be a valid 24-hour wall-clock value in HH:mm format.')
  }

  try {
    const plainDate = Temporal.PlainDate.from(date, { overflow: 'reject' })
    const plainTime = Temporal.PlainTime.from(time, { overflow: 'reject' })
    return plainDate.toPlainDateTime(plainTime)
  } catch {
    throw new TimezoneResolutionError('invalid_date', 'Date must be a valid calendar date in YYYY-MM-DD format.')
  }
}

function validateTimeZone(timeZoneId: string): void {
  if (typeof timeZoneId !== 'string'
    || !timeZoneId
    || timeZoneId.trim() !== timeZoneId
    || /^[+-]\d{2}(?::?\d{2})?$/.test(timeZoneId)) {
    throw invalidTimeZone(timeZoneId)
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZoneId }).format(0)
  } catch {
    throw invalidTimeZone(timeZoneId)
  }
}

function validateDisambiguation(value: unknown): asserts value is TimeDisambiguation | null | undefined {
  if (value !== undefined && value !== null && value !== 'earlier' && value !== 'later') {
    throw new TimezoneResolutionError('invalid_disambiguation', 'Disambiguation must be "earlier" or "later" when supplied.')
  }
}

function invalidTimeZone(timeZoneId: unknown): TimezoneResolutionError {
  return new TimezoneResolutionError('invalid_time_zone', `Invalid IANA timezone identifier: ${String(timeZoneId)}.`)
}

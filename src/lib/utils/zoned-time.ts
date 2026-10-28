/**
 * Wall-clock arithmetic in a named timezone.
 *
 * Extracted from `report-day.ts`, which worked out this machinery for the daily
 * digest and had it all private. The booking calendar needs the same primitives
 * — "what is 9 AM Eastern on this date, as a UTC instant?" is the central
 * question of slot generation — and two copies of DST handling is the last thing
 * anyone wants. `report-day.ts` now imports from here, and its nine existing
 * tests are what make that extraction safe.
 *
 * ## Why none of this is `setHours`
 *
 * Every `Date` method except the `getUTC*` family operates in the *server's*
 * timezone. On Netlify that is UTC, so `setHours(9, 0, 0, 0)` produces 9 AM UTC
 * — 4 or 5 AM in Atlanta. For a report that mis-buckets evening leads; for a
 * booking calendar it would offer appointments in the middle of the night.
 *
 * ## Why offsets are computed, never hardcoded
 *
 * Eastern is UTC-5 in winter and UTC-4 in summer. A fixed offset is an hour
 * wrong for half the year, and puts the error on the days either side of a
 * switch where nobody thinks to look. `Intl.DateTimeFormat` carries the real
 * rules, so the offset is read from the zone at the instant in question.
 */

/** The business's timezone. Joey's, not the server's. */
export const BUSINESS_TIME_ZONE = 'America/New_York';

/** Wall-clock fields of an instant as seen in a zone. */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday, matching `Date.prototype.getUTCDay`. */
  weekday: number;
}

/** Weekday names as `Intl` emits them, mapped to the 0-6 convention. */
const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * `hourCycle: 'h23'` rather than `hour12: false`, which can render midnight as
 * hour 24 and would push day arithmetic forward by one.
 */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
}

/** Formatters are expensive to build and immutable, so they are reused. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = formatterFor(timeZone);
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Read an instant's wall clock in a zone. */
export function zonedParts(
  instant: Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): ZonedParts {
  const parts = cachedFormatter(timeZone).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) {
      throw new Error(`zoned-time: no ${type} part for ${instant.toISOString()}`);
    }
    return value;
  };

  const weekdayName = read('weekday');
  const weekday = WEEKDAYS[weekdayName];
  if (weekday === undefined) {
    throw new Error(`zoned-time: unrecognised weekday "${weekdayName}"`);
  }

  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour: Number(read('hour')),
    minute: Number(read('minute')),
    second: Number(read('second')),
    weekday,
  };
}

/**
 * The zone's offset from UTC, in milliseconds, at a given instant.
 *
 * Derived by reading the instant's wall clock in the zone and re-reading those
 * same fields as if they were UTC: the gap is the offset. Negative for Eastern.
 */
export function zoneOffsetMs(
  instant: Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): number {
  const parts = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  // `formatToParts` has no millisecond field, so compare against the instant
  // truncated to the second or the offset picks up a sub-second remainder.
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asIfUtc - truncated;
}

/**
 * The UTC instant of a wall-clock time in a zone.
 *
 * Converting a wall clock to an instant is circular — the offset depends on the
 * instant being computed — so it resolves in two passes: guess using the offset
 * in force at the same wall clock read as UTC, then re-read the offset at the
 * guess and correct. The second pass only matters within a few hours of a DST
 * change.
 *
 * ## The two hours a year this cannot represent
 *
 * Spring forward skips 2:00-2:59 AM: those wall clocks do not exist, and this
 * returns the instant the clock jumps to. Fall back repeats 1:00-1:59 AM: those
 * wall clocks happen twice, and this returns the first.
 *
 * Both are acceptable here because the business day starts well after 2 AM — no
 * bookable slot ever lands in the affected hour. Stated rather than left for
 * someone to discover if the hours ever widen.
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  timeZone: string = BUSINESS_TIME_ZONE,
): Date {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  const firstGuess = wallClockAsUtc - zoneOffsetMs(new Date(wallClockAsUtc), timeZone);
  const corrected = wallClockAsUtc - zoneOffsetMs(new Date(firstGuess), timeZone);

  return new Date(corrected);
}

/** The UTC instant at which a calendar day begins in the zone. */
export function zonedDayStart(
  year: number,
  month: number,
  day: number,
  timeZone: string = BUSINESS_TIME_ZONE,
): Date {
  // Midnight is always real and unambiguous in the US: transitions happen at
  // 2 AM, so this never lands in a skipped or repeated hour.
  return zonedTimeToInstant(year, month, day, 0, 0, timeZone);
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** An instant's calendar date in the zone, as `YYYY-MM-DD`. */
export function zonedDateString(
  instant: Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): string {
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** An instant's wall-clock time in the zone, as `HH:MM` on a 24-hour clock. */
export function zonedTimeString(
  instant: Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): string {
  const parts = zonedParts(instant, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

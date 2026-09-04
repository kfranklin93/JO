/**
 * Calendar-day windows for human-facing daily reports.
 *
 * ## Why this is not `setHours(0, 0, 0, 0)`
 *
 * The daily summary previously bounded "yesterday" with `setDate(-1)` and
 * `setHours(0, 0, 0, 0)`, which are **server-local** operations. On Netlify the
 * server is UTC, so the window was the previous UTC day.
 *
 * The digest is read by one person, in one timezone, first thing in the morning.
 * The cron fires at 11:30 UTC, roughly 7 AM Eastern, so Joey opens it expecting
 * yesterday *as he lived it*. A UTC window does not describe that day:
 *
 *   A lead submitted 8:00 PM Eastern Monday is 01:00 UTC Tuesday. Under a UTC
 *   window it falls in Tuesday's bucket, so it is reported on Wednesday morning
 *   rather than Tuesday — and on Tuesday morning it is simply missing.
 *
 * Every evening lead is affected, and for a real estate site evening is when
 * people fill in forms. The report would be wrong about the leads most likely to
 * exist. So the window is anchored to Eastern instead: `start` and `end` are the
 * UTC instants of Eastern midnight, and the reported date is the Eastern date.
 *
 * ## Why the offset is computed rather than hardcoded
 *
 * Eastern is UTC-5 in winter and UTC-4 in summer. A fixed offset would be an
 * hour wrong for half the year, which reintroduces a smaller version of the same
 * bug at each DST boundary — and puts the error on the days either side of the
 * switch, where nobody would think to look. `Intl.DateTimeFormat` carries the
 * real rules, so the offset is read from the zone at the instant in question.
 *
 * A consequence worth stating: the spring-forward day is a 23-hour window and
 * the fall-back day is 25. That is correct. Those days really were that long in
 * Eastern, and a fixed 24-hour span would drop or double an hour of leads.
 */

/** The timezone the report describes. Joey's, not the server's. */
export const REPORT_TIME_ZONE = 'America/New_York';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * `hourCycle: 'h23'` rather than `hour12: false`, which can render midnight as
 * hour 24 and would push the arithmetic below a day forward.
 */
const zonedFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Wall-clock fields of an instant as seen in {@link REPORT_TIME_ZONE}. */
function zonedParts(instant: Date): ZonedParts {
  const parts = zonedFormatter.formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) {
      throw new Error(`report-day: no ${type} part for ${instant.toISOString()}`);
    }
    return Number(value);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/**
 * The zone's offset from UTC, in milliseconds, at a given instant.
 *
 * Derived by reading the instant's wall clock in the zone and re-reading those
 * same fields as if they were UTC: the gap between the two is the offset. Comes
 * out negative for Eastern (-5h or -4h).
 */
function zoneOffsetMs(instant: Date): number {
  const parts = zonedParts(instant);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  // `formatToParts` has no millisecond field, so compare against the instant
  // truncated to the second or the offset picks up a stray sub-second remainder.
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asIfUtc - truncated;
}

/**
 * The UTC instant at which a given Eastern calendar day begins.
 *
 * Converting a wall clock to an instant is circular — the offset depends on the
 * instant being computed — so it is resolved in two passes: guess using the
 * offset in force at the same wall clock read as UTC, then re-read the offset at
 * the guess and correct. The second pass only matters within a few hours of a DST
 * change.
 *
 * Midnight is always a real, unambiguous local time in the US: transitions
 * happen at 2 AM, so midnight never falls in a skipped or repeated hour and this
 * cannot land on an instant that does not exist.
 */
function zonedDayStart(year: number, month: number, day: number): Date {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  const firstGuess = wallClockAsUtc - zoneOffsetMs(new Date(wallClockAsUtc));
  const corrected = wallClockAsUtc - zoneOffsetMs(new Date(firstGuess));

  return new Date(corrected);
}

/** A half-open interval `[start, end)` covering one calendar day in the zone. */
export interface DayWindow {
  /** First instant of the day, inclusive. */
  start: Date;
  /** First instant of the following day, exclusive. */
  end: Date;
  /** The day itself as `YYYY-MM-DD` in {@link REPORT_TIME_ZONE}. */
  date: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * The calendar day before `now`, as seen in {@link REPORT_TIME_ZONE}.
 *
 * Half-open by design: `createdAt >= start AND createdAt < end`. A closed
 * interval would put a lead created exactly at midnight in two days' digests.
 */
export function previousDayWindow(now: Date): DayWindow {
  const today = zonedParts(now);

  // Step back one calendar day, not 24 hours. Around a DST change the previous
  // day is 23 or 25 hours long, and subtracting a fixed span would shift the
  // boundary off midnight.
  const yesterday = new Date(Date.UTC(today.year, today.month - 1, today.day));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const year = yesterday.getUTCFullYear();
  const month = yesterday.getUTCMonth() + 1;
  const day = yesterday.getUTCDate();

  return {
    start: zonedDayStart(year, month, day),
    end: zonedDayStart(today.year, today.month, today.day),
    date: `${year}-${pad(month)}-${pad(day)}`,
  };
}

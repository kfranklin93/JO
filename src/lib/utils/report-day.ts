/**
 * Calendar-day windows for human-facing daily reports.
 *
 * The timezone machinery this used to carry privately now lives in
 * `./zoned-time.ts`, because the booking calendar needs the same primitives and
 * two copies of DST handling is the last thing anyone wants. The nine tests
 * alongside this file are what made that extraction safe; they assert the
 * behaviour described below and passed unchanged through it.
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
 * A consequence worth stating: the spring-forward day is a 23-hour window and
 * the fall-back day is 25. That is correct. Those days really were that long in
 * Eastern, and a fixed 24-hour span would drop or double an hour of leads.
 */

import {
  BUSINESS_TIME_ZONE,
  zonedDayStart,
  zonedParts,
} from '@/lib/utils/zoned-time';

/**
 * The timezone the report describes.
 *
 * An alias of `BUSINESS_TIME_ZONE`, kept under this name because the daily
 * summary route reports it in its JSON payload and a test asserts on it.
 */
export const REPORT_TIME_ZONE = BUSINESS_TIME_ZONE;

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
  const today = zonedParts(now, REPORT_TIME_ZONE);

  // Step back one calendar day, not 24 hours. Around a DST change the previous
  // day is 23 or 25 hours long, and subtracting a fixed span would shift the
  // boundary off midnight.
  const yesterday = new Date(Date.UTC(today.year, today.month - 1, today.day));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const year = yesterday.getUTCFullYear();
  const month = yesterday.getUTCMonth() + 1;
  const day = yesterday.getUTCDate();

  return {
    start: zonedDayStart(year, month, day, REPORT_TIME_ZONE),
    end: zonedDayStart(today.year, today.month, today.day, REPORT_TIME_ZONE),
    date: `${year}-${pad(month)}-${pad(day)}`,
  };
}

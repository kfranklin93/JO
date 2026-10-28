/**
 * Human phrasing for an appointment time.
 *
 * Its own module because three callers need the identical string and they must
 * not drift: the assistant reads it out loud, the confirmation the client
 * receives repeats it, and the dashboard shows it to Joey. If those disagree by
 * even an hour, somebody misses a call.
 *
 * Always rendered in Joey's timezone, never the server's or the visitor's. A
 * client in California booking "2:00 PM" is booking 2 PM Eastern, because that
 * is the clock Joey works to — and the label says Eastern explicitly so nobody
 * has to guess which one was meant.
 */

import { BUSINESS_TIME_ZONE } from '@/lib/utils/zoned-time';

/**
 * `hourCycle: 'h12'` with the zone name, e.g.
 * "Thursday, 12 March at 2:00 PM EDT".
 *
 * The abbreviation shifts between EST and EDT with the season, which is correct
 * — it is read from the zone rather than hardcoded, so it is never the wrong one
 * for the date.
 */
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** A slot time as a person would say it. */
export function describeSlot(startsAt: Date): string {
  return formatter.format(startsAt);
}

/** Shorter form for dense lists, without the weekday. */
const shortFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function describeSlotShort(startsAt: Date): string {
  return shortFormatter.format(startsAt);
}

/**
 * Just the day, e.g. "Thu, Mar 12".
 *
 * Pairs with {@link describeSlotTime} so the dashboard can put the date and the
 * time in separate cells without any component reaching for `toLocaleString` —
 * which would render in the *viewer's* timezone and show Joey a different hour
 * than the one the assistant quoted to the client.
 */
const dayOnly = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export function describeSlotDay(startsAt: Date): string {
  return dayOnly.format(startsAt);
}

/**
 * Just the clock time, with its zone: "3:00 PM EDT".
 *
 * The zone abbreviation is not decoration. Pinning the formatter to Joey's zone
 * makes the hour correct; printing the zone is what tells the reader *which*
 * clock they are looking at. Without it the dashboard shows a bare "3:00 PM"
 * and Joey — or an assistant in another zone — has to assume, which is the
 * same guess the long form deliberately removes for the client.
 *
 * Read from the zone rather than hardcoded, so it is EST in January and EDT in
 * July without anybody remembering to switch it.
 */
const timeOnly = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

export function describeSlotTime(startsAt: Date): string {
  return timeOnly.format(startsAt);
}

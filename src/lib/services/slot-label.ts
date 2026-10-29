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
 *
 * ## Why it says "Eastern Time" and not EST or EDT
 *
 * Joey's decision: the label reads as plain Eastern all year. `timeZoneName:
 * 'short'` was correct in the narrow sense — it produced EDT in summer and EST
 * in winter, read from the zone rather than hardcoded — but that is a
 * distinction clients do not make and half of them read as a mistake. The
 * seasonal abbreviation was also the thing people got wrong in both directions,
 * writing "EST" in July and then doubting the time.
 *
 * `'longGeneric'` is what makes this honest rather than cosmetic. It renders
 * "Eastern Time", which is accurate in both seasons, and the *instant* behind
 * the label is still resolved through the IANA zone, so the hour continues to
 * follow daylight saving exactly as before. Nothing is hardcoded and nothing is
 * string-concatenated on; only the name shown changes.
 */

import { BUSINESS_TIME_ZONE } from '@/lib/utils/zoned-time';

/**
 * `hourCycle: 'h12'` with the zone name, e.g.
 * "Thursday, March 12 at 2:00 PM Eastern Time".
 *
 * The long form the assistant quotes and the client's confirmation repeats, so
 * it carries the zone: the one reader guaranteed not to know which clock is
 * meant is the client.
 */
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'longGeneric',
});

/** A slot time as a person would say it. */
export function describeSlot(startsAt: Date): string {
  return formatter.format(startsAt);
}

/**
 * Shorter form for dense lists, without the weekday: "Mar 12, 3:00 PM Eastern
 * Time".
 *
 * Carries the zone. It used to have none, which made it the one label in this
 * module a reader could misinterpret — and "dense list" is not a reason to drop
 * the half of the time that says which clock it is.
 */
const shortFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'longGeneric',
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
 *
 * Deliberately the one formatter here with no zone on it, because it prints no
 * time for a zone to qualify. "Thu, Mar 12, Eastern Time" reads as though the
 * date itself were zone-dependent. The date is still *computed* in Joey's zone,
 * which is the part that matters: a 7 PM Eastern slot is tomorrow in UTC, and
 * this says today.
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
 * Just the clock time, with its zone: "3:00 PM Eastern Time".
 *
 * The zone is not decoration. Pinning the formatter to Joey's zone makes the
 * hour correct; printing the zone is what tells the reader *which* clock they
 * are looking at. Without it the dashboard shows a bare "3:00 PM" and Joey — or
 * an assistant in another zone — has to assume, which is the same guess the
 * long form deliberately removes for the client.
 */
const timeOnly = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'longGeneric',
});

export function describeSlotTime(startsAt: Date): string {
  return timeOnly.format(startsAt);
}

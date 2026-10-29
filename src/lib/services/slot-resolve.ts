/**
 * Turning what the model *said* back into the instant it meant.
 *
 * ## The failure this exists for
 *
 * Nothing persists a tool call. `chat_messages` stores a role and a body of
 * text, and the chat route replays only `{role, content}` pairs, so on a later
 * turn the ISO instants `check_availability` returned are gone. The model's only
 * surviving trace of them is its own prose — "3:00 PM Eastern Time" — and when
 * the client replies "3:30 works" in the next request, that human label is what
 * it hands to `book_appointment`. The label is not on the slot grid, `book()`
 * correctly refuses it, and the client is told a free slot is unavailable.
 *
 * Observed in production: the assistant offered times in one message, the client
 * picked one in the next, and the answer was "that slot just got taken" over a
 * calendar with nothing in it.
 *
 * ## Why resolving is safe, and what keeps it safe
 *
 * Slot generation is a pure function of the clock and the existing bookings
 * (see ./availability.ts), so the server can reconstruct the free set at any
 * moment without having stored anything. {@link resolveSlotLabel} is given that
 * set and may only ever return a member of it. A visitor cannot craft a string
 * that books an arbitrary time, a time outside business hours, or somebody
 * else's slot, because no string resolves to an instant that is not currently
 * free. That property is the reason this is a resolver over a candidate list
 * rather than a date parser.
 *
 * ## Refusing beats guessing
 *
 * "3:30 PM Eastern Time" names a time and not a day, and 3:30 PM is free on
 * most days of a three-week horizon. Resolving that to the soonest candidate
 * would book somebody onto a day they never agreed to, which is a worse outcome
 * than refusing — a wrong appointment in Joey's calendar costs more than one
 * more question in the chat. So a label resolves only when it matches exactly
 * one free slot; zero matches and two matches are both declined, and the caller
 * answers with fresh alternatives so the client can say which day.
 *
 * ## Why components rather than string equality
 *
 * The obvious implementation compares the incoming string to each formatter's
 * output in ./slot-label.ts. That only recognises the four exact phrasings those
 * formatters produce, and the model does not reliably echo one — it writes
 * "October 29 at 3:30 PM", "Thursday at 3:30 PM" or a bare "3:30 PM" depending
 * on how the client asked. So the label is decomposed into weekday, month, day,
 * year and clock time, and a slot matches when every component the label
 * actually states agrees with that slot read in Joey's timezone. The month and
 * weekday vocabulary is read from `Intl` rather than written out, so it is the
 * same vocabulary the labels are built from, and slot-resolve.test.ts pins the
 * output of every formatter in ./slot-label.ts as resolvable to stop the two
 * drifting apart.
 *
 * Unstated components widen the match rather than narrowing it, which is what
 * makes the ambiguity check do the work: a label with no day matches every day
 * and is therefore refused, not resolved to the first one.
 */

import type { Slot } from '@/lib/services/availability';
import { BUSINESS_TIME_ZONE, zonedParts } from '@/lib/utils/zoned-time';

/**
 * What a requested string turned out to name.
 *
 * `ambiguous` carries its matches so the caller can log what it declined; it is
 * a distinct outcome from `no_match` because the two mean opposite things about
 * the client — one has named a real time underspecifically, the other has named
 * no time at all — even though both refuse the booking.
 */
export type SlotResolution =
  | { outcome: 'resolved'; slot: Slot }
  | { outcome: 'ambiguous'; matches: readonly Slot[] }
  | { outcome: 'no_match' };

/**
 * A full ISO-8601 timestamp, which is what `check_availability` hands out.
 *
 * The zone designator is optional only because `Date` has always read a
 * zone-less timestamp as the server's clock, which on Netlify is UTC; that
 * reading is preserved explicitly below rather than changed, since a model that
 * drops the trailing `Z` is still copying a real value.
 */
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?$/;

/**
 * The instant a string states outright, or `undefined` if it does not state one.
 *
 * Deliberately stricter than `new Date(value)`. "October 29, 2025 3:30 PM" is a
 * string `Date` parses happily — in the *server's* zone, so on Netlify it means
 * 3:30 PM UTC, which is 11:30 AM in Atlanta. Booking that would be the quiet
 * version of this whole bug: a plausible instant four hours from the one the
 * client said. Anything that is not an unambiguous ISO timestamp goes to
 * {@link resolveSlotLabel} instead, where it can only land on a real free slot.
 */
export function parseIsoInstant(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!ISO_INSTANT.test(trimmed)) return undefined;

  // Zone-less timestamps keep their historical reading: UTC, which is what the
  // server's clock has always been.
  const withZone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const instant = new Date(withZone);

  return Number.isNaN(instant.getTime()) ? undefined : instant;
}

/** Month and weekday names, read from `Intl` so they match the labels. */
function nameIndex(
  options: Intl.DateTimeFormatOptions,
  instants: readonly Date[],
): Map<string, number> {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options });
  const names = new Map<string, number>();

  instants.forEach((instant, index) => {
    names.set(formatter.format(instant).toLowerCase(), index);
  });

  return names;
}

/** The 15th of each month of a non-leap year, to name the months from. */
const MONTH_SAMPLES = Array.from(
  { length: 12 },
  (_, month) => new Date(Date.UTC(2021, month, 15)),
);

/** 1 August 2021 was a Sunday, so these run Sunday-first like `zonedParts`. */
const WEEKDAY_SAMPLES = Array.from(
  { length: 7 },
  (_, offset) => new Date(Date.UTC(2021, 7, 1 + offset)),
);

const MONTHS = new Map<string, number>([
  // One-based, matching ZonedParts.month.
  ...[...nameIndex({ month: 'long' }, MONTH_SAMPLES)].map(
    ([name, index]) => [name, index + 1] as const,
  ),
  ...[...nameIndex({ month: 'short' }, MONTH_SAMPLES)].map(
    ([name, index]) => [name, index + 1] as const,
  ),
  // "Sept" is not an `Intl` form and is what people type.
  ['sept', 9],
]);

const WEEKDAYS = new Map<string, number>([
  ...nameIndex({ weekday: 'long' }, WEEKDAY_SAMPLES),
  ...nameIndex({ weekday: 'short' }, WEEKDAY_SAMPLES),
  // Abbreviations `Intl` does not emit but a client will write.
  ['tues', 2],
  ['weds', 3],
  ['thur', 4],
  ['thurs', 4],
]);

/**
 * Reduce a phrasing to the words that carry a date or a time.
 *
 * Only noise is removed — the timezone wording the labels append, joining words,
 * punctuation and ordinal suffixes. Nothing that narrows which slot is meant is
 * dropped, and in particular relative words like "next" survive so they reach
 * the unrecognised-token check in {@link parseLabel} and are refused. Treating
 * "next Thursday" as "Thursday" would be a guess about which week.
 */
function normalize(raw: string): string {
  return (
    raw
      .toLowerCase()
      // `Intl` separates the time from AM/PM with a narrow no-break space.
      .replace(/[\u00a0\u202f\u2007]/g, ' ')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\b([ap])\.\s*m\.?/g, '$1m')
      .replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1')
      .replace(/\beastern (?:daylight|standard) time\b/g, ' ')
      .replace(/\beastern time\b/g, ' ')
      .replace(/\beastern\b/g, ' ')
      .replace(/\b(?:et|edt|est)\b/g, ' ')
      .replace(/\bo'clock\b/g, ' ')
      .replace(/\b(?:at|on|the)\b/g, ' ')
      // Everything but the colon, which is part of the clock and not noise.
      .replace(/[,.!?;"']/g, ' ')
      // "3pm" and "3:30pm" are the same statement as "3 pm" and "3:30 pm".
      .replace(/(\d)\s*(am|pm)\b/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** The components a label states. Anything absent widens the match. */
interface LabelParts {
  /** Hour on a 24-hour clock, in Joey's timezone. */
  hour: number;
  minute: number;
  month?: number;
  day?: number;
  /** 0 = Sunday, matching {@link zonedParts}. */
  weekday?: number;
  year?: number;
}

/** A 12-hour clock reading as an hour of the day. */
function toHour24(hour12: number, meridiem: string): number {
  if (meridiem === 'pm') return hour12 === 12 ? 12 : hour12 + 12;
  return hour12 === 12 ? 0 : hour12;
}

const CLOCK = /\b(\d{1,2})(?::(\d{2}))?\s+(am|pm)\b/g;

/**
 * Decompose a normalized phrasing, or refuse it.
 *
 * Refuses rather than partially understands, in three cases that all mean the
 * same thing — the string does not pin down a slot, so the caller must ask:
 *
 *  - No clock time, or more than one ("3:30 or 4 PM"). A 15-minute slot cannot
 *    be identified without a time, and two times are a question, not a choice.
 *  - A component stated twice and differently.
 *  - Any word left over that is not a weekday, a month, a date or a year.
 *    "Tomorrow", "next" and "sometime" land here, which is the point: they are
 *    exactly the words whose meaning this function would have to invent.
 */
function parseLabel(normalized: string): LabelParts | undefined {
  const clocks = [...normalized.matchAll(CLOCK)];
  if (clocks.length !== 1) return undefined;

  const clock = clocks[0]!;
  const hour12 = Number(clock[1]);
  const minute = clock[2] === undefined ? 0 : Number(clock[2]);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return undefined;

  const parts: LabelParts = {
    hour: toHour24(hour12, clock[3]!),
    minute,
  };

  const at = clock.index ?? 0;
  const remainder = `${normalized.slice(0, at)} ${normalized.slice(at + clock[0].length)}`;

  for (const token of remainder.split(/\s+/).filter(Boolean)) {
    const month = MONTHS.get(token);
    if (month !== undefined) {
      if (parts.month !== undefined && parts.month !== month) return undefined;
      parts.month = month;
      continue;
    }

    const weekday = WEEKDAYS.get(token);
    if (weekday !== undefined) {
      if (parts.weekday !== undefined && parts.weekday !== weekday) return undefined;
      parts.weekday = weekday;
      continue;
    }

    const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(token);
    if (isoDate) {
      if (parts.day !== undefined || parts.month !== undefined) return undefined;
      parts.year = Number(isoDate[1]);
      parts.month = Number(isoDate[2]);
      parts.day = Number(isoDate[3]);
      continue;
    }

    const slashed = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(token);
    if (slashed) {
      if (parts.day !== undefined || parts.month !== undefined) return undefined;
      parts.month = Number(slashed[1]);
      parts.day = Number(slashed[2]);
      if (slashed[3] !== undefined) parts.year = Number(slashed[3]);
      continue;
    }

    if (/^\d{1,2}$/.test(token)) {
      const day = Number(token);
      if (parts.day !== undefined && parts.day !== day) return undefined;
      parts.day = day;
      continue;
    }

    if (/^\d{4}$/.test(token)) {
      const year = Number(token);
      if (parts.year !== undefined && parts.year !== year) return undefined;
      parts.year = year;
      continue;
    }

    // A word this cannot account for. Refuse the whole string.
    return undefined;
  }

  return parts;
}

/** Whether a slot, read in Joey's timezone, agrees with every stated component. */
function matches(slot: Slot, label: LabelParts): boolean {
  const parts = zonedParts(slot.startsAt, BUSINESS_TIME_ZONE);

  if (parts.hour !== label.hour || parts.minute !== label.minute) return false;
  if (label.month !== undefined && parts.month !== label.month) return false;
  if (label.day !== undefined && parts.day !== label.day) return false;
  if (label.weekday !== undefined && parts.weekday !== label.weekday) return false;
  if (label.year !== undefined && parts.year !== label.year) return false;

  return true;
}

/**
 * Which free slot a human phrasing names, if exactly one.
 *
 * @param requested - What the model passed to `book_appointment`.
 * @param slots - The slots that are free *now*. The result is always one of
 *   these or nothing, which is the security property: resolution can never
 *   widen what is bookable, only recognise which bookable thing was meant.
 */
export function resolveSlotLabel(
  requested: string,
  slots: readonly Slot[],
): SlotResolution {
  const label = parseLabel(normalize(requested));
  if (!label) return { outcome: 'no_match' };

  const found = slots.filter((slot) => matches(slot, label));

  if (found.length === 1) return { outcome: 'resolved', slot: found[0]! };
  if (found.length > 1) return { outcome: 'ambiguous', matches: found };

  return { outcome: 'no_match' };
}

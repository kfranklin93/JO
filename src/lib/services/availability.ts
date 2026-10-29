/**
 * When Joey can be booked, and which slots are actually free.
 *
 * Availability is declared here as data rather than stored in the database,
 * following the same reasoning as `follow-up-content.ts`: it is Joey's working
 * pattern, it changes rarely, and it is reviewable in a pull request. Moving it
 * into a table buys an admin screen nobody has asked for and costs a round trip
 * on every slot query.
 *
 * ## Everything is Eastern, and that is the whole difficulty
 *
 * The rules below are wall-clock times in Joey's timezone. The slots they
 * produce are UTC instants. Getting between those two is the entire job, and it
 * is why `zoned-time.ts` exists — every `Date` method except the `getUTC*`
 * family reads the *server's* clock, which on Netlify is UTC. A naive
 * implementation offers 9 AM appointments that are 4 AM in Atlanta, and is an
 * hour wrong for half the year even once that is fixed.
 *
 * ## Slot generation is a pure function
 *
 * {@link freeSlots} takes rules, existing bookings and a clock, and returns
 * slots. No database, no `Date.now()`. That is deliberate: this is the logic
 * most likely to be subtly wrong at a DST boundary or a day edge, and pure
 * functions are the only kind that can be exhaustively tested at those points.
 * The database work lives in `booking.ts`.
 */

import {
  BUSINESS_TIME_ZONE,
  zonedDateString,
  zonedParts,
  zonedTimeToInstant,
  zonedTimeString,
} from '@/lib/utils/zoned-time';

/** A span of bookable wall-clock time on one weekday. */
export interface AvailabilityWindow {
  /** 0 = Sunday, matching `Date.prototype.getUTCDay`. */
  weekday: number;
  /** Inclusive start, `HH:MM` on a 24-hour clock, Eastern. */
  from: string;
  /** Exclusive end, `HH:MM`. A window of 09:00-12:00 ends before 12:00. */
  to: string;
}

/**
 * Joey's bookable hours.
 *
 * Weekdays only, with a midday gap. Saturday mornings included because weekend
 * showings are the job — a real estate agent unbookable at the weekend is a
 * misconfiguration, not a lifestyle.
 *
 * These are placeholders in one specific sense: they are reasonable, not
 * confirmed. Joey should review them before launch, which is why they are in
 * one obvious list rather than scattered.
 */
export const BUSINESS_HOURS: readonly AvailabilityWindow[] = [
  { weekday: 1, from: '09:00', to: '12:00' },
  { weekday: 1, from: '13:00', to: '17:00' },
  { weekday: 2, from: '09:00', to: '12:00' },
  { weekday: 2, from: '13:00', to: '17:00' },
  { weekday: 3, from: '09:00', to: '12:00' },
  { weekday: 3, from: '13:00', to: '17:00' },
  { weekday: 4, from: '09:00', to: '12:00' },
  { weekday: 4, from: '13:00', to: '17:00' },
  { weekday: 5, from: '09:00', to: '12:00' },
  { weekday: 5, from: '13:00', to: '16:00' },
  { weekday: 6, from: '10:00', to: '13:00' },
];

/** Length of a consultation, in minutes. Joey's brief says fifteen. */
export const SLOT_MINUTES = 15;

/**
 * How far ahead a booking must be made.
 *
 * Two hours, so nobody books a call that starts before Joey has seen the alert.
 * This is the single most important rule for his trust in the feature: a slot
 * offered for twenty minutes' time is worse than no slot at all.
 */
export const MIN_NOTICE_MINUTES = 120;

/**
 * Extra notice a slot needs before it may be *offered*, on top of
 * {@link MIN_NOTICE_MINUTES}.
 *
 * ## Why there are two notice windows, which is not a bug
 *
 * {@link MIN_NOTICE_MINUTES} is the rule: nothing may be booked inside two
 * hours. This is a margin on top of it, applied only when slots are offered.
 * The asymmetry is the fix for an observed production failure.
 *
 * A conversation takes time. The assistant offered 3:00–4:45 PM, the client
 * read it, asked a question, gave their name and email, and only then picked
 * 3:15. By that point 3:15 was inside the two-hour window, so `book()`
 * correctly refused a slot that had been genuinely free when it was offered.
 * From the client's side the assistant listed a time and then denied it
 * existed.
 *
 * Offering with a margin and booking without one means the boundary is crossed
 * before the offer is made rather than during the conversation. A client who
 * picks promptly is never refused, because `book()` still validates against the
 * real two hours — the margin only ever makes the offer *more* conservative,
 * never the booking more permissive. That direction matters: the reverse would
 * let the assistant offer something Joey cannot honour.
 *
 * Sixty minutes, chosen against the transcript that prompted this: that session
 * ran sixteen messages, and a web chat where somebody steps away mid-thread and
 * comes back is ordinary. An hour covers that with room to spare while still
 * leaving same-day afternoon slots on offer. It cannot be a guarantee — a
 * client who disappears for three hours and then picks will still be refused,
 * and `book()` saying no is the correct answer in that case.
 */
export const OFFER_BUFFER_MINUTES = 60;

/** Total notice a slot needs before {@link offerableSlots} will offer it. */
export const OFFER_NOTICE_MINUTES = MIN_NOTICE_MINUTES + OFFER_BUFFER_MINUTES;

/** How far into the future slots are offered. */
export const BOOKING_HORIZON_DAYS = 21;

/** Dates Joey is unavailable regardless of weekday, as `YYYY-MM-DD` Eastern. */
export const BLACKOUT_DATES: readonly string[] = [];

/** One bookable slot. */
export interface Slot {
  /** UTC instant the slot begins. */
  startsAt: Date;
  /** UTC instant it ends. */
  endsAt: Date;
  /** The Eastern date, `YYYY-MM-DD`, for grouping in a UI. */
  date: string;
  /** The Eastern wall-clock start, `HH:MM`, for display. */
  time: string;
}

/** Parse `HH:MM` into minutes since midnight. */
function toMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  if (
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    throw new Error(`availability: "${clock}" is not HH:MM`);
  }
  return hours * 60 + minutes;
}

export interface SlotOptions {
  /** Defaults to {@link BUSINESS_HOURS}. */
  windows?: readonly AvailabilityWindow[];
  /** Instants already taken. Compared by exact start, matching the grid. */
  booked?: readonly Date[];
  /** Defaults to {@link BLACKOUT_DATES}. */
  blackouts?: readonly string[];
  /** Defaults to {@link BOOKING_HORIZON_DAYS}. */
  horizonDays?: number;
  /** Defaults to {@link MIN_NOTICE_MINUTES}. */
  minNoticeMinutes?: number;
  /** Cap on how many slots to return. */
  limit?: number;
}

/**
 * Every free slot from `now` to the horizon.
 *
 * Pure: the clock and the bookings are arguments, so a test can place `now`
 * anywhere — including inside a DST transition — and get a deterministic answer.
 *
 * Days are walked as calendar dates in Eastern rather than by adding 24 hours,
 * because a DST day is 23 or 25 hours long and fixed-span arithmetic drifts off
 * the day boundary and eventually skips or repeats one.
 */
export function freeSlots(now: Date, options: SlotOptions = {}): Slot[] {
  const windows = options.windows ?? BUSINESS_HOURS;
  const blackouts = new Set(options.blackouts ?? BLACKOUT_DATES);
  const horizonDays = options.horizonDays ?? BOOKING_HORIZON_DAYS;
  const minNotice = options.minNoticeMinutes ?? MIN_NOTICE_MINUTES;

  // Exact-instant comparison. Every slot comes off the same grid, so a booking
  // either starts exactly on a slot or is not a slot booking at all.
  const taken = new Set((options.booked ?? []).map((date) => date.getTime()));

  const earliest = now.getTime() + minNotice * 60_000;
  const slots: Slot[] = [];

  const today = zonedParts(now, BUSINESS_TIME_ZONE);

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset += 1) {
    // Calendar-date arithmetic in UTC purely as a counter, then read back as a
    // date. This never touches wall-clock times, so DST cannot distort it.
    const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day));
    cursor.setUTCDate(cursor.getUTCDate() + dayOffset);

    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const weekday = cursor.getUTCDay();

    const dayStart = zonedTimeToInstant(year, month, day, 0, 0, BUSINESS_TIME_ZONE);
    const date = zonedDateString(dayStart, BUSINESS_TIME_ZONE);

    if (blackouts.has(date)) continue;

    for (const window of windows) {
      if (window.weekday !== weekday) continue;

      const from = toMinutes(window.from);
      const to = toMinutes(window.to);

      for (let minute = from; minute + SLOT_MINUTES <= to; minute += SLOT_MINUTES) {
        const startsAt = zonedTimeToInstant(
          year,
          month,
          day,
          Math.floor(minute / 60),
          minute % 60,
          BUSINESS_TIME_ZONE,
        );

        if (startsAt.getTime() < earliest) continue;
        if (taken.has(startsAt.getTime())) continue;

        slots.push({
          startsAt,
          endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000),
          date,
          time: zonedTimeString(startsAt, BUSINESS_TIME_ZONE),
        });

        if (options.limit && slots.length >= options.limit) {
          return sortSlots(slots);
        }
      }
    }
  }

  return sortSlots(slots);
}

/**
 * Chronological order.
 *
 * Needed because the windows for one day are generated in list order, and a day
 * with a morning and an afternoon window produces them in that order only if
 * the list happens to be sorted. Sorting explicitly means the list above can be
 * edited without a subtle ordering bug.
 */
function sortSlots(slots: Slot[]): Slot[] {
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Free slots that are safe to *offer* to somebody mid-conversation.
 *
 * {@link freeSlots} with {@link OFFER_NOTICE_MINUTES} instead of
 * {@link MIN_NOTICE_MINUTES}. Every path that shows a time to a client goes
 * through here; {@link freeSlots} and {@link isBookable} stay on the real rule,
 * so a booking is validated against what Joey actually requires and an offer is
 * made with a margin. See the note on {@link OFFER_BUFFER_MINUTES} for why.
 *
 * Pure, for the same reason {@link freeSlots} is: the boundary behaviour is the
 * whole point of the function and it has to be assertable at the exact minute.
 *
 * A caller may still pass `minNoticeMinutes` to override the margin — the
 * options spread last — which is what lets a test state both windows explicitly.
 */
export function offerableSlots(now: Date, options: SlotOptions = {}): Slot[] {
  return freeSlots(now, { minNoticeMinutes: OFFER_NOTICE_MINUTES, ...options });
}

/**
 * Whether an instant is a real, currently-bookable slot.
 *
 * The guard the booking path needs. A model asked to book "tomorrow at 3" can
 * produce any instant it likes; this is what refuses anything that is not on
 * the grid, inside business hours, beyond the notice period and still free.
 * Requirement 2 of the assistant spec in one function.
 */
export function isBookable(
  startsAt: Date,
  now: Date,
  options: SlotOptions = {},
): boolean {
  const target = startsAt.getTime();

  // Scanning is acceptable: the horizon is three weeks of fifteen-minute slots
  // during business hours, which is hundreds of entries, not millions.
  return freeSlots(now, options).some((slot) => slot.startsAt.getTime() === target);
}

/** Slots grouped by Eastern date, for rendering a day-by-day picker. */
export function slotsByDate(slots: readonly Slot[]): Map<string, Slot[]> {
  const grouped = new Map<string, Slot[]>();
  for (const slot of slots) {
    const list = grouped.get(slot.date) ?? [];
    list.push(slot);
    grouped.set(slot.date, list);
  }
  return grouped;
}

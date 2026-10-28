import { describe, expect, it } from 'vitest';
import {
  BUSINESS_HOURS,
  MIN_NOTICE_MINUTES,
  SLOT_MINUTES,
  freeSlots,
  isBookable,
  slotsByDate,
  type AvailabilityWindow,
} from './availability';
import { zonedTimeString, zonedDateString } from '@/lib/utils/zoned-time';

/**
 * Tests for slot generation.
 *
 * This is the logic most likely to be subtly wrong, and wrong in a way nobody
 * notices until a client turns up an hour early. Two classes of bug are the
 * reason it is a pure function:
 *
 *  1. **Timezone.** Every `Date` method except `getUTC*` reads the server clock,
 *     which on Netlify is UTC. A naive implementation offers 9 AM slots that are
 *     4 AM in Atlanta.
 *  2. **DST.** Eastern is UTC-4 or UTC-5 depending on the date, so a hardcoded
 *     offset is an hour wrong for half the year — and day arithmetic by adding
 *     86,400,000 ms drifts off midnight on the two days a year that are 23 and
 *     25 hours long.
 *
 * Both are asserted at the exact boundaries below. `now` is always explicit so
 * the answers are deterministic.
 */

/** A Monday, 8 AM Eastern (EST, UTC-5). */
const MON_8AM_EST = new Date('2026-01-12T13:00:00.000Z');

/** A Monday, 8 AM Eastern in summer (EDT, UTC-4). */
const MON_8AM_EDT = new Date('2026-07-13T12:00:00.000Z');

/** Monday 9-12 and 13-17, nothing else — simpler to reason about than the real list. */
const MONDAY_ONLY: AvailabilityWindow[] = [
  { weekday: 1, from: '09:00', to: '12:00' },
  { weekday: 1, from: '13:00', to: '17:00' },
];

describe('slots land on Joey’s wall clock, not the server’s', () => {
  it('starts the first winter slot at 10:00 Eastern given 8 AM and two hours’ notice', () => {
    // 8 AM + 120 minutes notice = 10:00. If this came out as 05:00 or 15:00,
    // the server's timezone is leaking in.
    const [first] = freeSlots(MON_8AM_EST, { windows: MONDAY_ONLY });

    expect(zonedTimeString(first!.startsAt)).toBe('10:00');
  });

  it('does the same in summer, when the offset is an hour different', () => {
    const [first] = freeSlots(MON_8AM_EDT, { windows: MONDAY_ONLY });

    expect(zonedTimeString(first!.startsAt)).toBe('10:00');
  });

  it('puts a 10:00 Eastern winter slot at 15:00 UTC', () => {
    const [first] = freeSlots(MON_8AM_EST, { windows: MONDAY_ONLY });

    expect(first!.startsAt.toISOString()).toBe('2026-01-12T15:00:00.000Z');
  });

  it('puts a 10:00 Eastern summer slot at 14:00 UTC', () => {
    // The same wall clock, one hour earlier in UTC. A hardcoded offset fails
    // exactly one of these two tests.
    const [first] = freeSlots(MON_8AM_EDT, { windows: MONDAY_ONLY });

    expect(first!.startsAt.toISOString()).toBe('2026-07-13T14:00:00.000Z');
  });
});

describe('the windows are honoured', () => {
  const slots = freeSlots(MON_8AM_EST, { windows: MONDAY_ONLY, horizonDays: 0 });

  it('offers nothing before the window opens or after it closes', () => {
    const times = slots.map((slot) => zonedTimeString(slot.startsAt));

    expect(times).not.toContain('08:45');
    expect(times).not.toContain('17:00');
    expect(times.at(-1)).toBe('16:45');
  });

  it('respects the midday gap', () => {
    const times = slots.map((slot) => zonedTimeString(slot.startsAt));

    expect(times).toContain('11:45');
    expect(times).not.toContain('12:00');
    expect(times).not.toContain('12:45');
    expect(times).toContain('13:00');
  });

  it('never starts a slot that would run past the window', () => {
    // A 15-minute slot at 11:50 would end at 12:05, inside the gap.
    for (const slot of slots) {
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(
        SLOT_MINUTES * 60_000,
      );
    }
  });

  it('offers nothing on a day with no window', () => {
    // A Sunday.
    const sunday = new Date('2026-01-11T13:00:00.000Z');

    expect(freeSlots(sunday, { windows: MONDAY_ONLY, horizonDays: 0 })).toEqual([]);
  });
});

describe('minimum notice', () => {
  it('refuses a slot inside the notice period', () => {
    // 11:50 Eastern, so 12:00 is ten minutes away and must not be offered.
    const almostNoon = new Date('2026-01-12T16:50:00.000Z');

    const times = freeSlots(almostNoon, {
      windows: MONDAY_ONLY,
      horizonDays: 0,
    }).map((slot) => zonedTimeString(slot.startsAt));

    expect(times).not.toContain('12:00');
    expect(times).not.toContain('13:00');
    // 13:50 + notice lands at 13:50; the first slot at or after is 14:00.
    expect(times[0]).toBe('14:00');
  });

  it('is configurable, and zero notice offers the next slot', () => {
    const almostNoon = new Date('2026-01-12T16:50:00.000Z');

    const times = freeSlots(almostNoon, {
      windows: MONDAY_ONLY,
      horizonDays: 0,
      minNoticeMinutes: 0,
    }).map((slot) => zonedTimeString(slot.startsAt));

    expect(times[0]).toBe('13:00');
  });

  it('defaults to two hours, so nobody books before Joey sees the alert', () => {
    expect(MIN_NOTICE_MINUTES).toBe(120);
  });
});

describe('existing bookings', () => {
  it('removes a taken slot and keeps its neighbours', () => {
    const taken = new Date('2026-01-12T15:00:00.000Z'); // 10:00 Eastern

    const times = freeSlots(MON_8AM_EST, {
      windows: MONDAY_ONLY,
      horizonDays: 0,
      booked: [taken],
    }).map((slot) => zonedTimeString(slot.startsAt));

    expect(times).not.toContain('10:00');
    expect(times).toContain('10:15');
  });

  it('ignores a booking that is not on the grid', () => {
    // A 10:07 booking cannot have come from this system, so it blocks nothing.
    // Said plainly because it is the assumption the unique index relies on.
    const offGrid = new Date('2026-01-12T15:07:00.000Z');

    const times = freeSlots(MON_8AM_EST, {
      windows: MONDAY_ONLY,
      horizonDays: 0,
      booked: [offGrid],
    }).map((slot) => zonedTimeString(slot.startsAt));

    expect(times).toContain('10:00');
  });
});

describe('across a DST boundary', () => {
  // US spring forward 2026: 2 AM Sunday 8 March. The Monday after is EDT.
  const FRI_BEFORE_SPRING = new Date('2026-03-06T14:00:00.000Z'); // 9 AM EST

  it('keeps the wall clock steady either side of the change', () => {
    // The point: a client booking "10:00" in the week of the change must get
    // 10:00 Joey's time, whichever side of Sunday they land on.
    const byDate = slotsByDate(
      freeSlots(FRI_BEFORE_SPRING, { windows: BUSINESS_HOURS, horizonDays: 5 }),
    );

    const friday = byDate.get('2026-03-06') ?? [];
    const monday = byDate.get('2026-03-09') ?? [];

    expect(friday.length).toBeGreaterThan(0);
    expect(monday.length).toBeGreaterThan(0);
    expect(zonedTimeString(friday[0]!.startsAt)).toBe('11:00');
    expect(zonedTimeString(monday[0]!.startsAt)).toBe('09:00');
  });

  it('shifts the UTC instant by an hour, which is the correct consequence', () => {
    const byDate = slotsByDate(
      freeSlots(FRI_BEFORE_SPRING, { windows: BUSINESS_HOURS, horizonDays: 5 }),
    );

    // 09:00 Eastern is 14:00 UTC in winter and 13:00 UTC in summer.
    const monday = byDate.get('2026-03-09') ?? [];
    expect(monday[0]!.startsAt.toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });

  it('never skips or duplicates a calendar day', () => {
    // Day stepping by adding 24 hours drifts across a 23-hour day and
    // eventually repeats or loses one. Walking calendar dates does not.
    const dates = [
      ...slotsByDate(
        freeSlots(FRI_BEFORE_SPRING, { windows: BUSINESS_HOURS, horizonDays: 14 }),
      ).keys(),
    ];

    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toEqual([...dates].sort());
  });
});

describe('ordering and grouping', () => {
  it('returns slots chronologically even though windows are generated per day', () => {
    const slots = freeSlots(MON_8AM_EST, { windows: MONDAY_ONLY, horizonDays: 7 });

    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i]!.startsAt.getTime()).toBeGreaterThan(
        slots[i - 1]!.startsAt.getTime(),
      );
    }
  });

  it('is unaffected by the order the windows are declared in', () => {
    const reversed = [...MONDAY_ONLY].reverse();

    const forward = freeSlots(MON_8AM_EST, { windows: MONDAY_ONLY, horizonDays: 0 });
    const backward = freeSlots(MON_8AM_EST, { windows: reversed, horizonDays: 0 });

    expect(backward.map((s) => s.time)).toEqual(forward.map((s) => s.time));
  });

  it('groups by the Eastern date, not the UTC one', () => {
    // A 19:00 Eastern slot is the next day in UTC. Grouping on UTC would file
    // an evening appointment under tomorrow.
    const evening: AvailabilityWindow[] = [{ weekday: 1, from: '19:00', to: '20:00' }];
    const slots = freeSlots(MON_8AM_EST, { windows: evening, horizonDays: 0 });

    expect(slots[0]!.startsAt.toISOString()).toContain('2026-01-13T00:00');
    expect(slots[0]!.date).toBe('2026-01-12');
    expect(zonedDateString(slots[0]!.startsAt)).toBe('2026-01-12');
  });
});

describe('blackouts and limits', () => {
  it('skips a blacked-out date', () => {
    const slots = freeSlots(MON_8AM_EST, {
      windows: MONDAY_ONLY,
      horizonDays: 0,
      blackouts: ['2026-01-12'],
    });

    expect(slots).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(
      freeSlots(MON_8AM_EST, { windows: MONDAY_ONLY, limit: 3 }),
    ).toHaveLength(3);
  });

  it('offers nothing beyond the horizon', () => {
    const slots = freeSlots(MON_8AM_EST, { windows: MONDAY_ONLY, horizonDays: 0 });
    const dates = new Set(slots.map((slot) => slot.date));

    expect([...dates]).toEqual(['2026-01-12']);
  });
});

describe('isBookable — the guard on the booking path', () => {
  it('accepts an instant that is a real free slot', () => {
    const tenAm = new Date('2026-01-12T15:00:00.000Z');

    expect(isBookable(tenAm, MON_8AM_EST, { windows: MONDAY_ONLY })).toBe(true);
  });

  it('refuses an instant off the grid', () => {
    // A model asked to book "around ten" can produce 10:07. It must not stick.
    const offGrid = new Date('2026-01-12T15:07:00.000Z');

    expect(isBookable(offGrid, MON_8AM_EST, { windows: MONDAY_ONLY })).toBe(false);
  });

  it('refuses a time outside business hours', () => {
    const threeAm = new Date('2026-01-12T08:00:00.000Z');

    expect(isBookable(threeAm, MON_8AM_EST, { windows: MONDAY_ONLY })).toBe(false);
  });

  it('refuses a slot already booked', () => {
    const tenAm = new Date('2026-01-12T15:00:00.000Z');

    expect(
      isBookable(tenAm, MON_8AM_EST, { windows: MONDAY_ONLY, booked: [tenAm] }),
    ).toBe(false);
  });

  it('refuses a slot inside the notice period', () => {
    const tenAm = new Date('2026-01-12T15:00:00.000Z');
    const nineFifty = new Date('2026-01-12T14:50:00.000Z');

    expect(isBookable(tenAm, nineFifty, { windows: MONDAY_ONLY })).toBe(false);
  });

  it('refuses a time in the past', () => {
    const lastWeek = new Date('2026-01-05T15:00:00.000Z');

    expect(isBookable(lastWeek, MON_8AM_EST, { windows: MONDAY_ONLY })).toBe(false);
  });
});

describe('the shipped business hours', () => {
  it('covers weekdays and Saturday morning', () => {
    const days = new Set(BUSINESS_HOURS.map((w) => w.weekday));

    expect(days).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('declares no window on Sunday', () => {
    expect(BUSINESS_HOURS.some((w) => w.weekday === 0)).toBe(false);
  });

  it('has every window ending after it starts', () => {
    for (const window of BUSINESS_HOURS) {
      expect(window.to > window.from, JSON.stringify(window)).toBe(true);
    }
  });
});

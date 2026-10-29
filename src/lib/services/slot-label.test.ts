import { describe, expect, it } from 'vitest';
import {
  describeSlot,
  describeSlotDay,
  describeSlotShort,
  describeSlotTime,
} from './slot-label';

/**
 * Appointment labels.
 *
 * The thing being pinned down is that none of these render in the machine's
 * timezone. Every assertion below uses an explicit UTC instant and expects an
 * Eastern wall clock, so a test run on a laptop in Berlin and one on a Netlify
 * builder in UTC agree — which is the whole reason this module exists rather
 * than four calls to `toLocaleString` spread across the components.
 *
 * The DST pair still matters, but it is now about the *hour* rather than the
 * label. Joey's decision is that the zone reads as plain Eastern year-round, so
 * the same string appears in January and July — while the instant behind it
 * continues to resolve through the IANA zone, which is what makes the two
 * seasons land on different UTC hours. These tests assert both halves: the name
 * no longer moves, and the clock still does.
 */

/** 19:00 UTC on a Thursday in March — 3:00 PM Eastern, daylight time. */
const MARCH = new Date('2026-03-12T19:00:00.000Z');

/** 19:00 UTC on a Friday in January — 2:00 PM Eastern, standard time. */
const JANUARY = new Date('2026-01-16T19:00:00.000Z');

/** 19:00 UTC in July — 3:00 PM Eastern, daylight time. */
const JULY = new Date('2026-07-16T19:00:00.000Z');

/** Every label that carries a zone, for the rules that apply to all of them. */
const ZONED = [describeSlot, describeSlotShort, describeSlotTime] as const;

describe('describeSlot', () => {
  it('reads out the weekday, the 12-hour time and the zone', () => {
    const label = describeSlot(MARCH);

    expect(label).toContain('Thursday');
    expect(label).toContain('March 12');
    expect(label).toContain('3:00 PM');
    expect(label).toContain('Eastern Time');
  });

  it('renders an Eastern wall clock, not the UTC hour', () => {
    // 19:00Z is the trap: a label built from the raw instant would say 7:00 PM
    // and Joey would take a call four hours after the client expected it.
    expect(describeSlot(MARCH)).not.toContain('7:00 PM');
    expect(describeSlot(MARCH)).not.toContain('19:00');
  });

  it('names the zone the same way in both seasons', () => {
    expect(describeSlot(JANUARY)).toContain('Eastern Time');
    expect(describeSlot(JULY)).toContain('Eastern Time');
  });

  it('shifts the wall clock by an hour between standard and daylight time', () => {
    // Same UTC hour, different Eastern hour. The zone name no longer moves with
    // the season, but the offset behind it still does — which is the part that
    // decides when somebody picks up the phone.
    expect(describeSlot(JANUARY)).toContain('2:00 PM');
    expect(describeSlot(JULY)).toContain('3:00 PM');
  });
});

/**
 * Joey's instruction: plain Eastern, never the seasonal abbreviation. Asserted
 * across every formatter that prints a zone, because one of them quietly
 * keeping `timeZoneName: 'short'` is exactly the inconsistency a client would
 * notice and nobody reviewing a diff would.
 */
describe('the zone reads as Eastern, not EST or EDT', () => {
  it.each(ZONED)('never abbreviates in either season (%#)', (format) => {
    for (const instant of [JANUARY, MARCH, JULY]) {
      expect(format(instant)).not.toMatch(/\bEST\b/);
      expect(format(instant)).not.toMatch(/\bEDT\b/);
      expect(format(instant)).toContain('Eastern Time');
    }
  });

  it('does not say Standard or Daylight either', () => {
    // 'long' would render "Eastern Daylight Time", which is the same seasonal
    // distinction spelled out.
    for (const format of ZONED) {
      expect(format(JULY)).not.toMatch(/Daylight/);
      expect(format(JANUARY)).not.toMatch(/Standard/);
    }
  });
});

describe('describeSlotDay and describeSlotTime', () => {
  it('splits the long form into a day and a time that agree with it', () => {
    const long = describeSlot(MARCH);

    expect(describeSlotDay(MARCH)).toBe('Thu, Mar 12');
    expect(describeSlotTime(MARCH)).toBe('3:00 PM Eastern Time');
    expect(long).toContain('March 12');
    expect(long).toContain(describeSlotTime(MARCH));
  });

  it('names the zone, so a bare hour is never left to interpretation', () => {
    // The hour being right is not enough on a screen: whoever reads "3:00 PM"
    // has to know whose 3 PM it is, and the assistant quoted the client an
    // Eastern one.
    expect(describeSlotTime(JANUARY)).toContain('Eastern Time');
    expect(describeSlotTime(JULY)).toContain('Eastern Time');
  });

  it('keeps the time in Joey’s zone, not the viewer’s', () => {
    expect(describeSlotTime(JANUARY)).toBe('2:00 PM Eastern Time');
    expect(describeSlotTime(JULY)).toBe('3:00 PM Eastern Time');
  });

  it('keeps the day in Joey’s zone, which can differ from the UTC date', () => {
    // 01:00Z on the 13th is still the evening of the 12th in Atlanta.
    expect(describeSlotDay(new Date('2026-03-13T01:00:00.000Z'))).toBe('Thu, Mar 12');
  });

  it('puts no zone on the date, which has no time for one to qualify', () => {
    // "Thu, Mar 12, Eastern Time" reads as though the date itself were
    // zone-dependent. The date is still computed in Joey's zone — the
    // assertion above is what proves that.
    expect(describeSlotDay(MARCH)).not.toMatch(/Eastern/);
  });
});

describe('describeSlotShort', () => {
  it('drops the weekday but keeps the Eastern time', () => {
    const label = describeSlotShort(MARCH);

    expect(label).toContain('Mar 12');
    expect(label).toContain('3:00 PM');
    expect(label).not.toContain('Thursday');
  });

  it('says which clock it means, like every other label that prints a time', () => {
    // It used to print a bare hour, which made it the one label here a reader
    // could misread. Density is not a reason to drop the zone.
    expect(describeSlotShort(MARCH)).toContain('Eastern Time');
  });
});

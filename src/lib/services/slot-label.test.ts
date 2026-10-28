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
 * The DST pair matters too. Eastern is UTC-5 in January and UTC-4 in July, and
 * the abbreviation is read from the zone rather than hardcoded, so the same code
 * path has to produce EST for one and EDT for the other.
 */

/** 19:00 UTC on a Thursday in March — 3:00 PM Eastern, daylight time. */
const MARCH = new Date('2026-03-12T19:00:00.000Z');

/** 19:00 UTC on a Friday in January — 2:00 PM Eastern, standard time. */
const JANUARY = new Date('2026-01-16T19:00:00.000Z');

/** 19:00 UTC in July — 3:00 PM Eastern, daylight time. */
const JULY = new Date('2026-07-16T19:00:00.000Z');

describe('describeSlot', () => {
  it('reads out the weekday, the 12-hour time and the zone', () => {
    const label = describeSlot(MARCH);

    expect(label).toContain('Thursday');
    expect(label).toContain('March 12');
    expect(label).toContain('3:00 PM');
    expect(label).toMatch(/\bEDT\b/);
  });

  it('renders an Eastern wall clock, not the UTC hour', () => {
    // 19:00Z is the trap: a label built from the raw instant would say 7:00 PM
    // and Joey would take a call four hours after the client expected it.
    expect(describeSlot(MARCH)).not.toContain('7:00 PM');
    expect(describeSlot(MARCH)).not.toContain('19:00');
  });

  it('follows the zone across the daylight-saving switch', () => {
    expect(describeSlot(JANUARY)).toMatch(/\bEST\b/);
    expect(describeSlot(JULY)).toMatch(/\bEDT\b/);
  });

  it('shifts the wall clock by an hour between standard and daylight time', () => {
    // Same UTC hour, different Eastern hour. This is the reason the offset is
    // read from the zone rather than fixed.
    expect(describeSlot(JANUARY)).toContain('2:00 PM');
    expect(describeSlot(JULY)).toContain('3:00 PM');
  });
});

describe('describeSlotDay and describeSlotTime', () => {
  it('splits the long form into a day and a time that agree with it', () => {
    const long = describeSlot(MARCH);

    expect(describeSlotDay(MARCH)).toBe('Thu, Mar 12');
    expect(describeSlotTime(MARCH)).toBe('3:00 PM EDT');
    expect(long).toContain('March 12');
    expect(long).toContain(describeSlotTime(MARCH));
  });

  it('names the zone, so a bare hour is never left to interpretation', () => {
    // The hour being right is not enough on a screen: whoever reads "3:00 PM"
    // has to know whose 3 PM it is, and the assistant quoted the client an
    // Eastern one.
    expect(describeSlotTime(JANUARY)).toMatch(/\bEST\b/);
    expect(describeSlotTime(JULY)).toMatch(/\bEDT\b/);
  });

  it('keeps the time in Joey’s zone, not the viewer’s', () => {
    expect(describeSlotTime(JANUARY)).toBe('2:00 PM EST');
    expect(describeSlotTime(JULY)).toBe('3:00 PM EDT');
  });

  it('keeps the day in Joey’s zone, which can differ from the UTC date', () => {
    // 01:00Z on the 13th is still the evening of the 12th in Atlanta.
    expect(describeSlotDay(new Date('2026-03-13T01:00:00.000Z'))).toBe('Thu, Mar 12');
  });
});

describe('describeSlotShort', () => {
  it('drops the weekday but keeps the Eastern time', () => {
    const label = describeSlotShort(MARCH);

    expect(label).toContain('Mar 12');
    expect(label).toContain('3:00 PM');
    expect(label).not.toContain('Thursday');
  });
});

import { describe, expect, it } from 'vitest';
import { previousDayWindow, REPORT_TIME_ZONE } from './report-day';

/**
 * The daily digest's window boundary.
 *
 * These assert Eastern midnights expressed as UTC instants, which is the only
 * form the database comparison can use. The interesting cases are the two DST
 * switches, where a naive implementation is an hour wrong, and the evening hours
 * that a server-local (UTC) boundary files under the wrong day entirely.
 */

const iso = (date: Date): string => date.toISOString();

describe('previousDayWindow', () => {
  it('anchors to Eastern rather than to the server clock', () => {
    expect(REPORT_TIME_ZONE).toBe('America/New_York');
  });

  it('spans the previous Eastern day during daylight time', () => {
    // 11:30 UTC is 07:30 EDT on 16 June, so "yesterday" is 15 June Eastern.
    // Eastern is UTC-4 in June, so its midnights land at 04:00 UTC.
    const window = previousDayWindow(new Date('2026-06-16T11:30:00.000Z'));

    expect(iso(window.start)).toBe('2026-06-15T04:00:00.000Z');
    expect(iso(window.end)).toBe('2026-06-16T04:00:00.000Z');
    expect(window.date).toBe('2026-06-15');
  });

  it('spans the previous Eastern day during standard time', () => {
    // Same cron time in January is 06:30 EST. Eastern is UTC-5, so the midnights
    // move to 05:00 UTC — the hour a fixed offset would get wrong.
    const window = previousDayWindow(new Date('2026-01-15T11:30:00.000Z'));

    expect(iso(window.start)).toBe('2026-01-14T05:00:00.000Z');
    expect(iso(window.end)).toBe('2026-01-15T05:00:00.000Z');
    expect(window.date).toBe('2026-01-14');
  });

  it('reports a 23-hour day when the clocks go forward', () => {
    // DST began 08 March 2026. That day started in EST and ended in EDT, so it
    // was genuinely 23 hours long. A fixed 24-hour span would drag the boundary
    // an hour into 07 March and report an hour of leads twice.
    const window = previousDayWindow(new Date('2026-03-09T11:30:00.000Z'));

    expect(iso(window.start)).toBe('2026-03-08T05:00:00.000Z');
    expect(iso(window.end)).toBe('2026-03-09T04:00:00.000Z');
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * 3_600_000);
    expect(window.date).toBe('2026-03-08');
  });

  it('reports a 25-hour day when the clocks go back', () => {
    // DST ended 01 November 2026, making that day 25 hours. Dropping the extra
    // hour would silently lose any lead created in it.
    const window = previousDayWindow(new Date('2026-11-02T11:30:00.000Z'));

    expect(iso(window.start)).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(window.end)).toBe('2026-11-02T05:00:00.000Z');
    expect(window.end.getTime() - window.start.getTime()).toBe(25 * 3_600_000);
    expect(window.date).toBe('2026-11-01');
  });

  it('covers an Eastern evening that has already rolled over in UTC', () => {
    // 9 PM EDT on 15 June is 01:00 UTC on 16 June. A server-local boundary files
    // it under 16 June and reports it a day late; this window contains it.
    const window = previousDayWindow(new Date('2026-06-16T11:30:00.000Z'));
    const eveningLead = new Date('2026-06-16T01:00:00.000Z');

    expect(eveningLead >= window.start).toBe(true);
    expect(eveningLead < window.end).toBe(true);
  });

  it('steps back across a month boundary', () => {
    const window = previousDayWindow(new Date('2026-07-01T11:30:00.000Z'));

    expect(window.date).toBe('2026-06-30');
    expect(iso(window.start)).toBe('2026-06-30T04:00:00.000Z');
  });

  it('is half-open, so midnight belongs to exactly one day', () => {
    const monday = previousDayWindow(new Date('2026-06-16T11:30:00.000Z'));
    const tuesday = previousDayWindow(new Date('2026-06-17T11:30:00.000Z'));

    // One day's exclusive end is the next day's inclusive start. A lead created
    // at that instant is reported once, not in two consecutive digests.
    expect(iso(monday.end)).toBe(iso(tuesday.start));
  });

  it('does not depend on the run time within the Eastern day', () => {
    // Any instant on 16 June Eastern describes the same previous day, whether the
    // cron fires early morning UTC or late evening.
    const morning = previousDayWindow(new Date('2026-06-16T11:30:00.000Z'));
    const evening = previousDayWindow(new Date('2026-06-17T03:59:00.000Z'));

    expect(evening.date).toBe(morning.date);
    expect(iso(evening.start)).toBe(iso(morning.start));
    expect(iso(evening.end)).toBe(iso(morning.end));
  });
});

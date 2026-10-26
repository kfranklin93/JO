import { describe, it, expect } from 'vitest';
import { statusBadgeClasses } from './property-status';

/**
 * Regression guard for the status badge.
 *
 * The original ternary read
 *   status === 'Available' ? 'bg-navy text-white' : 'bg-navy text-white'
 * — both branches identical, so the two states rendered the same badge. These
 * assertions fail if the branches ever collapse back together.
 */
describe('statusBadgeClasses', () => {
  it('gives Available and Under Contract different class output', () => {
    expect(statusBadgeClasses('Available')).not.toBe(
      statusBadgeClasses('Under Contract')
    );
  });

  it('shares no colour utility between the two states', () => {
    const available = statusBadgeClasses('Available').split(' ');
    const other = statusBadgeClasses('Under Contract').split(' ');

    // Not just "different strings" — the background and the text colour must
    // both differ, or one state could still read as the other.
    expect(available.filter((c) => other.includes(c))).toEqual([]);
  });

  it('uses the affirmative accent pairing for Available', () => {
    expect(statusBadgeClasses('Available')).toBe('bg-champagne text-navy');
  });

  it('uses the muted pairing for Under Contract', () => {
    // Was `bg-stone text-linen`. Stone is a mid-grey that fails AA against both
    // bone (4.21:1) and onyx (3.97:1), which the palette change exposed — see
    // the ratio note in property-status.ts.
    expect(statusBadgeClasses('Under Contract')).toBe('bg-hunter text-bone');
  });

  it('treats any unrecognised status as unavailable', () => {
    for (const status of ['Sold', 'Pending', 'Coming Soon', '', 'available']) {
      expect(statusBadgeClasses(status)).toBe('bg-hunter text-bone');
    }
  });

  it('uses only palette tokens, never a raw colour or arbitrary escape', () => {
    for (const status of ['Available', 'Under Contract']) {
      const classes = statusBadgeClasses(status);
      expect(classes).not.toMatch(/-\[(black|white)\]/);
      expect(classes).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(classes).not.toMatch(/\b(bg|text)-white\b/);
    }
  });
});

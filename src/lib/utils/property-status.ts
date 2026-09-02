/**
 * Class mapping for the property status badge.
 *
 * This existed inline on the properties page as a ternary whose two branches
 * were byte-identical (`bg-navy text-white` either way), so "Available" and
 * "Under Contract" were visually indistinguishable. It lives here so the two
 * states can be asserted to differ.
 *
 * Both pairings clear WCAG AA (4.5:1) for the badge's small uppercase text:
 *   navy #1C2A39 on champagne #C5A059 → 5.94:1
 *   linen #FAF9F6 on stone #707070    → 4.70:1
 */

/** Affirmative accent treatment — the listing is on the market. */
const AVAILABLE = 'bg-champagne text-navy';

/** Muted treatment — every other state, e.g. "Under Contract". */
const UNAVAILABLE = 'bg-stone text-linen';

export function statusBadgeClasses(status: string): string {
  return status === 'Available' ? AVAILABLE : UNAVAILABLE;
}

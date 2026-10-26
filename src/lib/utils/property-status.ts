/**
 * Class mapping for the property status badge.
 *
 * This existed inline on the properties page as a ternary whose two branches
 * were byte-identical (`bg-navy text-white` either way), so "Available" and
 * "Under Contract" were visually indistinguishable. It lives here so the two
 * states can be asserted to differ.
 *
 * Both pairings clear WCAG AA (4.5:1) for the badge's small uppercase text:
 *   navy #0F2A5E on champagne #C9A45C → 5.91:1
 *   bone #F2ECE0 on hunter #14291F    → 13.0:1
 *
 * Recording the ratios here is what caught a regression when the brand palette
 * changed. The muted state was `bg-stone text-linen`, and repointing `linen`
 * from #FAF9F6 to Bone #F2ECE0 dropped it to 4.21:1 — below AA, invisibly.
 *
 * Stone cannot be rescued by changing the text: it is a mid-grey, so bone over
 * it is 4.21:1 and onyx over it is 3.97:1, and both fail. The same trap applies
 * to Champagne Gold. Mid-tones only work as fills behind large text, which a
 * small uppercase badge is not. Hunter is a brand colour, reads correctly as
 * "not available", and carries bone comfortably.
 *
 * Keep these numbers updated when the palette moves. They are the only reason
 * the drop was noticed rather than shipped.
 */

/** Affirmative accent treatment — the listing is on the market. */
const AVAILABLE = 'bg-champagne text-navy';

/** Muted treatment — every other state, e.g. "Under Contract". */
const UNAVAILABLE = 'bg-hunter text-bone';

export function statusBadgeClasses(status: string): string {
  return status === 'Available' ? AVAILABLE : UNAVAILABLE;
}

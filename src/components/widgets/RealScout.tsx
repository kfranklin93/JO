/**
 * RealScout widgets — the real MLS search and listings embeds.
 *
 * These replace a fake hero search that navigated to `/properties?search=…`
 * with a query nothing read, and four hardcoded listings on `/properties`
 * with neighbourhoods and asking prices that were invented. Everything shown
 * here now comes from Joey's RealScout account.
 *
 * ## Three widgets, three jobs
 *
 * - `RealScoutSimpleSearch` — one input. The hero.
 * - `RealScoutAdvancedSearch` — beds, baths, price range. `/properties`.
 * - `RealScoutYourListings` — the only one of the three that *renders
 *   properties*. The search widgets are entry points and display none, so do
 *   not write copy anywhere that promises a grid of homes beneath them.
 *
 * ## No capture surface here, deliberately
 *
 * RealScout also offers a `realscout-home-value` widget, which takes a
 * seller's name, address and contact details and **submits them to RealScout,
 * not to this app.** A seller who filled it in would not appear in Joey's
 * dashboard, would not enter the five-touch drip and would not be covered by
 * our unsubscribe suppression list — a second lead pool, reachable only
 * inside RealScout, sitting alongside forms that do reach the leads table and
 * looking identical to a visitor. So it is not embedded anywhere. Every
 * capture path on this site goes through `src/lib/services/lead-capture.ts`.
 * Adding it would mean reconciling the two pools first (RealScout's Agent API
 * exposes `GET /contacts`) or the owner confirming he works RealScout's
 * contacts directly.
 *
 * ## How the script loads, and why it is not `next/script`
 *
 * One bundle upgrades all three elements. It is a `type="module"` script, which
 * `next/script` handles poorly:
 * its `afterInteractive` path builds the element itself and the module type is
 * easy to lose on the way through, and a module that never executes leaves the
 * custom element un-upgraded — rendering as an inert unknown tag that looks
 * completely correct in a code read.
 *
 * So it is a plain `<script>` rendered in the tree, with `async`. React 19
 * hoists an async script with a `src` into `<head>` and **dedupes it by
 * `src`**, which is the property `/properties` depends on: that page mounts
 * two widgets, both needing this same bundle, and must end up with exactly one
 * tag. `async` is also what keeps it off the critical path — the hero headline
 * paints without waiting for a third-party module, and the widget is below the
 * fold of the headline anyway.
 *
 * ## Colours and width live in globals.css
 *
 * Each element's `--rs-*` custom properties are set in the `@layer base` block
 * of src/app/globals.css, fed from the `@theme` tokens. They are not set here:
 * colour values belong in the theme block, and a `style` prop on these
 * elements would be a second place they live. That block is also where the
 * fixed widget widths from the owner's snippets — 640px and 600px, both
 * wider than a 390px phone — are constrained.
 */

import { siteConfig } from '@/config/site';

const { agentEncodedId, scriptSrc } = siteConfig.realscout;

/**
 * The shared UMD bundle that upgrades all three elements.
 *
 * Rendered by each widget rather than once at the layout level, so a page only
 * pays for it when it actually embeds a widget. Mounting two widgets on one
 * page renders this twice in the tree and React collapses it to a single tag
 * in `<head>` — see the note above.
 */
function RealScoutScript() {
  return <script src={scriptSrc} type="module" async />;
}

/**
 * One-input search. The hero's primary control.
 */
export function RealScoutSimpleSearch() {
  return (
    <>
      <RealScoutScript />
      <realscout-simple-search agent-encoded-id={agentEncodedId} />
    </>
  );
}

/**
 * Beds, baths and price-range search over the wider market.
 */
export function RealScoutAdvancedSearch() {
  return (
    <>
      <RealScoutScript />
      <realscout-advanced-search agent-encoded-id={agentEncodedId} />
    </>
  );
}

/**
 * Joey's own listings and past transactions, newest first.
 *
 * Attribute values are the owner's, verbatim. Two of them shape what the page
 * is allowed to claim:
 *
 * - `listing-status` includes `Sold` and `Rented`, so this grid mixes active
 *   inventory with closed business. That is deliberate — it means the widget
 *   is never empty between listings — but it is why the heading above it says
 *   "listings and recent transactions" rather than anything about homes
 *   currently for sale.
 * - `include-seller-listings` is a bare boolean attribute in the supplied
 *   HTML. `""` renders it valueless, exactly as supplied; `{true}` would
 *   render `include-seller-listings="true"`, a different value the widget may
 *   read differently.
 */
export function RealScoutYourListings() {
  return (
    <>
      <RealScoutScript />
      <realscout-your-listings
        agent-encoded-id={agentEncodedId}
        sort-order="NEWEST"
        listing-status="For Sale,For Rent,In Contract,Sold,Rented"
        property-types="SFR,MF,TC,LAL,MOBILE,OTHER"
        include-seller-listings=""
      />
    </>
  );
}

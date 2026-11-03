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
 * ## Four widgets, four jobs
 *
 * - `RealScoutSimpleSearch` — one input. The hero.
 * - `RealScoutAdvancedSearch` — beds, baths, price range. `/properties`.
 * - `RealScoutYourListings` — the only one of the four that *renders
 *   properties*. The search widgets are entry points and display none, so do
 *   not write copy anywhere that promises a grid of homes beneath them.
 * - `RealScoutHomeValue` — a seller's address-to-valuation capture.
 *   `/sell-home`.
 *
 * ## Where the home-value widget's leads go, which is not here
 *
 * `RealScoutHomeValue` captures a name, an address and contact details, and
 * **submits them to RealScout, not to this app.** Nothing about it touches
 * `src/lib/db/schema.ts`. So a seller who fills it in does not appear in
 * Joey's dashboard, does not enter the five-touch drip, and is not covered by
 * our unsubscribe suppression list — they are a second lead pool, reachable
 * only inside RealScout. Reconciling the two (RealScout's Agent API exposes
 * `GET /contacts`) is out of scope here and is flagged rather than attempted.
 *
 * ## How the script loads, and why it is not `next/script`
 *
 * One bundle upgrades all four elements. It is a `type="module"` script, which
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
 * The shared UMD bundle that upgrades all four elements.
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

/**
 * Address-to-valuation capture for sellers.
 *
 * Read the note at the top of this file about where its leads go before
 * treating it as a replacement for anything in `src/lib/services`: it is not
 * wired to our database, our drip or our suppression list.
 *
 * Its widget width is `auto` in the owner's snippet, so unlike the two search
 * widgets it needs no responsive constraint invented for it.
 */
export function RealScoutHomeValue() {
  return (
    <>
      <RealScoutScript />
      <realscout-home-value agent-encoded-id={agentEncodedId} />
    </>
  );
}

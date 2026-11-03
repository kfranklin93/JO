import type { Metadata } from 'next';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import { getBreadcrumbSchema } from '@/config/structured-data';
import {
  RealScoutAdvancedSearch,
  RealScoutYourListings,
} from '@/components/widgets/RealScout';

/**
 * /properties — a search tool, not a listings showcase.
 *
 * ## What was here
 *
 * A hardcoded array of four homes — a Buckhead estate, a Marietta cottage, a
 * Sandy Springs build and a Roswell townhome — each with a real
 * neighbourhood, a specific asking price, a bed and bath count and a status
 * badge. None of them existed. The page is in the sitemap and indexed, so a
 * licensed agent's site was publishing four fabricated listings at four
 * invented prices. Removing them is the point of this change.
 *
 * ## What is here now
 *
 * Two RealScout widgets from Joey's own account, in the order the owner asked
 * for: his real inventory first, then a search of the wider market.
 *
 *   1. `realscout-your-listings` — Joey's listings and recent transactions.
 *      Its `listing-status` deliberately includes `Sold` and `Rented`, so the
 *      grid mixes active with closed. That is why the heading above it says
 *      "listings and recent transactions": nothing on this page may claim
 *      these are all homes currently for sale, because some of them are not.
 *   2. `realscout-advanced-search` — beds, baths and price range.
 *
 * ## Why there is still prose
 *
 * Both widgets render inside a third-party web component, so none of their
 * content is ours and none of it is crawlable as ours. A page whose entire
 * body is two custom elements has nothing for a visitor who arrives before
 * the script does and nothing for a search engine at all. Hence the two prose
 * sections.
 *
 * **Every factual sentence in them is Joey's, traced to a source in this
 * repo.** A previous pass on this page was rejected for four invented claims,
 * and the sentence this page used to close with — "exclusive access to
 * off-market listings" — was one of them: no source anywhere states it. Each
 * paragraph below carries the playbook entry id it comes from. The rule is
 * absolute: no statistic, guarantee, timeline or price that is not already in
 * `src/lib/assistant/answer-playbook-content.ts` or `src/config/site.ts`.
 */

export const metadata: Metadata = {
  // Was "Featured Properties", which described the four invented homes and
  // is false now that the page features nothing of its own.
  title: 'Search Atlanta Homes | Joey Oberndorfer Real Estate',
  description:
    "Search Metro Atlanta homes and see Joey Oberndorfer's listings and recent transactions. Joey serves all of Georgia, with deep expertise in Metro Atlanta.",
};

export default function PropertiesPage() {
  // Kept from the sibling service pages' pattern, and kept deliberately: the
  // page stays in the sitemap, so it stays described to a crawler.
  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Search Homes', url: '/properties' },
  ]);

  return (
    <>
      <StructuredData data={breadcrumbs} />

      <main className="min-h-screen bg-linen">
        {/* Masthead. Hunter, not eXp Navy — hunter is the dark surface
            everywhere now and navy is reserved for the logo marks. Bone
            (`text-linen`, the same value) on hunter is 13.1:1. */}
        <section className="relative bg-hunter py-32">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="font-serif text-5xl tracking-tight text-linen sm:text-6xl lg:text-7xl">
                Search Atlanta Homes
              </h1>
              {/* Verbatim from the `service-area` playbook entry. */}
              <p className="mt-6 font-sans text-lg font-light leading-relaxed text-linen/80">
                Joey serves all of Georgia, with deep expertise in Metro
                Atlanta, including Cobb, Fulton, DeKalb, and Gwinnett counties.
              </p>
            </div>
          </div>
        </section>

        {/* Joey's own inventory, first. */}
        <section className="py-24">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-serif text-4xl text-navy sm:text-5xl">
                Joey's Listings and Recent Transactions
              </h2>
              {/* Describes the widget's own configuration — `sort-order` and
                  the five values in `listing-status` — and claims nothing
                  beyond it. In particular it does not say these homes are all
                  for sale, because `Sold` and `Rented` are in that list. */}
              <p className="mt-6 font-sans text-lg font-light leading-relaxed text-stone">
                Newest first, from Joey's own RealScout account: homes for sale
                and for rent, under contract, sold and rented.
              </p>
            </div>

            <div className="mt-16">
              <RealScoutYourListings />
            </div>
          </div>
        </section>

        {/* Then the wider market. */}
        <section className="bg-hunter py-24">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-serif text-4xl text-linen sm:text-5xl">
                Search the Wider Market
              </h2>
              <p className="mt-6 font-sans text-lg font-light leading-relaxed text-linen/80">
                Set your own criteria — beds, baths and price range.
              </p>
            </div>

            <div className="mt-16">
              <RealScoutAdvancedSearch />
            </div>
          </div>
        </section>

        {/* The crawlable half of the page. Each paragraph is one of Joey's
            approved answers, named in the heading comment above it. */}
        <section className="py-32">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl">
              <h2 className="font-serif text-4xl text-navy sm:text-5xl">
                Before You Start Searching
              </h2>

              <div className="mt-10 space-y-8">
                {/* `first-time-buyer` */}
                <p className="font-sans text-lg leading-relaxed text-stone">
                  Every first-time buyer's path is different, and the buyers
                  who win start with a plan. Joey builds that plan with you
                  personally: your goals, your budget, and your next steps.
                </p>

                {/* `pre-approval-first` */}
                <p className="font-sans text-lg leading-relaxed text-stone">
                  Joey walks every buyer through the pre-approval process
                  personally and connects you with a trusted lending partner
                  when you're ready. Starting with a plan puts you ahead of
                  most buyers.
                </p>

                {/* `home-valuation` — selling rather than buying, and the
                    reason a search tool is not a valuation. */}
                <p className="font-sans text-lg leading-relaxed text-stone">
                  Every home is different. Price and timing depend on your
                  home's condition, the market right now, and recent sales
                  near you, so Joey reviews your home personally instead of
                  giving a generic online estimate.
                </p>

                {/* `investment-property` */}
                <p className="font-sans text-lg leading-relaxed text-stone">
                  Joey is an investor himself in rentals and flips, so he looks
                  at every deal numbers first.
                </p>

                {/* `who-is-joey` — the credential line, which is also the
                    `eXp Realty ICON Agent` award in src/config/site.ts. */}
                <p className="font-sans text-lg leading-relaxed text-stone">
                  Joey Oberndorfer is a licensed Georgia Realtor with eXp
                  Realty and an eXp ICON Agent, serving clients across all of
                  Georgia with a global network of agents and properties.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA. Hunter, like the masthead. The gold CTA inside still
            works: gold on hunter is 6.5:1 as a fill, and its label is
            `champagne-foreground` so the pairing is decided in the theme. */}
        <section className="bg-hunter py-32">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-serif text-4xl text-linen sm:text-5xl">
                Don't See What You're Looking For?
              </h2>
              {/* Was "With exclusive access to off-market listings and deep
                  local expertise, I'll match you with your ideal home" — a
                  claim with no source in this repo and an outcome promise on
                  top of it. Replaced by two of Joey's own sentences:
                  `closing-services` and `am-i-talking-to-a-bot`. */}
              <p className="mt-6 font-sans text-lg font-light leading-relaxed text-linen/80">
                Joey personally manages every deal from contract to closing,
                and attends every one of his closings in person. Joey handles
                every client personally, and the best way to get his full
                attention is a short consultation.
              </p>
              <div className="mt-10">
                <Link
                  href="/get-started"
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-champagne px-10 py-5 font-sans text-lg font-normal text-champagne-foreground transition-all duration-300 hover:bg-champagne/90 hover:shadow-2xl hover:shadow-onyx/40"
                >
                  Book a Consultation
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

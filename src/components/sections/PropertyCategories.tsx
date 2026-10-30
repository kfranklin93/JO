'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

/**
 * The browsing section in the middle of the homepage.
 *
 * Built, never imported, and placed now to give the stretch of page that
 * carries the trust argument something to click. It is the browsing half of
 * that fix; ValueProposition is the other half.
 *
 * ## Why this rather than FeaturedListings
 *
 * `FeaturedListings` was the alternative and could not be placed. It renders
 * `featuredProperties` from src/data/properties.ts — three homes with street
 * names, bed and bath counts, square footage, asking prices and statuses like
 * "Open House Sat" and "Price Reduced", none of which came from Joey. Putting
 * invented listings and invented prices under a licensed agent's name on his
 * own homepage is not a copy problem. (The same fabricated pattern is already
 * live on /properties and wants his real data or deletion; that page is not
 * this change.) It is also the only mount point for `StickyBottomCTA`, which
 * would have put a second persistent element along the bottom edge in the same
 * change that reduced the floating elements to one.
 *
 * ## The three cards used to go nowhere
 *
 * They pointed at /properties/now-selling, /properties/future-visions and
 * /properties/legacy. None of those routes exists — there is one `/properties`
 * page and no dynamic segment under it — so all three were 404s, in a section
 * placed to fix dead ends.
 *
 * Their copy went with the links. "Future Visions · Coming Soon · exclusive
 * pre-launch opportunities and development projects" described an offering no
 * approved answer mentions, and a "Sold" badge over
 * `siteConfig.stats.closedDeals` made the scoreboard figure look like a
 * property status. What is here now is the three destinations a visitor can
 * actually reach, described from the playbook in
 * src/lib/assistant/answer-playbook-content.ts: the counties and statewide
 * coverage are `service-area`, the pre-approval plan is `pre-approval-first`,
 * and reviewing a home personally instead of giving a generic online estimate
 * is `home-valuation`.
 *
 * Repeating the hero's buying and selling split this far down the page is
 * deliberate, not an oversight — a visitor who has just read the trust
 * argument should not have to scroll back to the top to act on it.
 *
 * ## The card images are gone, because the files are not images
 *
 * Each card opened with a 4:3 photograph from `public/images/properties/`.
 * Those four files are 237 to 243 bytes each — stubs, not photographs — so the
 * cards rendered three broken-image boxes, confirmed on screen at 1440x900
 * before this was changed. The gap is not local to this section: the portrait
 * at `/images/hero/joey-profile.jpg` is 238 bytes, the six testimonial avatars
 * are 34 bytes each (TestimonialsSection has been rendering those broken on
 * the live homepage), and of the three files big enough to be real only
 * `joey-hero-instagram.jpg` is an actual photograph.
 *
 * Writing less beats inventing more, so the cards are text. They come back as
 * image cards when Joey supplies photographs; the gap is in the report for him.
 *
 * ## Colours
 *
 * Bone-white surface with bone cards, matching the three sections below it,
 * and it sits between a neutral section and the onyx scoreboard so the dark
 * sections do not run together. Card text is onyx and stone on bone; the link
 * is `text-accent`, which resolves to hunter at 13.1:1.
 */
const categories = [
  {
    title: 'Homes on the Market',
    description: 'Current listings across Metro Atlanta.',
    href: '/properties',
    cta: 'Browse Listings',
  },
  {
    title: 'Buying in Georgia',
    description:
      'Cobb, Fulton, DeKalb and Gwinnett, and anywhere else in the state. Joey walks every buyer through pre-approval personally and builds the plan with you.',
    href: '/buy-home',
    cta: 'Start as a Buyer',
  },
  {
    title: 'Selling Your Home',
    description:
      'Price and timing depend on your home, the market right now, and recent sales near you. Joey reviews your home personally.',
    href: '/sell-home',
    cta: 'Start as a Seller',
  },
];

export function PropertyCategories() {
  return (
    <section className="bg-white py-32 sm:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="text-center">
          <h2 className="font-serif text-5xl text-navy sm:text-6xl">
            Where Would You Like to Start?
          </h2>
          <p className="mt-6 font-sans text-lg font-light text-stone">
            Browse what&rsquo;s available, or pick the side of the deal you&rsquo;re on
          </p>
        </div>

        <div className="mt-20 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, index) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-navy/10 bg-linen"
            >
              <div className="flex flex-1 flex-col p-10">
                <h3 className="font-serif text-3xl text-navy">
                  {category.title}
                </h3>
                <p className="mt-4 font-sans font-light text-stone">
                  {category.description}
                </p>
                {/* `mt-auto` rather than a fixed margin: the three
                    descriptions are different lengths, and without it the
                    three links sit at three different heights. */}
                <Link
                  href={category.href}
                  className="mt-auto inline-flex items-center gap-2 pt-8 font-sans text-sm font-normal text-accent underline underline-offset-4 transition-colors hover:text-accent-hover"
                >
                  <span>{category.cta}</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

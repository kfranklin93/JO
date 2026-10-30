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
    image: '/images/properties/now-selling.jpg',
    href: '/properties',
    cta: 'Browse Listings',
  },
  {
    title: 'Buying in Georgia',
    description:
      'Cobb, Fulton, DeKalb and Gwinnett, and anywhere else in the state. Joey walks every buyer through pre-approval personally and builds the plan with you.',
    image: '/images/properties/flagship.jpg',
    href: '/buy-home',
    cta: 'Start as a Buyer',
  },
  {
    title: 'Selling Your Home',
    description:
      'Price and timing depend on your home, the market right now, and recent sales near you. Joey reviews your home personally.',
    image: '/images/properties/legacy.jpg',
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
              className="group relative overflow-hidden rounded-2xl border border-navy/10 bg-linen"
            >
              <div className="aspect-[4/3] overflow-hidden bg-navy/5">
                <img
                  src={category.image}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-10">
                <h3 className="font-serif text-3xl text-navy">
                  {category.title}
                </h3>
                <p className="mt-4 font-sans font-light text-stone">
                  {category.description}
                </p>
                <Link
                  href={category.href}
                  className="mt-8 inline-flex items-center gap-2 font-sans text-sm font-normal text-accent underline underline-offset-4 transition-colors hover:text-accent-hover"
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

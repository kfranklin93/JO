import { StructuredData } from '@/components/seo/StructuredData';
import { homepageSchema } from '@/config/structured-data';
import { EnhancedHeroSection } from '@/components/sections/EnhancedHeroSection';
import { WhyJoeySection } from '@/components/sections/WhyJoeySection';
import { HowItStartsSection } from '@/components/sections/HowItStartsSection';
import { TestimonialsSection } from '@/components/sections/TestimonialsSection';
import { PropertyCategories } from '@/components/sections/PropertyCategories';
import { MarketStatsSection } from '@/components/sections/MarketStatsSection';
import { NeighborhoodsSection } from '@/components/sections/NeighborhoodsSection';
import { BuyersGuideSection } from '@/components/sections/BuyersGuideSection';
import { TeamSection } from '@/components/sections/TeamSection';
import { FinalCTA } from '@/components/sections/FinalCTA';

/**
 * The homepage.
 *
 * ## The middle of the page had nothing to do
 *
 * Why Joey, Testimonials and Market Stats ran consecutively and offered a
 * visitor almost nothing to act on — the trust argument, the social proof and
 * the numbers, which is exactly the stretch where someone decides they want to
 * work with Joey and then has to find a way to say so. `HowItStartsSection`
 * and `PropertyCategories` are interleaved into it: one opens the chat, one
 * routes to the page for the side of the deal they are on, and they break up a
 * run of three sections that was read-only.
 *
 * `HowItStartsSection` replaces `ValueProposition`, which is deleted. That
 * component existed to carry a named month-inventory guide, and the owner has
 * said the guide is not a real concept — so it is retired as data as well as
 * copy, including the config field that held its figure, and with the guide
 * gone nothing was left in the component that needed a section. The
 * replacement keeps the slot's two jobs: the mid-page dark break between two
 * light sections, and an action in the dead zone. Every factual sentence in it
 * traces to one of Joey's approved playbook answers; the sources are listed at
 * the top of the component.
 *
 * `PropertyCategories` was also built and imported by nothing, and needed its
 * copy fixed against Joey's approved answers before it could be shown — see
 * the note at the top of it.
 *
 * ## The five unrendered sections are disqualified, not merely unplaced
 *
 * All five were read when this slot needed filling. None of them can go live
 * as written, which is why a new section was built instead:
 *
 *   - `FeaturedListings` renders the invented `featuredProperties` from
 *     src/data/properties.ts, routes to /properties, and is the only mount
 *     point for `StickyBottomCTA` — a second fixed bottom element, which the
 *     one-floating-element test forbids.
 *   - `SocialProofSection` carries invented accolades: a "Top 0%" claim, a
 *     Christie's ranking and an Atlanta Business Chronicle listing, none of
 *     which appear in any source in this repo.
 *   - `LegacyPortfolio` carries six invented sold homes with addresses, prices
 *     and day counts, plus a hard-coded "3.8 Avg Days on Market".
 *   - `StickyPropertyShowcase` carries one invented listing at $1.2M and a
 *     "100%" conversion figure.
 *   - `StickyScrollCTA` carries invented urgency claims and is
 *     `fixed bottom-6 right-6 z-50`, so it would collide with `JoeyChat` and
 *     break the one-fixed-bottom-element test.
 *
 * Each needs real data or Joey's sign-off before it can be placed.
 *
 * ## One floating element, bottom right
 *
 * This page used to mount `FloatingConnectCTA` at `bottom-8 right-8` while the
 * marketing layout mounted `JoeyChat` at `bottom-8 left-8`, both at `z-40`, so
 * a phone had a permanent button in each bottom corner competing for one job.
 * The chat does strictly more — it answers, qualifies, captures the lead and
 * books — so it is the one that stayed, and it has moved to the right-hand
 * corner users look in. `FloatingConnectCTA` is gone, and with it this page's
 * only state, which is why there is no `'use client'` here any more.
 *
 * The form that button opened, `ServicesInquiryForm`, is not orphaned: it opens
 * from the contact page now. See ServicesInquiryLauncher.
 */
export default function HomePage() {
  return (
    <>
      <StructuredData data={homepageSchema} />

      <EnhancedHeroSection />

      {/* Why work with Joey */}
      <WhyJoeySection />

      {/* How working with Joey starts, and the consultation that starts it.
          Opens the chat. */}
      <HowItStartsSection />

      {/* Social proof */}
      <TestimonialsSection />

      {/* The three ways in: buying, selling, closing. Light surface on purpose,
          so the onyx scoreboard below it does not butt against another dark
          section. It carried a fourth card into /properties until a review
          pointed out that page's four listings are invented — see the note in
          the component. */}
      <PropertyCategories />

      {/* The scoreboard — the one place the performance figures are listed */}
      <MarketStatsSection />

      <NeighborhoodsSection />
      <BuyersGuideSection />
      <TeamSection />
      <FinalCTA />
    </>
  );
}

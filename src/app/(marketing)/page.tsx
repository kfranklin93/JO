import { StructuredData } from '@/components/seo/StructuredData';
import { homepageSchema } from '@/config/structured-data';
import { EnhancedHeroSection } from '@/components/sections/EnhancedHeroSection';
import { WhyJoeySection } from '@/components/sections/WhyJoeySection';
import { ValueProposition } from '@/components/sections/ValueProposition';
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
 * work with Joey and then has to find a way to say so. `ValueProposition` and
 * `PropertyCategories` are interleaved into it: one opens the chat, one routes
 * to the page for the side of the deal they are on, and they break up a run of
 * three sections that was read-only.
 *
 * Both were already built and imported by nothing, so neither had ever
 * rendered. Both needed their copy fixed against Joey's approved answers
 * before they could be shown — see the notes at the top of each.
 *
 * Five more sections are in the same unrendered state and are left for Joey,
 * because section order on his homepage is his call, not something to settle by
 * placing everything that exists: `StickyScrollCTA`, `FeaturedListings`,
 * `SocialProofSection`, `LegacyPortfolio` and `StickyPropertyShowcase`.
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

      {/* Wealth-building framing and the 0-4-7 Month Inventory Guide, which
          appeared nowhere on the site before this. Opens the chat. */}
      <ValueProposition />

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

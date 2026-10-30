'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { openJoeyChat } from '@/lib/chat/open-chat';
import { siteConfig } from '@/config/site';

/**
 * The wealth-building argument, and the only place the 0-4-7 Month Inventory
 * Guide appears on the site.
 *
 * This component was built and then never imported by anything, so Joey's own
 * named framework was live nowhere. It is placed now because the three
 * homepage sections that carry the trust argument had almost nothing to click
 * — a visitor decided they wanted to work with him in the one stretch of the
 * page that offered no way to say so.
 *
 * ## The copy was rewritten before it was placed
 *
 * It predated the review of Joey's approved answers, and four things in it
 * could not go live:
 *
 *   - "You'll find your perfect property on the first showing—guaranteed."
 *     An outcome guarantee from a licensed agent. Nothing in the playbook
 *     promises an outcome, and the loader there withholds any answer that
 *     does. The site states the pattern elsewhere as "most clients buy on
 *     first tour", which is a description, so the claim is simply gone.
 *   - "strategic pricing, professional staging, and targeted marketing", as
 *     the contents of the 0-4-7 guide. No approved answer describes what is in
 *     it, or says he stages or markets a listing that way.
 *   - "'One-Tour' conversion mastery eliminates decision fatigue."
 *     `siteConfig.stats.conversionRate` holds the descriptor 'One-Tour' and is
 *     flagged there as still wanting a real figure; "mastery" and "eliminates"
 *     are claims on top of a value that is not yet a number.
 *   - a third copy of 60+ / $23.9M, in a floating card over the photograph.
 *     WhyJoeySection states both figures and MarketStatsSection is the
 *     scoreboard. A fourth repetition of the same two numbers on one page was
 *     the specific thing the owner asked to have cleaned up.
 *
 * What is left is sourced. The wealth-building framing, the investor
 * background and the philosophy line are `who-is-joey`; "numbers first" is
 * `investment-property`; condition, the current market and recent nearby sales
 * as what price and timing depend on, and reviewing the home personally rather
 * than giving a generic online estimate, are `home-valuation` — all in
 * src/lib/assistant/answer-playbook-content.ts. Of the guide itself the page
 * says only that it exists, that it is his, and that it reads inventory, which
 * is what its name says. Anything further has to come from Joey.
 *
 * ## There is no photograph to put beside it
 *
 * The original was a two-column grid: this copy on the left, a portrait from
 * `/images/hero/joey-profile.jpg` on the right inside a gold offset frame. That
 * file is 238 bytes — a stub, not an image — so the column rendered a broken
 * image icon, confirmed on screen at 1440x900 before this was changed. Almost
 * every asset under `public/images/` is in the same state: the property shots
 * are 237-243 bytes, the testimonial avatars are 34 bytes, and of the three
 * files large enough to be real only `joey-hero-instagram.jpg` is an actual
 * photograph — `joey-office.jpg` and `joey-hero.jpg` are flat grey rectangles.
 *
 * So the column is gone and this is a single centred column. Writing less is
 * the rule here rather than substituting the hero's photograph into a second
 * slot or inventing a decorative panel to fill the space. The layout comes back
 * when Joey supplies a portrait; the gap is in the report for him.
 *
 * ## Colours
 *
 * Onyx surface. Bone text (16.6:1) and champagne for the accents and the
 * philosophy line (8.4:1) — gold is legible here and would not be on bone. The
 * action is `champagne`, a gold fill with an onyx label, because `primary` is
 * hunter and a hunter button on a dark section is close to invisible.
 *
 * ## Why the chat button is a link
 *
 * Same reason as StartTheConversationCTA: the homepage prerenders, the
 * listener that opens the panel only exists after hydration, and a plain
 * `<button>` is silently dead until then. It carries `/get-started` as its
 * `href` and the handler calls `preventDefault()`, so the click works either
 * way and nothing changes on screen.
 */
export function ValueProposition() {
  /** Open the panel instead of following the fallback href. */
  const handleChatClick = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    openJoeyChat();
  };

  return (
    <section className="bg-onyx py-32 sm:py-40">
      <div className="mx-auto max-w-3xl px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="flex flex-col justify-center"
        >
          <span className="text-champagne font-sans text-sm font-light tracking-[0.3em] uppercase">
            The 0-4-7 Month Inventory Guide
          </span>
          <h2 className="text-linen mt-6 font-serif text-5xl sm:text-6xl">
            Real Estate as a<br />
            <span className="text-champagne">Wealth-Building Strategy.</span>
          </h2>
          <div className="text-linen/80 mt-8 space-y-6 font-sans text-lg leading-relaxed font-light">
            <p>
              {siteConfig.fullName} is an active real estate investor in rentals
              and flips, so he looks at every deal{' '}
              <strong className="text-linen font-normal">numbers first</strong>.
              Every move should build your financial future, not just close a
              deal.
            </p>
            <p>
              He reads inventory through his own framework, the{' '}
              <strong className="text-linen font-normal">
                0-4-7 Month Inventory Guide
              </strong>
              . What it means for your home depends on the home — its condition,
              the market right now, and recent sales near you — so he goes
              through it with you personally rather than handing you a generic
              online estimate.
            </p>
            {/* Joey's philosophy, from the `who-is-joey` entry. Set in the
                  display face and champagne, which is how the same sentence is
                  set on the contact page — one sentence, one treatment. Note
                  `font-serif` is the display token and resolves to Archivo
                  Expanded, not a serif; the name predates the brand sheet. */}
            <p className="text-champagne font-serif text-xl leading-relaxed sm:text-2xl">
              Preparation Creates Confidence. Execution Creates Wins.
            </p>
          </div>

          <div className="mt-12 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-8">
            <MagneticButton
              href="/get-started"
              variant="champagne"
              size="md"
              onClick={handleChatClick}
            >
              <span>Ask About the 0-4-7 Guide</span>
            </MagneticButton>
            <Link
              href="/about"
              className="text-champagne hover:text-champagne/80 inline-flex items-center gap-2 font-sans text-base font-normal transition-colors"
            >
              <span>More about Joey</span>
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
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
        </motion.div>
      </div>
    </section>
  );
}

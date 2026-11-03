'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { openJoeyChat } from '@/lib/chat/open-chat';

/**
 * How working with Joey starts, and the action that starts it.
 *
 * This fills the slot `ValueProposition` held. That component existed to carry
 * a named month-inventory guide, which the owner has now said is not a real
 * concept, so the component is deleted rather than edited — with the guide
 * gone there was nothing in it that needed its own section, and the stretch of
 * the homepage it was breaking up (Why Joey, Testimonials, Market Stats) still
 * offers a visitor almost nothing to act on.
 *
 * ## Why a new section rather than one of the five orphans
 *
 * Five built-but-unimported sections could have taken this slot. All five were
 * read and all five are disqualified on provenance or on layout — see the note
 * in src/app/(marketing)/page.tsx, which records the reason for each.
 *
 * ## Every factual sentence and where it comes from
 *
 * Sources are Joey's eleven approved answers in
 * src/lib/assistant/answer-playbook-content.ts, cited by entry `id`:
 *
 *   - "Every buyer's path is different, and the buyers who win start with a
 *     plan." — `first-time-buyer` ("Every first-time buyer's path is
 *     different, and the buyers who win start with a plan."), generalised from
 *     first-time buyers to buyers because this section is not addressed to
 *     first-timers only.
 *   - "Joey builds that plan with you personally: your goals, your budget, and
 *     your next steps." — `first-time-buyer`, verbatim.
 *   - "He treats real estate as a wealth-building strategy, so every move
 *     should build your financial future, not just close a deal." —
 *     `who-is-joey`.
 *   - "First-time buyer, seller, investor, or relocating across the world,
 *     Joey has a plan for you." — `who-is-joey`, verbatim.
 *   - "Joey serves all of Georgia, with deep expertise in Metro Atlanta,
 *     including Cobb, Fulton, DeKalb and Gwinnett counties." —
 *     `service-area`, verbatim.
 *   - "Joey handles every client personally, and the best way to get his full
 *     attention is a short consultation." — `am-i-talking-to-a-bot` ("Joey
 *     handles every client personally. The best way to get his full attention
 *     is a short consultation.").
 *   - "Preparation Creates Confidence. Execution Creates Wins." —
 *     `who-is-joey`, his philosophy line, verbatim.
 *
 * Nothing else is asserted here. No statistic, price, timeline, guarantee or
 * testimonial, and in particular no repetition of 60+ or $23.9M:
 * WhyJoeySection states both and MarketStatsSection is the scoreboard, and a
 * prior pass was rejected partly for putting a fourth copy of those two
 * numbers on one page. A test in
 * src/app/(marketing)/conversion-paths.test.tsx holds that line.
 *
 * ## There is no photograph to put beside it
 *
 * Single centred column, no image. Every relevant file under public/images/ is
 * a 34-243 byte stub, which is what made ValueProposition's photograph column
 * render a broken-image icon. The second column comes back when Joey supplies
 * a real portrait.
 *
 * ## Colours
 *
 * Onyx surface: bone text at 16.6:1, champagne for the eyebrow and the
 * philosophy line at 8.4:1 — gold is legible here and would not be on bone.
 * The action is `champagne`, a gold fill with an onyx label, because `primary`
 * resolves to hunter and a hunter button on a dark section is near-invisible.
 *
 * Nothing here is absolutely positioned or negatively inset: a decorative
 * element at `-right-8` caused 31px of horizontal scroll on a 390px viewport,
 * fixed in 87fa854.
 *
 * ## Why the chat button is a link
 *
 * Same reason as StartTheConversationCTA: the homepage prerenders, the
 * listener that opens the panel only exists after hydration, and a plain
 * `<button>` is silently dead until then. It carries `/get-started` as its
 * `href` and the handler calls `preventDefault()`, so the click works either
 * way and nothing changes on screen. The label is "Book 15 Minutes with
 * Joey", which is the consultation system-prompt.ts defines ("The
 * consultation is 15 minutes with Joey Oberndorfer").
 */
export function HowItStartsSection() {
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
            How It Starts
          </span>
          <h2 className="text-bone mt-6 font-serif text-5xl sm:text-6xl">
            Every buyer&rsquo;s path is different.
            <br />
            <span className="text-champagne">
              The buyers who win start with a plan.
            </span>
          </h2>
          <div className="text-bone/80 mt-8 space-y-6 font-sans text-lg leading-relaxed font-light">
            <p>
              Joey builds that plan with you personally:{' '}
              <strong className="text-bone font-normal">
                your goals, your budget, and your next steps
              </strong>
              .
            </p>
            <p>
              He treats real estate as a wealth-building strategy, so every move
              should build your financial future, not just close a deal.
              First-time buyer, seller, investor, or relocating across the
              world, Joey has a plan for you.
            </p>
            <p>
              Joey serves all of Georgia, with deep expertise in Metro Atlanta,
              including Cobb, Fulton, DeKalb and Gwinnett counties. He handles
              every client personally, and the best way to get his full
              attention is a short consultation.
            </p>
            {/* Joey's philosophy, from the `who-is-joey` entry. Set in the
                display face and champagne, which is how the same sentence is
                set on the contact page — one sentence, one treatment. */}
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
              <span>Book 15 Minutes with Joey</span>
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

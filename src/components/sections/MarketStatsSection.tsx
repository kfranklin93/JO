'use client';

import * as React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { siteConfig } from '@/config/site';

// JOEY UPDATE: Created market stats section with parallax background
// Establishes trust through activity metrics and recent results
//
// This is the single place the performance figures appear as a scoreboard.
// TestimonialsSection above used to repeat "Homes Sold" and "Total Volume"
// verbatim; that strip is gone. The prose mentions in TeamSection and FinalCTA
// read as narrative and stay.
//
// The section also predated the brand work and was black-and-white: `bg-black`
// with `text-white`, `bg-white/5` fills, `border-white/10` and a
// `hover:border-cerulean` that is invisible now `cerulean` resolves to hunter
// against a near-black fill. It is onyx-and-bone with champagne accents, which
// is the palette: bone on onyx is 16.6:1, champagne on onyx is 8.4:1.
//
// A fourth tile used to render `stats.avgDaysOnMarket` ('0-4-7 Months') under
// the label "Avg Days on Market" — a day count expressed in months, in a
// format that reads as corrupted data. No label can honestly describe that
// value, so the tile is removed and the grid reflows to three rather than
// publishing a broken figure. It comes back when Joey supplies the real
// number. See the note on `stats` in src/config/site.ts.

export function MarketStatsSection() {
  const sectionRef = React.useRef<HTMLDivElement>(null);

  // JOEY UPDATE: Parallax effect for background layer
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const backgroundY = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-onyx py-20 lg:py-32">
      {/* JOEY UPDATE: Parallax background pattern */}
      <motion.div
        style={{ y: backgroundY }}
        className="absolute inset-0 opacity-10"
      >
        {/* The grid lines held a raw white hex literal *inside* this arbitrary
            value, which is why the contrast audit never saw this section: it
            reads `bg-`/`text-` token pairs and an arbitrary value is opaque to
            it. `var(--color-bone)` references the token in the @theme block,
            so the colour is still declared in exactly one place. The audit now
            flags a hex in brackets as its own category, so this cannot recur
            silently. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-bone)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-bone)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </motion.div>

      <div className="relative z-10 mx-auto max-w-7xl px-8 lg:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="font-serif text-4xl text-bone sm:text-5xl lg:text-6xl">
            Proven Results That Speak
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg text-bone/80">
            Real numbers from real transactions across Atlanta's most competitive markets
          </p>
        </motion.div>

        {/* JOEY UPDATE: Stats grid with premium visual treatment */}
        {/* Three tiles, not four — see the note at the top of this file. */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="group relative overflow-hidden rounded-lg border border-bone/10 bg-bone/5 p-8 backdrop-blur-sm transition-all duration-300 hover:border-champagne hover:bg-bone/10"
          >
            <div className="relative z-10">
              <div className="font-serif text-5xl text-champagne lg:text-6xl">
                {siteConfig.stats.closedDeals}
              </div>
              <div className="mt-4 font-sans text-sm uppercase tracking-[0.2em] text-bone/80">
                Homes Sold
              </div>
              <p className="mt-2 font-sans text-sm text-bone/60">
                Successfully closed transactions
              </p>
            </div>
            {/* Decorative gradient. Champagne, not cerulean: cerulean resolves
                to hunter, and a 10% hunter wash over onyx is no visible hover
                state at all. */}
            <div className="absolute inset-0 bg-gradient-to-br from-champagne/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="group relative overflow-hidden rounded-lg border border-bone/10 bg-bone/5 p-8 backdrop-blur-sm transition-all duration-300 hover:border-champagne hover:bg-bone/10"
          >
            <div className="relative z-10">
              <div className="font-serif text-5xl text-champagne lg:text-6xl">
                {siteConfig.stats.totalVolume}
              </div>
              <div className="mt-4 font-sans text-sm uppercase tracking-[0.2em] text-bone/80">
                Total Volume
              </div>
              <p className="mt-2 font-sans text-sm text-bone/60">
                In closed real estate sales
              </p>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-champagne/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </motion.div>

          {/* `conversionRate` holds 'One-Tour', a descriptor rather than a
              number, so "Conversion Rate" was a label its own value could not
              satisfy. "First-Tour Buyers" is what 'One-Tour' actually names.
              The figure still wants Joey's real percentage — see site.ts. */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="group relative overflow-hidden rounded-lg border border-bone/10 bg-bone/5 p-8 backdrop-blur-sm transition-all duration-300 hover:border-champagne hover:bg-bone/10"
          >
            <div className="relative z-10">
              <div className="font-serif text-5xl text-champagne lg:text-6xl">
                {siteConfig.stats.conversionRate}
              </div>
              <div className="mt-4 font-sans text-sm uppercase tracking-[0.2em] text-bone/80">
                First-Tour Buyers
              </div>
              <p className="mt-2 font-sans text-sm text-bone/60">
                Most clients buy on first tour
              </p>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-champagne/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </motion.div>
        </div>

        {/* JOEY UPDATE: Awards and recognition */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 rounded-lg border border-bone/10 bg-bone/5 p-8 backdrop-blur-sm"
        >
          <h3 className="mb-6 text-center font-serif text-2xl text-bone">Awards & Recognition</h3>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {siteConfig.awards.map((award, index) => (
              <div
                key={index}
                className="flex items-center gap-3 font-sans text-sm text-bone/80"
              >
                <svg className="h-5 w-5 text-champagne" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span>{award}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* JOEY UPDATE: Disclaimer for listing data */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-8 text-center font-sans text-xs text-bone/40"
        >
          * Some listings may be delayed or off-market. All data represents closed transactions and verified results.
        </motion.p>
      </div>
    </section>
  );
}


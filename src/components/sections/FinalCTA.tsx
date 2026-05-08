'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { siteConfig } from '@/config/site';

export function FinalCTA() {
  return (
    <section className="bg-black py-32 sm:py-40">
      <div className="mx-auto max-w-4xl px-8 text-center lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="font-serif text-5xl text-white sm:text-6xl">
            Ready to Find Your Dream Home?
          </h2>
          <p className="mx-auto mt-8 max-w-2xl font-sans text-lg text-neutral-300">
            Experience Joey's proven 'One-Tour' conversion mastery. Schedule your exclusive viewing today
            and discover why {siteConfig.stats.closedDeals}+ clients trust Joey with their real estate journey.
          </p>
          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center sm:gap-6">
            <Link
              href="/get-started"
              className="inline-flex items-center justify-center gap-3 border-2 border-white bg-white px-10 py-5 font-sans text-base font-medium uppercase tracking-wider text-black transition-all duration-300 hover:bg-black hover:text-white"
            >
              <span>Schedule Your Viewing</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-3 border-2 border-white bg-transparent px-10 py-5 font-sans text-base font-medium uppercase tracking-wider text-white transition-all duration-300 hover:bg-white hover:text-black"
            >
              <span>Contact Joey</span>
            </Link>
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 border-t border-neutral-700 pt-12">
            <div className="flex items-center gap-2 text-neutral-400">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="font-sans text-sm">5-Star Rated</span>
            </div>
            <div className="h-4 w-[1px] bg-neutral-700" />
            <div className="font-sans text-sm text-neutral-400">
              24-Hour Response Time
            </div>
            <div className="h-4 w-[1px] bg-neutral-700" />
            <div className="font-sans text-sm text-neutral-400">
              {siteConfig.stats.conversionRate} First-Tour Success
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// Made with Bob

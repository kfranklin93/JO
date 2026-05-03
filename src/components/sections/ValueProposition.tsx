'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { siteConfig } from '@/config/site';

export function ValueProposition() {
  return (
    <section className="bg-[#1C2A39] py-32 sm:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="grid gap-20 lg:grid-cols-2 lg:gap-28">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex flex-col justify-center"
          >
            <span className="font-sans text-sm font-light uppercase tracking-[0.3em] text-[#C5A059]">
              Why Joey Oberndorfer
            </span>
            <h2 className="mt-6 font-serif text-5xl text-[#FAF9F6] sm:text-6xl">
              One Tour.<br />One Decision.<br />
              <span className="text-[#C5A059]">Zero Regrets.</span>
            </h2>
            <div className="mt-8 space-y-6 font-sans text-lg font-light leading-relaxed text-[#FAF9F6]/80">
              <p>
                With a background in <strong className="font-normal text-[#FAF9F6]">law enforcement and competitive athletics</strong>,
                Joey brings non-negotiable discipline and strategic thinking to every transaction.
              </p>
              <p>
                His signature <strong className="font-normal text-[#FAF9F6]">'One-Tour' conversion mastery</strong> eliminates
                decision fatigue. You'll find your perfect property on the first showing—guaranteed.
              </p>
              <p>
                The <strong className="font-normal text-[#FAF9F6]">'0-4-7 Month Inventory Guide'</strong> ensures your property
                moves quickly with strategic pricing, professional staging, and targeted marketing.
              </p>
            </div>

            <div className="mt-12">
              <Link
                href="/about"
                className="inline-flex items-center gap-2 font-sans text-base font-normal text-[#C5A059] transition-colors hover:text-[#C5A059]/80"
              >
                <span>Learn More About Joey's Process</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-[#C5A059]/20">
              <img
                src="/images/hero/joey-profile.jpg"
                alt={siteConfig.fullName}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-8 -right-8 h-40 w-40 rounded-2xl border border-[#C5A059]" />
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="absolute -left-8 bottom-16 rounded-2xl border border-[#C5A059]/20 bg-[#FAF9F6] p-8 shadow-2xl"
            >
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="font-serif text-3xl text-[#C5A059]">{siteConfig.stats.closedDeals}</div>
                  <div className="mt-1 font-sans text-xs font-light text-[#1C2A39]/60">Closed Deals</div>
                </div>
                <div>
                  <div className="font-serif text-3xl text-[#C5A059]">{siteConfig.stats.totalVolume}</div>
                  <div className="mt-1 font-sans text-xs font-light text-[#1C2A39]/60">Total Volume</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// Made with Bob

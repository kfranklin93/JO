'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { siteConfig } from '@/config/site';

export function HeroSection() {
  return (
    <section className="relative min-h-screen bg-[#1C2A39]">
      <div className="absolute inset-0 overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover opacity-30"
        >
          <source src="/videos/hero-drone.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#1C2A39]/90 via-[#1C2A39]/75 to-[#1C2A39]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-8 pt-32 pb-20 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl"
        >
          <div className="mb-8 inline-flex items-center gap-3 rounded-2xl border border-[#C5A059]/30 bg-[#C5A059]/10 px-6 py-3 backdrop-blur-sm">
            <span className="text-2xl">★★★★★</span>
            <span className="font-sans text-sm font-light text-[#FAF9F6]">
              {siteConfig.stats.closedDeals} Closed Deals • {siteConfig.stats.totalVolume} in Volume
            </span>
          </div>

          <h1 className="font-serif text-6xl leading-tight text-[#FAF9F6] sm:text-7xl lg:text-8xl">
            Find Your Perfect Home on the{' '}
            <span className="text-[#C5A059]">First Showing</span>
          </h1>

          <p className="mt-8 max-w-2xl font-sans text-xl font-light leading-relaxed text-[#FAF9F6]/90">
            Joey Oberndorfer's proven 'One-Tour' conversion mastery means you'll discover your dream property
            without the exhausting back-and-forth. Schedule your exclusive viewing today.
          </p>

          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:gap-6">
            <Link
              href="/get-started"
              className="group inline-flex items-center justify-center gap-3 rounded-2xl bg-[#C5A059] px-10 py-5 font-sans text-lg font-normal text-[#FAF9F6] transition-all duration-300 hover:bg-[#C5A059]/90 hover:shadow-2xl hover:shadow-[#C5A059]/20"
            >
              <span>Schedule Your Viewing</span>
              <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>

            <Link
              href="/properties"
              className="inline-flex items-center justify-center gap-3 rounded-2xl border border-[#FAF9F6]/30 bg-transparent px-10 py-5 font-sans text-lg font-light text-[#FAF9F6] backdrop-blur-sm transition-all duration-300 hover:border-[#FAF9F6] hover:bg-[#FAF9F6]/10"
            >
              <span>Browse Listings</span>
            </Link>
          </div>

          <div className="mt-16 flex flex-wrap gap-12 border-t border-[#FAF9F6]/20 pt-8">
            <div>
              <div className="font-serif text-4xl text-[#C5A059]">{siteConfig.stats.conversionRate}</div>
              <div className="mt-2 font-sans text-sm font-light text-[#FAF9F6]/70">First-Tour Success Rate</div>
            </div>
            <div>
              <div className="font-serif text-4xl text-[#C5A059]">0-4-7</div>
              <div className="mt-2 font-sans text-sm font-light text-[#FAF9F6]/70">Month Inventory System</div>
            </div>
            <div>
              <div className="font-serif text-4xl text-[#C5A059]">24hr</div>
              <div className="mt-2 font-sans text-sm font-light text-[#FAF9F6]/70">Response Time</div>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2"
      >
        <div className="flex flex-col items-center gap-2">
          <span className="font-sans text-xs font-light uppercase tracking-wider text-[#FAF9F6]/60">
            Explore Properties
          </span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="h-8 w-[1px] bg-gradient-to-b from-[#C5A059] to-transparent"
          />
        </div>
      </motion.div>
    </section>
  );
}

// Made with Bob

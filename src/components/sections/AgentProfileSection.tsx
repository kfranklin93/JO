'use client';

import * as React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { siteConfig } from '@/config/site';

export function AgentProfileSection() {
  return (
    <section className="relative bg-neutral-900 py-20 lg:py-32">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/images/joey-office.jpg"
          alt="Joey Oberndorfer in his office"
          fill
          className="object-cover object-center opacity-20"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-900 via-neutral-900/95 to-neutral-900/80" />
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-7xl px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left Column - Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            {/* Eyebrow */}
            <div className="mb-6 inline-block border-l-4 border-white pl-4">
              <span className="font-sans text-sm font-medium uppercase tracking-wider text-white">
                About Joey
              </span>
            </div>

            {/* Headline */}
            <h2 className="mb-8 font-serif text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">
              Experience That Makes the Difference
            </h2>

            {/* Description */}
            <div className="space-y-6 font-sans text-lg leading-relaxed text-neutral-300">
              <p>
                Former San Diego Police Department officer and Division II football player turned top-producing real
                estate agent. Joey brings discipline, integrity, and a winning mindset to every transaction.
              </p>
              <p>
                With {siteConfig.stats.closedDeals} closed deals and {siteConfig.stats.totalVolume} in sales volume,
                Joey has built a reputation for delivering exceptional results in Atlanta's competitive market.
              </p>
              <p>
                His unique background in law enforcement and athletics translates to unmatched dedication, strategic
                thinking, and a commitment to protecting his clients' interests at every turn.
              </p>
            </div>

            {/* CTA */}
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:gap-6">
              <MagneticButton
                href="/about"
                variant="secondary"
                size="md"
                className="group"
              >
                <span>Discover Joey's Story</span>
                <svg
                  className="h-5 w-5 transition-transform group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </MagneticButton>

              <MagneticButton
                href="/contact"
                variant="outline"
                size="md"
                className="border-bronze text-bronze hover:bg-bronze hover:text-white hover:border-bronze"
              >
                <span>Schedule a Consultation</span>
              </MagneticButton>
            </div>

            {/* Credentials */}
            <div className="mt-12 flex flex-wrap gap-8 border-t border-neutral-700 pt-8">
              <div>
                <div className="font-serif text-3xl text-white">{siteConfig.stats.closedDeals}</div>
                <div className="mt-1 font-sans text-sm text-neutral-400">Closed Deals</div>
              </div>
              <div>
                <div className="font-serif text-3xl text-white">{siteConfig.stats.totalVolume}</div>
                <div className="mt-1 font-sans text-sm text-neutral-400">Total Volume</div>
              </div>
              <div>
                <div className="font-serif text-3xl text-white">{siteConfig.stats.conversionRate}</div>
                <div className="mt-1 font-sans text-sm text-neutral-400">Conversion Rate</div>
              </div>
            </div>
          </motion.div>

          {/* Right Column - YouTube Video */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex items-center"
          >
            <div className="w-full">
              {/* Video Label */}
              <div className="mb-4">
                <span className="font-sans text-sm font-medium uppercase tracking-wider text-neutral-400">
                  Featured Interview
                </span>
                <h3 className="mt-2 font-serif text-2xl text-white">
                  {siteConfig.featured.interviewTitle}
                </h3>
              </div>

              {/* YouTube Embed */}
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black shadow-2xl">
                <iframe
                  src={`https://www.youtube.com/embed/${siteConfig.featured.youtubeInterview.split('v=')[1]}`}
                  title={siteConfig.featured.interviewTitle}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>

              {/* Video CTA */}
              <div className="mt-6">
                <a
                  href={siteConfig.featured.youtubeInterview}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-sans text-sm text-neutral-400 transition-colors hover:text-white"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  <span>Watch on YouTube</span>
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// Made with Bob
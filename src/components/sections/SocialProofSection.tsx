'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { siteConfig } from '@/config/site';

const accolades = [
  {
    title: 'Top 0%',
    subtitle: 'of Real Estate Agents Nationwide',
    description: 'Ranked among the elite performers in the industry',
  },
  {
    title: 'Top 1 International Luxury',
    subtitle: 'Christie\'s International Real Estate',
    description: 'Recognized for excellence in luxury property sales',
  },
  {
    title: 'Most Influential Men',
    subtitle: 'Atlanta Business Chronicle',
    description: 'Leading voice in Atlanta real estate market',
  },
];

export function SocialProofSection() {
  return (
    <section className="bg-neutral-50 py-20 lg:py-32">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="font-serif text-4xl text-black sm:text-5xl lg:text-6xl">
            Proven Excellence
          </h2>
          <p className="mt-4 font-sans text-lg text-neutral-600">
            Recognition from industry leaders and publications
          </p>
        </motion.div>

        {/* Accolades Grid */}
        <div className="grid gap-8 md:grid-cols-3">
          {accolades.map((accolade, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative overflow-hidden border border-neutral-200 bg-white p-8 transition-all duration-300 hover:border-black hover:shadow-lg"
            >
              {/* Decorative Element */}
              <div className="absolute right-0 top-0 h-1 w-0 bg-black transition-all duration-300 group-hover:w-full" />

              {/* Content */}
              <div className="relative">
                <h3 className="font-serif text-3xl text-black lg:text-4xl">
                  {accolade.title}
                </h3>
                <p className="mt-3 font-sans text-base font-medium text-neutral-700">
                  {accolade.subtitle}
                </p>
                <p className="mt-4 font-sans text-sm leading-relaxed text-neutral-600">
                  {accolade.description}
                </p>
              </div>

              {/* Hover Arrow */}
              <div className="mt-6 flex items-center gap-2 text-neutral-400 transition-all duration-300 group-hover:gap-4 group-hover:text-black">
                <span className="font-sans text-xs uppercase tracking-wider">Learn More</span>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 grid gap-8 border-t border-neutral-200 pt-12 sm:grid-cols-3"
        >
          <div className="text-center">
            <div className="font-serif text-5xl text-black">{siteConfig.stats.closedDeals}</div>
            <div className="mt-2 font-sans text-sm uppercase tracking-wider text-neutral-600">
              Closed Deals
            </div>
          </div>
          <div className="text-center">
            <div className="font-serif text-5xl text-black">{siteConfig.stats.totalVolume}</div>
            <div className="mt-2 font-sans text-sm uppercase tracking-wider text-neutral-600">
              Total Volume
            </div>
          </div>
          <div className="text-center">
            <div className="font-serif text-5xl text-black">{siteConfig.stats.conversionRate}</div>
            <div className="mt-2 font-sans text-sm uppercase tracking-wider text-neutral-600">
              Conversion Rate
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// Made with Bob
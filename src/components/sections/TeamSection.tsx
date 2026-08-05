'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { siteConfig } from '@/config/site';

// JOEY UPDATE: Created team section with hero image and personal story
// Builds trust and connection through Joey's background and expertise

export function TeamSection() {
  return (
    <section className="bg-white py-20 lg:py-32">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="font-serif text-4xl text-navy sm:text-5xl lg:text-6xl">
            Meet Your Agent
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg text-stone">
            From law enforcement to real estate excellence—bringing discipline, integrity, and results to every transaction
          </p>
        </motion.div>

        {/* JOEY UPDATE: Split layout with image and story */}
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Team Photo */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-neutral-100 shadow-2xl">
              {/* JOEY UPDATE: Replace with actual team photo when available */}
              <Image
                src="/images/joey-hero-instagram.jpg"
                alt={`${siteConfig.fullName} - Real Estate Team`}
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            {/* Decorative element */}
            <div className="absolute -bottom-6 -right-6 -z-10 h-full w-full rounded-lg bg-champagne/10" />
          </motion.div>

          {/* Story and Credentials */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col justify-center"
          >
            <h3 className="font-serif text-3xl text-navy lg:text-4xl">
              {siteConfig.fullName}
            </h3>
            <p className="mt-2 font-sans text-lg text-stone">
              {siteConfig.subtitle}
            </p>

            {/* JOEY UPDATE: Personal story */}
            <div className="mt-8 space-y-4 font-sans text-base leading-relaxed text-stone">
              <p>
                Before becoming one of Atlanta's top real estate agents, I served as a police officer with the San Diego Police Department, where I learned the importance of integrity, attention to detail, and putting people first.
              </p>
              <p>
                That same commitment drives my approach to real estate. Whether you're a first-time buyer, seasoned investor, or looking to sell, I bring the same dedication and work ethic that made me successful in law enforcement.
              </p>
              <p>
                With {siteConfig.stats.closedDeals} homes sold and {siteConfig.stats.totalVolume} in closed volume, I've built my reputation on results, transparency, and genuine care for my clients' success.
              </p>
            </div>

            {/* JOEY UPDATE: Credentials and specialties */}
            <div className="mt-8 space-y-6">
              <div>
                <h4 className="mb-3 font-sans text-sm font-medium uppercase tracking-[0.2em] text-champagne">
                  Specialties
                </h4>
                <div className="flex flex-wrap gap-2">
                  {siteConfig.background.specialties.map((specialty, index) => (
                    <span
                      key={index}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 font-sans text-sm text-stone"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-3 font-sans text-sm font-medium uppercase tracking-[0.2em] text-champagne">
                  Education & Background
                </h4>
                <ul className="space-y-2 font-sans text-sm text-stone">
                  <li className="flex items-start gap-2">
                    <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-champagne" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>{siteConfig.background.education}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-champagne" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>{siteConfig.background.previousCareer}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-champagne" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>{siteConfig.background.athletics}</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* JOEY UPDATE: Contact CTA */}
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href={`tel:${siteConfig.contact.phone}`}
                className="inline-flex items-center gap-2 rounded-lg bg-champagne px-6 py-3 font-sans text-sm font-medium text-navy transition-all hover:bg-[#b08e4a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                Call Me
              </a>
              <a
                href={`mailto:${siteConfig.contact.email}`}
                className="inline-flex items-center gap-2 rounded-lg border-2 border-navy bg-white px-6 py-3 font-sans text-sm font-medium text-navy transition-all hover:border-champagne hover:bg-champagne hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Email Me
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// Made with Bob
'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MagneticButton } from '@/components/ui/MagneticButton';

const ctaCards = [
  {
    title: 'Home Search',
    description: 'Browse exclusive listings and find your perfect property in Atlanta\'s most desirable neighborhoods.',
    icon: (
      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
    href: '/properties',
    cta: 'Search Now',
  },
  {
    title: 'Home Valuation',
    description: 'Get an accurate, complimentary market analysis of your property from an experienced local expert.',
    icon: (
      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    href: '/sell-home',
    cta: 'Get Valuation',
  },
  {
    title: 'Connect',
    description: 'Schedule a consultation to discuss your real estate goals and discover how we can help you succeed.',
    icon: (
      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
    href: '/contact',
    cta: 'Get in Touch',
  },
];

export function ThreeCardCTA() {
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
          <h2 className="font-serif text-4xl text-black sm:text-5xl lg:text-6xl">
            How Can I Help You?
          </h2>
          <p className="mt-4 font-sans text-lg text-neutral-600">
            Choose the service that best fits your needs
          </p>
        </motion.div>

        {/* CTA Cards Grid */}
        <div className="grid gap-8 md:grid-cols-3">
          {ctaCards.map((card, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative flex flex-col border border-neutral-200 bg-white p-8 transition-all duration-300 hover:border-primary hover:shadow-2xl lg:p-10"
            >
              {/* Icon */}
              <div className="mb-6 text-neutral-400 transition-colors duration-300 group-hover:text-primary">
                {card.icon}
              </div>

              {/* Title */}
              <h3 className="mb-4 font-serif text-2xl text-black lg:text-3xl">
                {card.title}
              </h3>

              {/* Description */}
              <p className="mb-8 flex-grow font-sans text-base leading-relaxed text-neutral-600">
                {card.description}
              </p>

              {/* CTA Link */}
              <Link
                href={card.href}
                className="group/link inline-flex items-center gap-2 font-sans text-sm font-medium uppercase tracking-wider text-primary transition-all duration-300 hover:text-accent"
              >
                <span className="border-b border-transparent pb-1 group-hover/link:border-accent">{card.cta}</span>
                <svg
                  className="h-4 w-4 transition-transform group-hover/link:translate-x-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>

              {/* Decorative Corner */}
              <div className="absolute bottom-0 right-0 h-0 w-0 border-b-[40px] border-r-[40px] border-b-transparent border-r-neutral-100 transition-all duration-300 group-hover:border-r-primary" />
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA with MagneticButton */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <p className="mb-6 font-sans text-lg text-neutral-600">
            Not sure where to start?
          </p>
          <MagneticButton 
            href="/contact" 
            variant="primary" 
            size="lg"
            className="group"
          >
            <span>Schedule a Consultation</span>
            <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </MagneticButton>
        </motion.div>
      </div>
    </section>
  );
}


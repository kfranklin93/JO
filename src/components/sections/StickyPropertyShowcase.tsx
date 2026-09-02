'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useScrollTrigger } from '@/lib/hooks/useScrollTrigger';
import { MagneticButton } from '@/components/ui/MagneticButton';
import Link from 'next/link';

interface PropertySpec {
  label: string;
  value: string;
  icon: React.ReactNode;
}

const propertySpecs: PropertySpec[] = [
  {
    label: 'Square Footage',
    value: '4,200 sq ft',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
      </svg>
    ),
  },
  {
    label: 'Bedrooms',
    value: '5 Beds',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Bathrooms',
    value: '4.5 Baths',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Price',
    value: '$1.2M',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Days on Market',
    value: '4 Days',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'One-Tour Conversion',
    value: '100%',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export function StickyPropertyShowcase() {
  return (
    <section className="relative bg-linen py-32 sm:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="grid gap-20 lg:grid-cols-2 lg:gap-28">
          {/* Left: Sticky Image */}
          <div className="lg:sticky lg:top-24 lg:h-[600px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative h-full overflow-hidden rounded-2xl border border-navy/10 bg-navy/5 shadow-2xl"
            >
              <img
                src="/images/properties/flagship.jpg"
                alt="Flagship Property"
                className="h-full w-full object-cover"
              />
              {/* Overlay Badge */}
              <div className="absolute left-6 top-6 rounded-2xl bg-navy px-4 py-2 shadow-lg">
                <span className="font-sans text-sm font-light uppercase tracking-wider text-linen">
                  Flagship Property
                </span>
              </div>
            </motion.div>
          </div>

          {/* Right: Scrolling Specs */}
          <div className="space-y-8">
            {/* Header */}
            <div>
              <span className="font-sans text-sm font-light uppercase tracking-[0.3em] text-cerulean">
                Featured Listing
              </span>
              <h2 className="mt-4 font-serif text-5xl text-navy sm:text-6xl">
                Modern Luxury in East Cobb
              </h2>
              <p className="mt-6 font-sans text-lg font-light text-stone">
                Experience Joey's signature one-tour conversion with this stunning
                custom-built estate. Sold in just 4 days.
              </p>
            </div>

            {/* Specs Grid */}
            <div className="space-y-6">
              {propertySpecs.map((spec, index) => (
                <PropertySpecItem
                  key={spec.label}
                  spec={spec}
                  index={index}
                />
              ))}
            </div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="pt-8"
            >
              <Link href="/get-started">
                <MagneticButton variant="primary" size="lg">
                  See Similar Properties
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </MagneticButton>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PropertySpecItem({ spec, index }: { spec: PropertySpec; index: number }) {
  const { ref, isVisible } = useScrollTrigger({
    threshold: 0.5,
    triggerOnce: true,
  });

  return (
    <motion.div
      ref={ref as React.RefObject<HTMLDivElement>}
      initial={{ opacity: 0, x: -30 }}
      animate={isVisible ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="flex items-start gap-4 border-l-4 border-navy pl-6"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-navy/10 text-navy">
        {spec.icon}
      </div>
      <div>
        <div className="font-sans text-sm font-light uppercase tracking-wider text-stone">
          {spec.label}
        </div>
        <div className="mt-1 font-serif text-2xl text-navy">
          {spec.value}
        </div>
      </div>
    </motion.div>
  );
}


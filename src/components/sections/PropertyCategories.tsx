'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { siteConfig } from '@/config/site';

const categories = [
  {
    title: 'Move-In Ready Homes',
    description: 'High-intent properties ready for immediate occupancy',
    image: '/images/properties/now-selling.jpg',
    badge: 'Now Selling',
    badgeColor: 'bg-[#C5A059]',
    href: '/properties/now-selling'
  },
  {
    title: 'Future Visions',
    description: 'Exclusive pre-launch opportunities and development projects',
    image: '/images/properties/future-visions.jpg',
    badge: 'Coming Soon',
    badgeColor: 'bg-[#1C2A39]/60',
    href: '/properties/future-visions'
  },
  {
    title: 'Legacy Portfolio',
    description: `Showcasing ${siteConfig.stats.closedDeals} successful transactions`,
    image: '/images/properties/legacy.jpg',
    badge: 'Sold',
    badgeColor: 'bg-[#1C2A39]',
    href: '/properties/legacy'
  }
];

export function PropertyCategories() {
  return (
    <section className="bg-[#1C2A39] py-32 sm:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="text-center">
          <h2 className="font-serif text-5xl text-[#FAF9F6] sm:text-6xl">
            Explore by Category
          </h2>
          <p className="mt-6 font-sans text-lg font-light text-[#FAF9F6]/70">
            From move-in ready homes to exclusive pre-launch opportunities
          </p>
        </div>

        <div className="mt-20 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, index) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative overflow-hidden rounded-2xl border border-[#FAF9F6]/10 bg-[#FAF9F6]"
            >
              <div className="aspect-[4/3] overflow-hidden bg-[#1C2A39]/5">
                <img
                  src={category.image}
                  alt={category.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-10">
                <span className={`inline-block rounded-2xl ${category.badgeColor} px-4 py-2 font-sans text-xs font-light uppercase tracking-wider text-[#FAF9F6]`}>
                  {category.badge}
                </span>
                <h3 className="mt-6 font-serif text-3xl text-[#1C2A39]">
                  {category.title}
                </h3>
                <p className="mt-4 font-sans font-light text-[#1C2A39]/70">
                  {category.description}
                </p>
                <Link
                  href={category.href}
                  className="mt-8 inline-flex items-center gap-2 font-sans text-sm font-normal text-[#C5A059] transition-colors hover:text-[#C5A059]/80"
                >
                  <span>{category.badge === 'Sold' ? 'View Success Stories' : category.badge === 'Coming Soon' ? 'Get Early Access' : 'View Listings'}</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Made with Bob

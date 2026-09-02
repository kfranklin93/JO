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
    badgeColor: 'bg-navy',
    href: '/properties/now-selling'
  },
  {
    title: 'Future Visions',
    description: 'Exclusive pre-launch opportunities and development projects',
    image: '/images/properties/future-visions.jpg',
    badge: 'Coming Soon',
    badgeColor: 'bg-stone',
    href: '/properties/future-visions'
  },
  {
    title: 'Legacy Portfolio',
    description: `Showcasing ${siteConfig.stats.closedDeals} successful transactions`,
    image: '/images/properties/legacy.jpg',
    badge: 'Sold',
    badgeColor: 'bg-navy',
    href: '/properties/legacy'
  }
];

export function PropertyCategories() {
  return (
    <section className="bg-onyx py-32 sm:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="text-center">
          <h2 className="font-serif text-5xl text-linen sm:text-6xl">
            Explore by Category
          </h2>
          <p className="mt-6 font-sans text-lg font-light text-linen/70">
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
              className="group relative overflow-hidden rounded-2xl border border-navy/10 bg-linen"
            >
              <div className="aspect-[4/3] overflow-hidden bg-navy/5">
                <img
                  src={category.image}
                  alt={category.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-10">
                <span className={`inline-block rounded-2xl ${category.badgeColor} px-4 py-2 font-sans text-xs font-light uppercase tracking-wider text-linen`}>
                  {category.badge}
                </span>
                <h3 className="mt-6 font-serif text-3xl text-navy">
                  {category.title}
                </h3>
                <p className="mt-4 font-sans font-light text-stone">
                  {category.description}
                </p>
                <Link
                  href={category.href}
                  className="mt-8 inline-flex items-center gap-2 font-sans text-sm font-normal text-cerulean transition-colors hover:text-cerulean/80"
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

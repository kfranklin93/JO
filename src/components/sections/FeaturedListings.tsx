'use client';

import * as React from 'react';
import Link from 'next/link';
import { PropertyCard } from '@/components/cards/PropertyCard';
import { featuredProperties } from '@/data/properties';
import { siteConfig } from '@/config/site';

export function FeaturedListings() {
  return (
    <section className="bg-[white] py-32 sm:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="mb-16 text-center">
          <span className="font-sans text-sm font-light uppercase tracking-[0.3em] text-[black]">
            Available Now
          </span>
          <h2 className="mt-4 font-serif text-5xl text-[black] sm:text-6xl">
            Featured Properties
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg font-light text-[black]/70">
            Handpicked luxury homes ready for your exclusive viewing
          </p>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {featuredProperties.map((property, index) => (
            <PropertyCard key={index} property={property} index={index} />
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/properties"
            className="inline-flex items-center justify-center gap-3 rounded-2xl border border-[black]/20 bg-transparent px-10 py-5 font-sans text-base font-normal text-[black] transition-all duration-300 hover:border-[black] hover:bg-[black] hover:text-[white]"
          >
            <span>View All {siteConfig.stats.closedDeals}+ Listings</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

// Made with Bob

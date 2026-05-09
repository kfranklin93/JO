'use client';

import * as React from 'react';
import { PropertyCard } from '@/components/cards/PropertyCard';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { StickyBottomCTA } from '@/components/ui/StickyBottomCTA';
import { featuredProperties } from '@/data/properties';
import { siteConfig } from '@/config/site';

export function FeaturedListings() {
  return (
    <section id="featured-listings" className="bg-surface py-32 sm:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="mb-16 text-center">
          <span className="font-sans text-sm font-medium uppercase tracking-[0.3em] text-muted">
            Available Now
          </span>
          <h2 className="mt-4 font-serif text-5xl text-primary sm:text-6xl">
            Curated Collection
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg text-neutral-600">
            Handpicked luxury homes ready for your exclusive viewing
          </p>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {featuredProperties.map((property, index) => (
            <PropertyCard key={index} property={property} index={index} />
          ))}
        </div>

        <div className="mt-16 text-center">
          <MagneticButton
            href="/properties"
            variant="outline"
            size="lg"
            className="group"
          >
            <span>Explore All {siteConfig.stats.closedDeals}+ Listings</span>
            <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </MagneticButton>
        </div>
      </div>

      {/* Sticky Bottom CTA - appears when user scrolls past this section */}
      <StickyBottomCTA triggerElementId="featured-listings" />
    </section>
  );
}

// Made with Bob

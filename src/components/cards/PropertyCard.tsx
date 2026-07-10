'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Property } from '@/data/properties';

interface PropertyCardProps {
  property: Property;
  index: number;
}

export function PropertyCard({ property, index }: PropertyCardProps) {
  const [imageLoaded, setImageLoaded] = React.useState(false);

  return (
    <Link href={`/properties/${index + 1}`} className="block">
      <motion.article
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: index * 0.1 }}
        className="group relative overflow-hidden rounded-sm border border-neutral-200 bg-surface transition-all duration-300 hover:shadow-soft"
      >
        {/* Image Container with Progressive Disclosure */}
        <div className="relative aspect-[4/5] overflow-hidden bg-neutral-100">
          <img
            src={property.image}
            alt={`${property.title} - ${property.beds} bed, ${property.baths} bath home`}
            className={cn(
              'h-full w-full object-cover transition-all duration-700',
              'group-hover:scale-105',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImageLoaded(true)}
            loading="lazy"
          />
          
          {/* Status Badge */}
          <div className="absolute left-4 top-4 rounded-sm bg-primary px-4 py-2 font-sans text-xs font-medium uppercase tracking-widest text-primary-foreground shadow-md">
            {property.status}
          </div>
          
          {/* Desktop Hover Overlay */}
          <div className="absolute inset-0 hidden items-center justify-center bg-primary/90 opacity-0 transition-opacity duration-300 group-hover:opacity-100 md:flex">
            <span className="rounded-sm border-2 border-primary-foreground bg-primary px-8 py-4 font-sans text-sm font-medium uppercase tracking-wider text-primary-foreground transition-transform hover:scale-105">
              Request Private Showing
            </span>
          </div>

          {/* Mobile CTA Icon - Always Visible */}
          <div className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110 md:hidden">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* Property Details */}
        <div className="p-8">
          <div className="font-serif text-3xl text-primary">{property.price}</div>
          <h3 className="mt-3 font-serif text-2xl text-primary">{property.title}</h3>
          
          {/* Property Meta - Enhanced Contrast */}
          <div className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-6 font-sans text-xs uppercase tracking-widest text-neutral-600">
            <div className="flex items-center gap-1.5">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>{property.beds} Beds</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{property.baths} Baths</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span>{property.sqft} sqft</span>
            </div>
          </div>

          {/* Action-Oriented CTA */}
          <div className="mt-6 flex items-center justify-between font-sans text-sm font-medium text-primary transition-colors group-hover:text-accent">
            <span className="underline-offset-4 group-hover:underline">View Full Details</span>
            <svg className="h-4 w-4 transform transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}

// Helper function for conditional classes
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// Made with Bob

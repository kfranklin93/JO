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
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="group relative overflow-hidden rounded-sm border border-[black]/10 bg-white"
    >
      <div className="relative aspect-[4/5] overflow-hidden group">
        <img
          src={property.image}
          alt={property.title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute left-4 top-4 rounded-sm bg-[black] px-4 py-2 font-sans text-xs font-light uppercase tracking-widest text-[white]">
          {property.status}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-[black]/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Link
            href="/get-started"
            className="rounded-2xl bg-[black] px-6 py-3 font-sans text-sm font-normal text-[white] transition-transform hover:scale-105"
          >
            Schedule Viewing
          </Link>
        </div>
      </div>

      <div className="p-8">
        <div className="font-serif text-3xl text-[black]">{property.price}</div>
        <h3 className="mt-3 font-serif text-2xl text-[black]">{property.title}</h3>
        
        <div className="mt-6 flex items-center gap-6 border-t border-[black]/10 pt-6 font-sans text-xs uppercase tracking-widest text-[black]/60">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>{property.beds} Beds</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{property.baths} Baths</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span>{property.sqft} sqft</span>
          </div>
        </div>

        <Link
          href={`/properties/${index + 1}`}
          className="mt-6 inline-flex items-center gap-2 font-sans text-sm font-normal text-[black] transition-colors hover:text-[black]/80"
        >
          <span>View Full Details</span>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </motion.div>
  );
}

// Made with Bob

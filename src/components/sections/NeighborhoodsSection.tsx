'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { atlantaNeighborhoods } from '@/data/neighborhoods';

// JOEY UPDATE: Created neighborhoods browsing section with rich imagery
// Inspired by premium real estate site patterns for area exploration

export function NeighborhoodsSection() {
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
            Explore Atlanta Neighborhoods
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg text-neutral-600">
            From urban sophistication to family-friendly suburbs, discover the perfect community for your lifestyle
          </p>
        </motion.div>

        {/* JOEY UPDATE: Neighborhood cards grid with hover effects */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {atlantaNeighborhoods.map((neighborhood, index) => (
            <motion.article
              key={neighborhood.slug}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative overflow-hidden rounded-lg bg-white shadow-md transition-all duration-300 hover:shadow-2xl"
            >
              {/* JOEY UPDATE: Neighborhood image with parallax hover effect */}
              <Link href={`/properties?neighborhood=${neighborhood.slug}`} className="block">
                <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
                  <Image
                    src={neighborhood.image}
                    alt={neighborhood.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  
                  {/* Price range badge */}
                  <div className="absolute right-4 top-4 rounded-full bg-white/90 px-4 py-2 backdrop-blur-sm">
                    <span className="font-sans text-sm font-medium text-black">{neighborhood.priceRange}</span>
                  </div>
                </div>

                {/* JOEY UPDATE: Neighborhood details */}
                <div className="p-6">
                  <h3 className="font-serif text-2xl text-black group-hover:text-accent transition-colors">
                    {neighborhood.name}
                  </h3>
                  <p className="mt-3 font-sans text-base leading-relaxed text-neutral-600">
                    {neighborhood.description}
                  </p>

                  {/* JOEY UPDATE: Highlights list */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {neighborhood.highlights.slice(0, 3).map((highlight) => (
                      <span
                        key={highlight}
                        className="rounded-full bg-neutral-100 px-3 py-1 font-sans text-xs text-neutral-700"
                      >
                        {highlight}
                      </span>
                    ))}
                  </div>

                  {/* JOEY UPDATE: View homes CTA */}
                  <div className="mt-6 flex items-center gap-2 font-sans text-sm font-medium text-primary transition-colors group-hover:text-accent">
                    <span>View Homes</span>
                    <svg
                      className="h-4 w-4 transition-transform group-hover:translate-x-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>

        {/* JOEY UPDATE: View all neighborhoods CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <Link
            href="/properties"
            className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-white px-8 py-4 font-sans text-sm font-medium uppercase tracking-wider text-primary transition-all hover:border-accent hover:bg-accent hover:text-black hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span>Explore All Areas</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

// Made with Bob
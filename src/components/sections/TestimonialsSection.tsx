'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { clientTestimonials, type Testimonial } from '@/data/testimonials';

/**
 * Client testimonials.
 *
 * ## With no testimonials, this section does not exist
 *
 * The six reviews this rendered were invented — see the note at the top of
 * src/data/testimonials.ts — and `clientTestimonials` is now empty, so the
 * component returns `null`. A heading reading "What My Clients Say" over a
 * sub-head promising "real stories from real people" is a claim in its own
 * right; with nothing under it, it is either an empty band on the homepage or
 * an invitation to write prose standing in for quotes that do not exist.
 *
 * The alternative considered was keeping a section that speaks honestly without
 * quoting anyone. It was rejected: any replacement copy here has to trace every
 * factual sentence to Joey's approved answers or src/config/site.ts, and the
 * homepage already makes that argument from those exact sources in three
 * places — WhyJoeySection, the real figures in MarketStatsSection, and the two
 * genuine credentials in FinalCTA. A fourth section restating them to fill the
 * slot adds a surface to maintain and no information. The run of sections above
 * and below closes cleanly without it: HowItStartsSection is a dark band and
 * PropertyCategories is the light section after it, which is the same
 * dark-then-light rhythm the page uses elsewhere.
 *
 * Returning `null` rather than deleting the mount is deliberate. The section is
 * data-driven, so the day Joey supplies a real review it appears here and in
 * the review schema together, with no edit to the homepage.
 *
 * ## Attribution is rendered, not just stored
 *
 * Every card links to the platform the review was published on and shows its
 * date. A quote shown without its source is unverifiable to a visitor, which is
 * exactly the state the invented entries were able to hide in.
 *
 * Testimonials only, deliberately. This section used to end in a "Homes Sold /
 * Total Volume / Average Rating" strip that repeated, verbatim, the figures
 * MarketStatsSection renders immediately below it — the same two numbers twice
 * in adjacent sections. MarketStatsSection is the single place the numbers
 * live. The unsourced "5-Star Rated Agent" badge that used to carry the rating
 * claim in FinalCTA has since been removed from there as well, so no five-star
 * claim survives anywhere on the page.
 */

/** `2025-03-14` → `March 2025`. Parsed by hand; `new Date(iso)` shifts a date-only string a day in negative offsets. */
function formatReviewDate(iso: string): string {
  const [year, month] = iso.split('-');
  const monthIndex = Number(month) - 1;
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const name = monthNames[monthIndex];
  return name && year ? `${name} ${year}` : iso;
}

function TestimonialCard({ testimonial, index }: { testimonial: Testimonial; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="group relative flex flex-col rounded-lg border border-border bg-bone p-8 shadow-md transition-all duration-300 hover:shadow-xl"
    >
      <div
        className="flex gap-1"
        role="img"
        aria-label={`${testimonial.rating} out of 5 stars`}
      >
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <svg
            key={i}
            className="h-5 w-5 text-champagne"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>

      <blockquote className="mt-6 flex-grow font-sans text-base leading-relaxed text-stone">
        &ldquo;{testimonial.content}&rdquo;
      </blockquote>

      <div className="mt-6 flex items-center gap-4 border-t border-border pt-6">
        {testimonial.image ? (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-border">
            <Image
              src={testimonial.image}
              alt={testimonial.name}
              fill
              className="object-cover"
              sizes="48px"
            />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="font-sans text-sm font-medium text-onyx">{testimonial.name}</p>
          <p className="font-sans text-xs text-stone">{testimonial.role}</p>
          {testimonial.location ? (
            <p className="font-sans text-xs text-stone">{testimonial.location}</p>
          ) : null}
        </div>
      </div>

      <p className="mt-4 font-sans text-xs text-stone">
        <a
          href={testimonial.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-hunter underline decoration-hunter/40 underline-offset-2 transition-colors hover:decoration-hunter"
        >
          Read this review on {testimonial.source.platform}
        </a>
        <span className="block">{formatReviewDate(testimonial.source.datePublished)}</span>
      </p>

      <div className="absolute right-8 top-8 opacity-10 transition-opacity group-hover:opacity-20">
        <svg
          className="h-12 w-12 text-champagne"
          fill="currentColor"
          viewBox="0 0 32 32"
          aria-hidden="true"
        >
          <path d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.8 3.456-8.256 9.12-8.256 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z" />
        </svg>
      </div>
    </motion.article>
  );
}

export function TestimonialsSection() {
  if (clientTestimonials.length === 0) {
    return null;
  }

  return (
    <section className="bg-bone py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="font-serif text-4xl text-onyx sm:text-5xl lg:text-6xl">
            What My Clients Say
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg text-stone">
            Reviews my clients published themselves. Every one links back to where they left it.
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {clientTestimonials.map((testimonial, index) => (
            <TestimonialCard
              key={`${testimonial.source.platform}-${testimonial.source.url}-${index}`}
              testimonial={testimonial}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

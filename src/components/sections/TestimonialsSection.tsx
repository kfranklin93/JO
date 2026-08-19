'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { clientTestimonials } from '@/data/testimonials';

// JOEY UPDATE: Created testimonials section for social proof and trust building
// Warm, approachable design inspired by Shanna Bradley reference

export function TestimonialsSection() {
  return (
    <section className="bg-neutral-50 py-20 lg:py-32">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="font-serif text-4xl text-navy sm:text-5xl lg:text-6xl">
            What My Clients Say
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg text-stone">
            Real stories from real people who trusted me with their real estate journey
          </p>
        </motion.div>

        {/* JOEY UPDATE: Testimonials grid with staggered animation */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {clientTestimonials.map((testimonial, index) => (
            <motion.article
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative flex flex-col rounded-lg bg-white p-8 shadow-md transition-all duration-300 hover:shadow-xl"
            >
              {/* JOEY UPDATE: Star rating */}
              <div className="flex gap-1">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <svg
                    key={i}
                    className="h-5 w-5 text-bronze"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              {/* JOEY UPDATE: Testimonial content */}
              <blockquote className="mt-6 flex-grow font-sans text-base leading-relaxed text-stone">
                "{testimonial.content}"
              </blockquote>

              {/* JOEY UPDATE: Client info */}
              <div className="mt-6 flex items-center gap-4 border-t border-neutral-200 pt-6">
                {testimonial.image && (
                  <div className="relative h-12 w-12 overflow-hidden rounded-full bg-neutral-200">
                    <Image
                      src={testimonial.image}
                      alt={testimonial.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </div>
                )}
                <div>
                  <p className="font-sans text-sm font-medium text-navy">{testimonial.name}</p>
                  <p className="font-sans text-xs text-stone">{testimonial.role}</p>
                  {testimonial.location && (
                    <p className="font-sans text-xs text-stone">{testimonial.location}</p>
                  )}
                </div>
              </div>

              {/* JOEY UPDATE: Decorative quote mark */}
              <div className="absolute right-8 top-8 opacity-10 transition-opacity group-hover:opacity-20">
                <svg className="h-12 w-12 text-bronze" fill="currentColor" viewBox="0 0 32 32">
                  <path d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.8 3.456-8.256 9.12-8.256 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z" />
                </svg>
              </div>
            </motion.article>
          ))}
        </div>

        {/* JOEY UPDATE: Trust indicators */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 rounded-lg border border-neutral-200 bg-white p-8 text-center"
        >
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="font-serif text-4xl text-bronze">60+</div>
              <div className="mt-2 font-sans text-sm uppercase tracking-[0.2em] text-stone">Homes Sold</div>
            </div>
            <div>
              <div className="font-serif text-4xl text-bronze">$23.9M</div>
              <div className="mt-2 font-sans text-sm uppercase tracking-[0.2em] text-stone">Total Volume</div>
            </div>
            <div>
              <div className="font-serif text-4xl text-bronze">5.0</div>
              <div className="mt-2 font-sans text-sm uppercase tracking-[0.2em] text-stone">Average Rating</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// Made with Bob
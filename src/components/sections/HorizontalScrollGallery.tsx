'use client';

import * as React from 'react';
import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { MagneticButton } from '@/components/ui/MagneticButton';

gsap.registerPlugin(ScrollTrigger);

interface LifestyleInsight {
  title: string;
  description: string;
  image: string;
  category: string;
}

const lifestyleInsights: LifestyleInsight[] = [
  {
    title: 'Marietta Square',
    description: 'Historic downtown with boutique shopping and award-winning restaurants',
    image: '/images/lifestyle/marietta-square.jpg',
    category: 'Dining & Shopping',
  },
  {
    title: 'Kennesaw Mountain',
    description: '15-minute drive to hiking trails and outdoor recreation',
    image: '/images/lifestyle/kennesaw-mountain.jpg',
    category: 'Outdoor Living',
  },
  {
    title: 'Top-Rated Schools',
    description: 'Access to Cobb County\'s highest-performing school districts',
    image: '/images/lifestyle/schools.jpg',
    category: 'Education',
  },
  {
    title: 'Atlanta Commute',
    description: '25 minutes to Midtown via I-75, perfect for professionals',
    image: '/images/lifestyle/commute.jpg',
    category: 'Transportation',
  },
  {
    title: 'Local Coffee Culture',
    description: 'Artisan coffee shops and co-working spaces throughout the area',
    image: '/images/lifestyle/coffee.jpg',
    category: 'Community',
  },
];

export function HorizontalScrollGallery() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const scroll = scrollRef.current;
    if (!container || !scroll) return;

    let scrollTriggerInstance: ScrollTrigger | null = null;

    // Use a context to scope this ScrollTrigger instance
    const ctx = gsap.context(() => {
      const scrollWidth = scroll.scrollWidth - window.innerWidth;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: 'top top',
          end: () => `+=${scrollWidth}`,
          scrub: 1,
          // Temporarily disable pinning to avoid React unmount conflicts
          // pin: true,
          // anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: (self) => {
            scrollTriggerInstance = self;
          },
        },
      });

      tl.to(scroll, {
        x: -scrollWidth,
        ease: 'none',
      });

      // Store the ScrollTrigger instance
      scrollTriggerInstance = tl.scrollTrigger as ScrollTrigger;
    }, containerRef);

    // Cleanup - kill ScrollTrigger BEFORE reverting context
    return () => {
      if (scrollTriggerInstance) {
        scrollTriggerInstance.kill(true); // true = revert DOM changes immediately
      }
      ctx.revert();
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative h-screen overflow-hidden bg-[black]"
    >
      {/* Section Header - Fixed */}
      <div className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-[black] to-transparent px-8 py-12 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <span className="font-sans text-sm font-light uppercase tracking-[0.3em] text-[white]/70">
            Lifestyle Insights
          </span>
          <h2 className="mt-4 font-serif text-5xl text-[white] sm:text-6xl">
            Life in Marietta
          </h2>
        </div>
      </div>

      {/* Horizontal Scroll Container */}
      <div
        ref={scrollRef}
        className="flex h-full items-center gap-10 px-8 lg:px-12"
        style={{ width: 'fit-content' }}
      >
        {/* Spacer for initial positioning */}
        <div className="w-[50vw] flex-shrink-0" />

        {/* Insight Cards */}
        {lifestyleInsights.map((insight, index) => (
          <motion.div
            key={insight.title}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="group relative h-[70vh] w-[400px] flex-shrink-0 overflow-hidden rounded-2xl border border-[white]/10 bg-[white] shadow-2xl"
          >
            {/* Image */}
            <div className="relative h-2/3 overflow-hidden bg-[black]/5">
              <img
                src={insight.image}
                alt={insight.title}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              {/* Category Badge */}
              <div className="absolute left-4 top-4 rounded-2xl bg-[white]/90 px-3 py-1 backdrop-blur-sm">
                <span className="font-sans text-xs font-light text-[black]">
                  {insight.category}
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="flex h-1/3 flex-col justify-between p-6">
              <div>
                <h3 className="font-serif text-2xl text-[black]">
                  {insight.title}
                </h3>
                <p className="mt-2 font-sans text-sm font-light text-[black]/70">
                  {insight.description}
                </p>
              </div>
            </div>
          </motion.div>
        ))}

        {/* Final CTA Card - Z-Pattern End */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex h-[70vh] w-[500px] flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-[black] p-12 text-center shadow-2xl"
        >
          <h3 className="font-serif text-4xl text-[white]">
            Ready to Call Marietta Home?
          </h3>
          <p className="mt-6 font-sans text-lg font-light text-[white]/90">
            Discover properties in these sought-after neighborhoods
          </p>
          <div className="mt-8">
            <Link href="/get-started">
              <MagneticButton
                variant="outline"
                size="lg"
                className="border-[white] bg-[white] text-[black] hover:bg-[white]/90"
              >
                View Available Homes
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </MagneticButton>
            </Link>
          </div>
        </motion.div>

        {/* Spacer for final positioning */}
        <div className="w-[50vw] flex-shrink-0" />
      </div>

      {/* Scroll Hint */}
      <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
        <div className="flex items-center gap-3 text-[white]/70">
          <span className="font-sans text-sm font-light uppercase tracking-wider">Scroll Horizontally</span>
          <svg className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </section>
  );
}


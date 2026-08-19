'use client';

import * as React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import Image from 'next/image';
import { siteConfig } from '@/config/site';
import { MagneticButton } from '@/components/ui/MagneticButton';

// JOEY UPDATE: Created search-first hero with parallax scrolling inspired by Chase Mizell
// Features cinematic background, prominent search bar, and layered motion effects

export function EnhancedHeroSection() {
  const [searchQuery, setSearchQuery] = React.useState('');
  const heroRef = React.useRef<HTMLDivElement>(null);

  // JOEY UPDATE: Parallax scroll effects for layered depth
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  // JOEY UPDATE: Transform values for parallax layers
  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // JOEY UPDATE: Navigate to properties page with search query
    window.location.href = `/properties?search=${encodeURIComponent(searchQuery)}`;
  };

  return (
    <section ref={heroRef} className="relative min-h-screen overflow-hidden bg-navy">
      {/* JOEY UPDATE: Parallax background image layer */}
      <motion.div
        style={{ y: imageY }}
        className="absolute inset-0 h-[120%]"
      >
        <Image
          src="/images/joey-hero-instagram.jpg"
          alt="Atlanta Real Estate"
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
          quality={90}
        />
        {/* Base dark wash — kills brightness of the photo uniformly */}
        <div className="absolute inset-0 bg-navy/60 mix-blend-multiply" />
        {/* Gradient overlay — ensures top and bottom text areas are fully legible */}
        <div className="absolute inset-0 bg-gradient-to-b from-navy/80 via-navy/50 to-navy/90" />
      </motion.div>

      {/* JOEY UPDATE: Hero content with parallax motion */}
      <motion.div
        style={{ y: contentY, opacity }}
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-8 py-20 text-center"
      >
        <div className="mx-auto w-full max-w-5xl">
          {/* JOEY UPDATE: Welcoming headline for broad audience */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="font-serif text-5xl leading-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl"
          >
            Find Your Perfect Home
            <br />
            <span className="text-bronze">in Atlanta</span>
          </motion.h1>

          {/* JOEY UPDATE: Friendly, inviting subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mx-auto mt-6 max-w-2xl font-sans text-xl text-white/90 sm:text-2xl"
          >
            Expert guidance for buyers and sellers across Atlanta's most desirable neighborhoods
          </motion.p>

          {/* JOEY UPDATE: Prominent search bar - central to the experience */}
          <motion.form
            onSubmit={handleSearch}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mx-auto mt-12 max-w-3xl"
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by neighborhood, city, or ZIP code..."
                  className="h-16 w-full rounded-lg border-2 border-white/20 bg-white/10 px-6 font-sans text-lg text-white placeholder-white/60 backdrop-blur-md transition-all focus:border-cerulean focus:bg-white/20 focus:outline-none"
                  aria-label="Search properties"
                />
                <svg
                  className="absolute right-6 top-1/2 h-6 w-6 -translate-y-1/2 text-white/60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <button
                type="submit"
                className="h-16 rounded-lg bg-cerulean px-8 font-sans text-lg font-medium text-white transition-all hover:bg-cerulean/90 hover:shadow-2xl hover:shadow-cerulean/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean sm:px-12"
              >
                Search
              </button>
            </div>
          </motion.form>

          {/* JOEY UPDATE: Quick action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-4"
          >
            <MagneticButton
              href="/buy-home"
              variant="outline"
              size="lg"
              className="border-white/30 bg-white/10 text-white backdrop-blur-md hover:border-white hover:bg-white/20"
            >
              I'm Buying
            </MagneticButton>
            <MagneticButton
              href="/sell-home"
              variant="outline"
              size="lg"
              className="border-white/30 bg-white/10 text-white backdrop-blur-md hover:border-white hover:bg-white/20"
            >
              I'm Selling
            </MagneticButton>
          </motion.div>

          {/* JOEY UPDATE: Agent info and contact */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="mt-16 border-t border-white/30 pt-8"
          >
            <p className="font-sans text-lg text-white">
              <span className="font-medium text-bronze">{siteConfig.fullName}</span>
              {' • '}
              {siteConfig.subtitle}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
              <a
                href={`tel:${siteConfig.contact.phone}`}
                className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 font-sans text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-cerulean hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {siteConfig.contact.phoneDisplay}
              </a>
              <a
                href={`mailto:${siteConfig.contact.email}`}
                className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 font-sans text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-cerulean hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Email Me
              </a>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* JOEY UPDATE: Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.2 }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
      >
        <div className="flex flex-col items-center gap-2">
          <span className="font-sans text-sm uppercase tracking-wider text-white/60">Scroll to explore</span>
          <motion.svg
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="h-6 w-6 text-white/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </motion.svg>
        </div>
      </motion.div>
    </section>
  );
}

// Made with Bob
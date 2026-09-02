'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { MagneticButton } from '@/components/ui/MagneticButton';

interface FalseBottomHeroProps {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  videoSrc?: string;
  imageSrc?: string;
  nextSectionPreview?: React.ReactNode;
}

export function FalseBottomHero({
  title,
  subtitle,
  ctaText,
  ctaHref,
  videoSrc,
  imageSrc,
  nextSectionPreview,
}: FalseBottomHeroProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  // Parallax effects
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 0.8, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);

  // Scroll prompt animation
  const [showScrollPrompt, setShowScrollPrompt] = React.useState(true);

  React.useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) {
        setShowScrollPrompt(false);
      } else {
        setShowScrollPrompt(true);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Main Hero Section */}
      <section className="relative h-screen overflow-hidden bg-onyx">
        {/* Background Media */}
        <motion.div
          style={{ scale }}
          className="absolute inset-0"
        >
          {videoSrc ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
            >
              <source src={videoSrc} type="video/mp4" />
            </video>
          ) : imageSrc ? (
            <img
              src={imageSrc}
              alt="Hero background"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-onyx via-onyx to-onyx" />
          )}
          
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-onyx/60 via-onyx/40 to-onyx/70" />
        </motion.div>

        {/* Content */}
        <motion.div
          style={{ y, opacity }}
          className="relative flex h-full flex-col items-center justify-center px-8 text-center lg:px-12"
        >
          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="font-serif text-5xl text-linen sm:text-6xl lg:text-7xl"
          >
            {title}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-8 max-w-3xl font-sans text-xl font-light text-linen/90 sm:text-2xl"
          >
            {subtitle}
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-12"
          >
            <Link href={ctaHref}>
              <MagneticButton
                variant="primary"
                size="lg"
              >
                {ctaText}
              </MagneticButton>
            </Link>
          </motion.div>

          {/* Scroll Prompt with Curiosity Gap */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: showScrollPrompt ? 1 : 0 }}
            transition={{ duration: 0.5 }}
            className="absolute bottom-12 left-1/2 -translate-x-1/2"
          >
            <div className="flex flex-col items-center gap-3">
              <span className="font-sans text-sm font-light uppercase tracking-[0.3em] text-linen/80">
                Scroll to unlock the $23.9M Strategy
              </span>
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <ChevronDown className="h-8 w-8 text-linen/80" />
              </motion.div>
            </div>
          </motion.div>
        </motion.div>

        {/* False Bottom - Peek of Next Section */}
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="absolute bottom-0 left-0 right-0 h-32 overflow-hidden"
        >
          {/* Gradient Fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-transparent to-onyx/50" />
          
          {/* Preview Content */}
          <div className="relative h-full">
            {nextSectionPreview || (
              <div className="flex h-full items-center justify-center bg-linen/10 backdrop-blur-sm">
                <span className="font-sans text-sm font-light uppercase tracking-[0.3em] text-linen/80">
                  Continue scrolling to discover more
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </section>

      {/* Curiosity Gap Transition */}
      <div className="relative h-24 bg-gradient-to-b from-onyx to-linen" />
    </div>
  );
}

// Optional: Preview component for next section
export function NextSectionPreview({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center gap-4 bg-linen/10 backdrop-blur-sm">
      {icon && <div className="text-linen/80">{icon}</div>}
      <span className="font-sans text-sm font-light uppercase tracking-[0.3em] text-linen/80">
        {title}
      </span>
    </div>
  );
}


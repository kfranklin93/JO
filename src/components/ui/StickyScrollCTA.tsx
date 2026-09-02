'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useScrollDepth } from '@/lib/hooks/useScrollTrigger';
import { MagneticButton } from './MagneticButton';

interface CTAMessage {
  minDepth: number;
  message: string;
  cta: string;
  href: string;
  urgency?: string;
}

const ctaMessages: CTAMessage[] = [
  {
    minDepth: 0,
    message: 'Discover Joey\'s Strategy',
    cta: 'Get Started',
    href: '/get-started',
  },
  {
    minDepth: 25,
    message: 'Unlock the 0-4-7 Inventory Guide',
    cta: 'Download Free Guide',
    href: '/get-started?intent=sell',
    urgency: '3 spots left this week',
  },
  {
    minDepth: 50,
    message: 'See Your Street\'s Hidden Sales Data',
    cta: 'View Local Insights',
    href: '/get-started?intent=buy',
    urgency: 'Limited access',
  },
  {
    minDepth: 75,
    message: 'Get the 10-Minute High-Performer Reset',
    cta: 'Schedule Call',
    href: '/get-started?intent=general',
    urgency: 'Only 2 private tours left',
  },
];

export function StickyScrollCTA() {
  const scrollDepth = useScrollDepth();
  const [isVisible, setIsVisible] = React.useState(false);

  // Show CTA after user scrolls past hero (15% depth)
  React.useEffect(() => {
    setIsVisible(scrollDepth > 15 && scrollDepth < 95);
  }, [scrollDepth]);

  // Find the appropriate message based on scroll depth
  const currentMessage = React.useMemo(() => {
    return [...ctaMessages]
      .reverse()
      .find((msg) => scrollDepth >= msg.minDepth) || ctaMessages[0]!;
  }, [scrollDepth]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-6 right-6 z-50 max-w-sm"
        >
          <div className="rounded-2xl border border-navy/10 bg-linen p-6 shadow-2xl">
            {/* Urgency Badge */}
            {currentMessage.urgency && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-navy/10 px-3 py-1 text-xs font-light text-navy"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-navy opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-navy"></span>
                </span>
                {currentMessage.urgency}
              </motion.div>
            )}

            {/* Message */}
            <motion.p
              key={currentMessage.message}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-4 font-sans text-sm font-normal text-navy"
            >
              {currentMessage.message}
            </motion.p>

            {/* CTA Button */}
            <Link href={currentMessage.href} className="block">
              <MagneticButton
                variant="primary"
                size="md"
                className="w-full"
              >
                {currentMessage.cta}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </MagneticButton>
            </Link>

            {/* Progress Indicator */}
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-navy/10">
              <motion.div
                className="h-full bg-navy"
                initial={{ width: '0%' }}
                animate={{ width: `${scrollDepth}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


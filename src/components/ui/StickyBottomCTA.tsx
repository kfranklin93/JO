'use client';

import * as React from 'react';
import { useEffect, useState, useRef } from 'react';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { siteConfig } from '@/config/site';

interface StickyBottomCTAProps {
  /** Element ID to observe - CTA appears when this element is scrolled past */
  triggerElementId?: string;
}

/**
 * Sticky Bottom CTA Banner
 * Elegantly slides up from bottom when user scrolls past trigger element
 * Uses Intersection Observer for performance
 */
export function StickyBottomCTA({ triggerElementId = 'featured-listings' }: StickyBottomCTAProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Check if user has dismissed the banner in this session
    const dismissed = sessionStorage.getItem('sticky-cta-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    const triggerElement = document.getElementById(triggerElementId);
    if (!triggerElement) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Show CTA when trigger element is scrolled past (not intersecting)
          setIsVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        });
      },
      {
        threshold: 0,
        rootMargin: '-100px 0px 0px 0px', // Trigger 100px before element leaves viewport
      }
    );

    observerRef.current.observe(triggerElement);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [triggerElementId]);

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('sticky-cta-dismissed', 'true');
  };

  if (isDismissed) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transform transition-transform duration-500 ease-out ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      role="complementary"
      aria-label="Contact call to action"
    >
      {/* Backdrop blur effect */}
      <div className="absolute inset-0 bg-primary/95 backdrop-blur-md" />
      
      {/* Content */}
      <div className="relative mx-auto max-w-7xl px-6 py-4 sm:px-8 lg:px-12">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          {/* Message */}
          <div className="text-center sm:text-left">
            <p className="font-sans text-lg font-medium text-primary-foreground">
              Ready to find your Atlanta home?
            </p>
            <p className="mt-1 font-sans text-sm text-neutral-300">
              {siteConfig.stats.closedDeals}+ clients trust Joey's proven process
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <MagneticButton 
              href="/get-started" 
              variant="secondary"
              size="sm"
              className="group"
            >
              <span>Let's Talk</span>
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </MagneticButton>

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
              aria-label="Dismiss banner"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Made with Bob
'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// JOEY UPDATE: Created floating "Let's Connect" CTA inspired by Chase Mizell reference
// This button floats on the page and opens a contact form modal when clicked

interface FloatingConnectCTAProps {
  onOpenForm: () => void;
}

export function FloatingConnectCTA({ onOpenForm }: FloatingConnectCTAProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    // JOEY UPDATE: Show floating CTA after user scrolls past hero section
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const heroHeight = window.innerHeight * 0.8; // Show after 80% of viewport
      setIsVisible(scrollPosition > heroHeight);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial position

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-8 right-8 z-40"
        >
          {/* JOEY UPDATE: Premium floating button with magnetic hover effect */}
          <button
            onClick={onOpenForm}
            className="group relative flex items-center gap-3 rounded-full bg-cerulean px-8 py-4 font-sans text-sm font-medium uppercase tracking-wider text-white shadow-2xl transition-all duration-300 hover:scale-105 hover:bg-cerulean/90 hover:shadow-cerulean/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cerulean"
            aria-label="Open contact form"
          >
            {/* Icon */}
            <svg
              className="h-5 w-5 transition-transform group-hover:rotate-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            
            {/* Text - Hidden on mobile, visible on desktop */}
            <span className="hidden sm:inline">Let's Connect</span>

            {/* Pulse animation ring */}
            <span className="absolute inset-0 rounded-full bg-cerulean opacity-0 transition-opacity group-hover:opacity-20" />
          </button>

          {/* JOEY UPDATE: Mobile-optimized smaller button on small screens */}
          <div className="sm:hidden">
            <button
              onClick={onOpenForm}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-cerulean text-white shadow-2xl transition-all duration-300 hover:scale-105 hover:bg-cerulean/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cerulean"
              aria-label="Open contact form"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Made with Bob
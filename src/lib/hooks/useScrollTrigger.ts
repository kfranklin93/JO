'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseScrollTriggerOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook to detect when an element enters the viewport
 * Uses Intersection Observer API for performance
 */
export function useScrollTrigger(options: UseScrollTriggerOptions = {}) {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    triggerOnce = false,
  } = options;

  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        
        const visible = entry.isIntersecting;
        
        if (visible) {
          setIsVisible(true);
          if (triggerOnce) {
            setHasTriggered(true);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce]);

  return {
    ref,
    isVisible: triggerOnce ? hasTriggered : isVisible,
  };
}

/**
 * Hook to track scroll progress through an element
 */
export function useScrollProgress() {
  const ref = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleScroll = () => {
      const rect = element.getBoundingClientRect();
      const elementHeight = rect.height;
      const windowHeight = window.innerHeight;
      
      // Calculate how much of the element has been scrolled through
      const scrolled = windowHeight - rect.top;
      const total = elementHeight + windowHeight;
      const percentage = Math.max(0, Math.min(1, scrolled / total));
      
      setProgress(percentage);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return { ref, progress };
}

/**
 * Hook to track overall scroll depth on the page
 */
export function useScrollDepth() {
  const [scrollDepth, setScrollDepth] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      
      const depth = (scrollTop / (documentHeight - windowHeight)) * 100;
      setScrollDepth(Math.min(100, Math.max(0, depth)));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return scrollDepth;
}

// Made with Bob

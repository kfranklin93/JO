'use client';

import * as React from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { StructuredData } from '@/components/seo/StructuredData';
import { homepageSchema } from '@/config/structured-data';
import { StickyScrollCTA } from '@/components/ui/StickyScrollCTA';
import { HeroSection } from '@/components/sections/HeroSection';
import { FeaturedListings } from '@/components/sections/FeaturedListings';
import { ValueProposition } from '@/components/sections/ValueProposition';
import { SocialProof } from '@/components/sections/SocialProof';
import { PropertyCategories } from '@/components/sections/PropertyCategories';
import { FinalCTA } from '@/components/sections/FinalCTA';

gsap.registerPlugin(ScrollTrigger);

export default function HomePage() {
  React.useEffect(() => {
    return () => {
      const triggers = ScrollTrigger.getAll();
      triggers.forEach((trigger) => {
        try {
          trigger.kill(true);
        } catch (e) {
          console.warn('ScrollTrigger cleanup warning:', e);
        }
      });
      gsap.killTweensOf('*');
    };
  }, []);

  return (
    <>
      <StructuredData data={homepageSchema} />
      <StickyScrollCTA />
      <HeroSection />
      <FeaturedListings />
      <ValueProposition />
      <SocialProof />
      <PropertyCategories />
      <FinalCTA />
    </>
  );
}

// Made with Bob

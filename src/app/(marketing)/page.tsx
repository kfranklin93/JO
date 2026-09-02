'use client';

import * as React from 'react';
import { StructuredData } from '@/components/seo/StructuredData';
import { homepageSchema } from '@/config/structured-data';
import { EnhancedHeroSection } from '@/components/sections/EnhancedHeroSection';
import { WhyJoeySection } from '@/components/sections/WhyJoeySection';
import { TestimonialsSection } from '@/components/sections/TestimonialsSection';
import { MarketStatsSection } from '@/components/sections/MarketStatsSection';
import { NeighborhoodsSection } from '@/components/sections/NeighborhoodsSection';
import { BuyersGuideSection } from '@/components/sections/BuyersGuideSection';
import { TeamSection } from '@/components/sections/TeamSection';
import { FinalCTA } from '@/components/sections/FinalCTA';
import { FloatingConnectCTA } from '@/components/ui/FloatingConnectCTA';
import { ServicesInquiryForm } from '@/components/forms/ServicesInquiryForm';

// JOEY UPDATE: Completely rebuilt homepage with new high-converting flow
// Includes search-first hero, floating CTA, neighborhoods, testimonials, stats, and team sections
// Inspired by Chase Mizell, Ryan Deal, and Shanna Bradley reference sites

export default function HomePage() {
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  return (
    <>
      <StructuredData data={homepageSchema} />
      
      {/* JOEY UPDATE: New search-first hero with parallax scrolling */}
      <EnhancedHeroSection />
      
      {/* JOEY UPDATE: Trust/intro section - why work with Joey */}
      <WhyJoeySection />
      
      {/* JOEY UPDATE: Social proof with client testimonials */}
      <TestimonialsSection />
      
      {/* JOEY UPDATE: Market stats and recent results */}
      <MarketStatsSection />
      
      {/* JOEY UPDATE: Neighborhoods browsing section */}
      <NeighborhoodsSection />
      
      {/* JOEY UPDATE: Buyer's guide educational content */}
      <BuyersGuideSection />
      
      {/* JOEY UPDATE: Team section with Joey's story */}
      <TeamSection />
      
      {/* JOEY UPDATE: Final conversion CTA */}
      <FinalCTA />
      
      {/* JOEY UPDATE: Floating "Let's Connect" button - appears after scrolling past hero */}
      <FloatingConnectCTA onOpenForm={() => setIsFormOpen(true)} />
      
      {/* JOEY UPDATE: Dynamic services inquiry form modal */}
      <ServicesInquiryForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
      />
    </>
  );
}


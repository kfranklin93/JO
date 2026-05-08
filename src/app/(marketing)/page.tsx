'use client';

import * as React from 'react';
import { StructuredData } from '@/components/seo/StructuredData';
import { homepageSchema } from '@/config/structured-data';
import { HeroSection } from '@/components/sections/HeroSection';
import { SocialProofSection } from '@/components/sections/SocialProofSection';
import { ThreeCardCTA } from '@/components/sections/ThreeCardCTA';
import { AgentProfileSection } from '@/components/sections/AgentProfileSection';
import { FinalCTA } from '@/components/sections/FinalCTA';

export default function HomePage() {
  return (
    <>
      <StructuredData data={homepageSchema} />
      <HeroSection />
      <SocialProofSection />
      <ThreeCardCTA />
      <AgentProfileSection />
      <FinalCTA />
    </>
  );
}

// Made with Bob

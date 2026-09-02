'use client';

import * as React from 'react';
import { siteConfig } from '@/config/site';

export function SocialProof() {
  return (
    <section className="bg-[white] py-24">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        <div className="flex flex-col items-center justify-center gap-12 border-y border-[black]/10 py-12 sm:flex-row sm:gap-20">
          <div className="text-center">
            <div className="font-serif text-4xl text-[black]">★★★★★</div>
            <div className="mt-3 font-sans text-sm font-light text-[black]/60">5-Star Rated</div>
          </div>
          <div className="h-16 w-[1px] bg-[black]/10 sm:block hidden" />
          <div className="text-center">
            <div className="font-serif text-3xl text-[black]">Greater Atlanta HBA</div>
            <div className="mt-3 font-sans text-sm font-light text-[black]/60">Award Winner</div>
          </div>
          <div className="h-16 w-[1px] bg-[black]/10 sm:block hidden" />
          <div className="text-center">
            <div className="font-serif text-3xl text-[black]">{siteConfig.stats.closedDeals}+</div>
            <div className="mt-3 font-sans text-sm font-light text-[black]/60">Happy Clients</div>
          </div>
        </div>
      </div>
    </section>
  );
}


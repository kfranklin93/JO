'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useScrollTrigger } from '@/lib/hooks/useScrollTrigger';
import { siteConfig } from '@/config/site';

interface LegacyProperty {
  address: string;
  soldPrice: string;
  soldDate: string;
  daysOnMarket: number;
  image: string;
  imageColor: string;
}

const legacyProperties: LegacyProperty[] = [
  {
    address: '1234 Roswell Rd, Marietta',
    soldPrice: '$875,000',
    soldDate: 'March 2024',
    daysOnMarket: 3,
    image: '/images/legacy/property-1.jpg',
    imageColor: '/images/legacy/property-1-color.jpg',
  },
  {
    address: '5678 East Cobb Dr, Marietta',
    soldPrice: '$1.2M',
    soldDate: 'February 2024',
    daysOnMarket: 4,
    image: '/images/legacy/property-2.jpg',
    imageColor: '/images/legacy/property-2-color.jpg',
  },
  {
    address: '9012 Sandy Plains Rd, Marietta',
    soldPrice: '$950,000',
    soldDate: 'January 2024',
    daysOnMarket: 7,
    image: '/images/legacy/property-3.jpg',
    imageColor: '/images/legacy/property-3-color.jpg',
  },
  {
    address: '3456 Johnson Ferry Rd, Marietta',
    soldPrice: '$1.5M',
    soldDate: 'December 2023',
    daysOnMarket: 2,
    image: '/images/legacy/property-4.jpg',
    imageColor: '/images/legacy/property-4-color.jpg',
  },
  {
    address: '7890 Lower Roswell Rd, Marietta',
    soldPrice: '$825,000',
    soldDate: 'November 2023',
    daysOnMarket: 5,
    image: '/images/legacy/property-5.jpg',
    imageColor: '/images/legacy/property-5-color.jpg',
  },
  {
    address: '2345 Piedmont Rd, Atlanta',
    soldPrice: '$2.1M',
    soldDate: 'October 2023',
    daysOnMarket: 1,
    image: '/images/legacy/property-6.jpg',
    imageColor: '/images/legacy/property-6-color.jpg',
  },
];

export function LegacyPortfolio() {
  return (
    <section className="bg-gradient-to-b from-[#FAF9F6] to-[#1C2A39]/5 py-32 sm:py-40">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Header */}
        <div className="text-center">
          <span className="font-sans text-sm font-light uppercase tracking-[0.3em] text-[#C5A059]">
            Proven Track Record
          </span>
          <h2 className="mt-4 font-serif text-5xl text-[#1C2A39] sm:text-6xl">
            Joey's Legacy
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg font-light text-[#1C2A39]/70">
            {siteConfig.stats.closedDeals} successful transactions totaling {siteConfig.stats.totalVolume}.
            Hover to reveal the stories behind each sale.
          </p>
        </div>

        {/* Properties Grid */}
        <div className="mt-20 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {legacyProperties.map((property, index) => (
            <LegacyPropertyCard
              key={property.address}
              property={property}
              index={index}
            />
          ))}
        </div>

        {/* Stats Summary */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-20 grid gap-12 border-t border-[#1C2A39]/10 pt-20 sm:grid-cols-3"
        >
          <div className="text-center">
            <div className="font-serif text-5xl text-[#C5A059]">
              {siteConfig.stats.closedDeals}
            </div>
            <div className="mt-3 font-sans text-sm font-light uppercase tracking-wider text-[#1C2A39]/60">
              Closed Deals
            </div>
          </div>
          <div className="text-center">
            <div className="font-serif text-5xl text-[#C5A059]">
              {siteConfig.stats.totalVolume}
            </div>
            <div className="mt-3 font-sans text-sm font-light uppercase tracking-wider text-[#1C2A39]/60">
              Total Volume
            </div>
          </div>
          <div className="text-center">
            <div className="font-serif text-5xl text-[#C5A059]">3.8</div>
            <div className="mt-3 font-sans text-sm font-light uppercase tracking-wider text-[#1C2A39]/60">
              Avg Days on Market
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function LegacyPropertyCard({ property, index }: { property: LegacyProperty; index: number }) {
  const [isHovered, setIsHovered] = React.useState(false);
  const { ref, isVisible } = useScrollTrigger({
    threshold: 0.3,
    triggerOnce: true,
  });

  return (
    <motion.div
      ref={ref as React.RefObject<HTMLDivElement>}
      initial={{ opacity: 0, y: 30 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[#1C2A39]/10 bg-[#FAF9F6] shadow-lg transition-shadow duration-300 hover:shadow-2xl"
    >
      {/* Image Container with Color Shift */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[#1C2A39]/5">
        {/* Black and White Image */}
        <img
          src={property.image}
          alt={property.address}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            isHovered ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ filter: 'grayscale(100%)' }}
        />
        
        {/* Color Image */}
        <img
          src={property.imageColor}
          alt={property.address}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Sold Badge - Appears on Hover */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={isHovered ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute left-4 top-4 rounded-2xl bg-[#C5A059] px-4 py-2 shadow-lg"
        >
          <span className="font-sans text-sm font-light uppercase tracking-wider text-[#FAF9F6]">
            Sold
          </span>
        </motion.div>
      </div>

      {/* Content - Reveals on Hover */}
      <div className="p-6">
        <h3 className="font-serif text-xl text-[#1C2A39]">{property.address}</h3>
        
        {/* Details - Slide Up on Hover */}
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={isHovered ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="mt-4 space-y-2 border-t border-[#1C2A39]/10 pt-4">
            <div className="flex justify-between font-sans text-sm font-light">
              <span className="text-[#1C2A39]/60">Sold Price</span>
              <span className="font-normal text-[#C5A059]">{property.soldPrice}</span>
            </div>
            <div className="flex justify-between font-sans text-sm font-light">
              <span className="text-[#1C2A39]/60">Sold Date</span>
              <span className="font-normal text-[#1C2A39]">{property.soldDate}</span>
            </div>
            <div className="flex justify-between font-sans text-sm font-light">
              <span className="text-[#1C2A39]/60">Days on Market</span>
              <span className="font-normal text-[#1C2A39]">{property.daysOnMarket} days</span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Made with Bob

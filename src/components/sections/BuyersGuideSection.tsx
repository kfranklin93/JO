'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { MagneticButton } from '@/components/ui/MagneticButton';

// JOEY UPDATE: Created buyer's guide section for educational content
// Helpful, approachable tone for first-time buyers and all experience levels

export function BuyersGuideSection() {
  const guideSteps = [
    {
      number: '01',
      title: 'Get Pre-Approved',
      description: 'Understand your budget and strengthen your offer with mortgage pre-approval.',
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      ),
    },
    {
      number: '02',
      title: 'Define Your Needs',
      description: "Location, size, amenities, schools—let's create your perfect home checklist.",
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.25-1.92c.659-.059 1.314-.13 1.965-.21.652-.08 1.285-.174 1.898-.28.62-.107 1.22-.23 1.8-.37.58-.14 1.14-.3 1.68-.48" />
        </svg>
      ),
    },
    {
      number: '03',
      title: 'Tour Properties',
      description: "I'll schedule showings and guide you through each home with expert insights.",
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      ),
    },
    {
      number: '04',
      title: 'Make an Offer',
      description: 'Strategic negotiation to get you the best price and terms possible.',
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      number: '05',
      title: 'Close the Deal',
      description: "I'll manage inspections, appraisals, and paperwork for a smooth closing.",
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
      ),
    },
  ];

  return (
    <section className="bg-white py-20 lg:py-32">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="font-serif text-4xl text-black sm:text-5xl lg:text-6xl">
            Your Home Buying Journey
          </h2>
          <p className="mx-auto mt-6 max-w-2xl font-sans text-lg text-neutral-600">
            From first-time buyers to seasoned investors, I'll guide you through every step with clarity and confidence
          </p>
        </motion.div>

        {/* JOEY UPDATE: Process steps with clean, numbered layout */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {guideSteps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group relative rounded-lg border border-neutral-200 bg-white p-8 transition-all duration-300 hover:border-accent hover:shadow-lg"
            >
              {/* Step number */}
              <div className="mb-4 font-serif text-5xl text-neutral-200 transition-colors group-hover:text-accent/30">
                {step.number}
              </div>

              {/* Icon */}
              <div className="mb-4 text-neutral-400 transition-colors group-hover:text-accent">
                {step.icon}
              </div>

              {/* Content */}
              <h3 className="mb-3 font-serif text-xl text-black">{step.title}</h3>
              <p className="font-sans text-sm leading-relaxed text-neutral-600">{step.description}</p>
            </motion.div>
          ))}
        </div>

        {/* JOEY UPDATE: CTA to start the process */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 rounded-lg bg-neutral-50 p-8 text-center lg:p-12"
        >
          <h3 className="font-serif text-3xl text-black">Ready to Start Your Journey?</h3>
          <p className="mx-auto mt-4 max-w-2xl font-sans text-lg text-neutral-600">
            Whether you're buying your first home or your fifth, I'm here to make the process smooth, transparent, and successful.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <MagneticButton href="/buy-home" variant="primary" size="lg">
              Start Home Search
            </MagneticButton>
            <MagneticButton href="/contact" variant="outline" size="lg">
              Schedule Consultation
            </MagneticButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// Made with Bob
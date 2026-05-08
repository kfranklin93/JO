'use client';

import { LeadCaptureForm } from '@/components/forms';
import { useRouter } from 'next/navigation';
import { LeadSource } from '@/types';
import type { CreateLeadInput } from '@/types';

export default function GetStartedPage() {
  const router = useRouter();

  const handleSubmit = async (data: CreateLeadInput) => {
    try {
      // TODO: Implement actual API call to submit lead
      console.log('Lead data:', data);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // For now, just log success and redirect
      alert('Thank you! We will contact you soon.');
      router.push('/');
    } catch (error) {
      console.error('Error submitting lead:', error);
      throw error;
    }
  };

  return (
    <div className="bg-gradient-to-b from-[white] to-[white] py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-8 lg:px-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-serif text-5xl tracking-tight text-[black] sm:text-6xl">
            Get Started Today
          </h1>
          <p className="mt-6 font-sans text-lg font-light text-[black]/70">
            Tell us about your real estate needs and we'll connect you with the right solutions.
          </p>
        </div>

        {/* Form */}
        <div className="mt-16">
          <div className="rounded-2xl border border-[black]/10 bg-white p-10 shadow-lg sm:p-12">
            <LeadCaptureForm
              onSubmit={handleSubmit}
              source={LeadSource.WEBSITE}
            />
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="mt-16 text-center">
          <p className="font-sans text-sm font-light text-[black]/60">
            🔒 Your information is secure and will never be shared with third parties.
          </p>
          <div className="mt-8 flex items-center justify-center gap-12 font-sans text-sm font-light text-[black]/70">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-[black]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>No obligation</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-[black]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Free consultation</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-[black]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Quick response</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Made with Bob

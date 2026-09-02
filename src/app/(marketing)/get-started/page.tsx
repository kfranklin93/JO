'use client';

import { LeadCaptureForm } from '@/components/forms';
import { submitLead } from '@/lib/api/submit-lead';
import { useState } from 'react';
import { LeadSource } from '@/types';
import type { CreateLeadInput } from '@/types';
import type { LeadSubmissionInput } from '@/lib/validation/lead';

export default function GetStartedPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (data: CreateLeadInput) => {
    setIsSubmitting(true);
    setGeneralError(null);
    setFieldErrors({});

    try {
      // Map CreateLeadInput to LeadSubmissionInput
      const payload: LeadSubmissionInput = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        intent: data.intent,
        timeline: data.timeline,
        ...(data.propertyRequest?.bedrooms !== undefined && {
          bedrooms: data.propertyRequest.bedrooms,
        }),
        ...(data.propertyRequest?.bathrooms !== undefined && {
          bathrooms: data.propertyRequest.bathrooms,
        }),
        ...(data.propertyRequest?.additionalNotes && {
          additionalNotes: data.propertyRequest.additionalNotes,
        }),
        ...(data.propertyRequest?.propertyType && {
          propertyType: data.propertyRequest.propertyType,
        }),
        ...(data.propertyRequest?.preferredLocations && {
          location: data.propertyRequest.preferredLocations,
        }),
      };

      const result = await submitLead(payload);

      setIsSubmitting(false);

      if (result.ok) {
        setIsSuccess(true);
      } else if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
        throw new Error('Validation failed');
      } else {
        setGeneralError(result.message);
        throw new Error(result.message);
      }
    } catch (error) {
      setIsSubmitting(false);
      // Re-throw to let LeadCaptureForm handle it
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
            {isSuccess ? (
              <div className="text-center py-8">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="mt-6 font-serif text-2xl tracking-tight text-[black]">
                  Thank you for reaching out!
                </h2>
                <p className="mt-4 font-sans text-base font-light text-[black]/70">
                  We've received your information and will contact you shortly to discuss your real estate needs.
                </p>
                <button
                  onClick={() => setIsSuccess(false)}
                  className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[black] px-6 py-3 font-sans text-sm font-medium text-white hover:bg-[black]/90 transition-colors"
                >
                  Submit another inquiry
                </button>
              </div>
            ) : (
              <>
                {generalError && (
                  <div
                    role="alert"
                    className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                  >
                    <strong className="font-semibold">Error:</strong> {generalError}
                  </div>
                )}
                {Object.keys(fieldErrors).length > 0 && (
                  <div
                    role="alert"
                    className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700"
                  >
                    <strong className="font-semibold">Please correct the following:</strong>
                    <ul className="mt-2 list-disc list-inside space-y-1">
                      {Object.entries(fieldErrors).map(([field, message]) => (
                        <li key={field}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className={isSubmitting ? 'opacity-60 pointer-events-none' : ''}>
                  <LeadCaptureForm
                    onSubmit={handleSubmit}
                    source={LeadSource.WEBSITE}
                  />
                </div>
                {isSubmitting && (
                  <div className="mt-4 text-center">
                    <div className="inline-flex items-center gap-2 text-sm text-[black]/60">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Submitting your information...</span>
                    </div>
                  </div>
                )}
              </>
            )}
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


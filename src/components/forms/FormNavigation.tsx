'use client';

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import type { FormProgress } from '@/types';

export interface FormNavigationProps {
  /**
   * Current form progress state
   */
  progress: FormProgress;
  
  /**
   * Whether the form is currently submitting
   */
  isSubmitting?: boolean;
  
  /**
   * Handler for previous button click
   */
  onPrevious: () => void;
  
  /**
   * Handler for next button click
   */
  onNext: () => void;
  
  /**
   * Handler for submit button click
   */
  onSubmit: () => void;
  
  /**
   * Custom label for the next button
   */
  nextLabel?: string;
  
  /**
   * Custom label for the previous button
   */
  previousLabel?: string;
  
  /**
   * Custom label for the submit button
   */
  submitLabel?: string;
  
  /**
   * Custom loading label for submit button
   */
  submitLoadingLabel?: string;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * FormNavigation Component
 * 
 * Navigation buttons for multi-step forms with proper disabled states and ARIA.
 * Handles previous, next, and submit actions with loading states.
 */
export function FormNavigation({
  progress,
  isSubmitting = false,
  onPrevious,
  onNext,
  onSubmit,
  nextLabel = 'Next',
  previousLabel = 'Previous',
  submitLabel = 'Submit',
  submitLoadingLabel = 'Submitting',
  className,
}: FormNavigationProps) {
  const { currentStep, totalSteps, canProceed } = progress;
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-t border-[#1C2A39]/10 pt-6',
        className
      )}
    >
      {/* Previous Button */}
      <Button
        type="button"
        variant="outline"
        onClick={onPrevious}
        disabled={isFirstStep || isSubmitting}
        aria-label={`Go to previous step (Step ${currentStep - 1} of ${totalSteps})`}
        className={cn(isFirstStep && 'invisible')}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        {previousLabel}
      </Button>

      {/* Next/Submit Button */}
      {isLastStep ? (
        <Button
          type="submit"
          variant="primary"
          onClick={onSubmit}
          disabled={!canProceed || isSubmitting}
          loading={isSubmitting}
          loadingLabel={submitLoadingLabel}
          aria-label={
            canProceed
              ? 'Submit form'
              : 'Complete all required fields to submit'
          }
        >
          {submitLabel}
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          onClick={onNext}
          disabled={!canProceed || isSubmitting}
          aria-label={
            canProceed
              ? `Go to next step (Step ${currentStep + 1} of ${totalSteps})`
              : 'Complete all required fields to continue'
          }
        >
          {nextLabel}
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Button>
      )}
    </div>
  );
}

// Made with Bob
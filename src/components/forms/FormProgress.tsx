'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import type { FormProgress as FormProgressType } from '@/types';

export interface FormProgressProps {
  /**
   * Current form progress state
   */
  progress: FormProgressType;
  
  /**
   * Step labels for display
   */
  stepLabels: string[];
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * FormProgress Component
 * 
 * Visual progress indicator with proper ARIA attributes showing current step.
 * Displays step numbers, labels, and completion status with accessible markup.
 */
export function FormProgress({ progress, stepLabels, className }: FormProgressProps) {
  const { currentStep, totalSteps, completedSteps } = progress;

  return (
    <nav
      aria-label="Form progress"
      className={cn('w-full', className)}
    >
      <ol
        role="list"
        className="flex items-center justify-between gap-2 sm:gap-4"
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const stepNumber = index + 1;
          const isCompleted = completedSteps.has(stepNumber);
          const isCurrent = stepNumber === currentStep;
          const isPast = stepNumber < currentStep;
          const label = stepLabels[index] || `Step ${stepNumber}`;

          return (
            <li
              key={stepNumber}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="flex w-full items-center">
                {/* Connector line before step (except first) */}
                {stepNumber > 1 ? (
                  <div
                    className={cn(
                      'h-0.5 flex-1 transition-colors',
                      isPast || isCompleted
                        ? 'bg-[black]'
                        : 'bg-[black]/20'
                    )}
                    aria-hidden="true"
                  />
                ) : null}

                {/* Step indicator */}
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    isCurrent && 'border-[black] bg-[black] text-white',
                    (isPast || isCompleted) && !isCurrent && 'border-[black] bg-[black] text-white',
                    !isCurrent && !isPast && !isCompleted && 'border-[black]/20 bg-[white] text-[black]/60'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={
                    isCurrent
                      ? `Current step: ${label}`
                      : isCompleted || isPast
                        ? `Completed: ${label}`
                        : `Upcoming: ${label}`
                  }
                >
                  {isCompleted && !isCurrent ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <span>{stepNumber}</span>
                  )}
                </div>

                {/* Connector line after step (except last) */}
                {stepNumber < totalSteps ? (
                  <div
                    className={cn(
                      'h-0.5 flex-1 transition-colors',
                      isPast || isCompleted
                        ? 'bg-[black]'
                        : 'bg-[black]/20'
                    )}
                    aria-hidden="true"
                  />
                ) : null}
              </div>

              {/* Step label */}
              <span
                className={cn(
                  'text-center text-xs font-medium transition-colors sm:text-sm',
                  isCurrent ? 'text-[black]' : 'text-[black]/60'
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Screen reader announcement */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Step {currentStep} of {totalSteps}: {stepLabels[currentStep - 1]}
      </div>
    </nav>
  );
}

// Made with Bob
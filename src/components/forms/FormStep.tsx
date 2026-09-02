'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface FormStepProps {
  /**
   * Unique identifier for the step
   */
  id: string;
  
  /**
   * Step title for accessibility
   */
  title: string;
  
  /**
   * Current step number (1-based)
   */
  currentStep: number;
  
  /**
   * This step's number (1-based)
   */
  stepNumber: number;
  
  /**
   * Optional description for additional context
   */
  description?: string;
  
  /**
   * Step content
   */
  children: React.ReactNode;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * FormStep Component
 * 
 * Individual step wrapper with conditional rendering and proper ARIA attributes.
 * Only renders when it's the current step, with role="group" for accessibility.
 */
export function FormStep({
  id,
  title,
  currentStep,
  stepNumber,
  description,
  children,
  className,
}: FormStepProps) {
  const isActive = currentStep === stepNumber;
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;

  if (!isActive) {
    return null;
  }

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn('w-full space-y-6', className)}
    >
      <div className="space-y-2">
        <h2 id={titleId} className="text-2xl font-bold text-slate-900">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="text-base text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}


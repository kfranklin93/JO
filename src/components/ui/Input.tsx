'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, id, error, hint, required, type = 'text', 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    const hintId = hint && id ? `${id}-hint` : undefined;
    const errorId = error && id ? `${id}-error` : undefined;
    const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        <input
          ref={ref}
          id={id}
          type={type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex min-h-11 w-full rounded-xl border bg-[#FAF9F6] px-4 py-3 text-sm text-[#1C2A39] shadow-sm transition',
            'placeholder:text-[#1C2A39]/40',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            error
              ? 'border-red-600 focus-visible:outline-red-600'
              : 'border-[#1C2A39]/20 focus-visible:outline-[#C5A059]',
            'disabled:cursor-not-allowed disabled:bg-[#1C2A39]/5 disabled:text-[#1C2A39]/40',
            className
          )}
          {...props}
        />
        {hint ? (
          <p id={hintId} className="mt-2 text-sm text-[#1C2A39]/60">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="mt-2 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Made with Bob

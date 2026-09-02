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
            'flex min-h-11 w-full rounded-xl border bg-linen px-4 py-3 font-sans text-sm font-light text-navy shadow-sm transition-all',
            'placeholder:text-stone',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:border-cerulean',
            error
              ? 'border-red-600 focus-visible:ring-red-600 focus-visible:border-red-600'
              : 'border-navy/20 focus-visible:ring-cerulean',
            'disabled:cursor-not-allowed disabled:bg-navy/5 disabled:text-stone',
            className
          )}
          {...props}
        />
        {hint ? (
          <p id={hintId} className="mt-2 text-sm text-stone">
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


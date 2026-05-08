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
            'flex min-h-11 w-full rounded-xl border bg-[white] px-4 py-3 font-sans text-sm font-light text-[black] shadow-sm transition-all',
            'placeholder:text-[black]/40',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:border-[black]',
            error
              ? 'border-red-600 focus-visible:ring-red-600 focus-visible:border-red-600'
              : 'border-[black]/20 focus-visible:ring-[black]',
            'disabled:cursor-not-allowed disabled:bg-[black]/5 disabled:text-[black]/40',
            className
          )}
          {...props}
        />
        {hint ? (
          <p id={hintId} className="mt-2 text-sm text-[black]/60">
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

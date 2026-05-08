'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  error?: string;
  hint?: string;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      id,
      options,
      error,
      hint,
      placeholder = 'Select an option',
      required,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const hintId = hint && id ? `${id}-hint` : undefined;
    const errorId = error && id ? `${id}-error` : undefined;
    const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        <div className="relative">
          <select
            ref={ref}
            id={id}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'flex min-h-11 w-full appearance-none rounded-xl border bg-[white] px-4 py-3 pr-12 text-sm text-[black] shadow-sm transition',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              error
                ? 'border-red-600 focus-visible:outline-red-600'
                : 'border-[black]/20 focus-visible:outline-[black]',
              'disabled:cursor-not-allowed disabled:bg-[black]/5 disabled:text-[black]/40',
              className
            )}
            {...props}
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[black]/40"
          >
            ▼
          </span>
        </div>
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

Select.displayName = 'Select';

// Made with Bob

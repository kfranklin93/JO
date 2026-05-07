'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  hint?: string;
  showCharacterCount?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      id,
      error,
      hint,
      maxLength,
      value,
      defaultValue,
      showCharacterCount = true,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const resolvedValue =
      typeof value === 'string'
        ? value
        : typeof defaultValue === 'string'
          ? defaultValue
          : '';
    const characterCount = resolvedValue.length;
    const hintId = hint && id ? `${id}-hint` : undefined;
    const errorId = error && id ? `${id}-error` : undefined;
    const countId = showCharacterCount && maxLength && id ? `${id}-count` : undefined;
    const describedBy = [ariaDescribedBy, hintId, errorId, countId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        <textarea
          ref={ref}
          id={id}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex min-h-32 w-full rounded-xl border bg-[#FAF9F6] px-4 py-3 font-sans text-sm font-light text-[#1C2A39] shadow-sm transition-all',
            'placeholder:text-[#1C2A39]/40',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:border-[#C5A059]',
            error
              ? 'border-red-600 focus-visible:ring-red-600 focus-visible:border-red-600'
              : 'border-[#1C2A39]/20 focus-visible:ring-[#C5A059]',
            'disabled:cursor-not-allowed disabled:bg-[#1C2A39]/5 disabled:text-[#1C2A39]/40',
            className
          )}
          {...props}
        />
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="space-y-2">
            {hint ? (
              <p id={hintId} className="text-sm text-[#1C2A39]/60">
                {hint}
              </p>
            ) : null}
            {error ? (
              <p id={errorId} className="text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          {showCharacterCount && maxLength ? (
            <p id={countId} className="shrink-0 text-sm text-[#1C2A39]/60" aria-live="polite">
              {characterCount}/{maxLength}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// Made with Bob

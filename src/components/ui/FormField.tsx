'use client';

import * as React from 'react';
import { Label } from '@/components/ui/Label';
import { cn } from '@/lib/utils/cn';

export interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  optionalText?: string;
  error?: string;
  helpText?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  id,
  label,
  required = false,
  optionalText = 'Optional',
  error,
  helpText,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('w-full', className)}>
      <Label
        htmlFor={id}
        required={required}
        {...(!required ? { optionalText } : {})}
      >
        {label}
      </Label>
      {children}
      {!error && helpText ? (
        <p id={`${id}-help`} className="mt-2 text-sm text-[black]/60">
          {helpText}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-field-error`} className="mt-2 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// Made with Bob

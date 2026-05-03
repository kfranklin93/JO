'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  optionalText?: string;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, required = false, optionalText, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn('mb-2 block text-sm font-medium text-[#1C2A39]', className)}
        {...props}
      >
        <span className="inline-flex items-center gap-1">
          <span>{children}</span>
          {required ? <span aria-hidden="true" className="text-red-600">*</span> : null}
          {!required && optionalText ? (
            <span className="text-xs font-normal text-[#1C2A39]/50">({optionalText})</span>
          ) : null}
        </span>
      </label>
    );
  }
);

Label.displayName = 'Label';

// Made with Bob

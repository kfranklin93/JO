'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

const buttonVariants = {
  variant: {
    primary:
      'bg-[black] text-white shadow-sm hover:bg-[#B8935A] focus-visible:outline-[black] disabled:bg-[black]/40',
    secondary:
      'bg-[black] text-white shadow-sm hover:bg-[black]/90 focus-visible:outline-[black] disabled:bg-[black]/40',
    outline:
      'border border-[black]/20 bg-[white] text-[black] hover:bg-[black]/5 focus-visible:outline-[black] disabled:border-[black]/10 disabled:text-[black]/40',
    ghost:
      'bg-transparent text-[black] hover:bg-[black]/5 focus-visible:outline-[black] disabled:text-[black]/40',
    danger:
      'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:outline-red-600 disabled:bg-red-400',
  },
  size: {
    sm: 'min-h-11 px-4 text-sm',
    md: 'min-h-11 px-5 text-sm sm:text-base',
    lg: 'min-h-12 px-6 text-base',
    icon: 'min-h-11 min-w-11 px-3',
  },
} as const;

type ButtonVariant = keyof typeof buttonVariants.variant;
type ButtonSize = keyof typeof buttonVariants.size;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingLabel = 'Loading',
      disabled,
      fullWidth = false,
      type = 'button',
      'aria-busy': ariaBusy,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-100',
          fullWidth && 'w-full',
          buttonVariants.variant[variant],
          buttonVariants.size[size],
          className
        )}
        disabled={isDisabled}
        aria-busy={ariaBusy ?? loading}
        {...props}
      >
        {loading ? (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
            <span>{loadingLabel}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

// Made with Bob

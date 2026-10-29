'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Read this before adding a variant or picking one.
 *
 * `ghost` sets **no background**. `outline` sets `bg-surface`, which is Bone —
 * a light fill. Both carry `text-navy`, so neither may be placed on a dark
 * surface: `ghost` renders navy-on-dark at roughly 1:1 and disappears, and
 * `outline` punches a bone rectangle into the section. They are light-surface
 * variants, and nothing in the type system can tell you that, because the
 * surface lives in a parent component.
 *
 * `onDark` is the variant for a dark surface: a bone outline that fills with
 * bone and flips its label to hunter on hover. Bone on hunter is 13.1:1 and
 * bone on navy is 11.8:1, so it is legible on every dark fill in the palette.
 * Reach for it instead of hand-rolling a `className` override at the call
 * site, which is what the four MagneticButton call sites used to do.
 *
 * ## `champagne` and `champagneOutline`: a dark surface that needs an action
 *
 * `primary` is hunter, and hunter is also the site's dark section fill, so a
 * `primary` button on a hunter section is the same colour as its background
 * and disappears — the hero's Search control, exactly. The two champagne
 * variants are the fix:
 *
 *   `champagne`        solid gold fill, onyx label. 8.4:1 label on fill, and
 *                      6.5:1 fill against hunter, so the button has an edge
 *                      as well as a readable word on it. This is the
 *                      *primary* action on a dark surface.
 *   `champagneOutline` gold border, bone label, fills to gold with an onyx
 *                      label on hover. Deliberately lighter weight: use it
 *                      for secondary actions beside a `champagne` one, so a
 *                      panel does not end up with three solid gold slabs.
 *
 * Pick between them by weight, not by colour: `champagne` for the one action
 * you want pressed, `champagneOutline` for the alternatives, `onDark` when
 * the surface already has gold on it and another gold button would compete.
 *
 * The outline variant labels itself bone rather than gold on purpose. Gold
 * text is legible on hunter (6.5:1) but 2.0:1 on bone, and a variant map
 * cannot know which surface it will land on, so the safe half of the pairing
 * is the one that gets declared here. Gold is a fill in these variants; it is
 * never the ink.
 *
 * Both are dark-surface variants. On Bone the gold border drops to 2.0:1 and
 * a bone label vanishes outright — `primary` or `outline` is what a light
 * section wants.
 */
const buttonVariants = {
  variant: {
    primary:
      'bg-cerulean text-bone shadow-sm hover:bg-cerulean/90 focus-visible:outline-cerulean disabled:bg-cerulean/40',
    secondary:
      'bg-linen text-navy shadow-sm hover:bg-neutral-200 focus-visible:outline-navy disabled:bg-linen/40',
    outline:
      'border-2 border-navy bg-surface text-navy hover:border-cerulean hover:bg-cerulean hover:text-bone focus-visible:outline-cerulean disabled:border-navy/20 disabled:text-navy/40',
    ghost:
      'bg-transparent text-navy hover:bg-linen focus-visible:outline-navy disabled:text-navy/40',
    onDark:
      'border-2 border-bone bg-transparent text-bone hover:border-bone hover:bg-bone hover:text-hunter focus-visible:outline-bone disabled:border-bone/20 disabled:text-bone/40',
    champagne:
      'bg-champagne text-champagne-foreground shadow-sm hover:bg-champagne/90 focus-visible:outline-bone disabled:bg-champagne/40',
    champagneOutline:
      'border-2 border-champagne bg-transparent text-bone hover:border-champagne hover:bg-champagne hover:text-champagne-foreground focus-visible:outline-bone disabled:border-champagne/20 disabled:text-bone/40',
    danger:
      'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:outline-red-600 disabled:bg-red-400',
  },
  size: {
    sm: 'min-h-11 px-4 py-3 text-sm',
    md: 'min-h-11 px-5 py-3 text-sm sm:text-base',
    lg: 'min-h-12 px-6 py-3 text-base',
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


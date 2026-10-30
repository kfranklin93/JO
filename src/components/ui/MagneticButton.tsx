'use client';

import * as React from 'react';
import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils/cn';

export interface MagneticButtonProps {
  strength?: number;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'onDark' | 'champagne' | 'champagneOutline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  href?: string;
  /**
   * Click handler. Runs on the link too when `href` is also given, which is how
   * a caller builds a progressively enhanced control: the `href` is what a
   * click does before hydration or with JS off, and the handler calls
   * `preventDefault()` to take over once it is listening.
   */
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Magnetic Button with GSAP micro-interactions
 * Button subtly pulls toward cursor for rewarding click experience
 * Supports both button and link functionality
 */
export function MagneticButton({
  strength = 0.3,
  children,
  variant = 'primary',
  size = 'md',
  className,
  href,
  onClick,
  disabled = false,
  type = 'button',
}: MagneticButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text || disabled) return;

    // Use GSAP context for proper cleanup
    const ctx = gsap.context(() => {
      const handleMouseMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        gsap.to(container, {
          x: x * strength,
          y: y * strength,
          duration: 0.3,
          ease: 'power2.out',
        });

        gsap.to(text, {
          x: x * strength * 0.5,
          y: y * strength * 0.5,
          duration: 0.3,
          ease: 'power2.out',
        });
      };

      const handleMouseLeave = () => {
        gsap.to(container, {
          x: 0,
          y: 0,
          duration: 0.5,
          ease: 'elastic.out(1, 0.3)',
        });

        gsap.to(text, {
          x: 0,
          y: 0,
          duration: 0.5,
          ease: 'elastic.out(1, 0.3)',
        });
      };

      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      };
    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, [strength, disabled]);

  /**
   * Read this before adding a variant or picking one.
   *
   * `outline` sets **no background** and carries `text-navy`. On a dark
   * surface that is dark-on-dark at roughly 1:1 and the label disappears —
   * which is exactly the bug that produced this comment. Four of the five
   * `outline` call sites sat on navy or near-black sections and were only
   * legible because each hand-rolled its own colour override in `className`.
   * `outline` is a light-surface variant, and nothing in the type system can
   * say so, because the surface is declared in a parent component.
   *
   * `onDark` is the variant for a dark surface: a bone outline that fills with
   * bone and flips its label to hunter on hover. Bone on hunter is 13.1:1 and
   * bone on navy is 11.8:1, so it is legible on every dark fill in the
   * palette. Reach for it rather than an override at the call site.
   *
   * `champagne` and `champagneOutline` are the other two dark-surface
   * variants, and they exist because `primary` is hunter while hunter is also
   * the site's dark section fill: a `primary` button on a hunter section is
   * its own background colour and vanishes, which is what happened to the
   * hero's Search control.
   *
   *   `champagne`        solid gold fill, onyx label. 8.4:1 label on fill,
   *                      6.5:1 fill against hunter. The primary action on a
   *                      dark surface.
   *   `champagneOutline` gold border, bone label, fills to gold with an onyx
   *                      label on hover. Deliberately lighter weight, for
   *                      secondary actions sitting beside a `champagne` one.
   *
   * Choose by weight rather than by colour: `champagne` for the action you
   * want pressed, `champagneOutline` for its alternatives, `onDark` where
   * another gold button would compete with gold already on the surface. The
   * hero uses exactly that split — a solid gold Search, two gold-outlined
   * quick actions.
   *
   * The outline variant's label is bone, not gold, on purpose: gold ink is
   * 6.5:1 on hunter but 2.0:1 on bone, and a variant map does not know which
   * surface it will land on. Gold is a fill here, never the ink. Both
   * variants are dark-surface only — on Bone the gold border falls to 2.0:1
   * and a bone label disappears.
   */
  const variants = {
    primary: 'bg-cerulean text-bone border-2 border-cerulean hover:bg-cerulean/90 hover:border-cerulean/90',
    secondary: 'bg-linen text-navy border-2 border-neutral-200 hover:bg-neutral-100',
    outline: 'border-2 border-navy text-navy hover:bg-cerulean hover:border-cerulean hover:text-bone',
    onDark: 'border-2 border-bone text-bone hover:bg-bone hover:border-bone hover:text-hunter focus-visible:outline-bone',
    champagne: 'bg-champagne text-champagne-foreground border-2 border-champagne hover:bg-champagne/90 hover:border-champagne/90 focus-visible:outline-bone',
    champagneOutline: 'border-2 border-champagne text-bone hover:bg-champagne hover:border-champagne hover:text-champagne-foreground focus-visible:outline-bone',
  };

  const sizes = {
    sm: 'px-6 py-3 text-sm',
    md: 'px-8 py-4 text-base',
    lg: 'px-12 py-5 text-base',
  };

  const baseClasses = cn(
    'relative inline-flex items-center justify-center gap-3 rounded-none font-sans font-medium uppercase tracking-wider transition-all duration-300',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className
  );

  const content = (
    <span ref={textRef} className="relative z-10 inline-flex items-center gap-3">
      {children}
    </span>
  );

  if (href && !disabled) {
    return (
      <div ref={containerRef} className="inline-block">
        {/* Spread rather than passed: `exactOptionalPropertyTypes` makes an
            explicit `undefined` a type error on Link's own handler. */}
        <Link href={href} className={baseClasses} {...(onClick ? { onClick } : {})}>
          {content}
        </Link>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="inline-block">
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={baseClasses}
      >
        {content}
      </button>
    </div>
  );
}


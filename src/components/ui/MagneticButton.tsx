'use client';

import * as React from 'react';
import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils/cn';

export interface MagneticButtonProps {
  strength?: number;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  href?: string;
  onClick?: () => void;
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

  const variants = {
    primary: 'bg-champagne text-navy border-2 border-champagne hover:bg-[#b08e4a] hover:border-[#b08e4a]',
    secondary: 'bg-linen text-navy border-2 border-neutral-200 hover:bg-neutral-100',
    outline: 'border-2 border-navy text-navy hover:bg-navy hover:text-linen',
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
        <Link href={href} className={baseClasses}>
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

// Made with Bob

'use client';

import * as React from 'react';
import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils/cn';

export interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  strength?: number;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Magnetic Button with GSAP micro-interactions
 * Button subtly pulls toward cursor for rewarding click experience
 */
export function MagneticButton({
  strength = 0.3,
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: MagneticButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const button = buttonRef.current;
    const text = textRef.current;
    if (!button || !text) return;

    // Use GSAP context for proper cleanup
    const ctx = gsap.context(() => {
      const handleMouseMove = (e: MouseEvent) => {
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        gsap.to(button, {
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
        gsap.to(button, {
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

      button.addEventListener('mousemove', handleMouseMove);
      button.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        button.removeEventListener('mousemove', handleMouseMove);
        button.removeEventListener('mouseleave', handleMouseLeave);
      };
    }, buttonRef);

    return () => {
      ctx.revert();
    };
  }, [strength]);

  const variants = {
    primary: 'bg-[#C5A059] text-[#FAF9F6] hover:bg-[#C5A059]/90',
    secondary: 'bg-[#1C2A39] text-[#FAF9F6] hover:bg-[#1C2A39]/90',
    outline: 'border-2 border-[#C5A059] text-[#C5A059] hover:bg-[#C5A059] hover:text-[#FAF9F6]',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      ref={buttonRef}
      className={cn(
        'relative inline-flex items-center justify-center gap-2 rounded-2xl font-sans font-normal transition-all duration-300',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      <span ref={textRef} className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
    </button>
  );
}

// Made with Bob

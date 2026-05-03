'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Navigation, type NavigationItem } from '@/components/layout/Navigation';
import { MobileMenu } from '@/components/layout/MobileMenu';
import { navigationConfig } from '@/config/navigation';
import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils/cn';

export interface HeaderProps {
  sticky?: boolean;
  className?: string;
}

export function Header({ sticky = true, className }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    if (!sticky) return;

    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sticky]);

  // Close mobile menu on ESC key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  React.useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Convert readonly array to mutable for Navigation component
  const mainNavItems = [...navigationConfig] as NavigationItem[];

  return (
    <>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-700 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <header
        className={cn(
          'w-full border-b border-slate-200 bg-white transition-shadow',
          sticky && 'sticky top-0 z-40',
          scrolled && 'shadow-sm',
          className
        )}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                aria-label={`${siteConfig.name} - Home`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white">
                  <span className="text-xl font-bold" aria-hidden="true">
                    JO
                  </span>
                </div>
                <span className="hidden text-lg font-bold text-slate-900 sm:inline">
                  {siteConfig.name}
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <Navigation items={mainNavItems} className="flex-1" />

            {/* CTA Button - Desktop */}
            <div className="hidden items-center gap-3 lg:flex">
              <Link href="/get-started">
                <Button variant="primary" size="md">
                  Get Started
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              type="button"
              className={cn(
                'flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 transition-colors lg:hidden',
                'hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700'
              )}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? (
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </>
  );
}

// Made with Bob
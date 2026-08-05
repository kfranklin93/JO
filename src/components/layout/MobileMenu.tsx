'use client';

import * as React from 'react';
import Link from 'next/link';
import { navigationConfig } from '@/config/navigation';
import type { NavigationItem } from './Navigation';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const firstFocusableRef = React.useRef<HTMLAnchorElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const menu = menuRef.current;
    if (!menu) return;

    firstFocusableRef.current?.focus();

    const focusableElements = menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      {/* Menu Panel */}
      <div
        id="mobile-menu"
        ref={menuRef}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-5">
            <span className="font-serif text-xl text-black">Menu</span>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-black transition-colors hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              onClick={onClose}
              aria-label="Close menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto px-6 py-8" aria-label="Mobile navigation">
            <ul className="space-y-2">
              {navigationConfig.map((item, index) => (
                <li key={item.label}>
                  {'children' in item && item.children ? (
                    <MobileMenuDropdown item={item} onClose={onClose} />
                  ) : (
                    <Link
                      ref={index === 0 ? firstFocusableRef : undefined}
                      href={item.href}
                      className="block rounded-lg px-4 py-3 font-sans text-lg text-black transition-colors hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none"
                      onClick={onClose}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer CTA */}
          <div className="border-t border-neutral-200 p-6">
            <Link
              href="/contact"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center gap-2 border-2 border-navy bg-navy px-6 py-4 font-sans text-sm font-medium uppercase tracking-wider text-linen transition-all duration-300 hover:bg-champagne hover:text-navy hover:border-champagne"
            >
              <span>Get in Touch</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

interface MobileMenuDropdownProps {
  item: (typeof navigationConfig)[number];
  onClose: () => void;
}

function MobileMenuDropdown({ item, onClose }: MobileMenuDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  if (!('children' in item) || !item.children) return null;

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg px-4 py-3 font-sans text-lg text-black transition-colors hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        {item.label}
        <svg
          className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <ul className="ml-4 mt-2 space-y-1 border-l-2 border-neutral-200 pl-4">
          {item.children.map((child: NavigationItem) => (
            <li key={child.href}>
              <Link
                href={child.href}
                className="block rounded-lg px-4 py-2 font-sans text-base text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-black focus-visible:bg-neutral-100 focus-visible:outline-none"
                onClick={onClose}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Made with Bob

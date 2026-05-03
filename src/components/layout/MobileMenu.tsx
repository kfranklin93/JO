'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
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
      <div className="fixed inset-0 z-40 bg-[#1C2A39]/60 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />

      <div
        id="mobile-menu"
        ref={menuRef}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#1C2A39] shadow-xl lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#FAF9F6]/10 px-4 py-4">
            <span className="font-serif text-lg font-light text-[#FAF9F6]">Menu</span>
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#FAF9F6] transition-colors hover:bg-[#FAF9F6]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059]"
              onClick={onClose}
              aria-label="Close menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Mobile navigation">
            <ul className="space-y-1">
              {navigationConfig.map((item, index) => (
                <li key={item.label}>
                  {'children' in item && item.children ? (
                    <MobileMenuDropdown item={item} onClose={onClose} />
                  ) : (
                    <Link
                      ref={index === 0 ? firstFocusableRef : undefined}
                      href={item.href}
                      className="block rounded-lg px-4 py-3 font-sans text-xl font-light tracking-[0.1em] text-[#FAF9F6] transition-all duration-300 hover:bg-[#C5A059]/20 hover:text-[#C5A059] focus-visible:bg-[#C5A059]/20 focus-visible:outline-none"
                      onClick={onClose}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-[#FAF9F6]/10 p-4">
            <Link
              href="/get-started"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[#C5A059] px-6 py-4 font-sans text-base font-normal text-[#FAF9F6] transition-all duration-300 hover:bg-[#C5A059]/90"
            >
              Get Started
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
        className="flex w-full items-center justify-between rounded-lg px-4 py-3 font-sans text-xl font-light tracking-[0.1em] text-[#FAF9F6] transition-all duration-300 hover:bg-[#C5A059]/20 hover:text-[#C5A059] focus-visible:bg-[#C5A059]/20 focus-visible:outline-none"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        {item.label}
        <svg
          className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <ul className="ml-4 mt-1 space-y-1 border-l-2 border-[#C5A059]/30 pl-4">
          {item.children.map((child: NavigationItem) => (
            <li key={child.href}>
              <Link
                href={child.href}
                className="block rounded-lg px-4 py-2 font-sans text-base font-light tracking-[0.1em] text-[#FAF9F6]/80 transition-all duration-300 hover:bg-[#C5A059]/20 hover:text-[#C5A059] focus-visible:bg-[#C5A059]/20 focus-visible:outline-none"
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

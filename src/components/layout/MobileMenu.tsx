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
      <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onClose} aria-hidden="true" />

      <div
        id="mobile-menu"
        ref={menuRef}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-xl lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <span className="text-lg font-semibold text-slate-900">Menu</span>
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
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
                      className="block rounded-lg px-4 py-3 text-base font-medium text-slate-900 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
                      onClick={onClose}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-slate-200 p-4">
            <Link href="/get-started" onClick={onClose}>
              <Button variant="primary" size="lg" fullWidth>
                Get Started
              </Button>
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
        className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-base font-medium text-slate-900 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
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
        <ul className="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 pl-4">
          {item.children.map((child: NavigationItem) => (
            <li key={child.href}>
              <Link
                href={child.href}
                className="block rounded-lg px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
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

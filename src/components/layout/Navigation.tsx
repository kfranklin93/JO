'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

export interface NavigationItem {
  label: string;
  href: string;
  children?: NavigationItem[];
}

export interface NavigationProps {
  items: NavigationItem[];
  className?: string;
}

export function Navigation({ items, className }: NavigationProps) {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = React.useState<string | null>(null);
  const dropdownRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const timeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

  const handleMouseEnter = (label: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setOpenDropdown(label);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    item: NavigationItem,
    index: number
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (item.children) {
        event.preventDefault();
        setOpenDropdown(openDropdown === item.label ? null : item.label);
      }
    } else if (event.key === 'Escape') {
      setOpenDropdown(null);
    } else if (event.key === 'ArrowDown' && item.children && openDropdown === item.label) {
      event.preventDefault();
      const dropdown = dropdownRefs.current.get(item.label);
      const firstLink = dropdown?.querySelector('a');
      firstLink?.focus();
    }
  };

  const handleDropdownKeyDown = (
    event: React.KeyboardEvent,
    parentLabel: string,
    childIndex: number,
    totalChildren: number
  ) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const dropdown = dropdownRefs.current.get(parentLabel);
      const links = dropdown?.querySelectorAll('a');
      const nextIndex = (childIndex + 1) % totalChildren;
      (links?.[nextIndex] as HTMLElement)?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const dropdown = dropdownRefs.current.get(parentLabel);
      const links = dropdown?.querySelectorAll('a');
      const prevIndex = childIndex === 0 ? totalChildren - 1 : childIndex - 1;
      (links?.[prevIndex] as HTMLElement)?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpenDropdown(null);
      // Focus back on parent
      const parentButton = document.querySelector(
        `[data-nav-item="${parentLabel}"]`
      ) as HTMLElement;
      parentButton?.focus();
    }
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const hasActiveChild = (item: NavigationItem) => {
    return item.children?.some((child) => isActive(child.href)) ?? false;
  };

  return (
    <nav className={cn('hidden lg:flex', className)} aria-label="Main navigation">
      <ul className="flex items-center gap-8">
        {items.map((item, index) => {
          const active = isActive(item.href);
          const childActive = hasActiveChild(item);
          const isOpen = openDropdown === item.label;

          if (item.children) {
            return (
              <li
                key={item.label}
                className="relative"
                onMouseEnter={() => handleMouseEnter(item.label)}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  data-nav-item={item.label}
                  className={cn(
                    'flex items-center gap-1 font-sans text-sm uppercase tracking-[0.15em] font-medium transition-all duration-300',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne',
                    (active || childActive)
                      ? 'text-champagne drop-shadow-[0_0_8px_rgba(197,160,89,0.6)]'
                      : 'text-linen [text-shadow:0_2px_8px_rgba(0,0,0,0.6)] hover:text-champagne hover:[text-shadow:0_0_8px_rgba(197,160,89,0.4)]'
                  )}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onKeyDown={(e) => handleKeyDown(e, item, index)}
                >
                  {item.label}
                  <svg
                    className={cn(
                      'h-4 w-4 transition-transform',
                      isOpen && 'rotate-180'
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isOpen && (
                  <div
                    ref={(el) => {
                      if (el) {
                        dropdownRefs.current.set(item.label, el);
                      }
                    }}
                    className="absolute left-0 top-full z-50 mt-4 w-56 rounded-2xl bg-navy backdrop-blur-md py-3 shadow-2xl shadow-navy/30 border border-champagne/20"
                    role="menu"
                    aria-orientation="vertical"
                  >
                    {item.children.map((child, childIndex) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'block px-6 py-3 font-sans text-sm font-medium transition-all duration-300',
                          'focus-visible:bg-champagne/20 focus-visible:outline-none',
                          isActive(child.href)
                            ? 'text-champagne drop-shadow-[0_0_8px_rgba(197,160,89,0.6)] bg-champagne/10'
                            : 'text-linen hover:bg-champagne/20 hover:text-champagne hover:[text-shadow:0_0_8px_rgba(197,160,89,0.4)]'
                        )}
                        role="menuitem"
                        onClick={() => setOpenDropdown(null)}
                        onKeyDown={(e) =>
                          handleDropdownKeyDown(
                            e,
                            item.label,
                            childIndex,
                            item.children!.length
                          )
                        }
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            );
          }

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                className={cn(
                  'font-sans text-sm uppercase tracking-[0.15em] font-medium transition-all duration-300',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne',
                  active
                    ? 'text-champagne drop-shadow-[0_0_8px_rgba(197,160,89,0.6)]'
                    : 'text-linen [text-shadow:0_2px_8px_rgba(0,0,0,0.6)] hover:text-champagne hover:[text-shadow:0_0_8px_rgba(197,160,89,0.4)]'
                )}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}


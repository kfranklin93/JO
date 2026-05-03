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
                    'flex items-center gap-1 font-sans text-xs uppercase tracking-[0.2em] font-light transition-colors duration-300',
                    'hover:text-[#C5A059] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059]',
                    (active || childActive) ? 'text-[#C5A059]' : 'text-[#FAF9F6]/90'
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
                    className="absolute left-0 top-full z-50 mt-4 w-56 rounded-2xl bg-[#1C2A39]/95 backdrop-blur-md py-3 shadow-2xl border border-[#FAF9F6]/10"
                    role="menu"
                    aria-orientation="vertical"
                  >
                    {item.children.map((child, childIndex) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'block px-6 py-3 font-sans text-sm font-light transition-colors duration-300',
                          'hover:bg-[#C5A059]/20 hover:text-[#C5A059] focus-visible:bg-[#C5A059]/20 focus-visible:outline-none',
                          isActive(child.href)
                            ? 'text-[#C5A059] font-normal'
                            : 'text-[#FAF9F6]/90'
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
                  'font-sans text-xs uppercase tracking-[0.2em] font-light transition-colors duration-300',
                  'hover:text-[#C5A059] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059]',
                  active ? 'text-[#C5A059]' : 'text-[#FAF9F6]/90'
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

// Made with Bob
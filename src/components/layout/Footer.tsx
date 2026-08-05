'use client';

import * as React from 'react';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils/cn';

export interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={cn(
        'w-full border-t border-neutral-200 bg-neutral-50',
        className
      )}
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-4">
          {/* Company Info */}
          <div className="lg:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              aria-label={`${siteConfig.name} - Home`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-linen">
                <span className="text-xl font-bold" aria-hidden="true">
                  JO
                </span>
              </div>
              <span className="text-lg font-bold text-navy">
                {siteConfig.name}
              </span>
            </Link>
            <p className="mt-4 text-sm text-stone">
              Your trusted partner for buying, selling, and insuring your home.
            </p>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-navy">
              Services
            </h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/buy-home"
                  className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                >
                  Buy a Home
                </Link>
              </li>
              <li>
                <Link
                  href="/sell-home"
                  className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                >
                  Sell Your Home
                </Link>
              </li>
              <li>
                <Link
                  href="/home-insurance"
                  className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                >
                  Home Insurance
                </Link>
              </li>
              <li>
                <Link
                  href="/closing-services"
                  className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                >
                  Closing Services
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-navy">
              Company
            </h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/get-started"
                  className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                >
                  Get Started
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-navy">
              Contact Us
            </h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={`tel:${siteConfig.contact.phone}`}
                  className="flex items-center gap-2 text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                  aria-label={`Call us at ${siteConfig.contact.phoneDisplay}`}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  {siteConfig.contact.phoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${siteConfig.contact.email}`}
                  className="flex items-center gap-2 text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
                  aria-label={`Email us at ${siteConfig.contact.email}`}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  {siteConfig.contact.email}
                </a>
              </li>
              <li>
                <address className="flex items-start gap-2 text-sm not-italic text-stone">
                  <svg
                    className="mt-0.5 h-5 w-5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>
                    {siteConfig.contact.office}
                    <br />
                    {siteConfig.contact.brokerage}
                  </span>
                </address>
              </li>
            </ul>

            {/* Social Media */}
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-navy">
                Follow Us
              </h4>
              <div className="mt-3 flex gap-3">
                <a
                  href={siteConfig.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone transition-colors hover:bg-neutral-100 hover:text-navy focus-visible:bg-neutral-100 focus-visible:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                  aria-label="Follow us on Facebook"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                  </svg>
                </a>
                <a
                  href={siteConfig.social.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone transition-colors hover:bg-neutral-100 hover:text-navy focus-visible:bg-neutral-100 focus-visible:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                  aria-label="Follow us on LinkedIn"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                  </svg>
                </a>
                <a
                  href={siteConfig.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone transition-colors hover:bg-neutral-100 hover:text-navy focus-visible:bg-neutral-100 focus-visible:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                  aria-label="Follow us on Instagram"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
                <a
                  href={siteConfig.social.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone transition-colors hover:bg-neutral-100 hover:text-navy focus-visible:bg-neutral-100 focus-visible:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                  aria-label="Follow us on YouTube"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-neutral-200 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-stone">
              &copy; {currentYear} {siteConfig.name}. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link
                href="/privacy"
                className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-stone transition-colors hover:text-navy focus-visible:text-navy focus-visible:outline-none"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Made with Bob
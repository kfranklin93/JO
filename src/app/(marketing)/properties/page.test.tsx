// @vitest-environment jsdom

/**
 * Regression tests for /properties and for the hero search.
 *
 * Both surfaces were publishing fiction. The hero's "Search by neighborhood,
 * city, or ZIP code…" input sent the visitor to `/properties?search=<query>`,
 * a parameter this page never read, and the page then served four homes that
 * do not exist — named neighbourhoods, specific asking prices, bed and bath
 * counts, status badges. The page is in the sitemap and was indexed.
 *
 * The assertions below are the ones that would have caught each of the ways
 * this change can silently regress:
 *
 *  - any of the four invented titles, locations or prices coming back
 *  - a price-shaped string of any kind appearing on the page again
 *  - a widget losing its `agent-encoded-id`, which renders an element that
 *    upgrades and then shows nothing
 *  - `include-seller-listings` rendering as `"true"` or vanishing, either of
 *    which changes which listings come back
 *  - the shared UMD bundle being loaded twice on the page that hosts two
 *    widgets, or not at all — a missing module leaves the custom element as
 *    an inert unknown tag, which is invisible in a code read
 *  - the hero's fake input or its `searchQuery` state returning
 */

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteConfig } from '@/config/site';
import { EnhancedHeroSection } from '@/components/sections/EnhancedHeroSection';
import PropertiesPage from './page';

/** Every string the four fabricated listings put on the page. */
const INVENTED = [
  'Modern Estate in Buckhead',
  'Historic Charm in Marietta',
  'Contemporary Luxury in Sandy Springs',
  'Elegant Townhome in Roswell',
  '$2,450,000',
  '$875,000',
  '$1,650,000',
  '$625,000',
  'Buckhead, Atlanta',
  'Marietta Square',
  'Sandy Springs',
  'Historic Roswell',
];

/**
 * `whileInView` and the hero's `useScroll` both want observers jsdom does not
 * have. Without the IntersectionObserver stub, animated sections render at
 * `opacity: 0` and their text is unreachable by an accessible query — and the
 * text is the whole subject of the provenance assertions here.
 */
class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        } as IntersectionObserverEntry,
      ],
      this
    );
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
});

/**
 * The one `<script>` React hoisted into `<head>` for the widget bundle.
 *
 * Deliberately not reset between tests. React's dedupe of an async script is
 * per *document* and it remembers what it has already inserted, so removing
 * the tag by hand in a `beforeEach` does not make React insert it again — the
 * count then reads zero and the test lies about the mechanism. Reading the
 * live document instead is also the stronger assertion: however many widgets
 * however many renders mount, there must be exactly one tag.
 */
function bundleTags() {
  return document.querySelectorAll(
    `script[src="${siteConfig.realscout.scriptSrc}"]`
  );
}

describe('/properties no longer publishes invented listings', () => {
  it('contains none of the four fabricated homes or their prices', () => {
    const { container } = render(<PropertiesPage />);
    const text = container.textContent ?? '';

    expect(text.length).toBeGreaterThan(0);
    for (const fiction of INVENTED) {
      expect(text, `${fiction} is back on /properties`).not.toContain(fiction);
    }
  });

  it('quotes no price at all, in any format', () => {
    // Broader than the four known strings on purpose: the failure mode is
    // someone hardcoding a *different* price, not the same one again. Every
    // real figure on this page now comes out of RealScout at runtime.
    const { container } = render(<PropertiesPage />);
    const text = container.textContent ?? '';

    expect(text).not.toContain('$');
    expect(text).not.toMatch(/\d{3},\d{3}/);
  });

  it('promises no outcome and quotes no unsourced statistic', () => {
    // The provenance rule, as a pattern. Every factual sentence on the page
    // traces to answer-playbook-content.ts or site.ts, and none of those
    // quotes a figure or a guarantee — the playbook loader withholds any
    // entry that does.
    const { container } = render(<PropertiesPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/guarantee/i);
    expect(text).not.toMatch(/\d+\s*(%|percent|days?|months?)/i);
  });

  it('does not claim the listings grid is all homes for sale', () => {
    // `listing-status` includes Sold and Rented, so the grid mixes active
    // inventory with closed business. Copy that called it current for-sale
    // inventory would be false the moment a sold listing rendered.
    const { container } = render(<PropertiesPage />);
    const text = container.textContent ?? '';

    expect(text).toContain('Listings and Recent Transactions');
    expect(text).not.toMatch(/currently (for sale|on the market)/i);
    expect(text).not.toMatch(/featured properties/i);
  });
});

describe('/properties renders the two RealScout widgets', () => {
  it('mounts your-listings above advanced-search, both with the agent id', () => {
    const { container } = render(<PropertiesPage />);

    const listings = container.querySelector('realscout-your-listings');
    const advanced = container.querySelector('realscout-advanced-search');

    expect(listings).not.toBeNull();
    expect(advanced).not.toBeNull();
    for (const el of [listings, advanced]) {
      expect(el?.getAttribute('agent-encoded-id')).toBe(
        siteConfig.realscout.agentEncodedId
      );
    }

    // Joey's inventory first, the wider market second — the owner's order.
    const order = Array.from(
      container.querySelectorAll(
        'realscout-your-listings, realscout-advanced-search'
      )
    ).map((el) => el.tagName.toLowerCase());

    expect(order).toEqual([
      'realscout-your-listings',
      'realscout-advanced-search',
    ]);
  });

  it('passes the listing attributes through verbatim', () => {
    const { container } = render(<PropertiesPage />);
    const listings = container.querySelector('realscout-your-listings');

    expect(listings?.getAttribute('sort-order')).toBe('NEWEST');
    expect(listings?.getAttribute('listing-status')).toBe(
      'For Sale,For Rent,In Contract,Sold,Rented'
    );
    expect(listings?.getAttribute('property-types')).toBe(
      'SFR,MF,TC,LAL,MOBILE,OTHER'
    );
    // Bare boolean attribute: present, and valueless. `{true}` in JSX would
    // render the string "true" here, which is a different attribute value.
    expect(listings?.hasAttribute('include-seller-listings')).toBe(true);
    expect(listings?.getAttribute('include-seller-listings')).toBe('');
  });

  it('loads the shared UMD bundle exactly once for both widgets', () => {
    render(<PropertiesPage />);

    const tags = bundleTags();

    expect(tags).toHaveLength(1);
    // `async` is what keeps it off the critical path *and* what makes React
    // hoist and dedupe it. Losing it would give this page two tags.
    expect(tags[0]?.getAttribute('async')).not.toBeNull();
    expect(tags[0]?.getAttribute('type')).toBe('module');
  });
});

describe('the hero search is the real widget', () => {
  it('renders realscout-simple-search with the agent id', () => {
    const { container } = render(<EnhancedHeroSection />);

    const search = container.querySelector('realscout-simple-search');

    expect(search).not.toBeNull();
    expect(search?.getAttribute('agent-encoded-id')).toBe(
      siteConfig.realscout.agentEncodedId
    );
    expect(bundleTags()).toHaveLength(1);
  });

  it('has no fake search input or Search button left behind', () => {
    const { container } = render(<EnhancedHeroSection />);

    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).not.toContain('Search');
  });
});

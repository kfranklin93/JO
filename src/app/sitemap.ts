import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

/**
 * Sitemap for the public site.
 *
 * ## What this is actually for
 *
 * URL discovery, and little else. Google has said for years that it ignores
 * `priority` and largely ignores `changeFrequency`, so the values below are
 * conventional rather than load-bearing — they are included because the sitemap
 * format expects them, not because they steer anything. The real work this file
 * does is telling a crawler that these eleven pages exist without it having to
 * find every one by following links.
 *
 * That matters more here than on a typical site, because the homepage is a
 * client component with heavy section composition, and several service pages are
 * reachable only through navigation. A crawler that gives up early would index
 * the homepage and miss the pages that actually target local searches.
 *
 * ## What is deliberately absent
 *
 * - `/dashboard` and `/dashboard/login` — Joey's private tooling.
 * - `/api/*` — not pages.
 * - `/unsubscribe` — carries `robots: { index: false }` in its own metadata.
 *   Listing it here would ask Google to index a page that then asks not to be.
 *
 * Note that `/unsubscribe` is *not* blocked in robots.ts either, and that is on
 * purpose: a crawler has to be able to fetch a page to read its noindex
 * directive. Blocking it in robots.txt would leave the URL eligible to appear in
 * results with no description, which is the opposite of the intent.
 */

/**
 * Routes with real content, safe to ask Google to index.
 *
 * See PLACEHOLDER_ROUTES below for the ones deliberately held back.
 */
const ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
  { path: '', changeFrequency: 'weekly', priority: 1 },

  /*
   * The five service pages, promoted out of PLACEHOLDER_ROUTES below now that
   * each carries real content drawn from Joey's approved answer playbook.
   * Priority 0.9, as the note down there asked for: these are the pages that
   * can win "sell my house in Marietta", and a searcher who lands on one now
   * finds something real and a way to start a conversation.
   */
  { path: '/sell-home', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/buy-home', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/closing-services', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/home-insurance', changeFrequency: 'monthly', priority: 0.9 },

  // Listings change often; the page is worth recrawling.
  { path: '/properties', changeFrequency: 'weekly', priority: 0.8 },

  { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/get-started', changeFrequency: 'yearly', priority: 0.7 },

  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

/**
 * Pages that exist as stubs and are NOT submitted for indexing yet.
 *
 * Empty now, and kept rather than deleted because it is the mechanism for
 * holding back the next unfinished page. The rule it carries: a route joins
 * ROUTES above only once a visitor arriving from a search result would find
 * something real on it. Google does not rank thin pages, so listing a stub buys
 * nothing, spends crawl budget, and drags site-quality signals for the pages
 * that *are* real — and a searcher who clicked "Sell Your Home in Metro
 * Atlanta" and read the word "Placeholder" is worse for Joey than not ranking.
 *
 * The five that were listed here — `/sell-home`, `/buy-home`, `/contact`,
 * `/closing-services` and `/home-insurance` — were written from Joey's approved
 * answer playbook and have moved up, each at priority 0.9.
 */
const PLACEHOLDER_ROUTES: readonly string[] = [];

/** Exported so the test can assert these stay out until they are written. */
export const HELD_BACK_FROM_SITEMAP: readonly string[] = PLACEHOLDER_ROUTES;

export default function sitemap(): MetadataRoute.Sitemap {
  // One timestamp for the whole generation rather than `new Date()` per entry,
  // so every URL in a given response agrees on when it was produced.
  const generatedAt = new Date();

  // Trailing slashes stripped so `NEXT_PUBLIC_SITE_URL` with or without one
  // produces the same canonical URLs. A sitemap listing `example.com//about`
  // is a sitemap listing URLs that do not exist.
  const base = siteConfig.url.replace(/\/+$/, '');

  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${base}${path}`,
    lastModified: generatedAt,
    changeFrequency,
    priority,
  }));
}

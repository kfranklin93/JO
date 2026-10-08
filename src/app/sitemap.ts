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

/** Routes that should be indexed, with how often they realistically change. */
const ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
  { path: '', changeFrequency: 'weekly', priority: 1 },

  // The pages that target local intent searches — "sell my house in Marietta"
  // and the like. These are the commercial pages.
  { path: '/sell-home', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/buy-home', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/home-insurance', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/closing-services', changeFrequency: 'monthly', priority: 0.8 },

  // Listings change often; the page is worth recrawling.
  { path: '/properties', changeFrequency: 'weekly', priority: 0.8 },

  { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.7 },
  { path: '/get-started', changeFrequency: 'yearly', priority: 0.7 },

  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

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

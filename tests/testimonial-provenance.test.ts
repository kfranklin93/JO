import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homepageSchema, realEstateAgentSchema, getReviewSchemas } from '@/config/structured-data';
import { clientTestimonials, type Testimonial } from '@/data/testimonials';

/**
 * Guards on client testimonials and the review markup they feed.
 *
 * Six invented clients shipped to production in src/data/testimonials.ts and
 * were rendered on the homepage as endorsements of a licensed real estate
 * agent. The entries are deleted; these tests are what stops them, or anything
 * like them, coming back:
 *
 *  1. the six names appear nowhere in src/ — the guard list below is the only
 *     place they are written down, and this file is not under src/;
 *  2. a testimonial cannot be declared without a source, enforced by `tsc`
 *     rather than at runtime, because the failure mode is somebody *adding*
 *     data, not somebody running it;
 *  3. with no reviews, no Review node and no `aggregateRating` reach the page,
 *     and with one real review both appear. Half of that pair is the test that
 *     matters: an aggregate published over zero reviews is review-snippet spam
 *     and risks a Google manual action, and "absent when empty" passes
 *     trivially for a function that is absent always.
 */

const INVENTED_NAMES = [
  'Sarah & Michael Thompson',
  'David Chen',
  'Jennifer Martinez',
  'Robert & Lisa Johnson',
  'Amanda Williams',
  'Mark & Patricia Davis',
];

const SRC = resolve(import.meta.dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

describe('the fabricated testimonials are gone', () => {
  it('names none of the six invented clients anywhere in src/', () => {
    const files = sourceFiles(SRC);

    // An empty file list would make the loop below vacuous, which is how a
    // scan test passes against a directory it failed to read.
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const name of INVENTED_NAMES) {
        if (text.includes(name)) offenders.push(`${file} contains "${name}"`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('ships no testimonials at all until real ones are supplied', () => {
    expect(clientTestimonials).toEqual([]);
  });

  it('requires a platform, a link and a date on every testimonial', () => {
    // The compile-time half of the guard: this object is a valid testimonial
    // in every respect except that it does not say where it came from, which
    // is exactly the shape the six invented entries had. If `source` ever
    // becomes optional, `@ts-expect-error` has nothing to suppress and
    // `npm run typecheck` fails.
    // @ts-expect-error - `source` is required; an unattributed review must not type-check
    const unattributed: Testimonial = {
      name: 'No Such Person',
      role: 'Buyer',
      content: 'A review with nowhere a visitor can go and read it.',
      rating: 5,
    };

    expect(unattributed.name).toBe('No Such Person');

    // And the runtime half, for the entries that do exist.
    for (const review of clientTestimonials) {
      expect(review.source.platform).toBeTruthy();
      expect(review.source.url).toMatch(/^https:\/\//);
      expect(review.source.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('the review markup follows the data', () => {
  it('emits no Review node and no aggregateRating with zero testimonials', () => {
    expect(getReviewSchemas()).toEqual([]);

    const types = homepageSchema['@graph'].map((node) => node['@type']);
    expect(types).not.toContain('Review');

    expect(realEstateAgentSchema).not.toHaveProperty('aggregateRating');
    expect(JSON.stringify(homepageSchema)).not.toContain('aggregateRating');
    expect(JSON.stringify(homepageSchema)).not.toContain('AggregateRating');
  });

  it('publishes both once a real, sourced review exists', async () => {
    vi.resetModules();
    vi.doMock('@/data/testimonials', () => ({
      clientTestimonials: [
        {
          name: 'Real Reviewer',
          role: 'Seller',
          content: 'Published on a platform a visitor can check.',
          rating: 5,
          source: {
            platform: 'Zillow',
            url: 'https://www.zillow.com/profile/JoeyOberndorfer',
            datePublished: '2025-03-14',
          },
        },
      ],
    }));

    const wired = await import('@/config/structured-data');

    const reviews = wired.getReviewSchemas();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      '@type': 'Review',
      author: { name: 'Real Reviewer' },
      datePublished: '2025-03-14',
    });

    expect(wired.realEstateAgentSchema).toMatchObject({
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '5.0',
        reviewCount: '1',
      },
    });

    const types = wired.homepageSchema['@graph'].map((node) => node['@type']);
    expect(types).toContain('Review');
  });

  afterEach(() => {
    vi.doUnmock('@/data/testimonials');
    vi.resetModules();
  });
});

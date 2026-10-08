import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for robots.txt and the sitemap.
 *
 * Both are generated from config, so the failure modes are quiet ones: a URL
 * built with a double slash, a private route leaking into the sitemap, or — the
 * one that actually prompted these — an AI crawler getting blocked by a later
 * well-intentioned tightening of robots.txt.
 *
 * Being cited by AI assistants for local real estate questions is an explicit
 * goal here, and a crawler that cannot read the site cannot cite it. The
 * reflexive advice is to block those bots, so the allowance is asserted rather
 * than left as a comment someone can ignore.
 */

const testEnv: Record<string, string | undefined> = {};

vi.mock('@/config/site', () => ({
  siteConfig: {
    get url() {
      return testEnv.url ?? 'https://gowithjoeyo.com';
    },
  },
}));

const sitemap = (await import('./sitemap')).default;
const robots = (await import('./robots')).default;

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
});

describe('sitemap', () => {
  it('lists the commercial pages that target local searches', () => {
    const paths = sitemap().map((entry) => entry.url);

    for (const page of [
      '/sell-home',
      '/buy-home',
      '/home-insurance',
      '/closing-services',
      '/properties',
      '/about',
      '/contact',
    ]) {
      expect(paths).toContain(`https://gowithjoeyo.com${page}`);
    }
  });

  it('includes the homepage with no trailing path', () => {
    expect(sitemap().map((e) => e.url)).toContain('https://gowithjoeyo.com');
  });

  it('keeps private routes out', () => {
    const urls = sitemap().map((entry) => entry.url).join(' ');

    expect(urls).not.toContain('/dashboard');
    expect(urls).not.toContain('/api');
  });

  it('omits the unsubscribe page, which asks not to be indexed', () => {
    // Listing it would ask Google to index a page whose own metadata says
    // noindex — a contradiction that wastes crawl budget.
    expect(sitemap().map((e) => e.url).join(' ')).not.toContain('/unsubscribe');
  });

  it('builds clean URLs when the site URL has a trailing slash', () => {
    // NEXT_PUBLIC_SITE_URL is operator-set and may well carry one. A sitemap of
    // `example.com//about` lists URLs that do not exist.
    testEnv.url = 'https://gowithjoeyo.com/';

    for (const entry of sitemap()) {
      expect(entry.url).not.toContain('//about');
      expect(entry.url.replace('https://', '')).not.toContain('//');
    }
  });

  it('stamps every entry with one shared timestamp', () => {
    // Per-entry `new Date()` would let URLs in a single response disagree about
    // when they were generated.
    const stamps = new Set(sitemap().map((e) => String(e.lastModified)));

    expect(stamps.size).toBe(1);
  });

  it('has no duplicate URLs', () => {
    const urls = sitemap().map((e) => e.url);

    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('robots — AI crawlers', () => {
  /** Every rule whose userAgent matches, normalised to an array. */
  function rulesFor(agent: string) {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    return list.filter((rule) => {
      const ua = rule.userAgent;
      const agents = Array.isArray(ua) ? ua : [ua];
      return agents.includes(agent);
    });
  }

  it.each([
    ['OAI-SearchBot'],
    ['ChatGPT-User'],
    ['PerplexityBot'],
    ['ClaudeBot'],
    ['GPTBot'],
    ['Google-Extended'],
  ])('allows %s to read the public site', (agent) => {
    // If this test ever fails because someone "hardened" robots.txt, read the
    // note at the top of robots.ts before changing the test.
    const matched = rulesFor(agent);

    expect(matched).toHaveLength(1);
    expect(matched[0]!.allow).toBe('/');
  });

  it('still keeps the dashboard and API away from AI crawlers', () => {
    // Allowed to read the public site is not the same as allowed everywhere.
    const rule = rulesFor('ClaudeBot')[0]!;

    expect(rule.disallow).toContain('/dashboard');
    expect(rule.disallow).toContain('/api/');
  });
});

describe('robots — everything else', () => {
  it('allows general crawlers the public site', () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    const wildcard = list.find((rule) => rule.userAgent === '*');

    expect(wildcard?.allow).toBe('/');
  });

  it('blocks the dashboard and API by default', () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    const wildcard = list.find((rule) => rule.userAgent === '*')!;

    expect(wildcard.disallow).toEqual(['/api/', '/dashboard']);
  });

  it('does not block the unsubscribe page', () => {
    // It carries a noindex in its own metadata, and a crawler has to be able to
    // fetch the page to read that. Blocking it here would leave the URL
    // eligible to show up with no description.
    expect(JSON.stringify(robots())).not.toContain('/unsubscribe');
  });

  it('points at the sitemap', () => {
    expect(robots().sitemap).toBe('https://gowithjoeyo.com/sitemap.xml');
  });

  it('builds a clean sitemap URL when the site URL has a trailing slash', () => {
    testEnv.url = 'https://gowithjoeyo.com/';

    expect(robots().sitemap).toBe('https://gowithjoeyo.com/sitemap.xml');
  });
});

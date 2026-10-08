import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

/**
 * robots.txt.
 *
 * ## Why this file exists at all
 *
 * With no robots.txt, everything is already allowed — so this is not here to
 * open anything up. It earns its place three ways: it points crawlers at the
 * sitemap, it keeps Joey's dashboard and the API routes out of the index, and it
 * records a deliberate decision about AI crawlers that would otherwise get
 * reversed by accident.
 *
 * That last one is the important part. The reflex when writing a robots.txt is
 * to block the AI bots, and plenty of guides still recommend it. For this site
 * that would be self-defeating: being cited by AI assistants when someone asks
 * about buying or selling in metro Atlanta is an explicit goal, and a crawler
 * that cannot read the site cannot cite it. So the allowances below are stated
 * explicitly rather than left to the default, with the reasoning attached, so
 * nobody tightens them later without seeing what it costs.
 *
 * ## Two kinds of AI crawler, and only one of them matters for citation
 *
 * Worth separating, because they are routinely conflated:
 *
 *  - **Search and citation crawlers** fetch pages so an assistant can answer a
 *    live question and link the source. `OAI-SearchBot`, `PerplexityBot`,
 *    `ClaudeBot`. These are the ones that can surface Joey in an answer. Block
 *    them and he is invisible to that whole surface.
 *  - **Training crawlers** collect text for future model training. `GPTBot`,
 *    `CCBot`, and the `-Extended` tokens. These do not produce citations today
 *    and the payoff is slow and unprovable.
 *
 * Both are allowed here. The training ones are a judgement call rather than an
 * obvious win — the argument for allowing them is that being described in a
 * model's weights is how an assistant answers "who should I talk to in
 * Marietta" without searching at all. The argument against is that it is
 * uncompensated use of his content. For a local agent trying to become known,
 * being known wins. If Joey ever decides otherwise, the tokens to remove are
 * named below and removing them is a one-line change each.
 *
 * ## What is blocked
 *
 * `/dashboard` and `/api`. Neither is a page anyone should find in search.
 *
 * `/unsubscribe` is deliberately NOT blocked. It carries
 * `robots: { index: false }` in its own metadata, and a crawler has to fetch a
 * page to read that. Blocking it here would leave the URL eligible to appear
 * with no description — worse than letting it be fetched and excluded properly.
 */

/**
 * AI crawlers allowed to read the public site.
 *
 * Named individually rather than relying on the `*` default so the decision is
 * visible in the generated robots.txt and in review.
 */
const AI_CRAWLERS = [
  // Search and citation — the ones that can put Joey in an answer today.
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',

  // Training. Slower payoff, allowed deliberately — see the note above.
  'GPTBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent',
];

/** Paths no crawler should index. */
const DISALLOW = ['/api/', '/dashboard'];

export default function robots(): MetadataRoute.Robots {
  // Trailing slashes stripped so the sitemap URL is canonical whether or not
  // NEXT_PUBLIC_SITE_URL carries one.
  const base = siteConfig.url.replace(/\/+$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

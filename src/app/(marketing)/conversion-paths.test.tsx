// @vitest-environment jsdom

/**
 * Regression tests for the conversion paths.
 *
 * The review behind this work found no test coverage at all on any of it, and
 * the failures it found were the kind a code read passes: a link to a route
 * that does not exist, a floating button in each bottom corner, an active tab
 * announced by nothing but its background colour. Each test below is the
 * assertion that would have caught one of them.
 *
 * What is covered:
 *
 *  - the hero's two primary buttons and the mobile menu's only call to action
 *    point at pages that exist and render
 *  - every internal link on the homepage resolves to a real route. Three cards
 *    in the browsing section pointed at /properties/now-selling,
 *    /properties/future-visions and /properties/legacy, none of which is a
 *    route in this app
 *  - the homepage still has exactly one `<h1>` and no stand-in copy
 *  - the middle of the page has something to act on, and the 0-4-7 Month
 *    Inventory Guide is on it
 *  - one persistent floating element, in the bottom-right corner, labelled for
 *    what it gets you
 *  - `ServicesInquiryForm` is still reachable after the button that used to
 *    open it was retired
 *  - the dashboard view switcher says which view is active to something other
 *    than an eye, and the unsubscribe page has one `<h1>` in every state
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoeyChat } from '@/components/chat/JoeyChat';
import { MobileMenu } from '@/components/layout/MobileMenu';
import HomePage from './page';
import BuyHomePage from './buy-home/page';
import SellHomePage from './sell-home/page';
import ContactPage from './contact/page';

/**
 * `whileInView` needs an IntersectionObserver, and jsdom has none. Without
 * this, every section that animates in renders at `opacity: 0` and its text is
 * in the DOM but not reachable by an accessible-name query. The stub reports
 * each observed element as visible immediately, which is the state these tests
 * are asking about.
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

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Every route this app serves, read off the filesystem.
 *
 * Derived rather than listed, so a link to a page that was never built fails
 * here instead of in a browser. Route groups — the parenthesised directories —
 * contribute no URL segment, which is why they are dropped rather than
 * included as a path part.
 */
function appRoutes(): Set<string> {
  // From the working directory rather than `import.meta.url`: under jsdom the
  // module URL is not a `file:` URL and `fileURLToPath` rejects it.
  const appDir = join(process.cwd(), 'src', 'app');
  const routes = new Set<string>();

  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry === 'page.tsx') {
        routes.add(`/${segments.join('/')}` || '/');
        continue;
      }
      if (!statSync(full).isDirectory()) continue;
      // A route group contributes no URL segment.
      const isGroup = entry.startsWith('(') && entry.endsWith(')');
      walk(full, isGroup ? segments : [...segments, entry]);
    }
  };

  walk(appDir, []);
  routes.add('/');
  return routes;
}

describe('the hero and the mobile menu land on real pages', () => {
  it.each([
    { label: "I'm Buying", href: '/buy-home', Page: BuyHomePage },
    { label: "I'm Selling", href: '/sell-home', Page: SellHomePage },
  ])('$label goes to $href, which renders', async ({ label, href, Page }) => {
    render(<HomePage />);

    expect(await screen.findByRole('link', { name: label })).toHaveAttribute(
      'href',
      href
    );

    // The destination is the other half of the claim. Both of these were
    // ten-line stubs until Phase 1, and the hero pointed at them the whole
    // time.
    const { container } = render(<Page />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/placeholder/i);
  });

  it('the mobile menu call to action goes to /contact, which renders', () => {
    render(<MobileMenu isOpen onClose={() => {}} />);

    expect(screen.getByRole('link', { name: /get in touch/i })).toHaveAttribute(
      'href',
      '/contact'
    );

    const { container } = render(<ContactPage />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });
});

describe('the homepage', () => {
  it('has exactly one h1 and no stand-in copy', () => {
    const { container } = render(<HomePage />);

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/placeholder/i);
  });

  it('links only to routes that exist', () => {
    const { container } = render(<HomePage />);
    const routes = appRoutes();

    const internal = Array.from(container.querySelectorAll('a'))
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('/'))
      .map((href) => {
        const path = href.split(/[?#]/)[0] ?? '/';
        return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
      });

    // Worth asserting: an empty list would make the loop below vacuous, which
    // is how a link test passes on a page whose links all disappeared.
    expect(internal.length).toBeGreaterThan(0);

    for (const path of new Set(internal)) {
      expect(routes, `${path} is linked from the homepage`).toContain(path);
    }
  });

  it('puts the 0-4-7 Month Inventory Guide on the page', () => {
    // Joey's own named framework, in a component that nothing imported, so it
    // was live nowhere at all. A grep for it against the homepage returned
    // nothing before this.
    const { container } = render(<HomePage />);

    expect(container.textContent).toContain('0-4-7 Month Inventory Guide');
  });

  it('gives the middle of the page something to act on', async () => {
    // Why Joey, Testimonials and Market Stats ran consecutively with almost
    // nothing to click. These are the two sections interleaved into that run;
    // asserting their actions rather than their prose is what makes this a
    // test of the dead zone and not of the copy.
    render(<HomePage />);

    expect(
      await screen.findByRole('link', { name: /ask about the 0-4-7 guide/i })
    ).toBeInTheDocument();

    for (const name of [
      /browse listings/i,
      /start as a buyer/i,
      /start as a seller/i,
    ]) {
      expect(await screen.findByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('asks the chat to open rather than navigating away', async () => {
    const user = userEvent.setup();
    render(
      <>
        <HomePage />
        <JoeyChat />
      </>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const cta = await screen.findByRole('link', {
      name: /ask about the 0-4-7 guide/i,
    });
    // The fallback href matters as much as the handler: the homepage
    // prerenders, and before hydration the click has to land somewhere.
    expect(cta).toHaveAttribute('href', '/get-started');

    await user.click(cta);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('one floating entry point, bottom right', () => {
  it('is the only fixed bottom element the marketing pages mount', () => {
    // `FloatingConnectCTA` used to sit at bottom-8 right-8 while the chat sat
    // at bottom-8 left-8, both z-40 — two permanent buttons in a phone's thumb
    // zone offering two routes to the same outcome.
    const { container } = render(
      <>
        <HomePage />
        <JoeyChat />
      </>
    );

    const fixedToBottom = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="fixed"]')
    ).filter((el) => /(^|\s)bottom-\d/.test(el.className));

    expect(fixedToBottom).toHaveLength(1);
  });

  it('sits in the bottom-right corner', () => {
    render(<JoeyChat />);

    const launcher = screen.getByRole('button', { name: /chat with joey/i });

    expect(launcher.className).toContain('right-8');
    expect(launcher.className).not.toContain('left-8');
  });

  it('is labelled for what it gets you, with the same accessible name', () => {
    // It read "Ask a question", which describes the least valuable thing the
    // panel does. The visible label and the screen-reader one are the same
    // string so they cannot drift apart.
    render(<JoeyChat />);

    const launcher = screen.getByRole('button', { name: /chat with joey/i });
    const labels = Array.from(launcher.querySelectorAll('span')).map((s) =>
      s.textContent?.trim()
    );

    expect(launcher).toHaveAccessibleName('Chat with Joey');
    expect(new Set(labels)).toEqual(new Set(['Chat with Joey']));
  });
});

describe('the services inquiry form is not orphaned', () => {
  it('opens from the contact page', async () => {
    // Its only way in was the retired floating button. The contact page is
    // where it lives now.
    const user = userEvent.setup();
    render(<ContactPage />);

    await user.click(screen.getByRole('button', { name: /tell joey what you need/i }));

    const form = await screen.findByRole('dialog');
    expect(
      within(form).getByRole('heading', { name: /how can i help you/i })
    ).toBeInTheDocument();
  });
});

describe('the dashboard view switcher', () => {
  const leads: unknown[] = [];
  const data = {
    stats: { total: 0, thisWeek: 0, thisMonth: 0, intentBreakdown: {} },
    leads,
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => data }))
    );
  });

  it('says which view is active, not just which one is green', async () => {
    // The active view was conveyed by background colour alone — WCAG 1.4.1 —
    // and to a screen reader all three buttons read identically whichever one
    // was selected. `aria-pressed` has to be on all three: a group where only
    // the selected button carries it tells assistive tech the other two are
    // not toggles at all.
    vi.doMock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
    const { default: DashboardPage } = await import('@/app/dashboard/page');

    const user = userEvent.setup();
    render(<DashboardPage />);

    const overview = await screen.findByRole('button', { name: /lead overview/i });
    const chatLogs = screen.getByRole('button', { name: /chat logs/i });
    const calendar = screen.getByRole('button', { name: /calendar/i });

    for (const button of [overview, chatLogs, calendar]) {
      expect(button).toHaveAttribute('aria-pressed');
    }

    expect(overview).toHaveAttribute('aria-pressed', 'true');
    expect(chatLogs).toHaveAttribute('aria-pressed', 'false');
    expect(calendar).toHaveAttribute('aria-pressed', 'false');

    await user.click(chatLogs);

    await waitFor(() => {
      expect(chatLogs).toHaveAttribute('aria-pressed', 'true');
    });
    expect(overview).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('the unsubscribe page', () => {
  it.each([
    { name: 'confirm, bad token', params: {} },
    { name: 'done', params: { status: 'done' } },
    { name: 'invalid', params: { status: 'invalid' } },
    { name: 'error', params: { status: 'error' } },
  ])('renders one h1 in the $name state', async ({ params }) => {
    // Five `<h1>` elements lived in this file, one per branch plus a second in
    // the confirm branch. Only ever one rendered, so the bug was in the source
    // rather than on screen — which is exactly the kind a review catches and a
    // test should hold.
    const { default: UnsubscribePage } = await import('@/app/unsubscribe/page');

    const { container } = render(
      await UnsubscribePage({ searchParams: Promise.resolve(params) })
    );

    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });
});

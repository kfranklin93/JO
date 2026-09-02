import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the dashboard layout, the authorization boundary for page renders.
 *
 * The layout is an async server component, so these call it directly and inspect
 * what it returns rather than rendering into a DOM. That is enough: the question
 * is whether it hands back its wrapper with `children` inside, or redirects
 * instead.
 *
 * `redirect` is mocked to throw, matching what the real one does. Without that
 * the layout would carry on past the call and return its markup, and a test
 * asserting "children are not rendered" would pass for the wrong reason.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

/** Cookie the mocked `next/headers` store will report, if any. */
let requestCookie: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'dashboard_auth' && requestCookie !== undefined
        ? { name, value: requestCookie }
        : undefined,
  }),
}));

/** Marker thrown in place of the real `redirect`'s control-flow exception. */
class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`NEXT_REDIRECT ${location}`);
    this.name = 'RedirectSignal';
  }
}

const redirect = vi.fn((location: string): never => {
  throw new RedirectSignal(location);
});

vi.mock('next/navigation', () => ({
  redirect: (location: string) => redirect(location),
}));

const DashboardLayout = (await import('./layout')).default;
const { SESSION_MAX_AGE_SECONDS, createSession } = await import('@/lib/auth/session');

const SECRET = 'test-session-secret-do-not-use-in-production';
const OTHER_SECRET = 'a-different-secret-an-attacker-might-hold';

/** The value that worked as a credential before this spec. */
const OLD_HARDCODED_TOKEN = 'joey_dashboard_authenticated';

const children = React.createElement('main', { 'data-testid': 'dashboard' }, 'leads');

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  requestCookie = undefined;
  redirect.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Render the layout with `cookie` presented as the session, or none when omitted. */
function renderWithCookie(cookie?: string) {
  requestCookie = cookie;
  return DashboardLayout({ children });
}

/**
 * Assert the layout refused to render and sent the visitor to login.
 *
 * Both halves matter: that it threw (so `children` never reached the response)
 * and that the destination is the login page.
 */
async function expectRedirectToLogin(cookie?: string): Promise<void> {
  await expect(renderWithCookie(cookie)).rejects.toBeInstanceOf(RedirectSignal);
  expect(redirect).toHaveBeenCalledWith('/dashboard/login');
}

/** A `Date` the given number of seconds in the past. */
function secondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

describe('DashboardLayout — valid session', () => {
  it('renders its children', async () => {
    const element = await renderWithCookie(createSession());

    expect(element.props.children).toBe(children);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('keeps the wrapper markup this layout already had', async () => {
    const element = await renderWithCookie(createSession());

    expect(element.type).toBe('div');
    expect(element.props.className).toBe(
      'min-h-screen bg-neutral-50 font-sans text-neutral-900',
    );
  });

  it('accepts a session issued earlier in the window', async () => {
    const issued = createSession(secondsAgo(SESSION_MAX_AGE_SECONDS - 60));

    await expect(renderWithCookie(issued)).resolves.toBeDefined();
  });
});

describe('DashboardLayout — rejected session', () => {
  it('redirects to login for the hardcoded token this spec replaces', async () => {
    // The page render half of the regression test. Before this spec the layout
    // was a bare div, so this literal rendered the dashboard shell.
    await expectRedirectToLogin(OLD_HARDCODED_TOKEN);
  });

  it('redirects to login when no cookie is presented', async () => {
    await expectRedirectToLogin(undefined);
  });

  it('redirects to login when the cookie is empty', async () => {
    await expectRedirectToLogin('');
  });

  it('redirects to login once the session has expired', async () => {
    await expectRedirectToLogin(createSession(secondsAgo(SESSION_MAX_AGE_SECONDS + 60)));
  });

  it('redirects to login for a session signed with a different secret', async () => {
    testEnv.SESSION_SECRET = OTHER_SECRET;
    const forged = createSession();
    testEnv.SESSION_SECRET = SECRET;

    await expectRedirectToLogin(forged);
  });

  it('redirects to login for a malformed cookie rather than throwing', async () => {
    await expectRedirectToLogin('!!! not a token !!!');
  });

  it('redirects to login when SESSION_SECRET is absent, rather than rendering', async () => {
    const issued = createSession();
    delete testEnv.SESSION_SECRET;

    await expectRedirectToLogin(issued);
  });
});

describe('dashboard route structure', () => {
  it('keeps the login page outside this layout, so the redirect cannot loop', () => {
    // Structural rather than behavioural, and the only automated guard against
    // reintroducing the loop: were `login/page.tsx` a child of this layout, an
    // unauthenticated visitor sent to /dashboard/login would fail the check here
    // and be redirected to /dashboard/login again, indefinitely.
    const appDir = new URL('../', import.meta.url);
    const inLayout = fileURLToPath(new URL('dashboard/login/page.tsx', appDir));
    const inRouteGroup = fileURLToPath(
      new URL('(dashboard-login)/dashboard/login/page.tsx', appDir),
    );

    expect(existsSync(inLayout)).toBe(false);
    expect(existsSync(inRouteGroup)).toBe(true);
  });
});

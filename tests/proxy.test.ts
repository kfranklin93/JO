import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { config, proxy } from '@/proxy';

/**
 * Tests for the `src/proxy.ts` redirect affordance.
 *
 * Two things are being pinned here, and they pull in opposite directions.
 *
 * The first is that unauthenticated visitors get redirected, including on the
 * bare `/dashboard` — the path that a matcher typo would silently drop.
 *
 * The second is that a *forged* cookie passes straight through. That reads like a
 * hole and is not one: the proxy is deliberately not the authorization boundary,
 * and asserting the pass-through keeps anyone from "hardening" this file into
 * something that looks authoritative while resting on Edge-runtime secret access
 * that the framework does not guarantee. The real checks live in
 * `src/app/dashboard/layout.tsx` and `src/app/api/dashboard/data/route.ts`, and
 * both have their own tests for the forged case.
 */

const LOGIN_PATH = '/dashboard/login';
const ORIGIN = 'https://gowithjoeyo.com';

/**
 * Where the proxy has to live for the framework to load it.
 *
 * Next resolves this convention at the level of the `app` directory, so with the
 * app at `src/app` the file belongs at `src/proxy.ts`. A copy at the repository
 * root is ignored *without any warning* — the build succeeds, the route table
 * simply stops listing a Proxy entry and every dashboard path serves ungated. The
 * deprecated `middleware.ts` was more forgiving about this, which makes it an easy
 * trap on the way across.
 */
const PROXY_PATH = join(process.cwd(), 'src/proxy.ts');

/** The literal that worked as a credential before this spec. */
const OLD_HARDCODED_TOKEN = 'joey_dashboard_authenticated';

interface RequestOptions {
  /** Raw `dashboard_auth` cookie value. Omit to send no cookie at all. */
  cookie?: string;
  /** Cookie name to send, for asserting the check is name-specific. */
  cookieName?: string;
}

function request(pathname: string, options: RequestOptions = {}): NextRequest {
  const headers = new Headers();

  if (options.cookie !== undefined) {
    headers.set(
      'cookie',
      `${options.cookieName ?? SESSION_COOKIE_NAME}=${options.cookie}`,
    );
  }

  return new NextRequest(`${ORIGIN}${pathname}`, { headers });
}

/** True when the response sends the visitor to the login page. */
function redirectsToLogin(
  pathname: string,
  options: RequestOptions = {},
): boolean {
  const location = proxy(request(pathname, options)).headers.get('location');

  return location === `${ORIGIN}${LOGIN_PATH}`;
}

/** True when the response lets the request continue to the route. */
function passesThrough(
  pathname: string,
  options: RequestOptions = {},
): boolean {
  const response = proxy(request(pathname, options));

  return response.headers.get('location') === null && response.status < 300;
}

describe('proxy — unauthenticated dashboard requests', () => {
  it('redirects the bare /dashboard path', () => {
    // Called out separately because `/dashboard/:path*` covering the bare path
    // depends on the `*` modifier. Changing it to `:path+` would leave every
    // nested test below passing while the dashboard root fell open.
    expect(redirectsToLogin('/dashboard')).toBe(true);
  });

  it('redirects a nested dashboard path', () => {
    expect(redirectsToLogin('/dashboard/leads')).toBe(true);
  });

  it('redirects a deeply nested dashboard path', () => {
    expect(redirectsToLogin('/dashboard/leads/42/notes')).toBe(true);
  });

  it('redirects a dashboard path carrying a query string', () => {
    expect(redirectsToLogin('/dashboard/leads?status=new')).toBe(true);
  });

  it('redirects when some other cookie is present but the session cookie is not', () => {
    expect(
      redirectsToLogin('/dashboard', {
        cookie: 'x',
        cookieName: 'analytics_id',
      }),
    ).toBe(true);
  });

  it('uses a redirect status the browser will follow on a GET', () => {
    // 307 is what `NextResponse.redirect` emits by default. The design table says
    // "302" generically, meaning "a redirect"; 307 is the stricter form, since it
    // forbids the method being rewritten to GET on the way through.
    expect(proxy(request('/dashboard')).status).toBe(307);
  });
});

describe('proxy — the login page', () => {
  it('never redirects /dashboard/login, so an unauthenticated visitor can reach it', () => {
    // Without this the redirect would target a path that redirects to itself.
    expect(passesThrough(LOGIN_PATH)).toBe(true);
  });

  it('leaves /dashboard/login alone when a session cookie is already present', () => {
    expect(passesThrough(LOGIN_PATH, { cookie: 'anything' })).toBe(true);
  });

  it('still gates a path that merely starts with the login path', () => {
    // `startsWith` here would have exempted this too.
    expect(redirectsToLogin('/dashboard/login-as-joey')).toBe(true);
  });
});

describe('proxy — requests carrying a session cookie', () => {
  it('passes a request through on cookie presence alone', () => {
    expect(passesThrough('/dashboard', { cookie: 'any.value' })).toBe(true);
  });

  it('passes a nested path through', () => {
    expect(passesThrough('/dashboard/leads', { cookie: 'any.value' })).toBe(
      true,
    );
  });

  it('passes a forged cookie through, because this layer is not the boundary', () => {
    // Documented, intended behaviour. The layout and the data route both reject
    // this exact value — see their tests. Were the proxy to reject it here, the
    // rejection would be cosmetic anyway, since anyone can craft a cookie whose
    // shape looks right.
    expect(passesThrough('/dashboard', { cookie: OLD_HARDCODED_TOKEN })).toBe(
      true,
    );
  });

  it('passes an empty cookie value through, since the check is presence only', () => {
    expect(passesThrough('/dashboard', { cookie: '' })).toBe(true);
  });
});

describe('proxy — non-dashboard requests', () => {
  const untouched = ['/', '/about', '/properties', '/api/leads', '/dashboards'];

  for (const pathname of untouched) {
    it(`leaves ${pathname} alone`, () => {
      expect(passesThrough(pathname)).toBe(true);
    });
  }
});

describe('proxy — matcher', () => {
  it('scopes the proxy to dashboard paths', () => {
    expect(config.matcher).toEqual(['/dashboard/:path*']);
  });

  it('compiles to a pattern that matches the bare /dashboard', async () => {
    // Requirement 4.3 depends on the matcher, not just on the handler, so this
    // asserts against the pattern the build actually produces rather than
    // trusting the path-to-regexp semantics by eye.
    //
    // The cast is because Next exports this at runtime but does not declare it in
    // the shipped types. Reaching into `dist/` is deliberate: compiling the
    // matcher with a copy of path-to-regexp would only prove the copy agrees with
    // itself. If a future Next release moves this, the test fails loudly, which is
    // the right outcome for an assertion about build behaviour.
    const analysis =
      (await import('next/dist/build/analysis/get-page-static-info.js')) as {
        getMiddlewareMatchers?: (
          matcher: string | string[],
          nextConfig: Record<string, unknown>,
        ) => Array<{ regexp: string }>;
      };

    expect(analysis.getMiddlewareMatchers).toBeTypeOf('function');

    const [compiled] =
      analysis.getMiddlewareMatchers?.(config.matcher, {}) ?? [];
    const pattern = new RegExp(compiled?.regexp ?? '(?!)');

    expect(pattern.test('/dashboard')).toBe(true);
    expect(pattern.test('/dashboard/leads')).toBe(true);
    expect(pattern.test('/dashboard/leads/42/notes')).toBe(true);
    expect(pattern.test('/dashboards')).toBe(false);
    expect(pattern.test('/about')).toBe(false);
  });
});

describe('proxy — Edge-runtime constraints', () => {
  const source = readFileSync(PROXY_PATH, 'utf-8');

  /**
   * The file with comments removed.
   *
   * Scanning raw source would flag the header comment, which names
   * `verifySession` precisely to say it must not be called here. These assertions
   * are about what the file *does*, so they read the code only.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  /** Every module specifier the file imports from. */
  const importedFrom = Array.from(code.matchAll(/from\s+'([^']+)'/g)).map(
    (match) => match[1],
  );

  it('inlines the cookie name rather than importing it', () => {
    // Requirement 4.6: no shared modules, so the file can be hoisted to the CDN.
    // The duplication is the deliberate cost of that.
    expect(code).toContain("const SESSION_COOKIE_NAME = 'dashboard_auth'");
  });

  it('keeps the inlined cookie name in step with the session module', () => {
    // The guard on the duplication above. If `SESSION_COOKIE_NAME` is ever
    // renamed, this fails instead of the proxy quietly checking a cookie that no
    // longer exists and redirecting every authenticated visitor to login.
    expect(code).toContain(`= '${SESSION_COOKIE_NAME}'`);
  });

  it('imports nothing but next/server', () => {
    expect(importedFrom).toEqual(['next/server', 'next/server']);
  });

  it('does not call into the session module', () => {
    expect(code).not.toContain('verifySession');
    expect(code).not.toContain('@/lib/auth');
  });

  it('holds no module-scoped mutable state', () => {
    // Indented declarations are function-local and fine; the concern is state
    // that survives between requests on a warm instance.
    expect(code).not.toMatch(/^(let|var)\s/m);
  });
});

describe('proxy — file location', () => {
  it('sits beside the app directory, where the framework looks for it', () => {
    // The assertion that catches a silently ungated dashboard. See PROXY_PATH.
    expect(existsSync(PROXY_PATH)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/app'))).toBe(true);
  });

  it('has no ignored copy at the repository root', () => {
    // A leftover root copy is worse than none: it reads like the live file and is
    // never loaded, so edits to it appear to do nothing.
    expect(existsSync(join(process.cwd(), 'proxy.ts'))).toBe(false);
  });

  it('no longer ships a middleware.ts', () => {
    // Next 16 throws when both conventions are present, and the root
    // middleware.ts held the last live copy of the hardcoded token.
    expect(existsSync(join(process.cwd(), 'middleware.ts'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'src/middleware.ts'))).toBe(false);
  });
});

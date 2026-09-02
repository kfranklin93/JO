import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Dashboard redirect affordance.
 *
 * THIS IS NOT THE AUTHORIZATION BOUNDARY. It only checks whether a session
 * cookie is *present*, never whether it is valid. Authorization lives in two
 * independent Node-runtime checks, and both call `verifySession`:
 *
 *   - `src/app/dashboard/layout.tsx`      blocks the page render
 *   - `src/app/api/dashboard/data/route.ts` blocks lead data
 *
 * A forged or expired cookie therefore passes straight through this file. That
 * is expected and by design: the only thing it costs is that the visitor gets
 * redirected one layer later, by the layout instead of here. Nothing is exposed,
 * because neither real check trusts this one.
 *
 * Why the check is deliberately this weak: proxy runs in the Edge runtime and,
 * per the framework's guidance for this file, "is meant to be invoked separately
 * of your render code and in optimized cases deployed to your CDN for fast
 * redirect/rewrite handling, you should not attempt relying on shared modules or
 * globals." Signature verification needs `SESSION_SECRET`, and reading secrets
 * here is not dependable. An outer layer that *looks* authoritative but rests on
 * unreliable secret access is worse than one that is honest about being a hint.
 *
 * So the value this file adds is purely about what the visitor sees: an
 * unauthenticated request lands on the login page instead of a dashboard shell
 * that flashes empty and then redirects.
 *
 * Do not add a `verifySession` import here, and do not import the cookie-name
 * constant either. Requirement 4.6 keeps this file free of shared modules and
 * module-scoped state, which is what allows it to be hoisted to the CDN.
 *
 * Location matters, and quietly: the framework resolves this convention at the
 * level of the `app` directory, so with the app at `src/app` the file has to be
 * `src/proxy.ts`. A copy at the repository root is ignored with no warning — the
 * build succeeds and simply stops listing a Proxy entry in the route table, which
 * leaves every dashboard path ungated at this layer. The deprecated
 * `middleware.ts` it replaces was loaded from the repository root, so moving it
 * down into `src/` was part of the migration. `tests/proxy.test.ts` asserts the
 * placement so it cannot regress.
 */

/**
 * Must stay in sync with `SESSION_COOKIE_NAME` in `src/lib/auth/session.ts`.
 *
 * Intentionally duplicated rather than imported — see the note above. Renaming
 * the cookie means editing both places, and `tests/proxy.test.ts` asserts the two
 * literals still agree so the duplication cannot drift silently.
 */
const SESSION_COOKIE_NAME = 'dashboard_auth';

/** The one dashboard path an unauthenticated visitor is allowed to reach. */
const LOGIN_PATH = '/dashboard/login';

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // The matcher already limits this to `/dashboard/:path*`, so the guard is
  // redundant in normal operation. It is kept so the handler stays correct if the
  // matcher is ever widened, and it costs two string comparisons.
  //
  // The bare path is tested separately rather than folded into a
  // `startsWith('/dashboard')` — that shorter form also swallows `/dashboards`,
  // which the matcher does not route here and which this file has no business
  // redirecting. Requirement 4.3 makes the bare path explicit anyway.
  const isDashboardPath =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/');

  // The exemption is an exact comparison, so it cannot be widened by accident —
  // `/dashboard/login-as-joey` should be gated, not exempt.
  if (isDashboardPath && pathname !== LOGIN_PATH) {
    // Presence only. No value comparison — there is nothing to compare against
    // that an attacker could not also read, which was the flaw in the version
    // this replaces.
    if (!request.cookies.has(SESSION_COOKIE_NAME)) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // The `*` modifier makes the trailing segment optional, so this matches the
  // bare `/dashboard` as well as nested paths like `/dashboard/leads`.
  matcher: ['/dashboard/:path*'],
};

# Dashboard Session Security — Tasks

- [ ] 1. Build the signed session module
  - Create `src/lib/auth/session.ts` with `createSession`, `verifySession`, `sessionCookieOptions`, and the cookie-name constant
  - Sign a JSON payload carrying an `exp` timestamp using HMAC-SHA256 over `SESSION_SECRET`, encoded as `base64url(payload).base64url(signature)`
  - Compare signatures with `timingSafeEqual`, checking buffer lengths first so it cannot throw
  - Make `createSession` throw when `SESSION_SECRET` is absent, and `verifySession` return `false` rather than throw for every malformed input
  - Add `SESSION_SECRET` to the Zod schema in `src/config/env.ts` as optional
  - Write unit tests: valid round trip, tampered payload, wrong-secret signature, expired token, and every malformed-input case
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [ ] 2. Add the login rate limiter
  - Create `src/lib/auth/rate-limit.ts` with a sliding-window per-instance attempt counter keyed on client IP, with a shared fallback bucket when no IP is present
  - Document in the module that this is per-instance and therefore approximate in serverless, with a database-backed counter as the follow-up
  - Write tests that inject time rather than sleeping, covering threshold breach and window reset
  - _Requirements: 2.6, 2.7_

- [ ] 3. Rewrite the login route
  - Check the rate limit before comparing the password, so it functions as a limit rather than a delay
  - Compare SHA-256 digests of the submitted and configured passwords with `timingSafeEqual`, avoiding the equal-length requirement and not leaking the configured length
  - Issue a signed session on success, keeping `httpOnly`, `secure` in production, `sameSite: 'lax'`, 7-day `maxAge`, and `path: '/'`
  - Return 401 on mismatch with no cookie set, 503 when `ADMIN_PASSWORD` or `SESSION_SECRET` is unconfigured, and 429 with `Retry-After` when over the limit
  - Write route tests for correct password, wrong password, unconfigured password, unconfigured secret, and over-limit
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 4. Enforce verification at both data boundaries
  - Replace the `AUTH_TOKEN` constant and `isAuthenticated` helper in `src/app/api/dashboard/data/route.ts` with `verifySession`
  - Convert `src/app/dashboard/layout.tsx` into an async server component that reads the cookie, verifies it, and redirects to login on failure, keeping its existing wrapper markup
  - Confirm no hardcoded token constant remains anywhere in the repo
  - Write a route test using the literal `'joey_dashboard_authenticated'` as a forged cookie, asserting 401 — a direct regression test for the current vulnerability
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 5. Migrate to the `proxy.ts` convention
  - Create root `proxy.ts` exporting a named `proxy` function with the `['/dashboard/:path*']` matcher and the `/dashboard/login` exemption
  - Narrow the check to cookie presence only, with a header comment stating this is a redirect affordance and that authorization lives in the layout and the data route
  - Delete `middleware.ts`
  - Verify `npm run build` emits no middleware deprecation warning
  - Smoke-test the bare `/dashboard` path explicitly, not just nested paths
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 6. Verify the spec
  - Run `npm test`, `npm run typecheck`, and `npm run build`
  - Log in through the UI and confirm the cookie holds a signed value, not `joey_dashboard_authenticated`
  - Set the old literal as the cookie in devtools and confirm the dashboard redirects and the data endpoint returns 401
  - Confirm a valid session survives a page refresh
  - Submit wrong passwords repeatedly and confirm a 429
  - _Requirements: 1.9, 2.6, 3.4, 4.2, 4.3_

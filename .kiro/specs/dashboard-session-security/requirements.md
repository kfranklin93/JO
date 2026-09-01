# Dashboard Session Security — Requirements

## Introduction

The dashboard session cookie holds a fixed plaintext string that is committed to this repository in three separate files. Anyone who reads the source can set that cookie and reach the dashboard and every lead's name, email, and phone number.

This is not exploitable today only because the `leads` table is empty. Spec 1 fills it, which is why this spec follows directly behind.

The dashboard stays on cookie authentication. No external auth provider — that is a project constraint, and it is the right call for a single-operator dashboard.

## Current state

Verified by reading source:

- The literal `'joey_dashboard_authenticated'` appears as a hardcoded constant in `middleware.ts:3`, `src/app/api/auth/login/route.ts:5`, and `src/app/api/dashboard/data/route.ts:7`. The comment in the login route even flags the duplication as intentional.
- The value is not random, not signed, not per-session, and carries no embedded expiry. `httpOnly` prevents JavaScript from reading it but does nothing to prevent forging it.
- `src/app/api/auth/login/route.ts:18` compares the submitted password with `!==`, which is not constant-time. There is no rate limiting and no lockout.
- `src/app/dashboard/layout.tsx` performs no auth check. It is a bare `<div>` wrapper.
- `src/app/dashboard/page.tsx:156` handles a 401 from the data endpoint by redirecting client-side, which is a UX affordance rather than a security control.
- `middleware.ts` uses the deprecated Next 16 `middleware.ts` convention. Its matcher is `['/dashboard/:path*']`, and it deliberately avoids reading `process.env` — the login route comments explain this was to sidestep unreliable env access in the Edge runtime.
- `/api/*` is not covered by the matcher, so every API route must authenticate itself.
- `POST /api/auth/logout` requires no authentication and has no CSRF token, though `sameSite: 'lax'` limits the impact.

Cookie attributes are otherwise correct and worth preserving: `httpOnly: true`, `secure` when `NODE_ENV === 'production'`, `sameSite: 'lax'`, `maxAge` of 7 days, `path: '/'`.

## Requirements

### Requirement 1 — Unforgeable session token

**User Story:** As Joey, I want my dashboard session to be impossible to fabricate, so that reading the source code does not grant access to my client data.

#### Acceptance Criteria

1. WHEN a session is issued THEN its cookie value SHALL be cryptographically signed with a server-held secret
2. WHEN a cookie value is verified THEN the signature SHALL be checked against the payload before the session is accepted
3. WHEN any byte of the payload is modified THEN verification SHALL fail
4. WHEN the signature does not match the payload THEN verification SHALL fail
5. WHEN signatures are compared THEN the comparison SHALL be constant-time
6. WHEN a session payload carries an expiry timestamp that has passed THEN verification SHALL fail even if the signature is valid
7. WHEN a cookie value is structurally malformed THEN verification SHALL fail without throwing
8. WHEN the signing secret is not configured THEN session issuance SHALL fail explicitly rather than fall back to an unsigned value
9. WHEN the session token appears in source control THEN it SHALL NOT be a usable credential

### Requirement 2 — Authenticated login

**User Story:** As Joey, I want the login endpoint to resist guessing, so that a weak moment in password choice is not immediately fatal.

#### Acceptance Criteria

1. WHEN a password is submitted THEN it SHALL be compared against the configured value in constant time
2. WHEN the password matches THEN a signed session SHALL be issued in the `dashboard_auth` cookie
3. WHEN the password does not match THEN the response SHALL be HTTP 401 and no cookie SHALL be set
4. WHEN `ADMIN_PASSWORD` is not configured THEN the response SHALL be HTTP 503
5. WHEN a session cookie is set THEN it SHALL retain `httpOnly`, `secure` in production, `sameSite: 'lax'`, a 7-day `maxAge`, and `path: '/'`
6. WHEN repeated failed attempts exceed a threshold THEN further attempts SHALL be rejected with HTTP 429
7. WHEN the rate-limit window elapses THEN attempts SHALL be permitted again

### Requirement 3 — Enforcement at the data boundary

**User Story:** As Joey, I want lead data protected by a real check rather than a redirect, so that a crafted request cannot bypass the UI.

#### Acceptance Criteria

1. WHEN `/api/dashboard/data` receives a request THEN it SHALL verify the session signature before returning any data
2. WHEN the session is invalid, forged, or expired THEN the endpoint SHALL return HTTP 401 and no lead data
3. WHEN the dashboard page is rendered on the server THEN it SHALL verify the session and redirect to login if verification fails
4. WHEN a forged cookie is presented THEN both the page render and the data endpoint SHALL reject it independently
5. WHEN the implementation is complete THEN the hardcoded token constant SHALL NOT remain in any file
6. WHERE session verification occurs THE code SHALL run in the Node.js runtime, so that secret access is reliable

### Requirement 4 — Current routing convention

**User Story:** As a developer, I want the request interceptor to use the supported file convention, so that the project is not relying on a deprecated API.

#### Acceptance Criteria

1. WHEN the project builds THEN it SHALL NOT emit a deprecation warning for the `middleware.ts` convention
2. WHEN an unauthenticated visitor requests a dashboard path THEN they SHALL be redirected to the login page
3. WHEN an unauthenticated visitor requests the bare `/dashboard` path THEN they SHALL also be redirected
4. WHEN a visitor requests `/dashboard/login` THEN they SHALL NOT be redirected
5. WHERE the interceptor performs its check THE check SHALL be presence-only, and the file SHALL document that it is a redirect affordance and not the authorization boundary
6. WHEN the interceptor runs THEN it SHALL NOT depend on shared modules or global state, per the framework's guidance for this file

## Out of scope

- CSRF tokens on `POST /api/auth/logout` (`sameSite: 'lax'` provides partial mitigation; the impact is an unwanted logout)
- Multi-user accounts, roles, or an external identity provider
- A database-backed rate limiter — the per-instance counter is acknowledged as approximate in a serverless deployment
- Session revocation or a server-side session store
- Protecting `/api/leads`, which is intentionally public as a form target

# Lead Capture Pipeline — Requirements

## Introduction

The site has a marketing layer, a lead API, a database schema, and a dashboard, but the browser never connects to any of it. Both lead forms log to the console instead of submitting, so the `leads` table is permanently empty, the dashboard renders zeros, and the follow-up cron has nothing to process.

This spec closes that gap and makes the data path trustworthy: server-side validation, an atomic write, and the indexes the query patterns need.

This is the first spec in the repo, so it also establishes the test harness every later spec depends on.

## Current state

Verified by reading source:

- `src/app/(marketing)/get-started/page.tsx:13` — `// TODO: Implement actual API call to submit lead`, then `console.log`, a 1500ms fake delay, `alert('Thank you! We will contact you soon.')`, then a redirect to `/`.
- `src/components/forms/ServicesInquiryForm.tsx:69` — `// JOEY UPDATE: Add form submission logic here (API call to /api/leads)`, then `console.log`.
- Grepping every `.tsx` under `src` for `fetch('/api` returns only three hits, all dashboard or auth. Nothing calls `/api/leads`.
- `src/lib/validation/` contains a single 0-byte `.gitkeep`. Zod is a dependency but is not used at any API boundary.
- `src/app/api/leads/route.ts:14` validates with `if (!body.name || !body.email || !body.intent)` — presence only. No email format check, no closed enum on `intent`, no length caps.
- The lead insert (`route.ts:26-47`) and the four follow-up inserts (`route.ts:75-101`) are separate statements. No `.transaction(` call exists anywhere in `src`.
- `src/lib/db/schema.ts` declares zero indexes. No `index(`, `uniqueIndex`, or `.unique()` anywhere in `src/lib/db/`.
- No test framework. No test files. `package.json` has no `test` script.

## Requirements

### Requirement 1 — Verification baseline

**User Story:** As a developer, I want a working build and test harness, so that every subsequent change can be verified rather than assumed.

#### Acceptance Criteria

1. WHEN a developer runs `npm install` on a clean checkout THEN dependencies SHALL install without error
2. WHEN a developer runs `npm run typecheck` THEN the result SHALL be recorded as a baseline, and any pre-existing failures SHALL be documented before unrelated changes are made
3. WHEN a developer runs `npm run build` THEN the result SHALL be recorded as a baseline
4. WHEN a developer runs `npm test` THEN Vitest SHALL execute and report results
5. WHEN a test imports a module using the `@/` path alias THEN the import SHALL resolve correctly
6. WHEN Vitest runs THEN it SHALL execute once and exit, not enter watch mode

### Requirement 2 — Server-side lead validation

**User Story:** As Joey, I want malformed submissions rejected with clear reasons, so that bad data never reaches my database or my inbox.

#### Acceptance Criteria

1. WHEN a lead payload is submitted THEN the server SHALL validate it against a Zod schema before any database write
2. WHEN `email` is not a valid email address THEN the request SHALL be rejected
3. WHEN `intent` is absent or outside the accepted set THEN the request SHALL be rejected
4. WHEN `name` is empty or whitespace-only THEN the request SHALL be rejected
5. WHEN `email` exceeds 255 characters, `phone` exceeds 20, or the full name exceeds 200 THEN the request SHALL be rejected by the schema, NOT by a Postgres `22001` truncation error
6. WHEN validation fails THEN the response SHALL be HTTP 422 with a body identifying each failing field by name
7. WHEN validation fails THEN no row SHALL be written to any table
8. WHEN validation succeeds THEN the route SHALL operate on the parsed and typed result, not the raw request body
9. WHEN the client and server validate the same input THEN they SHALL use the same schema definition, so the two cannot drift

### Requirement 3 — Atomic lead persistence

**User Story:** As Joey, I want a submission to either fully succeed or leave no trace, so that I never see half-written leads or duplicates from a retry.

#### Acceptance Criteria

1. WHEN a lead is submitted THEN the lead row and its scheduled follow-up rows SHALL be written inside a single database transaction
2. IF any insert within the transaction fails THEN all inserts in that transaction SHALL be rolled back
3. WHEN the transaction is rolled back THEN no orphaned lead row SHALL remain
4. WHEN the transaction fails THEN the response SHALL be an error status, so the client does not report false success
5. WHEN outbound integrations (email, SMS, CRM) fail THEN the stored lead SHALL be retained — integration failures SHALL NOT roll back the write
6. WHEN a repeat client submits a second inquiry with the same email address THEN the submission SHALL be accepted, because a person legitimately transacts more than once

### Requirement 4 — Query performance

**User Story:** As a developer, I want the hot query paths indexed, so that the cron job and dashboard do not degrade as lead volume grows.

#### Acceptance Criteria

1. WHEN the cron queries follow-ups by status and due date THEN the query SHALL use an index rather than a sequential scan
2. WHEN leads are looked up by email THEN an index SHALL be available
3. WHEN leads are ordered by creation date THEN an index SHALL be available
4. WHEN child rows are resolved by `lead_id` on `conversations`, `follow_ups`, or `analytics_events` THEN an index SHALL be available, since Postgres does not index foreign-key child columns automatically
5. WHERE an index is added on `leads.email` THE index SHALL be non-unique

### Requirement 5 — Working lead capture forms

**User Story:** As a prospective client, I want my form submission to actually reach Joey, so that I get a response.

#### Acceptance Criteria

1. WHEN a visitor submits the form on `/get-started` THEN the browser SHALL POST the collected data to `/api/leads`
2. WHEN a visitor submits the homepage inquiry modal THEN the browser SHALL POST to `/api/leads` with the intent selected in the service picker
3. WHILE a submission is in flight THE form SHALL show a loading state and SHALL prevent duplicate submission
4. WHEN a submission succeeds THEN the visitor SHALL see an inline confirmation
5. WHEN the server returns 422 THEN each field error SHALL be displayed against the corresponding field
6. WHEN a submission fails for any other reason THEN the visitor SHALL see a recoverable error message and SHALL be able to retry
7. WHEN a submission succeeds THEN the visitor SHALL NOT see a browser `alert()`
8. WHEN both forms submit THEN they SHALL share one submit helper rather than duplicating the request logic

## Out of scope

- Rate limiting or CAPTCHA on `/api/leads` (tracked as a follow-up; the endpoint is unauthenticated by design since it is a public form target)
- Writing `conversations`, `analytics_events`, or `ab_tests` rows
- Consolidating the unused `src/lib/services/database-service.ts`
- Escaping lead data in outbound email — that is Spec 2 (`untrusted-input-hardening`)

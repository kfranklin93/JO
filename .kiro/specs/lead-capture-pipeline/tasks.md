# Lead Capture Pipeline — Tasks

- [x] 1. Establish the verification baseline
  - Run `npm install` on the current checkout and confirm it completes
  - Run `npm run typecheck` and `npm run build`, recording any pre-existing failures before changing unrelated code
  - Add Vitest with a `vitest.config.ts` that maps the `@/` alias to `./src`, matching `tsconfig.json` paths
  - Add a `test` script that runs once and exits (no watch mode)
  - Add one trivial passing test to prove the harness and alias resolution work
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Create the shared Zod lead schema
  - Create `src/lib/validation/lead.ts` exporting `LEAD_INTENTS`, `LEAD_FIELD_LIMITS`, `leadSubmissionSchema`, `LeadSubmission`, and `formatFieldErrors`
  - Set length caps from the column widths in `src/lib/db/schema.ts`: email 255, phone 20, name 200, first/last 100, timeline 50, location/propertyType 100, additionalNotes 2000
  - Adopt the `LeadIntent` values from `src/types/lead.ts` as the canonical intent set, and assert in tests that the legacy `buying`/`selling`/`both` spellings are rejected so the vocabulary cannot drift back
  - Accept either a full `name` or separate `firstName`/`lastName`, normalising to all three values the database stores
  - Write unit tests: valid payload, malformed email, missing intent, out-of-enum intent, empty and whitespace-only name, each length boundary at limit and limit+1, and multi-error single-pass reporting
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.9_

- [x] 3. Wire the schema into `POST /api/leads`
  - Replace the truthiness check at `src/app/api/leads/route.ts:14` with `leadSubmissionSchema.safeParse`
  - Return 422 with per-field errors on rejection; return 400 for malformed JSON
  - Build all downstream values from the parsed result rather than the raw body
  - Write route-handler tests importing the exported `POST` with a constructed `NextRequest`, mocking `@/lib/db`: 201 happy path, 422 for each rejection case, 400 on malformed JSON
  - _Requirements: 2.6, 2.7, 2.8_

- [x] 4. Make the lead write atomic
  - Wrap the lead insert and the four follow-up inserts in `db.transaction()`
  - Keep the `Promise.allSettled` integration fan-out outside the transaction so a Resend or Twilio failure cannot discard a stored lead
  - Return 500 when the transaction fails, so the client does not report false success
  - Write a test that forces the follow-up insert to fail and asserts the lead insert is rolled back
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Add the missing indexes
  - Add to `src/lib/db/schema.ts`: composite `(status, scheduled_for)` on `follow_ups`; `(lead_id)` on `follow_ups`, `conversations`, and `analytics_events`; `(email)` non-unique and `(created_at)` on `leads`
  - Do not add a unique constraint on `leads.email` — a repeat client legitimately submits twice
  - Use the array-returning `extraConfig` form; the object-returning form is the legacy overload in Drizzle 0.45
  - Add `src/lib/db/schema.test.ts` asserting each index exists, that the composite orders the equality column first, and that no unique index is declared — these read the schema via `getTableConfig`, so they run without a database
  - _Requirements: 3.6, 4.1, 4.2, 4.3, 4.4, 4.5_

  **Verified without a database:** `drizzle-kit generate` against a dummy URL reported the expected index counts (leads 2, follow_ups 2, conversations 1, analytics_events 1, ab_tests 0) and emitted `CREATE INDEX "leads_email_idx"` — not `CREATE UNIQUE INDEX` — confirming 4.5. The generated migration was removed afterwards, since the project applies schema with `db:push` and `/drizzle` is gitignored.

  **Blocked on the operator:** `npm run db:push` and the `EXPLAIN ANALYZE` confirmation could not be run. There is no `.env.local` in the working tree and no `DATABASE_URL` in the environment, and `drizzle.config.ts:7` throws without one. The indexes exist in the schema but are **not yet applied to the Neon database.** Someone with the connection string must run `npm run db:push`, then confirm the cron query plan with:

  ```sql
  EXPLAIN ANALYZE
  SELECT * FROM follow_ups
  WHERE status = 'scheduled' AND scheduled_for <= now();
  ```

  expecting an `Index Scan using follow_ups_status_scheduled_for_idx` rather than `Seq Scan`. Note that on a small table Postgres may still prefer a sequential scan because it is genuinely cheaper; `SET enable_seqscan = off` within the session confirms the index is usable if so.

- [x] 6. Build the shared submit helper and wire `/get-started`
  - Create `src/lib/api/submit-lead.ts` exporting `submitLead` returning a discriminated union for success, field errors, and general failure
  - Replace the `console.log`, 1500ms fake delay, and `alert()` in `src/app/(marketing)/get-started/page.tsx` with a real submit
  - Render a loading state that blocks duplicate submission, an inline success confirmation, and field-level errors mapped from the 422 response
  - Write tests for the helper (201, 422, network failure) and a component test asserting each UI state
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 7. Wire the homepage inquiry modal
  - Replace the `console.log` at `src/components/forms/ServicesInquiryForm.tsx:69` with a call to the same `submitLead` helper
  - Map the service picker values (`buying`, `selling`, `both`, `general`) onto the canonical `intent` enum, since the picker vocabulary does not match the schema
  - Render the same loading, success, and error states as `/get-started`
  - Write an equivalent component test, including one asserting the intent mapping
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 8. Verify the spec end to end
  - Run `npm test`, `npm run typecheck`, and `npm run build`
  - Submit through `/get-started` in a browser and confirm the row appears in the database and then in the dashboard
  - Submit through the homepage modal and confirm the intent recorded matches the service selected
  - _Requirements: 1.2, 1.3, 1.4, 5.1, 5.2_

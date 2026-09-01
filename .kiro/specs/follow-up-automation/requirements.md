# Follow-Up Automation Reliability — Requirements

## Introduction

The automated follow-up drip is the product's differentiator and it has never run. Its schedule is defined in a file the hosting platform ignores, its authentication passes anyone through when a secret is unset, and its send loop can double-send, time out, and permanently discard a touchpoint on a transient network error.

This spec makes the drip reliable and turns it on. Per the agreed MVP scope it sends templated email rather than AI-generated email, with the AI path kept behind a seam so it can be enabled later as a configuration change. That decision also removes AWS Bedrock from the critical path, so the drip can ship before AWS model access is arranged.

## Current state

Verified by reading source:

- `vercel.json` defines both cron schedules. The site deploys to Netlify, which ignores that file entirely. **No schedule exists today.** Netlify's own scheduled functions cannot substitute directly: they only target functions in the Netlify functions directory and, per Netlify's documentation, "you can't invoke scheduled functions directly with a URL."
- Both schedules are `0 7 * * *`, which is 07:00 UTC — 02:00 or 03:00 Eastern depending on daylight saving, not the "7 AM" the code comments claim.
- Cron auth is fail-open: `if (cronSecret && authHeader !== ...)` at `api/cron/follow-ups/route.ts:25` and `api/cron/daily-summary/route.ts:24`. With `CRON_SECRET` unset both endpoints are public, and `POST` aliases to `GET` on both.
- The send loop (`api/cron/follow-ups/route.ts:66-133`) selects due rows, then for each one awaits a Bedrock call, awaits a Resend call, awaits a 500 ms sleep (line 131), then updates status. There is no claim step between the select and the update, so two overlapping runs process the same rows.
- A failure sets `status: 'failed'` permanently with `failureReason: 'Send failed'` — a generic string that discards the actual error. There is no attempt counter, no backoff, and no requeue.
- Two unchecked casts corrupt the lead shape: line 99 casts `leadRow.propertyInterest ?? 'general'` to `Lead['intent']`, but `'general'` is not in that union; line 103 casts `leadRow.status` to `Lead['status']`, where the database enum has ten values and the TypeScript union has six with only partial overlap.
- `POST /api/leads` inserts only `day3`, `day7`, `day14`, and `day30`. The immediate follow-up is sent inline with no `follow_ups` row, so dashboard counts undercount by one per lead.
- `api/cron/daily-summary/route.ts` hardcodes `const yesterdayLeads = []` with a `// TODO: Fetch leads from database` and a commented-out Prisma-style example in a Drizzle codebase. It emails an empty digest every morning regardless of reality.
- `follow-up-scheduler.ts:101-102` hardcodes `previousMessage: 'N/A'` and `history: 'Initial contact'`, while the `day3` and `day14` prompts instruct the model to "reference something specific from your previous conversations." The `conversations` table that would supply this is never written.
- `follow-up-scheduler.ts:109` assigns `const lines = ...` and never uses it. `calculateFollowUpSchedule` and `processPendingFollowUps` are exported but imported nowhere, and disagree with the live inline logic in the route — the scheduler version emits an `immediate` row, the route does not.
- Doc comments carry stale platform guidance: `api/cron/follow-ups/route.ts:16-18` describes a `netlify.toml` block that was never created, and `api/cron/daily-summary/route.ts:11-16` describes `vercel.json`.

## Requirements

### Requirement 1 — Templated follow-up content

**User Story:** As Joey, I want the drip to send well-written email without depending on AI infrastructure, so that the sequence works before Bedrock access is arranged.

#### Acceptance Criteria

1. WHEN a follow-up is sent THEN its content SHALL be produced from a template for that touchpoint
2. WHERE a touchpoint exists in the schedule THE set of templates SHALL cover `immediate`, `day3`, `day7`, `day14`, and `day30`
3. WHEN a template renders THEN it SHALL incorporate the lead's name and intent
4. WHEN a template renders THEN it SHALL NOT reference prior conversations, shared resources, or client stories that do not exist
5. WHEN a lead has no recorded name THEN the greeting SHALL read naturally rather than inserting a placeholder mid-sentence
6. WHEN lead-supplied values are placed into email content THEN they SHALL be escaped using the helper from the untrusted-input-hardening spec
7. WHEN a template renders THEN its tone SHALL match the established voice: first-name greeting, conversational, a clear next step, signed simply

### Requirement 2 — Pluggable content source

**User Story:** As a developer, I want AI generation to be a swappable content source, so that enabling it later is configuration rather than a rewrite.

#### Acceptance Criteria

1. WHEN a follow-up needs content THEN it SHALL be obtained through a content-source abstraction
2. WHEN no content source is configured THEN the templated source SHALL be used
3. WHEN the AI content source is enabled by configuration THEN the Bedrock path SHALL be used instead
4. WHEN the templated source is active THEN no AWS credentials SHALL be required and no Bedrock call SHALL occur
5. WHEN the AI source is active but fails THEN the failure SHALL be handled by the retry policy rather than silently producing no email
6. WHEN dead code is identified in the scheduler THEN it SHALL be removed rather than left to contradict the live path

### Requirement 3 — Fail-closed cron authentication

**User Story:** As Joey, I want the cron endpoints to reject unauthenticated callers, so that nobody can trigger my email sequence on demand.

#### Acceptance Criteria

1. WHEN a cron endpoint receives a request without a bearer secret THEN it SHALL return HTTP 401
2. WHEN the bearer secret does not match THEN it SHALL return HTTP 401
3. WHEN `CRON_SECRET` is not configured on the server THEN the endpoint SHALL reject the request rather than allow it through
4. WHEN the bearer secret matches THEN the endpoint SHALL process normally
5. WHEN a request is rejected THEN no email SHALL be sent and no database row SHALL be modified
6. WHERE both cron endpoints exist THE same policy SHALL apply to each, including their `POST` aliases

### Requirement 4 — Exactly-once sending

**User Story:** As a lead, I want to receive each follow-up once, so that I do not get duplicate email from overlapping job runs.

#### Acceptance Criteria

1. WHEN due follow-ups are processed THEN each row SHALL be claimed by a conditional update before any send is attempted
2. WHEN two runs process concurrently THEN each due row SHALL be sent exactly once
3. WHEN a row is claimed THEN its state SHALL distinguish "in progress" from "scheduled" and "sent"
4. WHEN a run claims work THEN it SHALL claim a bounded batch rather than every due row, so a backlog cannot exceed the function time limit
5. WHEN a run completes THEN the response SHALL report how many were sent, how many failed, and whether work remains
6. WHEN a lead referenced by a follow-up no longer exists THEN the row SHALL be marked failed with a reason and processing SHALL continue
7. WHEN a database lead row is mapped to the scheduler's lead shape THEN values outside the expected set SHALL be normalised rather than cast unchecked

### Requirement 5 — Bounded retry

**User Story:** As Joey, I want a transient network error to be retried, so that one bad moment does not silently cost me a touchpoint.

#### Acceptance Criteria

1. WHEN a send fails THEN the attempt count for that row SHALL be incremented
2. WHEN a send fails and the attempt count is below the maximum THEN the row SHALL return to `scheduled` for a later run
3. WHEN a send fails and the attempt count has reached the maximum THEN the row SHALL be marked `failed`
4. WHEN a row is marked failed THEN the recorded reason SHALL describe the actual error rather than a generic string
5. WHEN a row is claimed but the run terminates before recording an outcome THEN a subsequent run SHALL be able to recover the row rather than leaving it stranded

### Requirement 6 — Accurate touchpoint records

**User Story:** As Joey, I want the dashboard to show every touchpoint, so that the counts reflect what was actually sent.

#### Acceptance Criteria

1. WHEN a lead is created THEN a follow-up row SHALL be recorded for the immediate touchpoint as well as the scheduled ones
2. WHEN the immediate follow-up is sent successfully THEN its row SHALL be marked sent
3. WHEN the immediate follow-up fails THEN its row SHALL reflect the failure and be eligible for retry
4. WHEN the dashboard displays follow-up counts THEN they SHALL include the immediate touchpoint

### Requirement 7 — Working daily summary

**User Story:** As Joey, I want the morning digest to list yesterday's real leads, so that the email is worth opening.

#### Acceptance Criteria

1. WHEN the daily summary runs THEN it SHALL query leads created during the previous day
2. WHEN leads exist for that period THEN the digest SHALL list them
3. WHEN no leads exist for that period THEN the digest SHALL report that accurately
4. WHEN the summary is generated THEN it SHALL NOT contain guidance or examples for an ORM the project does not use

### Requirement 8 — A real schedule

**User Story:** As Joey, I want follow-ups to go out every morning without me doing anything, so that the sequence runs on its own.

#### Acceptance Criteria

1. WHEN the project is deployed THEN the scheduling mechanism SHALL be one the hosting platform actually honours
2. WHEN the schedule fires THEN it SHALL correspond to approximately 7 AM Eastern, accounting for the schedule being expressed in UTC
3. WHEN scheduling configuration exists in the repository THEN it SHALL NOT reference a platform the project does not deploy to
4. WHEN code comments describe the scheduling mechanism THEN they SHALL describe the mechanism actually in use
5. WHEN the schedule is documented THEN the documentation SHALL include the exact URL, method, and header required to configure it

## Out of scope

- Writing `conversations` rows, which is what would let `day3` and `day14` reference real history
- Populating `analytics_events` or activating `ab_tests`
- Enabling the Bedrock content source in production — the seam is built, the flip is deferred
- An unsubscribe link, though this is noted as a CAN-SPAM exposure for a five-email sequence
- Moving the send loop to a queue or background function

# Follow-Up Automation Reliability — Tasks

- [x] 1. Write the templated follow-up bodies
  - Create `src/lib/services/follow-up-content.ts` with templates for `immediate`, `day3`, `day7`, `day14`, and `day30`
  - Keep the established voice: first-name greeting, conversational, one clear next step, signed simply
  - Do not reference prior conversations, shared resources, or client stories that do not exist — the current `day3` and `day14` prompts do this while `previousMessage` is hardcoded to `'N/A'`
  - Take a resolved greeting and a separate optional name so subject lines omit the name entirely when absent, rather than producing "Quick check-in, there"
  - Escape lead-supplied values using the helper from the untrusted-input-hardening spec
  - Write a snapshot test per touchpoint, a nameless-lead test, and an injection-payload test
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Introduce the content-source seam
  - Define `FollowUpContentSource` with `templateContentSource` and `aiContentSource`, and a `getContentSource()` that returns templates unless an env flag selects AI
  - Refactor `sendFollowUp` in `follow-up-scheduler.ts` to obtain content from the source and to return a result object carrying a failure reason instead of a bare boolean
  - Delete the unused `lines` variable at line 109, plus `calculateFollowUpSchedule` and `processPendingFollowUps`, which are dead and contradict the live route logic
  - Write tests asserting templates are used by default with no Bedrock call, and that the AI source is selected when the flag is set
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3. Make cron authentication fail closed
  - Create `src/lib/api/cron-auth.ts` with `requireCronAuth` returning 401 for an absent header, a mismatched secret, or an unset `CRON_SECRET`
  - Apply it to both cron routes and their `POST` aliases, replacing the fail-open `if (cronSecret && ...)` at `follow-ups/route.ts:25` and `daily-summary/route.ts:24`
  - Write tests for absent header, wrong secret, correct secret, and unset secret — each asserting no email was sent and no row modified on rejection
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Add the claim mechanism and bounded batch
  - Add `'sending'` to the `follow_up_status` enum and an `attempts` integer column defaulting to 0 in `src/lib/db/schema.ts`, then `npm run db:push`
  - Create `src/lib/db/follow-up-queue.ts` with `claimDueFollowUps`, `markSent`, `recordFailure`, and `countRemainingDue`
  - Claim with a single atomic `UPDATE ... RETURNING` that also reclaims `'sending'` rows staler than a threshold well beyond any function time limit
  - Restructure the cron loop to claim a bounded batch before any send I/O, and remove the 500 ms sleep at line 131 which is unnecessary without the LLM call
  - Report sent, failed, and whether work remains in the response
  - Create `src/lib/services/lead-mapping.ts` to replace the unchecked casts at lines 99 and 103, normalising `propertyInterest` into the intent union and mapping the ten-value database status enum onto the six-value TypeScript union explicitly
  - Write a test running two claim-and-process passes against the same due rows asserting exactly one send each, plus stranded-row reclaim tests and lead-mapping tests
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 5. Add bounded retry
  - Increment `attempts` on failure, returning the row to `scheduled` below the maximum and marking it `failed` at the maximum
  - Record the actual error as `failureReason` rather than the generic `'Send failed'`
  - Write tests for a transient failure requeuing with incremented attempts, and for exhausting the attempt budget
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6. Record the immediate touchpoint
  - Insert a `follow_ups` row for the immediate touchpoint in `POST /api/leads`, alongside the four scheduled ones, inside the existing transaction
  - Mark it sent when the immediate send succeeds, and leave it eligible for retry when it fails
  - Write a test asserting a submission produces five rows with the immediate one reflecting its send outcome
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 7. Make the daily summary real
  - Replace the hardcoded `yesterdayLeads = []` in `api/cron/daily-summary/route.ts` with a query over the previous day's leads
  - Delete the commented-out Prisma-style example
  - Write tests asserting seeded leads appear in the digest and that a genuinely empty day reports accurately
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 8. Give it a real schedule
  - Delete `vercel.json`, which Netlify ignores entirely
  - Remove the stale `netlify.toml` guidance at `follow-ups/route.ts:16-18` and the `vercel.json` guidance at `daily-summary/route.ts:11-16`, replacing them with the mechanism actually in use
  - Record the cron-job.org configuration in this spec — URL, `GET`, `Authorization: Bearer <CRON_SECRET>`, and `0 11 * * *` UTC for roughly 7 AM Eastern — with the daily summary offset by 30 minutes
  - Note why Netlify scheduled functions cannot be used: they only target functions in the Netlify functions directory and cannot be invoked by URL
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 9. Verify the spec
  - Run `npm test`, `npm run typecheck`, and `npm run build`
  - Hit the endpoint with no `Authorization` header and confirm 401 where it previously returned 200 and sent email
  - Seed due follow-ups, trigger twice in quick succession, and confirm one email per row
  - Force a send failure and confirm the row returns to `scheduled` with `attempts` incremented, then confirm it lands on `failed` with a real reason once the budget is exhausted
  - Submit a lead and confirm the dashboard shows five touchpoints with one already sent
  - Seed two leads and confirm the digest lists both
  - _Requirements: 3.1, 4.2, 5.1, 5.3, 6.4, 7.2_

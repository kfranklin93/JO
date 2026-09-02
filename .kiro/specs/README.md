# MVP Specs — Status and Execution Order

Five specs that take the site from "forms don't submit" to a working MVP: a visitor submits a form → the lead is stored → Joey is notified → Joey sees it in a dashboard that isn't trivially breachable → a follow-up drip fires on schedule.

Each spec directory holds `requirements.md`, `design.md`, and `tasks.md`.

> **Read this first if you are picking up the work.** Four of the five specs are implemented. **Only Spec 4 (`follow-up-automation`) remains, and none of its nine tasks have started.** The Neon database is reachable and its schema is current. Details in [Implementation status](#implementation-status) below.

---

## Execution order

```mermaid
graph LR
    S1["1. lead-capture-pipeline<br/>done"] --> S2["2. untrusted-input-hardening<br/>done"]
    S1 --> S3["3. dashboard-session-security<br/>done"]
    S2 --> S4["4. follow-up-automation<br/>REMAINING"]
    S5["5. design-token-restoration<br/>done"]
```

| # | Spec | Status | Why this position |
|---|---|---|---|
| 1 | `lead-capture-pipeline` | Done | Nothing else mattered until forms actually submitted. |
| 2 | `untrusted-input-hardening` | Done | Spec 1 is what makes visitor text reach email and AI prompts. |
| 3 | `dashboard-session-security` | Done | Spec 1 put real client PII behind a cookie whose value was a plaintext string committed to this repo. |
| 4 | `follow-up-automation` | **Remaining** | Turn the drip on now that inputs are sanitised. Largest spec; also the one with no schedule at all today. |
| 5 | `design-token-restoration` | Done | Touched no shared code, so it ran independently. |

Spec 4's prerequisites (1 and 2) are both complete, so there is nothing left blocking it in the dependency graph.

---

## What each spec does

**1. `lead-capture-pipeline`** — Wire both forms to `POST /api/leads`. Add server-side Zod validation (the `src/lib/validation/` directory was empty), wrap the lead and follow-up inserts in a transaction (there were no transactions anywhere in `src`), and add the six missing indexes (the schema had zero).

**2. `untrusted-input-hardening`** — Escape lead text in outbound HTML email including the `mailto:`/`tel:` attribute contexts, delimit lead data in AI prompts so a submission can't rewrite Joey's outbound email, fix a `$`-expansion bug in `fillPromptTemplate`, add Twilio signature validation to the previously-unauthenticated SMS webhook, and make missing env vars fail with a named 503 instead of degrading silently.

**3. `dashboard-session-security`** — Replace the hardcoded `'joey_dashboard_authenticated'` cookie value (duplicated in three files) with an HMAC-signed token carrying an expiry. Verification runs in Node-runtime code at both data boundaries; `proxy.ts` keeps a presence-only check for the redirect. Stays on cookie auth per the steering constraint.

**4. `follow-up-automation`** — Give the drip a schedule that the host actually honours, make cron auth fail closed, add a claim step so overlapping runs can't double-send, add bounded retry, and fix the daily summary that emails an empty digest every morning. Sends templated email for MVP with the Bedrock path behind a seam.

**5. `design-token-restoration`** — Migrate the palette into a `@theme` block so Tailwind v4 actually generates the tokens, remove the `bg-[black]`/`text-[white]` workarounds and the contrast bugs they caused, and fix `error.tsx` nesting a second `<html>` document.

---

## Implementation status

Verified on the current tree: `npm run typecheck` passes, `npm test` reports **460 passing across 23 files**, and `npm run build` completes clean — no middleware deprecation warning, and `proxy.ts` is picked up as `ƒ Proxy (Middleware)`.

### Specs 1, 2, 3, and 5: complete

All tasks checked off in their respective `tasks.md`. Landmarks you can grep for if you want to confirm quickly:

| Spec | Evidence on disk |
|---|---|
| 1 | `src/lib/validation/lead.ts`, `db.transaction()` in `src/app/api/leads/route.ts`, six indexes in `src/lib/db/schema.ts`, `src/lib/api/submit-lead.ts` wired into both forms |
| 2 | `src/lib/utils/escape.ts`, `src/lib/utils/require-env.ts`, Twilio `validateRequest` in `src/app/api/sms/webhook/route.ts` |
| 3 | `src/lib/auth/session.ts`, `src/lib/auth/rate-limit.ts`, `src/proxy.ts`; `middleware.ts` deleted and no hardcoded token constant remains |
| 5 | `@theme` block in `src/app/globals.css`; `tailwind.config.ts` deleted; `src/app/global-error.tsx` plus a document-shell-free `src/app/error.tsx` |

### Spec 4: not started

All nine tasks are unchecked and the code confirms it:

| Task | Current state |
|---|---|
| 1. Templated bodies | `src/lib/services/follow-up-content.ts` does not exist |
| 2. Content-source seam | `processPendingFollowUps` still live at `follow-up-scheduler.ts:163` |
| 3. Fail-closed cron auth | `if (cronSecret && ...)` still fail-open at `follow-ups/route.ts:28` and `daily-summary/route.ts:27` |
| 4. Claim + bounded batch | `src/lib/db/follow-up-queue.ts` does not exist; see the schema gaps below |
| 5. Bounded retry | Depends on task 4 |
| 6. Immediate touchpoint | Database holds 4 follow-ups per lead, not 5 |
| 7. Real daily summary | `yesterdayLeads` is still a hardcoded empty array with the commented-out Prisma example below it |
| 8. Real schedule | `vercel.json` still present and still ignored by Netlify |
| 9. Verification | — |

---

## Database status

**The Neon database is reachable and Spec 1's schema changes are applied.** This reverses the blocker recorded in earlier revisions of this file.

Confirmed by direct read-only inspection:

- `DATABASE_URL` is set in `.env.local`, pointing at `ep-summer-breeze-axv50rqg.c-4.us-east-2.aws.neon.tech`, database `neondb`, PostgreSQL 18.6
- All five tables exist: `leads`, `follow_ups`, `conversations`, `analytics_events`, `ab_tests`
- **All six Spec 1 indexes are live**, so `npm run db:push` has run: `follow_ups_status_scheduled_for_idx`, `follow_ups_lead_id_idx`, `conversations_lead_id_idx`, `analytics_events_lead_id_idx`, `leads_email_idx`, `leads_created_at_idx`
- `leads_email_idx` is non-unique and there is no `_key` index on `leads`, satisfying requirement 4.5 — a repeat client can legitimately submit twice
- Data is flowing: 5 leads, 20 follow-ups, 0 conversations. The 4-per-lead ratio is what `POST /api/leads` writes today; expect 5 once Spec 4 task 6 lands.

### Schema changes Spec 4 still needs

Both gaps in task 4 are confirmed absent from the live database:

- `follow_up_status` is `scheduled, sent, delivered, opened, clicked, replied, failed` — **no `'sending'`**, which the claim mechanism depends on
- `follow_ups` has **no `attempts` column**, which bounded retry needs

One `npm run db:push` after editing `schema.ts` applies both. Adding an enum value and a defaulted integer column are additive, so no data loss. Note that Postgres cannot easily remove an enum value once added, so `'sending'` is effectively permanent — worth getting the name right the first time.

Optional confirmation of the cron query plan once `'sending'` and `attempts` are in place:

```sql
EXPLAIN ANALYZE
SELECT * FROM follow_ups
WHERE status = 'scheduled' AND scheduled_for <= now();
```

Expect `Index Scan using follow_ups_status_scheduled_for_idx`. On a 20-row table Postgres may legitimately prefer a sequential scan because it is genuinely cheaper; `SET enable_seqscan = off` in the session confirms the index is usable if so.

---

## Remaining blockers

### Missing environment variable

**`SESSION_SECRET` is not in `.env.local`.** Spec 3 introduced it and made login return 503 without it, so **dashboard login is currently broken locally.** Generate one and add it:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Everything else Spec 4 needs is present locally: `DATABASE_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `JOEY_EMAIL`, and the AWS Bedrock set. (Presence and non-emptiness were checked; values were not inspected.)

### Operator tasks

| Item | Gates |
|---|---|
| `SESSION_SECRET` locally and in Netlify | Dashboard login, Spec 3 verification |
| Mirror all `.env.local` vars into Netlify | Any deployed verification |
| Verified Resend sender | Spec 4 task 9's live email checks |
| cron-job.org job | Spec 4 task 8 |
| DNS + Resend domain | Cosmetic until launch |
| Bedrock model access | **Not needed for MVP** — the drip is templated. Only needed to flip the Spec 4 task 2 flag later. |

Every env var addition in Netlify needs a manual redeploy.

### What is not blocked

All nine Spec 4 tasks can proceed. Tasks 1, 2, 3, 7, and 8 need no database at all; tasks 4, 5, and 6 need `db:push`, which now works.

---

## Findings that changed the specs

Recorded here because they contradict things stated elsewhere in the repo. The Tailwind and error-boundary items are now **fixed** by Spec 5, but the reasoning is kept because the misleading documents are still on disk.

**Tailwind v4 never loaded `tailwind.config.ts`.** `globals.css` had `@import "tailwindcss"` with no `@config` and no `@theme` — grepping every CSS file for all four v4 directives returned zero matches. Per Tailwind's upgrade guide, JS configs "are no longer detected automatically in v4." So every custom token generated no CSS: `bg-navy`, `text-cerulean`, `shadow-soft`, `max-w-content`, and all five `Button.tsx` variants. Built-ins like `bg-white` still worked, which is why the site looked partly right. **Fixed in Spec 5**: the palette lives in a `@theme` block and `tailwind.config.ts` is deleted.

`quiet-luxury-visual-fix-plan.md` at the repo root **misdiagnosed this** as missing tokens and prescribed adding them to `tailwind.config.ts`. That file no longer exists, so the document is now actively misleading and should be deleted or rewritten. The steering rule in `.kiro/steering/project.md` has been corrected to name the `@theme` block.

**Four competing intent vocabularies, not three.** `src/config/form-fields.ts` offers `general` to users while `follow-up-scheduler.ts` omitted it — which is exactly why `api/cron/follow-ups/route.ts:99` casts `'general'` into a union that lacks it. The specs adopt the `LeadIntent` enum from `src/types/lead.ts` as canonical, since it is the declared type system and a superset. A test asserts the legacy `buying`/`selling`/`both` spellings are rejected so the vocabulary cannot drift back. **Spec 4 task 4 removes the last two unchecked casts** via `src/lib/services/lead-mapping.ts`.

**Netlify scheduled functions cannot drive a Next route handler.** They only target functions in the Netlify functions directory and, per Netlify's docs, cannot be invoked by URL. `vercel.json` currently defines both crons and Netlify ignores it entirely, so **no schedule exists today.** Spec 4 uses cron-job.org, which is what HANDOFF.md always specified. Both current entries are also `0 7 * * *` = 2-3am Eastern, not the 7am the comments claim.

**`middleware.ts` is deprecated in Next 16**, renamed to `proxy.ts`. The docs also state proxy "should not attempt relying on shared modules or globals," which is why Spec 3 put session verification in Node-runtime code rather than in the interceptor. **Done**: `src/proxy.ts` ships and the build reports no deprecation warning.

**`error.tsx` should use `unstable_retry`, not `reset`.** The shipped docs at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` show `unstable_retry` was added in v16.2.0 and is now recommended: `reset()` only clears error state without re-fetching, so on a data-driven page it re-renders straight back into the same error. **Done in Spec 5.**

**Two bugs found while implementing Spec 1**, both fixed:

- The lead schema's name rule was first written as a cross-field `superRefine`. Zod skips refinements when the base object already has errors, so a submission with a bad email *and* no name reported only the email — the visitor fixes it, resubmits, then discovers the second problem. Now a preprocess step plus a required field, so everything reports in one pass. Regression test included.
- `leads.email` should **not** get a unique constraint, contrary to the initial analysis. A repeat client legitimately submits twice (buy now, sell in three years) and a unique index would turn the second inquiry into a 500. The duplicate-from-retry problem it appeared to solve was caused by the partial write, which the transaction fixes.

---

## Pre-existing issues left alone

Out of scope, but they will show up:

- **Five 501 stubs**, all still placeholders: `/api/ai/chat`, `/api/ai/follow-up`, `/api/analytics`, `/api/lofty/sync`, `/api/lofty/webhook`. HANDOFF.md lists only the first two.
- **No migration history.** `/drizzle` is gitignored and only `db:push` is used, so schema changes are not reviewable. Adopting migrations is a deploy-workflow change and needs a decision. This matters more now that Spec 4 mutates an enum.
- **`src/lib/services/database-service.ts`** is a complete, correct data layer imported nowhere — confirmed still unreferenced. The routes hand-roll their own queries.
- **Name splitting happens in three places** — the route, the schema, and `lofty.ts:26`.
- **20 markdown docs at the repo root**, several stale. `IMPLEMENTATION_COMPLETE.md` sits alongside five 501 stubs, and `quiet-luxury-visual-fix-plan.md` now points at a deleted file.
- **`.gitignore` ignores `.env*`**, so the `.env.example` that HANDOFF tells you to copy cannot be committed.
- **HANDOFF.md's overview says Claude 4.5 Sonnet**; its own table and the code say 3.5. Code and `env.ts` agree with each other.
- **HANDOFF.md and this file's earlier revisions claimed there was no database connection.** There is. Treat HANDOFF's setup section with suspicion.

The previously-noted build warning about Next inferring the workspace root as `/Users/rwilliams/Projects/` does not reproduce on the current machine — the build output is clean. It was an artefact of the original author's checkout location, not a repo defect.

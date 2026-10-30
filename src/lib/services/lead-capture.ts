/**
 * Lead capture pipeline.
 *
 * Extracted verbatim in behaviour from the inline body of `POST /api/leads` so
 * there is exactly one implementation of "a new lead arrived". The HTTP route is
 * now a translator: it turns a `Request` into raw input and turns the outcome
 * below into a status code. Everything that decides *what happens to a lead*
 * lives here.
 *
 * The extraction exists because there was no server-side entry point at all.
 * `src/lib/api/submit-lead.ts` is a browser helper that posts to a relative
 * `/api/leads`, which cannot resolve from inside a route handler, so any other
 * server-side caller — the AI assistant's `capture_lead` tool being the one that
 * forced the issue — had either to duplicate this logic or to fabricate an
 * absolute URL and pay for a second function invocation to reach itself.
 *
 * {@link captureLead} is therefore transport-agnostic on purpose: it takes
 * unknown raw input, validates it with `leadSubmissionSchema`, and returns
 * either the new lead id or the per-field errors. No `Request`, no `fetch`, no
 * `NextResponse`.
 *
 * ## What it does not do
 *
 * It does not decide status codes, and it does not catch. A missing variable
 * surfaces as `MissingEnvError` and a failed write surfaces as whatever the
 * driver threw, because a non-HTTP caller needs to distinguish "your input was
 * wrong" (a value it can ask the user to correct) from "the deployment is
 * broken" (a value it cannot). Collapsing both into one return shape would have
 * made the assistant apologise for the visitor's typo and for a dead database in
 * the same words.
 */

import { eq } from 'drizzle-orm';
import { db, leads, followUps } from '@/lib/db';
import type { leadSourceEnum } from '@/lib/db/schema';
import { markSent, recordFailure } from '@/lib/db/follow-up-queue';
import { sendImmediateFollowUp } from '@/lib/services/follow-up-scheduler';
import type { Lead } from '@/lib/services/follow-up-scheduler';
import { sendLeadToLofty } from '@/lib/api/lofty';
import { notifyJoeyOfNewLead } from '@/lib/services/email-service';
import { recordFreshConsent } from '@/lib/services/email-preferences';
import { sendSMSAlert } from '@/lib/services/sms-service';
import {
  formatFieldErrors,
  leadSubmissionSchema,
  type LeadSubmission,
} from '@/lib/validation/lead';
import { requireEnv } from '@/lib/utils/require-env';

/** The touchpoint this call sends itself, rather than leaving to the cron. */
export const IMMEDIATE_TEMPLATE_TYPE = 'immediate';

/** A label the database's `lead_source` enum accepts. */
export type LeadSourceValue = (typeof leadSourceEnum)['enumValues'][number];

/**
 * Where a lead arrived from, when the caller does not say.
 *
 * The public form and every other HTTP caller land here, which is what they
 * stored before this became a parameter at all.
 */
export const DEFAULT_LEAD_SOURCE: LeadSourceValue = 'website_form';

/**
 * The source a lead captured in conversation records.
 *
 * Requires the matching enum label in the database — see
 * src/lib/db/lead-source-schema.sql, which must be applied before any deploy
 * that writes this.
 */
export const ASSISTANT_CHAT_SOURCE: LeadSourceValue = 'assistant_chat';

/**
 * Every follow-up touchpoint created alongside a new lead.
 *
 * The immediate one is included even though this call sends it inline. It was
 * previously sent with no row at all, which cost the dashboard a touchpoint per
 * lead and — worse — left a failed immediate send with nothing to retry from.
 *
 * It is inserted as `sending`, not `scheduled`. The transaction commits before
 * the inline send finishes, so for that window the row exists but the email does
 * not. A cron run landing in that window would find a `scheduled` row that is
 * already due and claim it, and the lead would get the same email twice.
 * `sending` means the row arrives already claimed by this call, so the cron's
 * claim predicate passes over it. The cost is that a process killed between the
 * commit and the outcome update leaves the row in `sending` — which is exactly
 * the stranded-row case the claim's STALE_CLAIM_MS reclaim exists for, so it
 * self-heals on a later run instead of being lost.
 */
export const FOLLOW_UP_SCHEDULE = [
  { templateType: IMMEDIATE_TEMPLATE_TYPE, offsetDays: 0, status: 'sending' },
  { templateType: 'day3', offsetDays: 3, status: 'scheduled' },
  { templateType: 'day7', offsetDays: 7, status: 'scheduled' },
  { templateType: 'day14', offsetDays: 14, status: 'scheduled' },
  { templateType: 'day30', offsetDays: 30, status: 'scheduled' },
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Which outbound integrations actually succeeded for this lead. */
export interface LeadIntegrationOutcomes {
  followUp: boolean;
  loftyCRM: boolean;
  emailNotification: boolean;
  smsAlert: boolean;
}

/**
 * The result of a capture attempt.
 *
 * A discriminated union rather than a thrown error for the validation case,
 * because a rejected payload is an ordinary outcome that every caller has to
 * handle: the route turns it into a 422 and the assistant turns it into a
 * question for the client. Only genuine faults throw.
 */
export type LeadCaptureOutcome =
  | { ok: true; leadId: string; integrations: LeadIntegrationOutcomes }
  | { ok: false; fieldErrors: Record<string, string> };

/** What the transaction commits: the lead row plus the id needed to close out
 *  the immediate touchpoint. */
interface PersistedLead {
  lead: { id: string; createdAt: Date };
  immediateFollowUpId: string;
}

/**
 * Move the immediate follow-up's row out of `sending` to match what happened.
 *
 * Delegates to the queue rather than issuing its own UPDATE so the retry policy
 * stays in one place: `recordFailure` is what decides that a first failure is
 * worth another attempt, and it returns the row to `scheduled` so the next cron
 * run picks it up (Requirement 6.3).
 *
 * `currentAttempts` is 0 because the row was created by this call and the inline
 * send was its first delivery attempt.
 *
 * A failure to write the outcome is logged and swallowed. The lead is already
 * committed and the email has already been sent or not; turning that into a
 * thrown error would tell the visitor to submit again and duplicate the lead.
 * The row stays in `sending` and is reclaimed after the queue's staleness
 * threshold.
 */
async function recordImmediateOutcome(
  followUpId: string,
  failureReason: string | null
): Promise<void> {
  try {
    if (failureReason === null) {
      await markSent(followUpId);
    } else {
      await recordFailure(followUpId, failureReason, 0);
    }
  } catch (error) {
    console.error('❌ Failed to record the immediate follow-up outcome:', error);
  }
}

/**
 * Write the lead and its whole follow-up schedule, atomically.
 *
 * A partial write previously left an orphaned lead behind while the caller
 * reported failure, so the visitor retried and produced a duplicate with a
 * second drip sequence.
 *
 * The WebSocket driver in src/lib/db/index.ts supports transactions; the
 * neon-http driver would not.
 */
async function persistLead(
  submission: LeadSubmission,
  source: LeadSourceValue
): Promise<PersistedLead> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(leads)
      .values({
        email: submission.email,
        phone: submission.phone ?? null,
        firstName: submission.firstName,
        lastName: submission.lastName ?? null,
        fullName: submission.fullName,
        propertyInterest: submission.intent,
        timeline: submission.timeline ?? null,
        formData: {
          budget: submission.budget ?? null,
          location: submission.location ?? null,
          bedrooms: submission.bedrooms ?? null,
          bathrooms: submission.bathrooms ?? null,
          propertyType: submission.propertyType ?? null,
          additionalNotes: submission.additionalNotes ?? null,
        },
        status: 'new',
        // The DB `lead_source` enum and the `LeadSource` type enum in
        // src/types/lead.ts use different vocabularies, so this is the DB
        // value, chosen by the caller rather than translated. It used to be the
        // literal 'website_form', which made a chat lead indistinguishable from
        // a form submission in the dashboard.
        source,
      })
      .returning();

    const inserted = rows[0];
    if (!inserted) {
      // Throwing rather than returning keeps the rollback path uniform.
      throw new Error('Lead insert returned no row');
    }

    const followUpRows = await tx
      .insert(followUps)
      .values(
        FOLLOW_UP_SCHEDULE.map(({ templateType, offsetDays, status }) => ({
          leadId: inserted.id,
          templateType,
          scheduledFor: new Date(
            inserted.createdAt.getTime() + offsetDays * MS_PER_DAY
          ),
          status,
        }))
      )
      .returning({ id: followUps.id, templateType: followUps.templateType });

    const immediate = followUpRows.find(
      (row) => row.templateType === IMMEDIATE_TEMPLATE_TYPE
    );
    if (!immediate) {
      // Without this id the row cannot be moved out of `sending`, so it would
      // sit there until the staleness reclaim and then be sent a second time.
      // Rolling back and reporting failure lets the visitor retry into a clean
      // record instead, matching how a missing lead row is handled above.
      throw new Error('Immediate follow-up insert returned no row');
    }

    return { lead: inserted, immediateFollowUpId: immediate.id };
  });
}

/**
 * Capture a lead from raw, untrusted input.
 *
 * The one entry point for both transports. Order is load-bearing:
 *
 *   1. Validate. A bad payload must be reported as a bad payload even on a
 *      half-configured deploy, so this runs before the configuration check.
 *   2. Assert configuration, before the write rather than after. A missing
 *      variable then means nothing was stored and nothing was sent, so the
 *      visitor's retry once it is set cannot produce a duplicate lead with a
 *      second drip sequence.
 *   3. Persist, atomically.
 *   4. Notify, outside the persistence path.
 *
 * This is the INSERT path, and the only one that creates a follow-up drip. A
 * caller holding a lead that already exists — the chat assistant, whose model
 * re-calls `capture_lead` on later turns — must use {@link updateCapturedLead}
 * instead. Calling this twice for one conversation is what put six rows and
 * sixteen queued emails behind one person.
 *
 * @param options.source which touchpoint this lead arrived through. Defaults to
 *   the public form, which is what every caller stored before this existed.
 *
 * @throws MissingEnvError when the deployment lacks DATABASE_URL or
 *   RESEND_API_KEY — before anything is written.
 * @throws whatever the driver throws if the transaction cannot commit. Nothing
 *   is persisted and no integration has run in that case.
 */
export async function captureLead(
  rawInput: unknown,
  options: { source?: LeadSourceValue } = {}
): Promise<LeadCaptureOutcome> {
  const parsed = leadSubmissionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, fieldErrors: formatFieldErrors(parsed.error) };
  }

  // Everything downstream reads from the validated result. The raw input is not
  // touched again, so no unvalidated value can reach the database or an email.
  const submission = parsed.data;

  requireEnv('DATABASE_URL', 'RESEND_API_KEY');

  const { lead: savedLead, immediateFollowUpId } = await persistLead(
    submission,
    options.source ?? DEFAULT_LEAD_SOURCE
  );

  console.log('New lead saved to database:', savedLead.id);

  // Optional keys are absent rather than undefined on `submission`, so
  // spreading the remainder satisfies exactOptionalPropertyTypes without a
  // conditional per field.
  const { fullName, firstName, lastName, email, intent, ...optionalDetails } =
    submission;

  const lead: Lead = {
    id: savedLead.id,
    name: fullName,
    email,
    intent,
    createdAt: savedLead.createdAt,
    status: 'new',
    ...optionalDetails,
  };

  const succeeded = (result: PromiseSettledResult<boolean>): boolean =>
    result.status === 'fulfilled' && result.value;

  // Someone who previously unsubscribed and has now filled in a form — or given
  // their email to the chat assistant — has asked to be contacted again. That is
  // fresh consent, so the suppression is cleared.
  //
  // This must happen BEFORE the immediate follow-up, not after: that send goes
  // through the suppression check like every other client email, so clearing it
  // afterwards would silently swallow the one reply the person is actually
  // waiting for.
  //
  // Scoped to this function on purpose. Every caller of `captureLead` is a
  // person entering their own address. A bulk importer must NOT route through
  // here — a spreadsheet is not consent, and running this across one would undo
  // every opt-out on the list at once.
  await recordFreshConsent(lead.email, 'form');

  // Integrations run outside the persistence path. A Resend or Twilio outage
  // must not discard a lead that is already stored.
  //
  // The immediate follow-up is awaited first, on its own, because Joey's
  // notification states whether the lead has actually heard from us. Running it
  // alongside the notification meant that claim could not be based on the real
  // outcome, so it was hardcoded and became a lie whenever the send failed.
  const [followUpResult] = await Promise.allSettled([
    sendImmediateFollowUp(lead),
  ]);

  const immediateFollowUpSent =
    followUpResult!.status === 'fulfilled' && followUpResult!.value.ok;

  // Null on success. Otherwise the real reason — a thrown error stringified, or
  // the reason the send result carried — so `failure_reason` on the row says
  // what actually went wrong rather than a generic 'Send failed'.
  const immediateFailureReason: string | null = immediateFollowUpSent
    ? null
    : followUpResult!.status === 'rejected'
      ? String(followUpResult!.reason)
      : followUpResult!.value.ok
        ? null
        : followUpResult!.value.reason;

  if (immediateFailureReason !== null) {
    console.error('❌ Immediate follow-up failed:', immediateFailureReason);
  }

  // Before the notifications, because the row is the durable record of what
  // happened. The notifications are advisory; this is what the dashboard reads
  // and what the cron retries from.
  await recordImmediateOutcome(immediateFollowUpId, immediateFailureReason);

  const [loftyResult, emailResult, smsResult] = await Promise.allSettled([
    sendLeadToLofty(lead),
    notifyJoeyOfNewLead(lead, { immediateFollowUpSent }),
    sendSMSAlert(
      `🔥 New ${lead.intent.toUpperCase()} Lead`,
      `${lead.name}\n${lead.email}\n${lead.phone ?? 'No phone'}\n${lead.location ?? ''} | ${lead.budget ?? ''}`
    ),
  ]);

  if (immediateFollowUpSent) {
    console.log('✅ Immediate follow-up sent to:', lead.email);
  }

  if (succeeded(loftyResult)) {
    console.log('✅ Lead synced to Lofty CRM');
  } else {
    console.warn('⚠️  Lofty CRM sync skipped or failed');
  }

  if (succeeded(emailResult)) {
    console.log('✅ Joey notified via email');
  } else {
    console.error('❌ Failed to send email notification');
  }

  if (succeeded(smsResult)) {
    console.log('✅ Joey notified via SMS');
  } else {
    console.warn('⚠️  SMS notification skipped or failed');
  }

  return {
    ok: true,
    leadId: savedLead.id,
    integrations: {
      followUp: immediateFollowUpSent,
      loftyCRM: succeeded(loftyResult),
      emailNotification: succeeded(emailResult),
      smsAlert: succeeded(smsResult),
    },
  };
}

/**
 * A field the caller supplied a second, different value for.
 *
 * `kept` is what the row already held and still holds. `proposed` is what was
 * offered and deliberately not written. See {@link updateCapturedLead}.
 */
export interface LeadFieldConflict {
  field: string;
  kept: string;
  proposed: string;
}

/**
 * The result of adding detail to a lead that already exists.
 *
 * `rejected` carries the same per-field errors `captureLead` returns, so a
 * caller can keep one validation path. `missing` means the id named no row —
 * which a caller holding a stale id should treat as "capture afresh", not as
 * the client's fault.
 */
export type LeadUpdateOutcome =
  | {
      status: 'updated';
      leadId: string;
      /** Fields that were empty and now hold a value. */
      filled: string[];
      /** Fields whose stored value was kept against a different one. */
      conflicts: LeadFieldConflict[];
    }
  | { status: 'rejected'; fieldErrors: Record<string, string> }
  | { status: 'missing' };

/** Empty for this purpose: never set, or set to whitespace. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return String(value).trim() === '';
}

/** Case- and whitespace-insensitive, so "Buy " and "buy" are not a conflict. */
function sameValue(held: unknown, proposed: string | number): boolean {
  return (
    String(held).trim().toLowerCase() === String(proposed).trim().toLowerCase()
  );
}

/**
 * Add detail to a lead that already exists, writing the lead row and nothing
 * else.
 *
 * ## Why this is not `persistLead` with an upsert
 *
 * `persistLead` inserts the lead and its five follow-up touchpoints in one
 * transaction. Reusing it to "update" is what produced the production damage
 * this function exists to stop: four duplicate rows meant four drips, which
 * queued sixteen follow-up emails to one address.
 *
 * So, explicitly, this writes:
 *
 *   - the `leads` row named by `leadId`: fields that are currently empty, the
 *     `notes` audit line described below, and `updatedAt`.
 *
 * and this does NOT write, touch or send:
 *
 *   - any `follow_ups` row — no new drip, and no change to the existing one;
 *   - the immediate follow-up email, Joey's new-lead email, the SMS alert, or
 *     the Lofty CRM sync, all of which announce a lead that is not new;
 *   - a fresh consent record, since the email address is never overwritten
 *     here, so the address that consented is still the address on the row;
 *   - `id`, `createdAt`, `status` or `source`. A conversation that keeps talking
 *     is not a new lead and is not a lead from somewhere else.
 *
 * ## The rule for a field that already has a value
 *
 * Fill blanks; never overwrite. A stored value wins over a later, different one,
 * and the difference is appended to the lead's `notes` with a timestamp so
 * nothing is lost.
 *
 * The reason is that the server cannot tell a correction from a mistake. The
 * model re-calls `capture_lead` mostly with what it already sent, so a value
 * that differs is either the client correcting themselves or the model garbling
 * what it was told. Overwriting would let the second case redirect a drip to an
 * address the client never gave; dropping it silently would lose the first.
 * Keeping the stored value and recording the proposal does neither: the drip
 * keeps going to the address the person actually confirmed, and Joey can see in
 * the row that a different one was offered.
 *
 * @throws MissingEnvError when DATABASE_URL is absent — before anything is
 *   written. RESEND_API_KEY is not required, because this path sends nothing.
 * @throws whatever the driver throws if the transaction cannot commit.
 */
export async function updateCapturedLead(
  leadId: string,
  rawInput: unknown
): Promise<LeadUpdateOutcome> {
  // The same validation the insert path runs, in the same order: a bad payload
  // is reported as a bad payload even on a half-configured deploy, and a caller
  // can put one field back to the client rather than guessing at a default.
  const parsed = leadSubmissionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { status: 'rejected', fieldErrors: formatFieldErrors(parsed.error) };
  }

  const submission = parsed.data;

  requireEnv('DATABASE_URL');

  return db.transaction(async (tx) => {
    // Read and write in one transaction so two turns landing together cannot
    // both see the same field as empty and both fill it.
    const [existing] = await tx
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!existing) return { status: 'missing' as const };

    const patch: Partial<typeof leads.$inferInsert> = {};
    const filled: string[] = [];
    const conflicts: LeadFieldConflict[] = [];

    /** Fill one top-level column, or record that it already said otherwise. */
    const considerColumn = (
      field: string,
      held: unknown,
      proposed: string | undefined,
      write: (value: string) => void
    ): void => {
      if (proposed === undefined) return;
      if (isBlank(held)) {
        write(proposed);
        filled.push(field);
        return;
      }
      if (!sameValue(held, proposed)) {
        conflicts.push({
          field,
          kept: String(held).trim(),
          proposed: proposed.trim(),
        });
      }
    };

    considerColumn('email', existing.email, submission.email, (value) => {
      patch.email = value;
    });
    considerColumn('fullName', existing.fullName, submission.fullName, (value) => {
      patch.fullName = value;
    });
    considerColumn('firstName', existing.firstName, submission.firstName, (value) => {
      patch.firstName = value;
    });
    considerColumn('lastName', existing.lastName, submission.lastName, (value) => {
      patch.lastName = value;
    });
    considerColumn('phone', existing.phone, submission.phone, (value) => {
      patch.phone = value;
    });
    considerColumn('intent', existing.propertyInterest, submission.intent, (value) => {
      patch.propertyInterest = value;
    });
    considerColumn('timeline', existing.timeline, submission.timeline, (value) => {
      patch.timeline = value;
    });

    // `form_data` is where the insert path puts the softer details, so this
    // path reads and rewrites the same keys rather than inventing columns.
    const heldForm: Record<string, unknown> =
      existing.formData !== null &&
      typeof existing.formData === 'object' &&
      !Array.isArray(existing.formData)
        ? { ...(existing.formData as Record<string, unknown>) }
        : {};

    const nextForm = { ...heldForm };
    let formChanged = false;

    const considerFormField = (
      field: string,
      proposed: string | number | undefined
    ): void => {
      if (proposed === undefined) return;
      const held = heldForm[field];
      if (isBlank(held)) {
        nextForm[field] = proposed;
        formChanged = true;
        filled.push(field);
        return;
      }
      if (!sameValue(held, proposed)) {
        conflicts.push({
          field,
          kept: String(held).trim(),
          proposed: String(proposed).trim(),
        });
      }
    };

    considerFormField('budget', submission.budget);
    considerFormField('location', submission.location);
    considerFormField('bedrooms', submission.bedrooms);
    considerFormField('bathrooms', submission.bathrooms);
    considerFormField('propertyType', submission.propertyType);
    // Notes are treated like every other field — filled when empty, recorded in
    // the audit line when they differ — rather than concatenated. One rule is
    // easier to reason about than a per-field exception, and nothing is lost
    // either way: the new text ends up in `notes` if it is not written here.
    considerFormField('additionalNotes', submission.additionalNotes);

    if (formChanged) patch.formData = nextForm;

    if (conflicts.length > 0) {
      const detail = conflicts
        .map((c) => `${c.field} kept "${c.kept}", offered "${c.proposed}"`)
        .join('; ');
      const line =
        `[assistant ${new Date().toISOString()}] a later capture_lead offered ` +
        `different values and the stored ones were kept — ${detail}`;
      patch.notes =
        existing.notes === null || existing.notes.trim() === ''
          ? line
          : `${existing.notes}\n${line}`;
    }

    if (Object.keys(patch).length === 0) {
      // Nothing new was said. Not even `updated_at` is touched, so a repeated
      // identical capture leaves no trace at all — which is what makes this
      // idempotent rather than merely non-duplicating.
      return { status: 'updated' as const, leadId, filled, conflicts };
    }

    await tx
      .update(leads)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    return { status: 'updated' as const, leadId, filled, conflicts };
  });
}

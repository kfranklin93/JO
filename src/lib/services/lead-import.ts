/**
 * The dashboard's two write paths for leads Joey enters himself.
 *
 * {@link createManualLead} is one referral typed into a form.
 * {@link previewImport} and {@link runImport} are the bulk client-database
 * import: the first says what would happen, the second does it.
 *
 * ## Why this is not `captureLead`
 *
 * `persistLead` in src/lib/services/lead-capture.ts writes a lead row *and*
 * five `follow_ups` rows in one transaction, and `captureLead` around it then
 * sends the first email, clears any suppression on the address as fresh
 * consent, notifies Joey, texts Joey and syncs to Lofty. Every one of those is
 * correct for a visitor who just typed their own address into a form on the
 * site. Every one of them is wrong for a spreadsheet.
 *
 * Run 200 of Joey's past clients through that path and the arithmetic is: 1,000
 * queued marketing emails to people who never opted in, 200 "New Lead" emails
 * to Joey, 200 texts, and — the part that cannot be undone — every unsubscribe
 * among them silently cleared, because `recordFreshConsent` treats the write as
 * the person asking to be contacted again. src/lib/services/email-preferences.ts
 * says so at the definition: a CSV from a spreadsheet is not consent. For a
 * licensed agent that is CAN-SPAM exposure, and it would spend the deliverability
 * of a sending domain that was verified days ago.
 *
 * So this module does not import `captureLead`, `persistLead`,
 * `recordFreshConsent`, `notifyJoeyOfNewLead`, `sendImmediateFollowUp`,
 * `sendSMSAlert` or `sendLeadToLofty`, and it does not call `POST /api/leads`.
 *
 * ## Exactly what the import path writes
 *
 *   - one row in `leads` per accepted contact: `email`, `phone`, `first_name`,
 *     `last_name`, `full_name`, `property_interest` (`general`), `status` (the
 *     mapped enum value), `source` (`other`), `notes` (Joey's note plus the
 *     provenance line), `form_data` (the spreadsheet word it came from), and the
 *     defaulted columns the table fills itself.
 *
 * and exactly what it does not write or send:
 *
 *   - **no `follow_ups` rows.** Not scheduled, not sending, not any. This is
 *     the consent constraint and it is asserted by a test.
 *   - no email of any kind — not the immediate follow-up, not Joey's new-lead
 *     notification;
 *   - no SMS, no Lofty CRM sync;
 *   - nothing in `email_opt_outs`. No consent recorded, no suppression cleared.
 *     Anyone on that list stays on it.
 *   - no `conversations` and no `analytics_events` rows.
 *
 * The manual single-entry path writes the same row, and additionally writes the
 * five `follow_ups` rows **only** when the caller passes
 * `scheduleFollowUps: true` — the checkbox Joey has to tick. It still records no
 * consent and clears no suppression in either case; see
 * {@link createManualLead}.
 */

import { randomUUID } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import { db, leads, followUps } from '@/lib/db';
import { FOLLOW_UP_SCHEDULE } from '@/lib/services/lead-capture';
import {
  dedupeKey,
  importedNotes,
  IMPORT_INTENT,
  planImport,
  type ImportPlan,
  type ImportPlanOutcome,
  type PlannedLead,
} from '@/lib/services/lead-import-plan';
import type { LeadStatusValue } from '@/lib/validation/lead-status';
import type { LeadSubmission } from '@/lib/validation/lead';
import { requireEnv } from '@/lib/utils/require-env';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The `lead_source` value for a row Joey entered or imported.
 *
 * Neither path asks where the contact came from, so anything more specific
 * would be invented. `referral` would be a claim, `phone_call` would be a
 * claim; `other` says only "not the website form, not an inbound text", which
 * is all that is actually known. The provenance line in `notes` carries the
 * part that matters — that this row arrived by hand rather than by consent.
 */
const MANUAL_SOURCE = 'other' as const;

/**
 * Addresses already in the lead table, from among the ones offered.
 *
 * Scoped to the candidates rather than reading every address in the table, so
 * the query cost tracks the size of the import and not the size of the client
 * list. Compared on `lower(email)` because rows written before
 * `leadSubmissionSchema` started lowercasing may hold mixed case, and a
 * case-sensitive match would let `Bob@Example.com` import a second time
 * alongside `bob@example.com`.
 */
async function existingEmails(candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set<string>();

  const rows = await db
    .select({ email: leads.email })
    .from(leads)
    .where(inArray(sql<string>`lower(${leads.email})`, candidates));

  return new Set(rows.map((row) => dedupeKey(row.email)));
}

/**
 * Plan the import against the live lead table.
 *
 * Planned twice on purpose. The first pass runs with an empty existing-rows set
 * purely to find out which addresses the text actually contains *after*
 * validation and normalisation, so the database lookup asks about exactly the
 * keys the dedupe will later compare — rather than a second, parallel
 * normalisation written here that could drift from the one in
 * `leadSubmissionSchema`. The second pass is the real plan. Both passes are
 * pure and bounded by `MAX_IMPORT_ROWS`, so the cost is a parse of at most a
 * thousand rows.
 */
export async function previewImport(text: string): Promise<ImportPlanOutcome> {
  requireEnv('DATABASE_URL');

  const dry = planImport(text, new Set<string>());
  if (!dry.ok) return dry;

  const candidates = dry.plan.create.map((row) => dedupeKey(row.email));

  return planImport(text, await existingEmails(candidates));
}

/** A row that was written, so the caller can report it and find it again. */
export interface ImportedLead {
  id: string;
  line: number;
  fullName: string;
  email: string;
  status: LeadStatusValue;
}

/**
 * What an import actually did.
 *
 * `plan` is the plan as re-evaluated at commit time, not the one shown in the
 * preview, so the counts describe this write and not an earlier screen. `wrote`
 * says plainly whether anything landed: the insert is one transaction, so
 * either every planned row is in the table or none of them is, and the report
 * must not leave that ambiguous.
 */
export interface ImportResult {
  plan: ImportPlan;
  created: ImportedLead[];
  /** Always 0. Returned rather than assumed so the UI can state it. */
  followUpsCreated: 0;
  wrote: boolean;
  batchId: string;
}

export type ImportOutcome =
  | { ok: true; result: ImportResult }
  | { ok: false; error: string };

/**
 * Run the import.
 *
 * Re-plans against the table rather than trusting a plan handed in from the
 * browser. Two reasons: a client-supplied plan is a client-supplied list of
 * rows to insert, which is a write primitive the dashboard has no business
 * exposing; and the table can have changed between the preview and the
 * confirmation, so an address that was new a minute ago may not be now.
 *
 * All accepted rows go in one transaction. A row that fails validation has
 * already been held back by the plan, so the only way the write can fail is a
 * database fault — and in that case nothing is written at all, which is the
 * honest outcome to report for a 200-contact import. A partially imported list
 * with no record of where it stopped is the thing that cannot be cleaned up.
 */
export async function runImport(text: string): Promise<ImportOutcome> {
  const planned = await previewImport(text);
  if (!planned.ok) return planned;

  const plan = planned.plan;
  const batchId = randomUUID();

  if (plan.create.length === 0) {
    return {
      ok: true,
      result: { plan, created: [], followUpsCreated: 0, wrote: false, batchId },
    };
  }

  const at = new Date();

  const created = await db.transaction(async (tx) =>
    tx
      .insert(leads)
      .values(plan.create.map((row) => importRowValues(row, at, batchId)))
      .returning({ id: leads.id, email: leads.email })
  );

  // Matched back to the plan by email, which is unique within a plan by
  // construction — that is what the dedupe pass guarantees.
  const idByEmail = new Map(created.map((row) => [dedupeKey(row.email), row.id]));

  const createdRows: ImportedLead[] = plan.create.flatMap((row) => {
    const id = idByEmail.get(dedupeKey(row.email));
    return id === undefined
      ? []
      : [
          {
            id,
            line: row.line,
            fullName: row.fullName,
            email: row.email,
            status: row.status,
          },
        ];
  });

  console.log(
    `[dashboard:import] batch=${batchId} wrote ${createdRows.length} lead(s), ` +
      `0 follow-ups, skipped ${plan.skipped.length}, rejected ${plan.rejected.length}`
  );

  return {
    ok: true,
    result: {
      plan,
      created: createdRows,
      followUpsCreated: 0,
      wrote: true,
      batchId,
    },
  };
}

/** The column values for one imported contact. Nothing outside `leads`. */
function importRowValues(
  row: PlannedLead,
  at: Date,
  batchId: string
): typeof leads.$inferInsert {
  const parts = row.fullName.split(/\s+/).filter(Boolean);
  const lastName = parts.slice(1).join(' ');

  return {
    email: row.email,
    phone: row.phone,
    firstName: parts[0] ?? row.fullName,
    lastName: lastName === '' ? null : lastName,
    fullName: row.fullName,
    propertyInterest: IMPORT_INTENT,
    status: row.status,
    source: MANUAL_SOURCE,
    notes: importedNotes(row, at),
    // Machine-readable alongside the human-readable note, so a later correction
    // of the lossy `Active` mapping can be driven by a query rather than by
    // parsing prose out of `notes`.
    formData: {
      importedAt: at.toISOString(),
      importBatchId: batchId,
      spreadsheetStatus: row.spreadsheetStatus,
      followUpSequence: 'not scheduled — imported contact, no email consent',
    },
  };
}

/** Where a synced row came from, in the two forms the row has to record. */
export interface SyncedLeadOrigin {
  /** The pipeline stage to file the row under. */
  status: LeadStatusValue;
  /** Human-readable provenance, appended to `notes` for Joey to read. */
  provenance: string;
  /** Machine-readable provenance, merged into `form_data` for queries. */
  formData: Record<string, unknown>;
}

/** The row a sync wrote. */
export interface SyncedLeadResult {
  leadId: string;
  /** Always 0. Returned rather than assumed so the caller can state it. */
  followUpsCreated: 0;
}

/**
 * Write one lead that arrived from an outside system, with no drip and no
 * notification.
 *
 * This is the bulk-import write with its provenance supplied by the caller,
 * and it exists so a sync does not get a second write path. The whole reason
 * this module is separate from `lead-capture.ts` applies unchanged to a contact
 * synced out of an external contact book: the person is in somebody else's
 * system, they never typed their address into a form on this site, and routing
 * them through the website path would queue five marketing emails each, email
 * and text Joey once each, and clear every unsubscribe among them. See this
 * module's header for the arithmetic.
 *
 * So, exactly as with the spreadsheet, this writes one row in `leads` and
 * nothing else:
 *
 *   - `email`, `phone`, `first_name`, `last_name`, `full_name`,
 *     `property_interest` (the submission's intent), `timeline`, `status` and
 *     `source` (`other`);
 *   - `notes` — the caller's provenance line, after any note the submission
 *     carried;
 *   - `form_data` — the caller's machine-readable provenance.
 *
 * and does not write or send:
 *
 *   - **any `follow_ups` row.** Not scheduled, not sending, none. There is no
 *     option to ask for one, unlike {@link createManualLead}, because no
 *     outside system can consent on a person's behalf.
 *   - any email, SMS or CRM sync;
 *   - anything in `email_opt_outs` — no consent recorded, no suppression
 *     cleared. Anyone on that list stays on it.
 *
 * `submission` has already been through `leadSubmissionSchema`, so a synced
 * lead cannot be a shape the rest of the app does not expect.
 *
 * @throws MissingEnvError when DATABASE_URL is absent, before anything is
 *   written. RESEND_API_KEY is not required: this path sends nothing.
 */
export async function createSyncedLead(
  submission: LeadSubmission,
  origin: SyncedLeadOrigin
): Promise<SyncedLeadResult> {
  requireEnv('DATABASE_URL');

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
        status: origin.status,
        // Same value and same reasoning as the hand-entered and imported rows
        // above: `other` says only "not the website form, not an inbound text",
        // which is all that is actually known. The provenance line carries the
        // part that matters — which system this row came out of.
        source: MANUAL_SOURCE,
        notes:
          submission.additionalNotes === undefined
            ? origin.provenance
            : `${submission.additionalNotes}\n\n${origin.provenance}`,
        formData: {
          ...origin.formData,
          ...(submission.additionalNotes === undefined
            ? {}
            : { additionalNotes: submission.additionalNotes }),
        },
      })
      .returning({ id: leads.id });

    const inserted = rows[0];
    if (!inserted) throw new Error('Lead insert returned no row');

    return { leadId: inserted.id, followUpsCreated: 0 as const };
  });
}

/** What a manual entry wrote. */
export interface ManualLeadResult {
  leadId: string;
  status: LeadStatusValue;
  /** 0 when the follow-up box was left unticked, 5 when it was ticked. */
  followUpsCreated: number;
}

/**
 * Create one lead from the dashboard's Add Lead form.
 *
 * `submission` has already been through `leadSubmissionSchema`, the same
 * validation a website submission passes, so a hand-entered lead cannot be a
 * shape the rest of the app does not expect.
 *
 * ## The follow-up decision
 *
 * `scheduleFollowUps` is the caller's, and the form defaults it to off. A lead
 * Joey types in has not consented to a marketing sequence by existing: a
 * referral who asked him to call is a different person from a name he wrote
 * down after a phone call, and only Joey knows which this is. Off by default
 * means the mistake costs a tick of a box; on by default means the mistake is
 * five emails to someone who never asked, which cannot be taken back.
 *
 * When it is ticked, the five touchpoints of `FOLLOW_UP_SCHEDULE` are written
 * in the same transaction as the lead, so a lead can never exist with half a
 * sequence behind it.
 *
 * Two deliberate differences from the website path:
 *
 *   - the immediate touchpoint is inserted as `scheduled` and due now, not as
 *     `sending`. `sending` on the website path means "this request is about to
 *     send it inline"; nothing sends inline here, so a `sending` row would sit
 *     claimed-by-nobody until the queue's staleness reclaim. `scheduled` and
 *     due means the next cron run sends it, which is the mechanism that already
 *     exists for every other touchpoint.
 *   - no suppression is cleared. `recordFreshConsent` is for a person typing
 *     their own address; Joey ticking a box on their behalf is not that. If the
 *     address has unsubscribed, the sends will be suppressed as they should be,
 *     and Joey can contact them by hand.
 *
 * @throws MissingEnvError when DATABASE_URL is absent, before anything is
 *   written. RESEND_API_KEY is not required: this path sends nothing.
 */
export async function createManualLead(
  submission: LeadSubmission,
  options: { status: LeadStatusValue; scheduleFollowUps: boolean }
): Promise<ManualLeadResult> {
  requireEnv('DATABASE_URL');

  const at = new Date();
  const note =
    `[manual ${at.toISOString()}] entered by hand in the dashboard — ` +
    `status "${options.status}", follow-up sequence ` +
    `${options.scheduleFollowUps ? 'requested by Joey' : 'not scheduled'}.`;

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
        status: options.status,
        source: MANUAL_SOURCE,
        notes:
          submission.additionalNotes === undefined
            ? note
            : `${submission.additionalNotes}\n\n${note}`,
        formData: {
          enteredAt: at.toISOString(),
          enteredBy: 'dashboard',
          followUpSequence: options.scheduleFollowUps
            ? 'scheduled at Joey’s request'
            : 'not scheduled',
          ...(submission.additionalNotes === undefined
            ? {}
            : { additionalNotes: submission.additionalNotes }),
        },
      })
      .returning({ id: leads.id, createdAt: leads.createdAt });

    const inserted = rows[0];
    if (!inserted) throw new Error('Lead insert returned no row');

    if (!options.scheduleFollowUps) {
      return {
        leadId: inserted.id,
        status: options.status,
        followUpsCreated: 0,
      };
    }

    const written = await tx
      .insert(followUps)
      .values(
        FOLLOW_UP_SCHEDULE.map(({ templateType, offsetDays }) => ({
          leadId: inserted.id,
          templateType,
          scheduledFor: new Date(
            inserted.createdAt.getTime() + offsetDays * MS_PER_DAY
          ),
          // See the doc block: `scheduled`, never `sending`, because the cron
          // is what sends these and a `sending` row has no sender.
          status: 'scheduled' as const,
        }))
      )
      .returning({ id: followUps.id });

    return {
      leadId: inserted.id,
      status: options.status,
      followUpsCreated: written.length,
    };
  });
}

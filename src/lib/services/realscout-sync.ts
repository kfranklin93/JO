/**
 * The pull direction: RealScout contacts become leads in Joey's dashboard.
 *
 * This is the half the owner asked for. The Home Value widget on `/sell-home`
 * and the search widgets capture people **into RealScout**, not into this
 * database, so without this a seller who asks for a valuation never appears in
 * the dashboard at all.
 *
 * ## No watermark table
 *
 * Every run asks for a window that overlaps the last one —
 * {@link SYNC_WINDOW_DAYS} back from now — rather than reading a stored
 * "last synced at". The alternative needs a new table, which means a schema
 * change, and it has a failure mode this does not: a watermark written after a
 * partially failed run skips whatever the run did not reach, and nothing ever
 * notices. An overlapping window cannot drift. It re-reads the same contacts
 * every day, which is only a cost if applying a contact twice does something —
 * and it does not, because the write below is keyed and idempotent. RealScout's
 * own sync guide recommends exactly this ("you'll see a few contacts twice;
 * that's harmless as long as applying a contact is safe to repeat"), and seven
 * days of overlap against a 60-list-calls-a-minute budget is one or two calls.
 *
 * ## THE CONSENT CONSTRAINT
 *
 * `persistLead` in lead-capture.ts writes a lead **and five `follow_ups` rows**
 * in one transaction, and `captureLead` around it sends the first email, clears
 * any suppression on the address as fresh consent, emails Joey, texts Joey and
 * syncs to Lofty. Running Joey's RealScout book through that is hundreds of
 * marketing emails to people who never opted in to *this* site: CAN-SPAM
 * exposure for a licensed agent, and it would spend the deliverability of a
 * sending domain verified days ago. email-preferences.ts states the principle
 * at the definition of `recordFreshConsent`: a bulk list is not consent.
 *
 * So this module does not import `captureLead` or anything that sends. It
 * writes through `createSyncedLead` in lead-import.ts — the path the CSV
 * importer already established for exactly this problem — which writes one row
 * in `leads` and nothing else. **A sync creates zero `follow_ups` rows**, and a
 * test asserts it.
 *
 * RealScout's own suppression is honoured the same way: `emailable` is carried
 * onto the row, and because no synced contact gets a touchpoint, a contact
 * RealScout cannot email is never put on a path that emails them either.
 *
 * ## Deduplication
 *
 * `leads.email` is deliberately **not** unique — one person is legitimately
 * both a buyer and a seller lead — so the email cannot be the key. This follows
 * the precedent of the duplicate-lead fix in the assistant's chat route
 * (`1b66b6f`), which stopped keying on the email and started keying on the
 * stable identity of the thing being synced. See {@link alreadySynced}.
 */

import { inArray, or, sql } from 'drizzle-orm';
import { db, leads } from '@/lib/db';
import { createSyncedLead } from '@/lib/services/lead-import';
import {
  contactToLeadInput,
  syncFormData,
  syncProvenanceNote,
  REALSCOUT_CONTACT_ID_KEY,
} from '@/lib/services/realscout-mapping';
import {
  pagesOfRealScoutContacts,
  realScoutConfigured,
  RealScoutError,
  type RealScoutContact,
} from '@/lib/services/realscout';
import { leadSubmissionSchema } from '@/lib/validation/lead';
import { requireEnv } from '@/lib/utils/require-env';

/**
 * How far back each run looks. Seven days, so a week of failed or skipped runs
 * self-heals without an operator doing anything.
 */
export const SYNC_WINDOW_DAYS = 7;

/** Hard stop on pages per run, so one invocation cannot page forever. */
export const MAX_SYNC_PAGES = 20;

/** Status every synced lead is filed under. */
const SYNCED_STATUS = 'new' as const;

/** Canonical v4-shaped UUID, which is what `leads.id` holds. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Why a contact in the window produced no new lead. */
export type SkipReason =
  | 'already_synced'
  | 'already_ours'
  | 'no_email'
  | 'email_too_long'
  | 'rejected';

/** One contact the run did not write, and why. */
export interface SkippedContact {
  contactId: string;
  reason: SkipReason;
  detail: string | null;
}

/** What a run did. Every figure is about this run, not a cumulative total. */
export interface SyncReport {
  /** False when REALSCOUT_API_TOKEN is absent — nothing ran, nothing failed. */
  configured: boolean;
  /** The `updated_after` value sent, so a log says what window was read. */
  updatedAfter: string;
  /** Contacts RealScout returned inside the window. */
  seen: number;
  /** New `leads` rows written. */
  created: number;
  /** Always 0. The consent constraint, stated in the report. */
  followUpsCreated: 0;
  skipped: SkippedContact[];
  /** True when MAX_SYNC_PAGES was hit, so the window was not fully read. */
  truncated: boolean;
  /** Contacts RealScout flagged as not emailable, carried for the log. */
  notEmailable: number;
  /** New lead ids, so a caller can report or undo what one run created. */
  createdLeadIds: string[];
}

/**
 * Which of these contacts this app already holds a lead for.
 *
 * ## The dedup rule
 *
 * Two keys, in this order, and the email is not one of them:
 *
 *  1. **`external_user_key`, when the contact has one.** This site sets it to
 *     the lead's own UUID when it pushes a lead into RealScout (see
 *     realscout-push.ts), so a contact carrying a key that names a row in
 *     `leads` is a contact *we created from that lead*. Syncing it back would
 *     produce a second copy of a lead this app already has — the write loop
 *     RealScout's sync guide warns about. Skipped as `already_ours`.
 *  2. **The RealScout contact `id`**, recorded on every row this sync writes as
 *     `form_data.realscoutContactId`. Contacts created inside RealScout never
 *     have an `external_user_key` — the spec says it can only be set at
 *     creation — so the key the task names is absent for exactly the contacts
 *     this sync exists to pull, and something stable is needed for them.
 *     Skipped as `already_synced`.
 *
 * The contact `id` is the right fallback rather than the email because it does
 * not change when the person changes their address, it is unique per contact
 * where `leads.email` is non-unique by design, and `external_user_key` is
 * documented as not enforced unique — so it is a convenience, not a map. That
 * is the same reasoning as the chat route's fix: key on the stable identity of
 * the external thing, never on the address.
 *
 * Both lookups are scoped to the contacts in hand, so the query cost tracks the
 * size of the window and not the size of the lead table.
 */
async function alreadySynced(contacts: RealScoutContact[]): Promise<{
  byContactId: Set<string>;
  byLeadId: Set<string>;
}> {
  const contactIds = [...new Set(contacts.map((contact) => contact.id))];

  // Only UUID-shaped keys are offered to the comparison. `leads.id` is a
  // Postgres `uuid`, and comparing it against arbitrary external text is an
  // invalid-input error rather than a non-match.
  const leadIdKeys = [
    ...new Set(
      contacts
        .map((contact) => contact.external_user_key)
        .filter((key): key is string => typeof key === 'string' && UUID_PATTERN.test(key)),
    ),
  ];

  if (contactIds.length === 0 && leadIdKeys.length === 0) {
    return { byContactId: new Set<string>(), byLeadId: new Set<string>() };
  }

  const contactIdExpr = sql<string>`${leads.formData}->>${REALSCOUT_CONTACT_ID_KEY}`;

  const conditions = [
    ...(contactIds.length > 0 ? [inArray(contactIdExpr, contactIds)] : []),
    ...(leadIdKeys.length > 0 ? [inArray(leads.id, leadIdKeys)] : []),
  ];

  const rows = await db
    .select({ id: leads.id, contactId: contactIdExpr })
    .from(leads)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions));

  return {
    byContactId: new Set(
      rows
        .map((row) => row.contactId)
        .filter((value): value is string => typeof value === 'string' && value !== ''),
    ),
    byLeadId: new Set(rows.map((row) => row.id)),
  };
}

/**
 * Pull every RealScout contact changed in the window and write the new ones.
 *
 * An absent token is reported as `configured: false` and is not an error: a
 * deployment without RealScout has nothing to sync, and failing the cron would
 * put a red run in the schedule every day for a condition nobody is fixing.
 *
 * A RealScout failure *does* throw, as a {@link RealScoutError}, so the route
 * can report which kind it was. Anything already written stays written — each
 * contact is its own transaction, and the overlapping window means the next run
 * picks up whatever this one did not reach.
 */
export async function syncRealScoutContacts(
  options: { now?: Date; windowDays?: number } = {},
): Promise<SyncReport> {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? SYNC_WINDOW_DAYS;
  const updatedAfter = new Date(
    now.getTime() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  if (!realScoutConfigured()) {
    return {
      configured: false,
      updatedAfter,
      seen: 0,
      created: 0,
      followUpsCreated: 0,
      skipped: [],
      truncated: false,
      notEmailable: 0,
      createdLeadIds: [],
    };
  }

  requireEnv('DATABASE_URL');

  const skipped: SkippedContact[] = [];
  const createdLeadIds: string[] = [];
  let seen = 0;
  let notEmailable = 0;
  let pages = 0;

  for await (const page of pagesOfRealScoutContacts(
    { updated_after: updatedAfter, sort: 'created_at', order: 'DESC' },
    MAX_SYNC_PAGES,
  )) {
    pages++;
    seen += page.data.length;

    const held = await alreadySynced(page.data);

    for (const contact of page.data) {
      if (contact.emailable === false) notEmailable++;

      if (held.byContactId.has(contact.id)) {
        skipped.push({
          contactId: contact.id,
          reason: 'already_synced',
          detail: 'A lead row already carries this RealScout contact id',
        });
        continue;
      }

      const key = contact.external_user_key;
      if (typeof key === 'string' && UUID_PATTERN.test(key) && held.byLeadId.has(key)) {
        skipped.push({
          contactId: contact.id,
          reason: 'already_ours',
          detail: `external_user_key names lead ${key}, which this site pushed`,
        });
        continue;
      }

      const mapped = contactToLeadInput(contact);
      if (!mapped.ok) {
        skipped.push({ contactId: contact.id, reason: mapped.reason, detail: null });
        continue;
      }

      // The same schema a website submission passes. There is no second
      // validation path, by design.
      const parsed = leadSubmissionSchema.safeParse(mapped.input);
      if (!parsed.success) {
        skipped.push({
          contactId: contact.id,
          reason: 'rejected',
          detail: Object.keys(parsed.error.flatten().fieldErrors).join(', ') || 'invalid',
        });
        continue;
      }

      const written = await createSyncedLead(parsed.data, {
        status: SYNCED_STATUS,
        provenance: syncProvenanceNote(contact, now),
        formData: syncFormData(contact, now),
      });

      createdLeadIds.push(written.leadId);
    }
  }

  // The contact id is RealScout's own opaque identifier, not a person's
  // details, so it is safe in a log. Names, addresses and notes are not logged.
  console.log(
    `[realscout:sync] window from ${updatedAfter}: saw ${seen}, created ` +
      `${createdLeadIds.length}, 0 follow-ups, skipped ${skipped.length}, ` +
      `${notEmailable} not emailable`,
  );

  return {
    configured: true,
    updatedAfter,
    seen,
    created: createdLeadIds.length,
    followUpsCreated: 0,
    skipped,
    truncated: pages >= MAX_SYNC_PAGES,
    notEmailable,
    createdLeadIds,
  };
}

/** Whether a caught error came from RealScout, for a route's status mapping. */
export function isRealScoutError(error: unknown): error is RealScoutError {
  return error instanceof RealScoutError;
}

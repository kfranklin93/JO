/**
 * Append one line of conversation context to a lead.
 *
 * ## Why this exists
 *
 * The assistant's `log_lead_note` tool had no implementation. Both executors
 * answered `{ status: "logged_mock" }` and wrote nothing, anywhere, so the
 * model was told the note was filed and told clients their question had been
 * passed to Joey. Nothing had been. This is the write that makes the claim
 * true, and `tools.ts` gates the claim on the outcome below rather than on the
 * call having been made.
 *
 * ## What it writes, and what it does not
 *
 * It writes one timestamped line onto `leads.notes` and sets `updated_at`. The
 * line format matches the audit line `updateCapturedLead` appends, so a lead's
 * notes read as one chronological column rather than two formats interleaved.
 *
 * It does NOT touch `follow_ups`, and it sends nothing — no email, no SMS, no
 * CRM sync. A client asking a question is not a new lead and must not trigger
 * the things that announce one. That restraint is the whole reason this is a
 * separate function from `captureLead`: reusing the capture path to "add a
 * note" is what previously put four duplicate rows and sixteen queued
 * follow-up emails behind one person.
 *
 * Existing notes are appended to, never overwritten, for the same reason
 * `updateCapturedLead` fills blanks and keeps what it already has: nothing a
 * client actually said should be removable by a later turn.
 *
 * @throws MissingEnvError when DATABASE_URL is absent — before anything is
 *   written. RESEND_API_KEY is not required, because this path sends nothing.
 * @throws whatever the driver throws if the transaction cannot commit. The
 *   caller treats a throw as "not recorded"; it must not treat it as written.
 */

import { eq } from 'drizzle-orm';
import { db, leads } from '@/lib/db';
import { requireEnv } from '@/lib/utils/require-env';

/** `missing` is a lead id that names no row — typically one since deleted. */
export type LeadNoteOutcome = 'recorded' | 'missing';

export async function appendLeadNote(
  leadId: string,
  note: string
): Promise<LeadNoteOutcome> {
  requireEnv('DATABASE_URL');

  return db.transaction(async (tx) => {
    // Read and write in one transaction, as the update path does: the read that
    // decides what the column already holds and the write that extends it must
    // not be separable, or a note arriving at the same moment is overwritten
    // rather than appended.
    const [existing] = await tx
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!existing) return 'missing' as const;

    const line = `[assistant ${new Date().toISOString()}] ${note.trim()}`;
    const notes =
      existing.notes === null || existing.notes.trim() === ''
        ? line
        : `${existing.notes}\n${line}`;

    await tx
      .update(leads)
      .set({ notes, updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    return 'recorded' as const;
  });
}

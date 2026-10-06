/**
 * Who may be emailed, and who asked not to be.
 *
 * ## The send path fails closed
 *
 * {@link isSuppressed} throws when it cannot read the suppression list. It does
 * not return `false`.
 *
 * That is the opposite of how the rest of this codebase degrades — the chat
 * store swallows its failures, the Lofty sync returns `false`, Twilio outages
 * are shrugged off — and the asymmetry is deliberate. Those failures cost a
 * record. This one would cost an email sent to somebody who told us to stop,
 * which is a legal exposure and, more practically, the fastest way to get
 * Joey's sending domain flagged. An unreadable list and an empty list are
 * indistinguishable, so the only safe reading of "I don't know" is "don't send".
 *
 * ### What that costs, and the one deployment rule it implies
 *
 * A follow-up that cannot verify suppression fails, and the cron's retry
 * counter advances (`MAX_SEND_ATTEMPTS` is 3 in follow-up-queue.ts). So a long
 * outage — or shipping this code before ./../db/email-preferences-schema.sql is
 * applied — would not merely pause the drip, it would permanently fail the
 * queued follow-ups that exhaust their attempts.
 *
 * Hence the rule: **apply the SQL before deploying this code.** It is the only
 * ordering that matters, and it is cheap because the table is additive and the
 * file is idempotent.
 *
 * The transactional case needs no exception to this. Someone who unsubscribed
 * and then filled in the form again has their suppression cleared by
 * {@link recordFreshConsent} *before* the immediate follow-up is attempted, so
 * the one send that must always work does not depend on bypassing the check.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  emailOptOuts,
  type OptOutSource,
  type ResubscribeSource,
} from '@/lib/db/email-preferences-schema';

/**
 * Raised when the suppression list cannot be consulted.
 *
 * Distinct from a delivery failure so logs say "we could not check" rather than
 * "Resend rejected it", which are very different problems with very different
 * fixes.
 */
export class SuppressionUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      'Could not read the email suppression list, so the send was withheld. ' +
        'If the opt-out table does not exist yet, apply src/lib/db/email-preferences-schema.sql.',
    );
    this.name = 'SuppressionUnavailableError';
    this.cause = cause;
  }
}

/**
 * Lowercase and trim an address.
 *
 * Every read and write goes through this. Email local-parts are case-sensitive
 * per the RFC and case-insensitive in practice at every real provider, and
 * honouring the RFC here would mean `Dana@x.com` still receives mail after
 * `dana@x.com` unsubscribed. The practical reading is the safe one.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether this address has asked not to be emailed.
 *
 * @throws {SuppressionUnavailableError} When the list cannot be read. Callers
 *   on the send path must let this stop the send — see the module note.
 */
export async function isSuppressed(email: string): Promise<boolean> {
  const address = normalizeEmail(email);

  try {
    const [row] = await db
      .select({ email: emailOptOuts.email })
      .from(emailOptOuts)
      .where(
        and(eq(emailOptOuts.email, address), isNull(emailOptOuts.resubscribedAt)),
      )
      .limit(1);

    return row !== undefined;
  } catch (err) {
    throw new SuppressionUnavailableError(err);
  }
}

/**
 * Record that an address asked to stop receiving email.
 *
 * Idempotent: unsubscribing twice is a no-op the second time, which matters
 * because Gmail may issue the one-click POST more than once. A previously
 * resubscribed address is suppressed again — `resubscribed_at` is cleared — so
 * the opt-out/opt-in cycle can repeat.
 *
 * @returns `true` when the suppression is recorded.
 * @throws When the write fails. The caller is an HTTP endpoint that must report
 *   failure honestly rather than show a confirmation page for something that
 *   did not happen.
 */
export async function suppress(
  email: string,
  source: OptOutSource,
): Promise<boolean> {
  const address = normalizeEmail(email);
  const now = new Date();

  await db
    .insert(emailOptOuts)
    .values({ email: address, optedOutAt: now, source })
    .onConflictDoUpdate({
      target: emailOptOuts.email,
      set: {
        optedOutAt: now,
        source,
        updatedAt: now,
        // Clearing these is what makes a second opt-out after a resubscribe
        // take effect. Without it the row would still read as resubscribed and
        // the address would keep receiving mail.
        resubscribedAt: null,
        resubscribeSource: null,
      },
    });

  return true;
}

/**
 * Clear a suppression because the person asked us to contact them again.
 *
 * Called when someone submits a form or gives their email in the chat — they
 * typed it themselves, which is fresh consent. Explicitly NOT for bulk imports:
 * a CSV from a spreadsheet is not consent, and running this over one would
 * silently undo every opt-out on the list.
 *
 * Never throws. A lead capture must not fail because a suppression row could
 * not be updated — the lead is the thing worth keeping, and the worst case is
 * that the person stays suppressed and Joey contacts them by hand.
 *
 * @returns `true` if a suppression was cleared, `false` if there was nothing to
 *   clear or the update could not be made.
 */
export async function recordFreshConsent(
  email: string,
  source: ResubscribeSource,
): Promise<boolean> {
  const address = normalizeEmail(email);

  try {
    const now = new Date();
    const updated = await db
      .update(emailOptOuts)
      .set({ resubscribedAt: now, resubscribeSource: source, updatedAt: now })
      .where(
        and(eq(emailOptOuts.email, address), isNull(emailOptOuts.resubscribedAt)),
      )
      .returning({ email: emailOptOuts.email });

    if (updated.length > 0) {
      console.log(`[email-preferences] fresh consent cleared suppression for ${address}`);
      return true;
    }

    return false;
  } catch (err) {
    console.warn(
      `[email-preferences] could not clear suppression for ${address}; ` +
        'they stay suppressed and will need contacting by hand:',
      err,
    );
    return false;
  }
}

/** How many addresses are currently suppressed. For the dashboard. */
export async function countSuppressed(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailOptOuts)
    .where(isNull(emailOptOuts.resubscribedAt));

  return row?.count ?? 0;
}

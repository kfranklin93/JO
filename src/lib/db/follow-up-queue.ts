/**
 * The follow-up send queue.
 *
 * Isolates the queue's SQL from the route so the concurrency behaviour can be
 * reasoned about and tested on its own.
 *
 * ## The problem this solves
 *
 * The cron route used to read due rows, then send, then mark each row sent:
 *
 *   SELECT ... WHERE status = 'scheduled' AND scheduled_for <= now()
 *   for each: send email; UPDATE ... SET status = 'sent'
 *
 * Between the read and the update the row is still `scheduled`, so a second run
 * overlapping the first sees the same rows and sends the same emails again. With
 * a 500 ms sleep per row and no bound on batch size, a backlog made that window
 * arbitrarily wide. A retry from the cron provider, or a manual dashboard
 * trigger landing near the scheduled run, was enough to double-send.
 *
 * Claiming closes the window: a single atomic UPDATE moves rows out of
 * `scheduled` and returns them, all before any network I/O. A concurrent run
 * either claims different rows or claims nothing.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { FollowUp } from '@/lib/db/schema';

/**
 * Attempts allowed before a follow-up is abandoned.
 *
 * Counts total attempts, not retries, so 3 means one initial send plus two
 * retries. Without a bound a permanently bad address is retried on every run
 * forever.
 */
export const MAX_SEND_ATTEMPTS = 3;

/**
 * How long a row may sit in `sending` before another run may reclaim it.
 *
 * Deliberately far beyond any plausible function duration. A row is only left
 * in `sending` if the process died mid-send, and reclaiming too eagerly would
 * reintroduce the double-send this exists to prevent. Netlify's synchronous
 * function limit is measured in seconds, so fifteen minutes is a wide margin.
 */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

/** The batch ceiling, so one run cannot try to drain an unbounded backlog. */
export const DEFAULT_CLAIM_LIMIT = 25;

/**
 * Atomically claim up to `limit` follow-ups that are ready to send.
 *
 * Claimed rows move to `sending` and are returned. Because the status change and
 * the read happen in one statement, no other run can observe these rows as
 * claimable.
 *
 * `FOR UPDATE SKIP LOCKED` means a concurrent run does not block waiting for
 * this one; it skips locked rows and claims different work, or none.
 *
 * Rows stuck in `sending` beyond {@link STALE_CLAIM_MS} are reclaimed here too,
 * so a process that died mid-send does not strand a follow-up forever.
 */
export async function claimDueFollowUps(
  limit: number = DEFAULT_CLAIM_LIMIT,
  now: Date = new Date()
): Promise<FollowUp[]> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);

  const result = await db.execute(sql`
    UPDATE follow_ups
    SET status = 'sending', updated_at = ${now}
    WHERE id IN (
      SELECT id FROM follow_ups
      WHERE (status = 'scheduled' AND scheduled_for <= ${now})
         OR (status = 'sending' AND updated_at < ${staleBefore})
      ORDER BY scheduled_for ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  return rowsOf(result) as FollowUp[];
}

/** Mark a claimed follow-up as delivered to Resend. */
export async function markSent(id: string, now: Date = new Date()): Promise<void> {
  await db.execute(sql`
    UPDATE follow_ups
    SET status = 'sent',
        sent_at = ${now},
        updated_at = ${now},
        attempts = attempts + 1,
        failure_reason = NULL
    WHERE id = ${id}
  `);
}

/** What {@link recordFailure} decided to do with the row. */
export type FailureOutcome =
  | { requeued: true; attempts: number }
  | { requeued: false; attempts: number };

/**
 * Record a failed send and decide whether it is worth another attempt.
 *
 * Retry policy lives here rather than in the route so there is one place that
 * decides when to give up. Below the budget the row returns to `scheduled` and
 * the next run picks it up; at the budget it becomes `failed` permanently.
 *
 * The real reason is stored either way. The route previously wrote the literal
 * `'Send failed'` for every failure, which made a missing API key
 * indistinguishable from a rejected recipient.
 */
export async function recordFailure(
  id: string,
  reason: string,
  currentAttempts: number,
  now: Date = new Date()
): Promise<FailureOutcome> {
  const attempts = currentAttempts + 1;
  const requeue = attempts < MAX_SEND_ATTEMPTS;

  if (requeue) {
    await db.execute(sql`
      UPDATE follow_ups
      SET status = 'scheduled',
          attempts = ${attempts},
          failure_reason = ${reason},
          updated_at = ${now}
      WHERE id = ${id}
    `);
    return { requeued: true, attempts };
  }

  await db.execute(sql`
    UPDATE follow_ups
    SET status = 'failed',
        attempts = ${attempts},
        failed_at = ${now},
        failure_reason = ${reason},
        updated_at = ${now}
    WHERE id = ${id}
  `);
  return { requeued: false, attempts };
}

/**
 * How many follow-ups are still due after this run.
 *
 * Lets the response say whether work remains, so an operator can tell a cleared
 * queue from a batch limit being hit.
 */
export async function countRemainingDue(now: Date = new Date()): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM follow_ups
    WHERE status = 'scheduled' AND scheduled_for <= ${now}
  `);

  const rows = rowsOf(result) as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
}

/**
 * Normalise a driver result into rows.
 *
 * `db.execute` returns a node-postgres style `{ rows }` on the neon-serverless
 * driver, but other drivers return the array directly. Handling both keeps this
 * module from breaking if the driver is swapped.
 */
function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

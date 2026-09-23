/**
 * Translation between the driver's raw `follow_ups` row and the typed
 * {@link FollowUp}.
 *
 * ## Why this exists
 *
 * `db.execute(sql`...`)` bypasses Drizzle's column mapping. What comes back is
 * whatever the driver read off the wire, keyed by **database column name** — so
 * `RETURNING *` on `follow_ups` yields `lead_id` and `template_type`, not
 * `leadId` and `templateType`.
 *
 * The queue used to bridge that with an assertion:
 *
 *   return rowsOf(result) as FollowUp[]
 *
 * which compiled cleanly and was false at runtime. The cron route then read
 * `followUp.leadId` — `undefined` on every row — looked the lead up by
 * `undefined`, found nothing, and took the deleted-lead branch for the entire
 * batch. Production reported `{"claimed":25,"sent":0,"failed":25}` with 25 rows
 * stamped `failure_reason = 'Lead not found'` against leads that all existed.
 * Nobody was mailed and 25 touchpoints were destroyed.
 *
 * An assertion silences the compiler without changing the data, which is the
 * same defect `lead-mapping.ts` was written to remove. This module states each
 * column's correspondence explicitly instead.
 *
 * ## Why it validates rather than coerces
 *
 * Every field is checked, and a row that does not match throws naming the
 * column. That is deliberate: the failure mode being replaced was *silent*. A
 * shape mismatch turned into 25 plausible-looking failed rows and an HTTP 200.
 * A throw ends the run with the reason in the log, which an operator can act on.
 *
 * Nothing legitimate can trigger it — the columns are `NOT NULL` in the schema
 * and Postgres enforces the status enum — so the only way here is the schema and
 * this file having drifted apart, which needs a human either way.
 */

import { followUps, type FollowUp } from '@/lib/db/schema';

/** The statuses Postgres will accept, read from the schema rather than retyped. */
const FOLLOW_UP_STATUSES: readonly string[] = followUps.status.enumValues;

/** Column names as they appear in `follow_ups`, for error messages. */
type Column =
  | 'id'
  | 'lead_id'
  | 'scheduled_for'
  | 'template_type'
  | 'status'
  | 'sent_at'
  | 'delivered_at'
  | 'opened_at'
  | 'clicked_at'
  | 'replied_at'
  | 'failed_at'
  | 'failure_reason'
  | 'attempts'
  | 'conversation_id'
  | 'ab_test_id'
  | 'variant'
  | 'created_at'
  | 'updated_at';

function fail(column: Column, row: Record<string, unknown>, expected: string): never {
  // The available keys are the useful part of the diagnostic: a camelCase list
  // here means something is handing this mapper ORM-shaped rows, and a
  // snake_case list with the column missing means the SELECT lost a column.
  throw new Error(
    `follow_ups.${column}: expected ${expected}, got ${JSON.stringify(row[column])} ` +
      `(row keys: ${Object.keys(row).join(', ')})`
  );
}

function requireString(row: Record<string, unknown>, column: Column): string {
  const value = row[column];
  if (typeof value !== 'string' || value === '') fail(column, row, 'a non-empty string');
  return value as string;
}

function optionalString(row: Record<string, unknown>, column: Column): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail(column, row, 'a string or null');
  return value as string;
}

/**
 * Read a timestamp column.
 *
 * `pg` parses `timestamp` into a `Date`, but a driver or a `::text` cast can
 * hand back the ISO string instead, and the difference is invisible until
 * something compares it. Both are accepted and normalised to `Date`.
 */
function requireDate(row: Record<string, unknown>, column: Column): Date {
  const value = optionalDate(row, column);
  if (value === null) fail(column, row, 'a timestamp');
  return value as Date;
}

function optionalDate(row: Record<string, unknown>, column: Column): Date | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) fail(column, row, 'a valid timestamp');
    return value;
  }
  if (typeof value !== 'string') fail(column, row, 'a timestamp or null');
  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) fail(column, row, 'a valid timestamp');
  return parsed;
}

/**
 * Read an integer column.
 *
 * Postgres `integer` arrives as a number, but `bigint` and `numeric` arrive as
 * strings to avoid precision loss, so a widened column would otherwise start
 * feeding a string into the retry arithmetic and `attempts + 1` would become
 * string concatenation.
 */
function requireInteger(row: Record<string, unknown>, column: Column): number {
  const value = row[column];
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed)) {
    fail(column, row, 'an integer');
  }
  return parsed as number;
}

function requireStatus(row: Record<string, unknown>, column: Column): FollowUp['status'] {
  const value = row[column];
  if (typeof value !== 'string' || !FOLLOW_UP_STATUSES.includes(value)) {
    fail(column, row, `one of ${FOLLOW_UP_STATUSES.join(' | ')}`);
  }
  return value as FollowUp['status'];
}

/**
 * Convert one raw `follow_ups` row into a {@link FollowUp}.
 *
 * Use this for every row read through `db.execute`. Anything that reaches the
 * route or the scheduler should have been through here, so there is one place
 * that knows the snake_case column names and one place to change if a column is
 * renamed.
 */
export function toFollowUp(row: unknown): FollowUp {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`follow_ups: expected a row object, got ${JSON.stringify(row)}`);
  }

  const raw = row as Record<string, unknown>;

  return {
    id: requireString(raw, 'id'),
    leadId: requireString(raw, 'lead_id'),
    scheduledFor: requireDate(raw, 'scheduled_for'),
    templateType: requireString(raw, 'template_type'),
    status: requireStatus(raw, 'status'),
    sentAt: optionalDate(raw, 'sent_at'),
    deliveredAt: optionalDate(raw, 'delivered_at'),
    openedAt: optionalDate(raw, 'opened_at'),
    clickedAt: optionalDate(raw, 'clicked_at'),
    repliedAt: optionalDate(raw, 'replied_at'),
    failedAt: optionalDate(raw, 'failed_at'),
    failureReason: optionalString(raw, 'failure_reason'),
    attempts: requireInteger(raw, 'attempts'),
    conversationId: optionalString(raw, 'conversation_id'),
    abTestId: optionalString(raw, 'ab_test_id'),
    variant: optionalString(raw, 'variant'),
    createdAt: requireDate(raw, 'created_at'),
    updatedAt: requireDate(raw, 'updated_at'),
  };
}

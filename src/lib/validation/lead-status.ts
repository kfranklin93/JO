import { z } from 'zod';
import type { leadStatusEnum } from '@/lib/db/schema';

/**
 * The pipeline statuses a lead row can hold, restated for callers that must not
 * import the database.
 *
 * `leadStatusEnum` in src/lib/db/schema.ts is the real source of truth, but
 * that module pulls in `drizzle-orm/pg-core`, and the dashboard's Add Lead and
 * Import dialogs are client components. Importing the schema there to populate
 * a `<select>` would ship the Postgres dialect builder to the browser.
 *
 * So the list is written out once here and then *checked* against the enum at
 * compile time by `_matchesDbEnum` below. The `import type` is erased, so
 * nothing from the schema module reaches the bundle, and adding a value to the
 * enum without adding it here — or inventing one here that the column will
 * reject — fails `npm run typecheck` rather than failing at runtime as a
 * Postgres `invalid input value for enum lead_status`.
 */
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'appointment_set',
  'showing_scheduled',
  'offer_made',
  'under_contract',
  'closed',
  'lost',
  'nurture',
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export const leadStatusSchema = z.enum(LEAD_STATUSES, {
  required_error: 'Select a status',
  invalid_type_error: 'Select a status',
});

type DbLeadStatus = (typeof leadStatusEnum)['enumValues'][number];

/**
 * Fails to compile if the list above and the database enum have drifted apart
 * in either direction. `Unlisted` catches an enum value this file forgot;
 * `Invented` catches a value here that the column would reject.
 */
type Drift =
  | Exclude<DbLeadStatus, LeadStatusValue>
  | Exclude<LeadStatusValue, DbLeadStatus>;

const _matchesDbEnum: [Drift] extends [never]
  ? true
  : ['lead status list has drifted from leadStatusEnum', Drift] = true;
void _matchesDbEnum;

/** Sentence-case label for a status, for a `<select>` or a table cell. */
export function leadStatusLabel(status: string): string {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

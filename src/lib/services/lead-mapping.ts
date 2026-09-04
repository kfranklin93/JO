/**
 * Translation between the database's lead row and the scheduler's `Lead`.
 *
 * The cron route previously bridged the two with type assertions:
 *
 *   intent: (leadRow.propertyInterest ?? 'general') as Lead['intent']
 *   status: leadRow.status as Lead['status']
 *
 * Both were false. `propertyInterest` is a free-text `varchar(100)` holding
 * whatever the form sent, so it can be any string at all — and the intent union
 * did not even contain `'general'`, the value being asserted into it. The status
 * assertion squeezed a ten-value database enum into a six-value TypeScript
 * union, so four database states became values the union claims are impossible.
 *
 * An assertion silences the compiler without changing the data, so the mismatch
 * surfaced later as a template lookup falling through, or a status the rest of
 * the code was not written to handle. This module states each correspondence
 * explicitly instead, and where the two vocabularies genuinely do not
 * correspond, the choice is written down rather than asserted away.
 */

import { LEAD_INTENTS, type LeadIntentValue } from '@/lib/validation/lead';
import type { Lead as DbLead } from '@/lib/db/schema';
import type { Lead } from '@/lib/services/follow-up-scheduler';

type SchedulerStatus = Lead['status'];

/**
 * Intent used when a row's `propertyInterest` is absent or unrecognised.
 *
 * `'general'` rather than a guess like `'buy'`: the templates for a specific
 * intent make claims about what the person wants, and asserting the wrong one to
 * a real client reads worse than staying neutral.
 */
const DEFAULT_INTENT: LeadIntentValue = 'general';

/** Legacy spellings that appear in rows written before the vocabulary settled. */
const LEGACY_INTENTS: Record<string, LeadIntentValue> = {
  buying: 'buy',
  selling: 'sell',
  investing: 'invest',
  investment: 'invest',
  // The old UI offered a single "both" option. There is no combined template, and
  // someone selling in order to buy is running a purchase, so it maps to 'buy'.
  both: 'buy',
};

/**
 * Database lead statuses mapped onto the scheduler's narrower union.
 *
 * The database tracks pipeline position; the scheduler only distinguishes
 * engagement level. Several pipeline states collapse onto one scheduler state,
 * which is why this cannot be a cast.
 */
const STATUS_MAP: Record<string, SchedulerStatus> = {
  new: 'new',
  contacted: 'contacted',
  qualified: 'qualified',
  // An appointment or showing means they have engaged, not merely been contacted.
  appointment_set: 'engaged',
  showing_scheduled: 'engaged',
  // An offer or contract is past qualification and firmly in progress.
  offer_made: 'qualified',
  under_contract: 'qualified',
  closed: 'closed',
  // Lost and nurture both mean "stop the active drip", which is 'inactive'.
  lost: 'inactive',
  nurture: 'inactive',
};

/**
 * Normalise a free-text property interest to a canonical intent.
 *
 * Exported so the fallback behaviour can be asserted directly.
 */
export function toLeadIntent(value: string | null | undefined): LeadIntentValue {
  if (!value) return DEFAULT_INTENT;

  const normalised = value.trim().toLowerCase();
  if (!normalised) return DEFAULT_INTENT;

  if ((LEAD_INTENTS as readonly string[]).includes(normalised)) {
    return normalised as LeadIntentValue;
  }

  return LEGACY_INTENTS[normalised] ?? DEFAULT_INTENT;
}

/**
 * Map a database lead status onto the scheduler's union.
 *
 * An unrecognised value falls back to `'new'`, which is the least presumptuous
 * option: it keeps the lead in the sequence rather than silently dropping them.
 */
export function toSchedulerStatus(value: string | null | undefined): SchedulerStatus {
  if (!value) return 'new';
  return STATUS_MAP[value.trim().toLowerCase()] ?? 'new';
}

/**
 * Fields the form stores in the `form_data` JSON blob rather than as columns.
 */
interface LeadFormData {
  budget?: string | null;
  location?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  propertyType?: string | null;
  additionalNotes?: string | null;
}

function formDataOf(row: DbLead): LeadFormData {
  const raw = (row as { formData?: unknown }).formData;
  return raw && typeof raw === 'object' ? (raw as LeadFormData) : {};
}

/**
 * Resolve a display name from the row's three name columns.
 *
 * Returns `undefined` rather than the literal `'there'` that the route used to
 * substitute. Downstream, `resolveRecipient` decides how to greet someone with
 * no name; passing a placeholder here caused subjects like "Quick check-in,
 * there" because the placeholder was indistinguishable from a real name.
 */
function nameOf(row: DbLead): string | undefined {
  const candidates = [
    row.fullName,
    [row.firstName, row.lastName].filter(Boolean).join(' '),
    row.firstName,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }

  return undefined;
}

/**
 * Convert a database lead row into the shape the scheduler expects.
 *
 * Optional properties are omitted rather than set to `undefined`, which
 * `exactOptionalPropertyTypes` requires.
 */
export function toSchedulerLead(row: DbLead): Lead {
  const form = formDataOf(row);
  const name = nameOf(row);

  const lead: Lead = {
    id: row.id,
    // The scheduler's `name` is required. An empty string is passed through when
    // the row has no name at all, and resolveRecipient turns it into a natural
    // greeting with no name in the subject.
    name: name ?? '',
    email: row.email,
    intent: toLeadIntent(row.propertyInterest),
    createdAt: row.createdAt,
    status: toSchedulerStatus(row.status),
  };

  if (row.phone) lead.phone = row.phone;
  if (row.timeline) lead.timeline = row.timeline;
  if (row.lastContactedAt) lead.lastContactedAt = row.lastContactedAt;
  if (form.budget) lead.budget = form.budget;
  if (form.location) lead.location = form.location;
  if (form.propertyType) lead.propertyType = form.propertyType;
  if (form.additionalNotes) lead.additionalNotes = form.additionalNotes;
  if (typeof form.bedrooms === 'number') lead.bedrooms = form.bedrooms;
  if (typeof form.bathrooms === 'number') lead.bathrooms = form.bathrooms;

  return lead;
}

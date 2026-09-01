import { z } from 'zod';

/**
 * Lead submission contract.
 *
 * This is the single source of truth for the shape of a lead submission. Both
 * the `POST /api/leads` route handler and the client-side submit helper import
 * it, so server and client validation cannot drift.
 *
 * ## Why the intent vocabulary is defined here
 *
 * The repository had three competing sets before this schema existed:
 *
 *   - `LeadIntent` in src/types/lead.ts — buy, sell, invest, insurance,
 *     closing, general (6 values)
 *   - `Lead['intent']` in src/lib/services/follow-up-scheduler.ts — buy, sell,
 *     insurance, closing (4 values)
 *   - `ServiceType` in src/components/forms/ServicesInquiryForm.tsx — buying,
 *     selling, both, general (4 values, different spellings)
 *
 * `src/config/form-fields.ts` offers a fifth combination to the user. The cron
 * route papers over the gap by casting `'general'` into the 4-value union,
 * which is a lie the type system cannot catch.
 *
 * This schema adopts the `LeadIntent` values as canonical, because that enum is
 * the declared type system for the app and is a superset of the others. Forms
 * translate their own vocabulary into this set before submitting; they do not
 * get to widen it.
 *
 * ## Length caps
 *
 * Caps mirror the column widths in src/lib/db/schema.ts so oversized input is
 * rejected with a named field error instead of surfacing as an opaque Postgres
 * 22001 `string_data_right_truncation` inside a 500.
 */

/** Canonical lead intents. Mirrors the `LeadIntent` enum in src/types/lead.ts. */
export const LEAD_INTENTS = [
  'buy',
  'sell',
  'invest',
  'insurance',
  'closing',
  'general',
] as const;

export type LeadIntentValue = (typeof LEAD_INTENTS)[number];

/** Column widths from src/lib/db/schema.ts that constrain this payload. */
export const LEAD_FIELD_LIMITS = {
  email: 255,
  phone: 20,
  fullName: 200,
  firstName: 100,
  lastName: 100,
  timeline: 50,
  budget: 50,
  location: 100,
  propertyType: 100,
  /** `notes` is a text column, so this cap is a policy choice rather than a
   *  storage limit. Free text reaches AI prompts and outbound email, and an
   *  unbounded field is an injection and cost surface. */
  additionalNotes: 2000,
} as const;

/**
 * Trims a string and treats a blank result as absent.
 *
 * Uncontrolled form inputs submit `''` for every field the user skipped. Left
 * alone, that would store empty strings for optional columns and defeat the
 * `?? null` handling downstream.
 */
const blankToUndefined = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Optional trimmed text with a maximum length. */
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().max(max).optional());

/**
 * Optional text that also accepts an array of strings.
 *
 * `PropertyRequest` in src/types/property.ts declares `propertyType` and
 * `preferredLocations` as `string[]`, while src/config/form-fields.ts binds
 * both to single text inputs that produce a plain string. The runtime value is
 * therefore either shape depending on which form submitted. Accepting both and
 * normalising to a comma-joined string is more useful than forcing every caller
 * to guess.
 */
const optionalTextOrList = (max: number) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) {
      const joined = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
        .join(', ');
      return joined === '' ? undefined : joined;
    }
    return blankToUndefined(value);
  }, z.string().max(max).optional());

/**
 * Optional non-negative count.
 *
 * Coerced because form inputs submit strings. The upper bound is a sanity
 * check, not a business rule — it exists so a pasted phone number in the
 * bedrooms field is rejected rather than stored.
 */
const optionalCount = (max: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce.number().finite().min(0).max(max).optional()
  );

/**
 * Fills in `name` when the caller supplied only `firstName` / `lastName`.
 *
 * This runs before field validation so that `name` can be a plain required
 * field. The alternative — a cross-field `superRefine` — only executes once the
 * rest of the object parses cleanly, so a submission with both a bad email and
 * a missing name would report only the email, forcing the visitor through a
 * second round trip to discover the second problem.
 */
const deriveNameField = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const suppliedName =
    typeof record.name === 'string' ? record.name.trim() : '';
  if (suppliedName !== '') return value;

  const first = typeof record.firstName === 'string' ? record.firstName.trim() : '';
  const last = typeof record.lastName === 'string' ? record.lastName.trim() : '';
  const combined = [first, last].filter(Boolean).join(' ');

  return combined === '' ? value : { ...record, name: combined };
};

const leadSubmissionInput = z.object({
  /**
   * Full name. Required, but `deriveNameField` synthesises it from
   * `firstName` / `lastName` first, so a form that collects the parts
   * separately satisfies this without sending a combined value.
   */
  name: z.preprocess(
    blankToUndefined,
    z
      .string({ required_error: 'Name is required' })
      .min(1, 'Name is required')
      .max(LEAD_FIELD_LIMITS.fullName, 'Name is too long')
  ),
  firstName: optionalText(LEAD_FIELD_LIMITS.firstName),
  lastName: optionalText(LEAD_FIELD_LIMITS.lastName),

  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .min(1, 'Email is required')
    .max(LEAD_FIELD_LIMITS.email, 'Email is too long')
    .email('Enter a valid email address')
    .toLowerCase(),

  phone: optionalText(LEAD_FIELD_LIMITS.phone),

  intent: z.enum(LEAD_INTENTS, {
    required_error: 'Select what you need help with',
    invalid_type_error: 'Select what you need help with',
  }),

  /**
   * Free text rather than a closed enum. The two forms use different timeline
   * vocabularies (`Timeline` enum values versus free text), the column is a
   * varchar, and rejecting a submission over a low-stakes preference field
   * would cost a lead for no benefit.
   */
  timeline: optionalText(LEAD_FIELD_LIMITS.timeline),

  /** Free text because forms submit formatted ranges like "$200k - $400k". */
  budget: optionalText(LEAD_FIELD_LIMITS.budget),

  location: optionalTextOrList(LEAD_FIELD_LIMITS.location),
  propertyType: optionalTextOrList(LEAD_FIELD_LIMITS.propertyType),

  bedrooms: optionalCount(20),
  bathrooms: optionalCount(20),

  additionalNotes: optionalText(LEAD_FIELD_LIMITS.additionalNotes),
});

/** Raw shape accepted on the wire, before name normalisation. */
export type LeadSubmissionInput = z.input<typeof leadSubmissionInput>;

/**
 * Splits a full name into a first and last part.
 *
 * Deliberately conservative: everything after the first whitespace run becomes
 * the last name, so "Mary Anne van der Berg" keeps "van der Berg" intact rather
 * than dropping the tail. This is the same rule the route used inline before,
 * kept here so both name paths normalise identically.
 */
const splitFullName = (fullName: string): { firstName: string; lastName?: string } => {
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.slice(1).join(' ');
  return lastName === '' ? { firstName } : { firstName, lastName };
};

/**
 * Validated lead submission.
 *
 * Name handling is normalised so the route always receives all three name
 * fields the database stores, regardless of whether the form collected a single
 * full name or separate first and last names. The previous route split `name`
 * on whitespace unconditionally, which discarded the better data that the
 * multi-step form already collects separately.
 */
export const leadSubmissionSchema = z
  .preprocess(deriveNameField, leadSubmissionInput)
  .transform((value) => {
    const explicitFirst = value.firstName;
    const explicitLast = value.lastName;

    // `name` is always present here, either supplied directly or synthesised
    // from the parts by `deriveNameField`.
    const derived = explicitFirst === undefined ? splitFullName(value.name) : undefined;

    const firstName = explicitFirst ?? derived?.firstName ?? value.name;
    const lastName = explicitLast ?? derived?.lastName;

    const fullName = value.name;

    return {
      fullName,
      firstName,
      ...(lastName === undefined ? {} : { lastName }),
      email: value.email,
      ...(value.phone === undefined ? {} : { phone: value.phone }),
      intent: value.intent,
      ...(value.timeline === undefined ? {} : { timeline: value.timeline }),
      ...(value.budget === undefined ? {} : { budget: value.budget }),
      ...(value.location === undefined ? {} : { location: value.location }),
      ...(value.propertyType === undefined
        ? {}
        : { propertyType: value.propertyType }),
      ...(value.bedrooms === undefined ? {} : { bedrooms: value.bedrooms }),
      ...(value.bathrooms === undefined ? {} : { bathrooms: value.bathrooms }),
      ...(value.additionalNotes === undefined
        ? {}
        : { additionalNotes: value.additionalNotes }),
    };
  });

/** Normalised lead submission, as the route handler consumes it. */
export type LeadSubmission = z.output<typeof leadSubmissionSchema>;

/**
 * Flattens a Zod error into one message per field, keyed by field name.
 *
 * The first issue per field wins, which keeps the response predictable when a
 * single value trips more than one rule. Issues with an empty path (object-level
 * refinements) are collected under `_form` so they are never silently dropped.
 */
export function formatFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    if (!(key in fieldErrors)) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}

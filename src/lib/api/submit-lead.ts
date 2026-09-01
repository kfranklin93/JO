import type { LeadIntentValue } from '@/lib/validation/lead';

/**
 * Client-side transport for lead submissions, plus the adapters that translate
 * each form's own shape into the wire contract.
 *
 * Both lead forms go through here so the request, the response handling, and the
 * intent vocabulary translation exist once rather than twice.
 */

/**
 * Wire payload for `POST /api/leads`.
 *
 * Optional fields spell out `| undefined` so callers can assign a possibly
 * absent value directly under `exactOptionalPropertyTypes`. `JSON.stringify`
 * drops undefined values, so the server sees an absent key either way.
 */
export interface LeadRequestPayload {
  name?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  email: string;
  phone?: string | undefined;
  intent: LeadIntentValue;
  timeline?: string | undefined;
  budget?: string | undefined;
  location?: string | string[] | undefined;
  propertyType?: string | string[] | undefined;
  bedrooms?: number | string | undefined;
  bathrooms?: number | string | undefined;
  additionalNotes?: string | undefined;
}

export type SubmitLeadResult =
  | { ok: true; leadId: string }
  | { ok: false; kind: 'validation'; fieldErrors: Record<string, string> }
  | { ok: false; kind: 'error'; message: string };

const GENERIC_FAILURE =
  'Something went wrong sending your details. Please try again, or email Joey directly.';

/**
 * Posts a lead to the API and normalises the outcome.
 *
 * Returns a discriminated result rather than throwing, so callers can render a
 * field-level error state and a general error state without a try/catch around
 * every submit.
 */
export async function submitLead(
  payload: LeadRequestPayload
): Promise<SubmitLeadResult> {
  let response: Response;

  try {
    response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Offline, DNS failure, or the request was aborted.
    return {
      ok: false,
      kind: 'error',
      message:
        'We could not reach the server. Check your connection and try again.',
    };
  }

  // A gateway can return HTML on a 502, so parsing is allowed to fail.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (response.status === 422) {
    const fieldErrors = extractFieldErrors(body);
    return Object.keys(fieldErrors).length > 0
      ? { ok: false, kind: 'validation', fieldErrors }
      : { ok: false, kind: 'error', message: GENERIC_FAILURE };
  }

  if (!response.ok) {
    return { ok: false, kind: 'error', message: extractMessage(body) };
  }

  const leadId = extractLeadId(body);
  if (leadId === undefined) {
    // A 2xx without an id means the contract changed; treat it as a failure
    // rather than reporting a success we cannot evidence.
    return { ok: false, kind: 'error', message: GENERIC_FAILURE };
  }

  return { ok: true, leadId };
}

function extractFieldErrors(body: unknown): Record<string, string> {
  if (typeof body !== 'object' || body === null) return {};

  const raw = (body as { fieldErrors?: unknown }).fieldErrors;
  if (typeof raw !== 'object' || raw === null) return {};

  const result: Record<string, string> = {};
  for (const [field, message] of Object.entries(raw)) {
    if (typeof message === 'string') result[field] = message;
  }
  return result;
}

function extractMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim() !== '') return error;
  }
  return GENERIC_FAILURE;
}

function extractLeadId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const leadId = (body as { leadId?: unknown }).leadId;
  return typeof leadId === 'string' && leadId !== '' ? leadId : undefined;
}

// ---------------------------------------------------------------------------
// Form adapters
// ---------------------------------------------------------------------------

/**
 * The service picker in ServicesInquiryForm uses its own vocabulary. Mapping it
 * here keeps the canonical intent set in src/lib/validation/lead.ts closed.
 *
 * `both` has no canonical equivalent — a client buying and selling is recorded
 * as a buyer, with the full picture preserved in the notes so nothing is lost.
 */
const SERVICE_TYPE_TO_INTENT = {
  buying: 'buy',
  selling: 'sell',
  both: 'buy',
  general: 'general',
} as const satisfies Record<string, LeadIntentValue>;

export type ServiceType = keyof typeof SERVICE_TYPE_TO_INTENT;

export interface ServicesInquiryFields {
  name: string;
  email: string;
  phone: string;
  timeline: string;
  budget: string;
  message: string;
}

/** Builds a wire payload from the homepage inquiry modal. */
export function fromServicesInquiry(
  serviceType: ServiceType,
  fields: ServicesInquiryFields
): LeadRequestPayload {
  const notes =
    serviceType === 'both'
      ? ['Interested in both buying and selling.', fields.message]
          .filter((part) => part.trim() !== '')
          .join(' ')
      : fields.message;

  return {
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    intent: SERVICE_TYPE_TO_INTENT[serviceType],
    timeline: fields.timeline,
    budget: fields.budget,
    additionalNotes: notes,
  };
}

/**
 * Shape produced by LeadCaptureForm.
 *
 * Loosely typed on purpose. `CreateLeadInput` declares
 * `propertyRequest.propertyType` and `preferredLocations` as arrays and the
 * price range as numbers, but src/config/form-fields.ts binds all of them to
 * single text inputs, so the runtime values are strings. Accepting both keeps
 * the adapter honest about what actually arrives.
 */
export interface LeadCaptureFields {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  intent?: unknown;
  timeline?: unknown;
  propertyRequest?: {
    propertyType?: unknown;
    preferredLocations?: unknown;
    priceRangeMin?: unknown;
    priceRangeMax?: unknown;
    bedrooms?: unknown;
    bathrooms?: unknown;
    additionalNotes?: unknown;
  };
}

/** Narrows an unknown form value to a non-empty trimmed string. */
function asText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Passes through a string or an array of strings for the tolerant fields. */
function asTextOrList(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) {
    const entries = value.filter(
      (entry): entry is string => typeof entry === 'string'
    );
    return entries.length > 0 ? entries : undefined;
  }
  return asText(value);
}

/**
 * Combines the two price inputs into the single budget string the API stores.
 *
 * The schema caps budget at 50 characters, which comfortably fits a formatted
 * range like "$200,000 - $500,000".
 */
function toBudget(min: unknown, max: unknown): string | undefined {
  const low = asText(min);
  const high = asText(max);

  if (low !== undefined && high !== undefined) return `${low} - ${high}`;
  if (low !== undefined) return `${low}+`;
  if (high !== undefined) return `Up to ${high}`;
  return undefined;
}

/**
 * Maps a wire field name back to the LeadCaptureForm field it came from, so a
 * server validation error can be shown against the input the visitor typed in.
 *
 * Not every wire field maps cleanly. `budget` is synthesised from two separate
 * price inputs, so an error on it cannot be attributed to one of them; those
 * are surfaced in the form-level message instead of being pinned to the wrong
 * input. Anything absent from this map is treated the same way.
 */
const WIRE_FIELD_TO_FORM_FIELD: Record<string, string> = {
  // The server derives `name` from the parts, so report it on the first input
  // the visitor can act on.
  name: 'firstName',
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  phone: 'phone',
  intent: 'intent',
  timeline: 'timeline',
  location: 'propertyRequest.preferredLocations',
  propertyType: 'propertyRequest.propertyType',
  additionalNotes: 'propertyRequest.additionalNotes',
};

export interface AttributedFieldErrors {
  /** Errors that map to a specific form input, keyed by form field name. */
  byField: Record<string, string>;
  /** Errors that could not be attributed to a single input. */
  unattributed: string[];
}

/** Splits server field errors into per-input and form-level messages. */
export function attributeFieldErrors(
  fieldErrors: Record<string, string>
): AttributedFieldErrors {
  const byField: Record<string, string> = {};
  const unattributed: string[] = [];

  for (const [wireField, message] of Object.entries(fieldErrors)) {
    const formField = WIRE_FIELD_TO_FORM_FIELD[wireField];
    if (formField === undefined) {
      unattributed.push(message);
    } else {
      byField[formField] = message;
    }
  }

  return { byField, unattributed };
}

/** Builds a wire payload from the multi-step lead capture form. */
export function fromLeadCaptureInput(
  fields: LeadCaptureFields
): LeadRequestPayload {
  const property = fields.propertyRequest ?? {};

  return {
    firstName: asText(fields.firstName),
    lastName: asText(fields.lastName),
    // The API requires a name; sending the parts lets the server derive the
    // rest rather than the client doing lossy string surgery.
    email: asText(fields.email) ?? '',
    phone: asText(fields.phone),
    // Passed through unvalidated. `formFields` already constrains the select to
    // canonical values, and the server rejects anything outside the set.
    intent: asText(fields.intent) as LeadIntentValue,
    timeline: asText(fields.timeline),
    budget: toBudget(property.priceRangeMin, property.priceRangeMax),
    location: asTextOrList(property.preferredLocations),
    propertyType: asTextOrList(property.propertyType),
    bedrooms: asText(property.bedrooms),
    bathrooms: asText(property.bathrooms),
    additionalNotes: asText(property.additionalNotes),
  };
}

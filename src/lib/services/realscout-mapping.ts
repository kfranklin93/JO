/**
 * Translation between a RealScout contact and this app's lead.
 *
 * Pure: no database, no network, no environment. Everything that decides *what
 * a synced lead looks like* lives here so the sync route, the push path and the
 * tests all read the same rules.
 *
 * ## RealScout text is external input
 *
 * Names, notes and lead sources on a RealScout contact were typed by somebody
 * else into somebody else's system. They are length-capped here to the column
 * widths in `LEAD_FIELD_LIMITS`, because `leadSubmissionSchema` rejects an
 * over-long field and a rejected field would drop the whole contact — losing a
 * seller lead over a 21-character phone number is the wrong trade. Truncation is
 * done once, here, rather than at each call site.
 *
 * Escaping is *not* done here, and deliberately. A stored value must be the
 * value, not an HTML-encoded rendering of it, or the dashboard shows
 * `O&#39;Brien` and the next consumer double-encodes. Escaping belongs at the
 * boundary that needs it: `escapeHtml` / `escapeAttr` in
 * src/lib/utils/escape.ts for email HTML, and {@link safeRealScoutUrl} below
 * for the one attribute this feature puts external text into.
 */

import {
  LEAD_FIELD_LIMITS,
  type LeadIntentValue,
  type LeadSubmissionInput,
} from '@/lib/validation/lead';
import type { RealScoutContact } from '@/lib/services/realscout';

/**
 * The `form_data` key that carries the RealScout contact id.
 *
 * This is the sync's idempotency key. It is a `form_data` entry and not a
 * column because `src/lib/db/schema.ts` must not change: `form_data` is
 * `jsonb`, so a key costs no migration, and the lookup is an index-free scan of
 * a lead table that holds three rows today and hundreds at its worst.
 */
export const REALSCOUT_CONTACT_ID_KEY = 'realscoutContactId';

/** `lead_source` this site sends to RealScout on the push direction. */
export const REALSCOUT_PUSH_LEAD_SOURCE = 'gowithjoeyo.com website';

/** Tag applied to contacts this site creates, so Joey can find them. */
export const REALSCOUT_PUSH_TAG = 'Website Lead';

/** Trim, collapse whitespace, and cap at a column width. Blank becomes null. */
function capped(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Map RealScout's `contact_type` onto this app's lead intent.
 *
 * `LEAD_INTENTS` is the canonical vocabulary (see src/lib/validation/lead.ts)
 * and RealScout's is narrower, so only the two unambiguous values are
 * translated. Anything else — a combined buyer/seller designation, a value
 * RealScout adds later, or no designation at all — becomes `general` rather
 * than a guess: `general` is what the CSV importer uses for the same reason,
 * and a wrong intent on a seller lead is worse than an unspecified one.
 */
export function realScoutIntent(contactType: unknown): LeadIntentValue {
  if (typeof contactType !== 'string') return 'general';
  switch (contactType.trim().toUpperCase()) {
    case 'BUYER':
      return 'buy';
    case 'SELLER':
      return 'sell';
    default:
      return 'general';
  }
}

/** What the mapper could not do with a contact, in words a log can carry. */
export type ContactMappingRejection = 'no_email' | 'email_too_long';

/** A contact mapped onto validated-shape lead input, or the reason it was not. */
export type ContactMapping =
  | { ok: true; input: LeadSubmissionInput }
  | { ok: false; reason: ContactMappingRejection };

/**
 * Build the `leadSubmissionSchema` input for a RealScout contact.
 *
 * Returns raw input rather than a `LeadSubmission`, because the schema is the
 * single validation path for every lead this app stores and the sync does not
 * get a second one. The caller parses.
 *
 * ## The name fallback
 *
 * `email` is the only field `POST /contacts` requires, so a contact captured by
 * a RealScout widget can legitimately have no name at all — while `name` is
 * required by `leadSubmissionSchema`. The address is used as the name in that
 * case. It is the only identifying thing we have, it is what Joey would read in
 * the dashboard anyway, and the alternative — a placeholder like "Unknown" —
 * would make every nameless contact look like the same person.
 */
export function contactToLeadInput(contact: RealScoutContact): ContactMapping {
  const email = typeof contact.email === 'string' ? contact.email.trim() : '';
  if (email === '') return { ok: false, reason: 'no_email' };
  if (email.length > LEAD_FIELD_LIMITS.email) {
    return { ok: false, reason: 'email_too_long' };
  }

  const firstName = capped(contact.first_name, LEAD_FIELD_LIMITS.firstName);
  const lastName = capped(contact.last_name, LEAD_FIELD_LIMITS.lastName);
  const combined = [firstName, lastName].filter((part) => part !== null).join(' ');
  const name = capped(combined, LEAD_FIELD_LIMITS.fullName) ?? email;

  // A phone that does not fit the 20-character column is **dropped, not
  // truncated**. Truncation is right for a name — "Bartholomew" cut short is
  // still recognisably that person — and wrong for a phone number, where it
  // produces a different, dialable number. Rejecting the whole contact over it
  // would be worse again: losing a seller lead to score a phone field.
  const rawPhone = capped(contact.primary_mobile_phone, Number.MAX_SAFE_INTEGER);
  const phone =
    rawPhone !== null && rawPhone.length <= LEAD_FIELD_LIMITS.phone ? rawPhone : null;

  return {
    ok: true,
    input: {
      name,
      ...(firstName === null ? {} : { firstName }),
      ...(lastName === null ? {} : { lastName }),
      email,
      ...(phone === null ? {} : { phone }),
      intent: realScoutIntent(contact.contact_type),
    },
  };
}

/**
 * The provenance line appended to the lead's `notes`.
 *
 * Says three things the row has to carry on its own, because `notes` is what
 * Joey reads and what an audit reads: that the contact came from RealScout and
 * not from a form on this site, that no marketing sequence was scheduled
 * because arriving in Joey's RealScout book is not consent to this site's
 * email, and — when RealScout says so — that RealScout itself cannot email this
 * person.
 */
export function syncProvenanceNote(contact: RealScoutContact, at: Date): string {
  const parts = [
    `[realscout ${at.toISOString()}] synced from RealScout contact ${contact.id}`,
  ];

  const leadSource = capped(contact.lead_source, 120);
  if (leadSource !== null) parts.push(`lead source "${leadSource}"`);

  const contactType = capped(contact.contact_type, 40);
  if (contactType !== null) parts.push(`contact type "${contactType}"`);

  parts.push('follow-up sequence not scheduled — no email consent on this site');

  if (contact.emailable === false) {
    parts.push(
      'RealScout cannot email this contact (emailable=false) — do not put them ' +
        'on any sending path',
    );
  }

  return parts.join('; ') + '.';
}

/**
 * The machine-readable half of the same provenance, merged into `form_data`.
 *
 * `realscoutContactId` is the key a repeat sync matches on, so it has to be
 * here on every synced row; the rest is there so a later correction can be
 * driven by a query rather than by parsing prose out of `notes`.
 */
export function syncFormData(
  contact: RealScoutContact,
  at: Date,
): Record<string, unknown> {
  return {
    [REALSCOUT_CONTACT_ID_KEY]: contact.id,
    realscoutSyncedAt: at.toISOString(),
    realscoutExternalUserKey: contact.external_user_key ?? null,
    // Recorded as a hard false when RealScout says so, and only then. An absent
    // field is "RealScout did not say", which is not the same claim.
    realscoutEmailable: contact.emailable === false ? false : (contact.emailable ?? null),
    realscoutLeadSource: capped(contact.lead_source, 120),
    realscoutContactType: capped(contact.contact_type, 40),
    realscoutUpdatedAt: contact.updated_at ?? null,
    followUpSequence: 'not scheduled — synced from RealScout, no email consent',
  };
}

/**
 * A RealScout URL that is safe to put in an `href`, or null.
 *
 * `realscout_url` is a field on an external record, which makes it an untrusted
 * string being written into an attribute — the exact hazard
 * src/lib/utils/escape.ts exists for. Escaping is not enough for a URL: `
 * javascript:alert(1)` survives HTML escaping intact and still executes on
 * click. So this validates the scheme and the host instead of encoding the
 * value, and returns null for anything that is not an `https` RealScout
 * address, which renders as no link rather than a live one.
 */
export function safeRealScoutUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  if (host !== 'realscout.com' && !host.endsWith('.realscout.com')) return null;

  return url.toString();
}

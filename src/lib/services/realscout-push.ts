/**
 * The push direction: a lead captured on this site becomes a RealScout contact.
 *
 * That is what RealScout is for — once the person is a contact, Joey's listing
 * alerts, Scout Score and activity tracking start working on them — and the
 * website did not feed it at all before this.
 *
 * ## This must never break lead capture
 *
 * By the time this runs the lead is already committed. A RealScout outage, a
 * revoked token or a 500 must therefore surface as a logged line and a `false`
 * in the capture outcome, never as a failed form or a failed chat turn. Nothing
 * here throws: {@link pushLeadToRealScout} returns a discriminated outcome for
 * every path including its own bugs. It is the same posture as the Lofty sync
 * and for the same reason — the lead is the thing worth keeping.
 *
 * ## No column on our side
 *
 * `external_user_key` is set to the lead's UUID. The spec says RealScout never
 * reads it except through the `external_user_key` filter, which makes it a
 * one-way bridge: the contact can always be found again by filtering on the
 * lead id, so nothing has to be stored here and `src/lib/db/schema.ts` is
 * untouched. The spec also notes it is not enforced unique and can only be set
 * at creation, which is why the sync treats it as a convenience rather than a
 * map (see realscout-sync.ts).
 *
 * ## Alerts are sent explicitly off
 *
 * `price_status_alerts_enabled` and `exclusives_alerts_enabled` are sent as
 * `false` on every create. The documented example shows them `true`, and
 * omitting them would leave the default to RealScout — either of which would
 * subscribe a person who filled in a contact form to recurring marketing email
 * they did not ask for. That is the same consent line the sync direction holds,
 * drawn on the other side: Joey can switch a contact's alerts on in RealScout
 * when he has spoken to them.
 *
 * `auto_nurture` is not touched. The spec's create response shows
 * `auto_nurture.enabled: false` on a freshly created contact and the create body
 * has no field for it — enabling it is a separate `POST /contacts/auto-nurture`
 * call, which this code does not make.
 */

import type { Lead } from '@/lib/services/follow-up-scheduler';
import {
  createRealScoutContact,
  realScoutConfigured,
  RealScoutError,
  type CreateContactInput,
} from '@/lib/services/realscout';
import {
  REALSCOUT_PUSH_LEAD_SOURCE,
  REALSCOUT_PUSH_TAG,
} from '@/lib/services/realscout-mapping';

/** Longest note sent with a create. RealScout's own limit is unpublished. */
const MAX_NOTE_LENGTH = 1_000;

/**
 * What the push did.
 *
 * `created` and `exists` are both successes — the person is in RealScout
 * either way, which is the point — but they are not the same event and the
 * distinction is worth keeping in the log. `skipped` means no token in this
 * deployment. `failed` carries the classified reason so a 403 says which scope
 * is missing rather than "forbidden".
 */
export type PushOutcome =
  | {
      status: 'created';
      contactId: string | null;
      /**
       * True when the create may have revived a contact Joey had deleted.
       *
       * The spec documents that an email matching a **deleted** contact brings
       * them back, and that it answers with an ordinary 201 — so a revive and a
       * genuinely new contact are indistinguishable in the response. This flag
       * says "this 201 could have been either", which is the honest claim, and
       * it is what the log line below is for: if Joey finds somebody back in
       * his book that he removed, the line names the lead that did it.
       *
       * Not suppressed by a pre-flight lookup, deliberately. A lookup would
       * find a live contact and not a deleted one — deleted contacts are gone
       * from `GET /contacts` entirely, per the sync guide — so it could not
       * tell the two apart either, and it would spend a list call per lead to
       * learn nothing. The person also asked to be contacted, by typing their
       * address into this site, which is the strongest argument there is for
       * letting the create stand.
       */
      revivedIfPreviouslyDeleted: true;
    }
  | { status: 'exists'; detail: string }
  | { status: 'skipped'; reason: 'unconfigured' }
  | {
      status: 'failed';
      reason: string;
      missingScope: string | null;
      requestId: string | null;
    };

/** Trim to a cap without cutting mid-word where that is cheap. */
function cappedNote(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > MAX_NOTE_LENGTH
    ? `${trimmed.slice(0, MAX_NOTE_LENGTH - 1)}…`
    : trimmed;
}

/**
 * The note filed on the contact: what this person actually said they wanted.
 *
 * Built from the lead's own fields rather than a template, so Joey opens the
 * contact in RealScout and reads the same intent the dashboard shows him.
 */
export function pushNote(lead: Lead): string {
  const parts = [`Website lead from gowithjoeyo.com — intent: ${lead.intent}.`];

  if (lead.timeline) parts.push(`Timeline: ${lead.timeline}.`);
  if (lead.budget) parts.push(`Budget: ${lead.budget}.`);
  if (lead.location) parts.push(`Location: ${lead.location}.`);
  if (lead.propertyType) parts.push(`Property type: ${lead.propertyType}.`);
  if (lead.bedrooms !== undefined) parts.push(`Beds: ${lead.bedrooms}.`);
  if (lead.bathrooms !== undefined) parts.push(`Baths: ${lead.bathrooms}.`);
  if (lead.additionalNotes) parts.push(`Notes: ${lead.additionalNotes}`);

  return cappedNote(parts.join(' '));
}

/** Split a stored full name back into the two fields RealScout takes. */
function nameParts(lead: Lead): { first?: string; last?: string } {
  const pieces = lead.name.trim().split(/\s+/).filter(Boolean);
  const first = pieces[0];
  const last = pieces.slice(1).join(' ');
  return {
    ...(first === undefined ? {} : { first }),
    ...(last === '' ? {} : { last }),
  };
}

/** The create body for one lead. Exported so a test can pin the alert flags. */
export function pushBody(lead: Lead): CreateContactInput {
  const { first, last } = nameParts(lead);

  return {
    email: lead.email,
    ...(first === undefined ? {} : { first_name: first }),
    ...(last === undefined ? {} : { last_name: last }),
    ...(lead.phone === undefined ? {} : { primary_mobile_phone: lead.phone }),
    lead_source: REALSCOUT_PUSH_LEAD_SOURCE,
    ...(lead.intent === 'buy'
      ? { contact_type: 'BUYER' }
      : lead.intent === 'sell'
        ? { contact_type: 'SELLER' }
        : {}),
    note: pushNote(lead),
    tags: [REALSCOUT_PUSH_TAG],
    // The bridge back to our row. No column needed on this side: the contact is
    // found again with `GET /contacts?external_user_key=<lead id>`.
    external_user_key: lead.id,
    // Explicitly off. See this module's header.
    price_status_alerts_enabled: false,
    exclusives_alerts_enabled: false,
  };
}

/**
 * Create the RealScout contact for a lead this site just captured.
 *
 * Never throws, and never rejects. Both documented hazards on `POST /contacts`
 * are handled as outcomes rather than as failures:
 *
 *   - **an email a live contact already holds is refused** with
 *     `400 invalid_request`, `field: "email"`. That is `exists`, and it is a
 *     success: the person is already a RealScout contact, which is all the push
 *     was trying to achieve. The documented remedy — look the contact up rather
 *     than retry — needs no action here, because nothing is stored on our side
 *     to fill in; the `external_user_key` filter finds them when they are
 *     needed. Nothing is patched onto the existing contact either: the agent's
 *     own entries win over a form submission, and overwriting Joey's lead
 *     source or note with ours would destroy what he typed.
 *   - **an email matching a deleted contact revives them.** See
 *     `revivedIfPreviouslyDeleted`; the 201 is accepted and the log names the
 *     lead so the act is traceable.
 */
export async function pushLeadToRealScout(lead: Lead): Promise<PushOutcome> {
  if (!realScoutConfigured()) {
    console.warn('[realscout:push] REALSCOUT_API_TOKEN not set, skipping sync');
    return { status: 'skipped', reason: 'unconfigured' };
  }

  try {
    const outcome = await createRealScoutContact(pushBody(lead));

    if (outcome.status === 'exists') {
      console.log(
        `[realscout:push] lead=${lead.id} already a live RealScout contact; ` +
          'left as RealScout holds it',
      );
      return { status: 'exists', detail: outcome.message };
    }

    // The create may have revived a contact Joey deleted — RealScout answers
    // 201 either way — so the lead id is logged to make that traceable.
    console.log(
      `[realscout:push] lead=${lead.id} created RealScout contact ` +
        `${outcome.contact?.id ?? 'unknown'} (a 201 here also covers reviving a ` +
        'previously deleted contact at this address)',
    );

    return {
      status: 'created',
      contactId: outcome.contact?.id ?? null,
      revivedIfPreviouslyDeleted: true,
    };
  } catch (error) {
    // Everything below is a log and a return. The lead is already committed and
    // a RealScout problem must not reach the visitor.
    if (error instanceof RealScoutError) {
      console.error(
        `[realscout:push] lead=${lead.id} failed (${error.kind}` +
          `${error.missingScope === null ? '' : `, missing ${error.missingScope}`}` +
          `${error.requestId === null ? '' : `, request ${error.requestId}`}): ` +
          error.message,
      );
      return {
        status: 'failed',
        reason: error.kind,
        missingScope: error.missingScope,
        requestId: error.requestId,
      };
    }

    console.error(`[realscout:push] lead=${lead.id} failed unexpectedly:`, error);
    return { status: 'failed', reason: 'unknown', missingScope: null, requestId: null };
  }
}

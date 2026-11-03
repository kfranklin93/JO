/**
 * What RealScout knows about one lead, for the expanded dashboard row.
 *
 * Joey's question in front of a lead is "are they actually looking?", and this
 * app cannot answer it: the browsing happens on RealScout. So the panel shows
 * the Scout Score with its 7- and 30-day movement, the last few things the
 * person did — properties viewed, saved, rated, showings requested — and a link
 * through to the contact in RealScout.
 *
 * ## This is client browsing behaviour and never goes on a public page
 *
 * Which houses a named person looked at is the most sensitive data this feature
 * touches. It is read only by `GET /api/dashboard/leads/[id]/history`, which
 * verifies the dashboard session cookie before anything else, exactly as its
 * sibling dashboard routes do. Nothing here is imported by a page component, a
 * server component that renders publicly, or any route outside `/api/dashboard`.
 *
 * ## Finding the contact, in two calls at most
 *
 * 1. `GET /contacts?external_user_key=<lead id>` — finds a contact this site
 *    pushed, because the push sets `external_user_key` to the lead's UUID. The
 *    spec notes the key is not enforced unique, so the first match is taken and
 *    the possibility of a second is not pretended away.
 * 2. `GET /contacts?email=<lead email>` — finds everything else: a contact
 *    captured by a RealScout widget, or one Joey entered himself. A RealScout
 *    email is unique per agent, so this returns at most one.
 *
 * `GET /contacts/{id}` is deliberately not used even though synced leads carry
 * `form_data.realscoutContactId`: the two filters cover every lead including the
 * ones that predate the sync, and one code path is easier to trust than two.
 */

import { eq } from 'drizzle-orm';
import { db, leads } from '@/lib/db';
import {
  listRealScoutActivity,
  listRealScoutContacts,
  realScoutConfigured,
  RealScoutError,
  type RealScoutActionable,
  type RealScoutActivity,
  type RealScoutContact,
} from '@/lib/services/realscout';
import { safeRealScoutUrl } from '@/lib/services/realscout-mapping';

/** How many activity rows the panel shows. Enough to read, cheap to fetch. */
export const ACTIVITY_LIMIT = 12;

/** One thing the contact did, already shaped for display. */
export interface RealScoutActivityItem {
  id: string;
  /** The raw action name, e.g. `view`, `save`, `request_showing`. */
  action: string;
  /** ISO timestamp, or null when RealScout did not give one. */
  at: string | null;
  /** 1–5 for a `rated` action, null otherwise. */
  rating: number | null;
  /** What it was about — an address, a report name, a search name. */
  label: string;
  /** Price, beds and baths where the actionable is a property. */
  detail: string | null;
  /** Vetted https RealScout URL, or null. See `safeRealScoutUrl`. */
  url: string | null;
}

/** The contact's engagement, as RealScout scores it. */
export interface RealScoutContactSummary {
  id: string;
  /** Vetted link to the contact in RealScout, or null. */
  url: string | null;
  scoutScore: number | null;
  scoutScoreChange7d: number | null;
  scoutScoreChange30d: number | null;
  /** RealScout's own one-line reading of the last 30 days. */
  summary30d: string | null;
  /** False when RealScout cannot email them — shown as a warning. */
  emailable: boolean | null;
  lastActiveAt: string | null;
  leadSource: string | null;
  /** The agent's tags plus RealScout's own, de-duplicated. */
  tags: string[];
}

/** Why there is nothing to show. */
export type SnapshotUnavailableReason =
  | 'unconfigured'
  | 'not_found'
  | 'auth'
  | 'scope'
  | 'rate_limited'
  | 'unavailable';

/**
 * RealScout's view of one lead.
 *
 * A union would be tidier, but the panel needs to render "RealScout is not
 * configured", "this person is not a RealScout contact" and "RealScout could
 * not be reached" differently, and all three are ordinary states rather than
 * errors — so the reason is always present and `contact` is simply null.
 */
export interface RealScoutLeadSnapshot {
  reason: SnapshotUnavailableReason | null;
  /** Set for `scope`: the scope the 403 named, so the panel can say which. */
  missingScope: string | null;
  contact: RealScoutContactSummary | null;
  activity: RealScoutActivityItem[];
}

const unavailable = (
  reason: SnapshotUnavailableReason,
  missingScope: string | null = null,
): RealScoutLeadSnapshot => ({ reason, missingScope, contact: null, activity: [] });

/** Trim an external string, or null. Length-capped so a log line stays a line. */
function text(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** US dollars, no cents. RealScout prices are whole dollars. */
function money(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/**
 * Name what an activity row was about.
 *
 * The `actionable` is one of four shapes told apart by `type`, so each gets the
 * field that identifies it: an address for a property or home report, the alert
 * name for a market alert, the title for a CMA. Falls back to the type itself
 * rather than an empty row, so a shape RealScout adds later still renders.
 */
function describeActionable(actionable: RealScoutActionable | null): {
  label: string;
  detail: string | null;
} {
  if (actionable === null) return { label: 'Something in RealScout', detail: null };

  const place = [
    text(actionable.city, 60),
    text(actionable.state, 20),
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  switch (actionable.type) {
    case 'Property': {
      const address = text(actionable.address, 120);
      const beds = typeof actionable.beds === 'number' ? `${actionable.beds} bd` : null;
      const baths = typeof actionable.baths === 'number' ? `${actionable.baths} ba` : null;
      const detail = [money(actionable.price), beds, baths, place]
        .filter((part): part is string => part !== null && part !== '')
        .join(' · ');

      return {
        label: address ?? text(actionable.mls_number, 40) ?? 'A listing',
        detail: detail === '' ? null : detail,
      };
    }

    case 'HomeReport': {
      const address = text(actionable.address, 120);
      const value = money(actionable.valuation);
      return {
        label: address === null ? 'A home value report' : `Home value: ${address}`,
        detail: [value, place].filter((part): part is string => part !== null && part !== '').join(' · ') || null,
      };
    }

    case 'MarketAlert': {
      const name = text(actionable.name, 120);
      const range = [money(actionable.price_min), money(actionable.price_max)]
        .filter((part): part is string => part !== null)
        .join(' – ');
      return {
        label: name === null ? 'A market report' : `Market report: ${name}`,
        detail: range === '' ? null : range,
      };
    }

    case 'CmaReport': {
      const title = text(actionable.title, 120);
      return {
        label: title === null ? 'A comparative market analysis' : `CMA: ${title}`,
        detail: text(actionable.subject_address, 120),
      };
    }

    default:
      return { label: text(actionable.type, 60) ?? 'Something in RealScout', detail: null };
  }
}

/** Shape one activity row for display, vetting its URL. */
function toActivityItem(row: RealScoutActivity): RealScoutActivityItem {
  const { label, detail } = describeActionable(row.actionable);
  return {
    id: row.id,
    action: typeof row.action === 'string' ? row.action : 'unknown',
    at: row.created_at ?? null,
    rating: typeof row.rating === 'number' ? row.rating : null,
    label,
    detail,
    url: safeRealScoutUrl(row.actionable?.realscout_url),
  };
}

/** Shape the contact for display. */
function toContactSummary(contact: RealScoutContact): RealScoutContactSummary {
  const tags = [...(contact.tags ?? []), ...(contact.realscout_tags ?? [])]
    .map((tag) => text(tag, 60))
    .filter((tag): tag is string => tag !== null);

  return {
    id: contact.id,
    url: safeRealScoutUrl(contact.realscout_url),
    scoutScore: typeof contact.scout_score === 'number' ? contact.scout_score : null,
    scoutScoreChange7d:
      typeof contact.scout_score_change_7d === 'number'
        ? contact.scout_score_change_7d
        : null,
    scoutScoreChange30d:
      typeof contact.scout_score_change_30d === 'number'
        ? contact.scout_score_change_30d
        : null,
    summary30d: text(contact.scout_score_summary_30d, 300),
    emailable: typeof contact.emailable === 'boolean' ? contact.emailable : null,
    lastActiveAt: contact.last_active_at ?? null,
    leadSource: text(contact.lead_source, 120),
    tags: [...new Set(tags)],
  };
}

/** Find the RealScout contact for a lead, by key then by address. */
async function findContact(
  leadId: string,
  email: string | null,
): Promise<RealScoutContact | null> {
  const byKey = await listRealScoutContacts({ external_user_key: leadId, limit: 1 });
  if (byKey.data.length > 0) return byKey.data[0] ?? null;

  if (email === null || email.trim() === '') return null;

  const byEmail = await listRealScoutContacts({ email: email.trim(), limit: 1 });
  return byEmail.data[0] ?? null;
}

/**
 * RealScout's view of the lead with this id.
 *
 * Never throws. Every failure becomes a `reason` the panel can render, because
 * this is one section of a row whose primary job — showing the conversation —
 * works without RealScout and must keep working when RealScout does not.
 */
export async function realScoutLeadSnapshot(
  leadId: string,
): Promise<RealScoutLeadSnapshot> {
  if (!realScoutConfigured()) return unavailable('unconfigured');

  try {
    const [row] = await db
      .select({ email: leads.email })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    const contact = await findContact(leadId, row?.email ?? null);
    if (contact === null) return unavailable('not_found');

    const activity = await listRealScoutActivity({
      contact_id: contact.id,
      limit: ACTIVITY_LIMIT,
    });

    return {
      reason: null,
      missingScope: null,
      contact: toContactSummary(contact),
      activity: activity.data.map(toActivityItem),
    };
  } catch (error) {
    if (error instanceof RealScoutError) {
      // The lead id is ours and safe to log. The contact's details are not
      // logged, and neither is the token.
      console.error(
        `[realscout:lead] lead=${leadId} unavailable (${error.kind}` +
          `${error.missingScope === null ? '' : `, missing ${error.missingScope}`})`,
      );

      if (error.kind === 'auth') return unavailable('auth');
      if (error.kind === 'scope') return unavailable('scope', error.missingScope);
      if (error.kind === 'rate_limited') return unavailable('rate_limited');
      return unavailable('unavailable');
    }

    console.error(`[realscout:lead] lead=${leadId} snapshot failed:`, error);
    return unavailable('unavailable');
  }
}

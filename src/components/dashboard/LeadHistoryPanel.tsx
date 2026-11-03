'use client';

/**
 * One lead's conversation, plus the switch that stops the assistant replying
 * to them.
 *
 * Lives in the expanded leads-table row rather than a view of its own, because
 * the question "what has this person been told?" always arrives while looking
 * at that person. Reads `/api/dashboard/leads/[id]/history`, which is scoped to
 * a single lead — the site-wide view is the Chat Logs tab.
 *
 * ## Rendering choices that are requirements, not taste
 *
 * Direction, channel and timestamp are all shown, and a model-written message
 * is visually distinct from one Joey sent himself (an "AI" tag plus a different
 * fill). That distinction is the point: Joey needs to know at a glance whether
 * he is reading his own words before he follows up on them.
 *
 * Bookings this lead holds are listed above the conversation, since "have they
 * got time with Joey?" is the question that decides what he does next. The
 * section is hidden when there are none rather than showing an empty heading on
 * every row.
 *
 * Fetched lazily on first expand. The leads table can hold hundreds of rows and
 * eagerly loading every transcript would ship every client's words to the
 * browser to render one.
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { describeSlotDay, describeSlotTime } from '@/lib/services/slot-label';
import type {
  AppointmentChannel,
  AppointmentStatus,
} from '@/lib/db/appointment-schema';
import {
  appointmentChannelLabel,
  appointmentStatusLabel,
  appointmentStatusStyle,
} from './appointment-labels';

interface HistoryEntry {
  id: string;
  channel: 'chat' | 'sms' | 'email' | 'phone' | 'in_person';
  direction: 'inbound' | 'outbound';
  content: string;
  subject: string | null;
  aiGenerated: boolean;
  createdAt: string;
  mode?: string | null;
  latencyMs?: number | null;
}

/**
 * A consultation this lead has booked. ISO strings, serialised by the route.
 *
 * `status` and `channel` are the schema's enum unions, so a value added to the
 * database has to be given a label and a colour in `appointment-labels.ts`
 * before this compiles.
 */
interface AppointmentEntry {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  channel: AppointmentChannel;
  createdBy: string;
  notes: string | null;
}

interface HistoryResponse {
  leadId: string;
  history: HistoryEntry[];
  assistant: { muted: boolean; reason: 'global' | 'lead' | 'unavailable' | null };
  appointments: AppointmentEntry[];
  realscout: RealScoutLeadSnapshot;
}

/**
 * What RealScout knows, as the route serialises it.
 *
 * Declared here rather than imported from the service so this client component
 * does not pull a module that imports the database driver into the browser
 * bundle. The field names match `RealScoutLeadSnapshot` in
 * src/lib/services/realscout-lead.ts; that file is the definition.
 */
interface RealScoutLeadSnapshot {
  reason:
    | 'unconfigured'
    | 'not_found'
    | 'auth'
    | 'scope'
    | 'rate_limited'
    | 'unavailable'
    | null;
  missingScope: string | null;
  contact: {
    id: string;
    url: string | null;
    scoutScore: number | null;
    scoutScoreChange7d: number | null;
    scoutScoreChange30d: number | null;
    summary30d: string | null;
    emailable: boolean | null;
    lastActiveAt: string | null;
    leadSource: string | null;
    tags: string[];
  } | null;
  activity: {
    id: string;
    action: string;
    at: string | null;
    rating: number | null;
    label: string;
    detail: string | null;
    url: string | null;
  }[];
}

const CHANNEL_LABELS: Record<HistoryEntry['channel'], string> = {
  chat: 'Website chat',
  sms: 'Text',
  email: 'Email',
  phone: 'Phone',
  in_person: 'In person',
};

/**
 * RealScout's action names, in the tense Joey reads them in.
 *
 * Keyed loosely rather than by a union, because the activity feed's published
 * action set can grow and an unlisted action must still render — see
 * `realScoutActionLabel`.
 */
const REALSCOUT_ACTION_LABELS: Record<string, string> = {
  view: 'Viewed',
  save: 'Saved',
  unsave: 'Un-saved',
  hide: 'Hid',
  unhide: 'Un-hid',
  rated: 'Rated',
  comment: 'Commented on',
  request_showing: 'Asked to see',
  open_house_view: 'Viewed the open house for',
  home_report_view: 'Opened',
  market_alert_view: 'Opened',
  cma_view: 'Opened',
};

/** A label for an action, falling back to the action name made readable. */
function realScoutActionLabel(action: string): string {
  return REALSCOUT_ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

/** A signed score movement, or null when RealScout has no figure. */
function formatScoreChange(change: number | null): string | null {
  if (change === null) return null;
  if (change === 0) return 'no change';
  return change > 0 ? `+${change}` : String(change);
}

/** Why the RealScout section has nothing to show, in Joey's terms. */
const REALSCOUT_UNAVAILABLE: Record<string, string> = {
  unconfigured: 'RealScout is not connected to this site yet.',
  not_found: 'This person is not a RealScout contact.',
  auth: 'RealScout rejected the API token. It needs to be replaced in Netlify.',
  rate_limited: 'RealScout is rate-limiting us right now. Try again in a minute.',
  unavailable: 'Could not reach RealScout just now.',
};

/**
 * Message timestamps render in the *viewer's* timezone, which is right for "when
 * did they say this" — Joey wants it relative to his own clock.
 *
 * Appointment times do not use this. They go through `slot-label.ts`, which pins
 * Joey's zone, because a booking is a commitment to a specific wall clock: a
 * client in California booked 2 PM Eastern, and showing it as 11 AM to whoever
 * happens to be reading would be showing a different appointment.
 */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * What RealScout knows about this person.
 *
 * Always rendered, including when there is nothing to show, because "they are
 * not a RealScout contact" and "RealScout is down" are both answers to the
 * question Joey is asking and an absent section answers neither.
 *
 * Colours come from the `@theme` tokens only. The Scout Score is a champagne
 * fill with its paired `champagne-foreground` label — gold is a fill, never
 * text on a light surface — and every other surface here is the same white card
 * on `navy/10` the bookings and messages above use.
 */
function RealScoutSection({ data }: { data: RealScoutLeadSnapshot }) {
  const heading = (
    <h4 className="font-sans text-xs font-semibold tracking-wider text-stone uppercase">
      RealScout
    </h4>
  );

  if (data.contact === null) {
    const message =
      data.reason === 'scope'
        ? data.missingScope === null
          ? 'The RealScout token is missing a permission this needs.'
          : `The RealScout token is missing the ${data.missingScope} permission.`
        : (REALSCOUT_UNAVAILABLE[data.reason ?? 'unavailable'] ??
          'Could not reach RealScout just now.');

    return (
      <section>
        {heading}
        <p className="mt-2 font-sans text-sm text-stone">{message}</p>
      </section>
    );
  }

  const contact = data.contact;
  const change7d = formatScoreChange(contact.scoutScoreChange7d);
  const change30d = formatScoreChange(contact.scoutScoreChange30d);

  return (
    <section>
      {heading}

      <div className="mt-2 rounded-xl border border-navy/10 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="rounded-full bg-champagne px-3 py-1 font-sans text-sm font-semibold text-champagne-foreground">
            Scout Score {contact.scoutScore ?? '—'}
          </span>

          {change7d !== null && (
            <span className="font-sans text-xs text-stone">7 days {change7d}</span>
          )}

          {change30d !== null && (
            <span className="font-sans text-xs text-stone">30 days {change30d}</span>
          )}

          {contact.lastActiveAt !== null && (
            <span className="font-sans text-xs text-stone">
              Last active {formatWhen(contact.lastActiveAt)}
            </span>
          )}

          {contact.url !== null && (
            <a
              href={contact.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto font-sans text-sm font-medium text-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean"
            >
              Open in RealScout
            </a>
          )}
        </div>

        {contact.summary30d !== null && (
          <p className="mt-2 font-sans text-sm text-navy">{contact.summary30d}</p>
        )}

        {contact.leadSource !== null && (
          <p className="mt-1 font-sans text-xs text-stone">
            RealScout lead source: {contact.leadSource}
          </p>
        )}

        {contact.tags.length > 0 && (
          <p className="mt-1 font-sans text-xs text-stone">
            Tags: {contact.tags.join(', ')}
          </p>
        )}

        {contact.emailable === false && (
          <p className="mt-2 font-sans text-xs font-medium text-red-600">
            RealScout cannot email this contact. Do not add them to an email
            sequence — reach them by phone or text.
          </p>
        )}
      </div>

      {data.activity.length === 0 ? (
        <p className="mt-2 font-sans text-sm text-stone">
          No RealScout activity recorded for this person yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {data.activity.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-navy/10 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-sans text-xs font-semibold tracking-wider text-navy uppercase">
                  {realScoutActionLabel(item.action)}
                </span>
                {item.url === null ? (
                  <span className="font-sans text-sm text-navy">{item.label}</span>
                ) : (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-sans text-sm text-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean"
                  >
                    {item.label}
                  </a>
                )}
                {item.rating !== null && (
                  <span className="font-sans text-xs text-stone">
                    {item.rating} / 5
                  </span>
                )}
                {item.at !== null && (
                  <span className="ml-auto font-sans text-xs text-stone">
                    {formatWhen(item.at)}
                  </span>
                )}
              </div>

              {item.detail !== null && (
                <p className="mt-1 font-sans text-xs text-stone">{item.detail}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LeadHistoryPanel({ leadId }: { leadId: string }) {
  const [data, setData] = React.useState<HistoryResponse | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`/api/dashboard/leads/${leadId}/history`)
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            body && typeof body === 'object' && 'error' in body
              ? String((body as { error: unknown }).error)
              : 'Could not load this conversation.';
          throw new Error(message);
        }
        return body as HistoryResponse;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function toggleMute(next: boolean) {
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/assistant-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: leadId, muted: next }),
      });
      if (!res.ok) throw new Error('Could not change the switch');

      // Only reflected after the server confirms. An optimistic update here
      // would show the assistant as silenced when it is still replying, which
      // is the one thing this control must never do.
      setData((prev) =>
        prev
          ? { ...prev, assistant: { muted: next, reason: next ? 'lead' : null } }
          : prev,
      );
    } catch {
      setError('Could not change the assistant switch. It has not been changed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="py-4 font-sans text-sm text-stone">Loading conversation&hellip;</p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="py-4 font-sans text-sm font-medium text-red-600">
        {error}
      </p>
    );
  }

  if (!data) return null;

  const mutedGlobally = data.assistant.reason === 'global';

  return (
    <div className="space-y-4 py-2">
      {/* ── Assistant switch ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy/10 bg-white px-4 py-3">
        <div>
          <p className="font-sans text-sm font-medium text-navy">
            {data.assistant.muted ? 'Assistant is not replying' : 'Assistant is replying'}
          </p>
          <p className="mt-0.5 font-sans text-xs text-stone">
            {mutedGlobally
              ? 'Switched off for everyone — use the master switch in the header.'
              : data.assistant.reason === 'unavailable'
                ? 'Could not read the switch, so the assistant is staying quiet.'
                : data.assistant.muted
                  ? 'Their messages are still saved here. Nothing is sent automatically.'
                  : 'Turn this off to answer this person yourself.'}
          </p>
        </div>

        <button
          type="button"
          disabled={saving || mutedGlobally}
          onClick={() => void toggleMute(!data.assistant.muted)}
          className={cn(
            'min-h-11 rounded-xl px-4 py-2 font-sans text-sm font-medium transition-colors',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean',
            'disabled:cursor-not-allowed disabled:opacity-50',
            data.assistant.muted
              ? 'bg-cerulean text-bone hover:bg-accent-hover'
              : 'border-2 border-accent text-accent hover:bg-accent hover:text-bone',
          )}
        >
          {data.assistant.muted ? 'Let the assistant reply' : 'I’ll handle this one'}
        </button>
      </div>

      {/* ── Bookings ──
          Rendered only when there are some: an empty "Bookings" heading on
          every lead in the table is noise, and most leads never book. */}
      {data.appointments.length > 0 && (
        <section>
          <h4 className="font-sans text-xs font-semibold tracking-wider text-stone uppercase">
            Bookings
          </h4>
          <ul className="mt-2 space-y-2">
            {data.appointments.map((appointment) => {
              const startsAt = new Date(appointment.startsAt);
              return (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-navy/10 bg-white px-4 py-3"
                >
                  <span className="font-sans text-sm font-medium text-navy">
                    {describeSlotDay(startsAt)}
                  </span>
                  <span className="font-sans text-sm text-stone">
                    {describeSlotTime(startsAt)}
                  </span>
                  <span className="font-sans text-xs text-stone">
                    {appointmentChannelLabel(appointment.channel)}
                  </span>
                  <span
                    className={cn(
                      'ml-auto rounded-full px-2 py-0.5 font-sans text-xs font-medium',
                      appointmentStatusStyle(appointment.status),
                    )}
                  >
                    {appointmentStatusLabel(appointment.status)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── RealScout ──
          Above the conversation because "are they actually looking at houses?"
          decides whether the transcript is worth reading. */}
      <RealScoutSection data={data.realscout} />

      {/* ── Conversation ── */}
      {data.history.length === 0 ? (
        <p className="font-sans text-sm text-stone">
          No messages recorded for this lead yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {data.history.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'rounded-xl border px-4 py-3',
                entry.direction === 'inbound'
                  ? 'border-navy/10 bg-white'
                  : 'border-cerulean/20 bg-cerulean/5',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sans text-xs font-semibold tracking-wider text-navy uppercase">
                  {entry.direction === 'inbound' ? 'They said' : 'We said'}
                </span>
                <span className="font-sans text-xs text-stone">
                  {CHANNEL_LABELS[entry.channel]}
                </span>
                {/* Requirement 8.3 — a model-written message must be
                    distinguishable from one Joey wrote himself. */}
                {entry.aiGenerated && (
                  <span className="rounded-full bg-champagne px-2 py-0.5 font-sans text-xs font-medium text-champagne-foreground">
                    AI
                  </span>
                )}
                <span className="ml-auto font-sans text-xs text-stone">
                  {formatWhen(entry.createdAt)}
                </span>
              </div>

              {entry.subject && (
                <p className="mt-1 font-sans text-xs font-medium text-navy">
                  {entry.subject}
                </p>
              )}

              <p className="mt-1 font-sans text-sm whitespace-pre-line text-navy">
                {entry.content}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

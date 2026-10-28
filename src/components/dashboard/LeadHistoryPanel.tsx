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
}

const CHANNEL_LABELS: Record<HistoryEntry['channel'], string> = {
  chat: 'Website chat',
  sms: 'Text',
  email: 'Email',
  phone: 'Phone',
  in_person: 'In person',
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
      <p role="alert" className="py-4 font-sans text-sm font-medium text-bronze">
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
              ? 'bg-cerulean text-white hover:bg-accent-hover'
              : 'border-2 border-navy text-navy hover:bg-navy hover:text-white',
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

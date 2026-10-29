'use client';

/**
 * Joey's calendar on the dashboard.
 *
 * Reads `/api/dashboard/appointments`, which is DB-backed. This is the view of
 * every upcoming booking; one lead's bookings appear in their expanded row in
 * the leads table, alongside the conversation.
 *
 * ## Times are rendered in Joey's zone, never the viewer's
 *
 * Every time on this panel goes through `slot-label.ts`, which pins Eastern.
 * `toLocaleString` in the browser would render in whichever zone the laptop is
 * set to, so Joey travelling — or an assistant in another zone — would read a
 * different hour than the one the assistant quoted to the client. That is the
 * one mistake this panel must not make, and it is invisible until somebody
 * misses a call.
 *
 * The times print their zone (`3:00 PM Eastern Time`) for the same reason: a
 * correct hour with no zone on screen still leaves the reader guessing which
 * clock it belongs to. Plain "Eastern Time" rather than EST/EDT is Joey's
 * decision — see src/lib/services/slot-label.ts.
 *
 * Colours come from the `@theme` tokens in globals.css, never raw hex. Note the
 * error text is navy rather than gold: champagne measures 1.99:1 as text on
 * this background, so gold is a fill colour here, not a text colour.
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
import { Stat } from './Stat';

interface ApiLead {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
}

interface ApiAppointment {
  id: string;
  leadId: string;
  /** ISO string; `Date` fields serialise on the way through the route. */
  startsAt: string;
  endsAt: string;
  /**
   * The schema's enum values. Declared as the union rather than `string` so a
   * status added to the database has to be given a label and a colour before
   * this compiles; the accessors still tolerate an unknown one at runtime,
   * since this arrives as parsed JSON.
   */
  status: AppointmentStatus;
  channel: AppointmentChannel;
  createdBy: string;
  notes: string | null;
  lead: ApiLead | null;
}

interface ApiResponse {
  appointments: ApiAppointment[];
  range: { from: string; to: string | null };
}

export function AppointmentsPanel() {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    fetch('/api/dashboard/appointments')
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            body && typeof body === 'object' && 'error' in body
              ? String((body as { error: unknown }).error)
              : 'Could not load the calendar.';
          throw new Error(message);
        }
        return body as ApiResponse;
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
  }, []);

  if (loading) {
    return (
      <p className="rounded-xl border border-navy/10 bg-white py-16 text-center font-sans text-sm text-stone">
        Loading the calendar&hellip;
      </p>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-champagne/40 bg-white px-6 py-8 text-center"
      >
        <p className="font-sans text-sm font-medium text-navy">{error}</p>
      </div>
    );
  }

  if (!data || data.appointments.length === 0) {
    return (
      <div className="rounded-xl border border-navy/10 bg-white px-6 py-16 text-center">
        <p className="font-sans text-sm text-stone">Nothing booked yet.</p>
        <p className="mt-2 font-sans text-xs text-silver">
          Bookings appear here once a client books a consultation through the
          assistant.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Stat label="Bookings" value={data.appointments.length} />

      <ul className="space-y-2">
        {data.appointments.map((appointment) => {
          const startsAt = new Date(appointment.startsAt);
          const name =
            appointment.lead?.name ?? appointment.lead?.email ?? 'Unknown lead';

          return (
            <li
              key={appointment.id}
              className="rounded-xl border border-navy/10 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                <div className="min-w-32">
                  <p className="font-sans text-sm font-semibold text-navy">
                    {describeSlotDay(startsAt)}
                  </p>
                  <p className="mt-0.5 font-sans text-sm text-stone">
                    {describeSlotTime(startsAt)}
                  </p>
                </div>

                <div className="min-w-48 flex-1">
                  <p className="font-sans text-sm font-medium text-navy">{name}</p>
                  {appointment.lead && (
                    <p className="mt-0.5 font-sans text-xs text-stone">
                      {appointment.lead.email}
                      {appointment.lead.phone
                        ? ` \u00b7 ${appointment.lead.phone}`
                        : ''}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-sans text-xs text-stone">
                    {appointmentChannelLabel(appointment.channel)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-sans text-xs font-medium',
                      appointmentStatusStyle(appointment.status),
                    )}
                  >
                    {appointmentStatusLabel(appointment.status)}
                  </span>
                </div>
              </div>

              {appointment.notes && (
                <p className="mt-2 font-sans text-xs whitespace-pre-line text-stone">
                  {appointment.notes}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

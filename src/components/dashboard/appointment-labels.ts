/**
 * How a booking's status and channel are written and coloured on the dashboard.
 *
 * One module because two surfaces render the same booking: the Calendar view
 * (`AppointmentsPanel`) and the expanded row in the leads table
 * (`LeadHistoryPanel`). They were literal copies of each other, which is the
 * kind of duplication that survives until the day somebody renames a status in
 * one place and Joey sees two different words for the same appointment.
 *
 * The maps are keyed by the enum unions from the appointments schema, so adding
 * a status or a channel there is a compile error here rather than a row that
 * silently renders raw database text. The accessors still take a plain `string`
 * and fall back, because what arrives in the browser is parsed JSON and nothing
 * at runtime enforces the type — the fallback tidies an unknown value instead
 * of showing Joey `no_show`-style snake case.
 *
 * Colours are `@theme` tokens from globals.css. Champagne appears only as a
 * fill with `text-champagne-foreground`: as text on this background it measures
 * 1.99:1, well under the AA floor.
 */

import type {
  AppointmentChannel,
  AppointmentStatus,
} from '@/lib/db/appointment-schema';

/** How the consultation happens. A different vocabulary from a message channel. */
const CHANNEL_LABELS: Record<AppointmentChannel, string> = {
  phone: 'Phone call',
  video: 'Video call',
  in_person: 'In person',
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  canceled: 'Canceled',
  completed: 'Completed',
  no_show: 'No show',
};

/**
 * Status badges.
 *
 * Gold is the no-show — the one status worth noticing at a glance, and the only
 * use of champagne that passes contrast.
 */
const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: 'bg-navy/10 text-navy',
  canceled: 'bg-neutral-100 text-stone',
  completed: 'bg-hunter/10 text-hunter',
  no_show: 'bg-champagne text-champagne-foreground',
};

/** Neutral badge for a value the maps have never heard of. */
const UNKNOWN_STATUS_STYLE = 'bg-neutral-100 text-stone';

/**
 * Readable text for a value no map covers.
 *
 * Only reachable if the database grows a value the build has not seen — a
 * deploy skew, in practice. "Rescheduled" is a better thing for Joey to read
 * than `rescheduled`, and both beat an empty cell.
 */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, ' ').trim();
  if (!spaced) return 'Unknown';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function appointmentChannelLabel(channel: string): string {
  return CHANNEL_LABELS[channel as AppointmentChannel] ?? humanize(channel);
}

export function appointmentStatusLabel(status: string): string {
  return STATUS_LABELS[status as AppointmentStatus] ?? humanize(status);
}

export function appointmentStatusStyle(status: string): string {
  return STATUS_STYLES[status as AppointmentStatus] ?? UNKNOWN_STATUS_STYLE;
}

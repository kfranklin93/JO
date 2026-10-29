/**
 * Making, cancelling and listing bookings.
 *
 * ## Two visitors, one slot
 *
 * The interesting case is concurrency, and it is not hypothetical — two people
 * reading the same availability list and tapping the same slot a second apart is
 * exactly what happens when a listing goes live.
 *
 * No application-level check can prevent it. "Is this slot free?" followed by
 * "book it" is two statements, and between them the other request writes. So the
 * guarantee lives in the database: a partial unique index on `starts_at` where
 * `status = 'scheduled'`, which makes Postgres refuse the second insert. This
 * module's job is to catch that refusal and turn it into a civil answer rather
 * than a 500.
 *
 * {@link book} therefore returns a discriminated result instead of throwing.
 * "That slot just went" is an ordinary outcome of booking, not an error, and the
 * assistant needs to be able to say so and offer alternatives.
 *
 * ## The model never picks the time, only passes it on
 *
 * {@link book} re-derives availability from the rules and the current bookings
 * and refuses anything that is not a genuinely free slot. A language model asked
 * to book "tomorrow afternoon" will happily produce a plausible instant; this is
 * the layer that declines it. That check cannot be skipped by a caller, which is
 * the point — it is not a validation helper the tool layer may forget to call.
 *
 * ## Validation and offers use different notice windows
 *
 * {@link book} validates against `MIN_NOTICE_MINUTES`. {@link offerSlots} and
 * every `alternatives` list below use the wider `OFFER_NOTICE_MINUTES`. Reading
 * two notice periods in one module looks like a bug and is not — see the note
 * on `OFFER_BUFFER_MINUTES` in ./availability.ts. In short: a slot has to
 * survive the conversation it is offered in, and a client who picks promptly
 * must never be refused.
 *
 * ## Email is best effort, the row is not
 *
 * The confirmation to the client and the heads-up to Joey are attempted after
 * the insert has committed, by {@link confirm}. A failed send cannot roll the
 * booking back, and the actual outcome travels out on the result so the
 * assistant can say what happened rather than assume it worked.
 */

import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  type Appointment,
  type AppointmentChannel,
} from '@/lib/db/appointment-schema';
import { leads } from '@/lib/db/schema';
import {
  SLOT_MINUTES,
  freeSlots,
  isBookable,
  offerableSlots,
  type Slot,
  type SlotOptions,
} from '@/lib/services/availability';
import {
  notifyJoeyOfAppointment,
  sendAppointmentConfirmation,
  type ConfirmationOutcome,
} from '@/lib/services/email-service';
import { readLeadFormData, resolveLeadName, toLeadIntent } from '@/lib/services/lead-mapping';

/** Postgres's code for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * Whether an error is the double-booking race rather than a real fault.
 *
 * The driver nests the original error, so the code is looked for on the error
 * and on its `cause`. Matched on the constraint name as well so an unrelated
 * unique violation is not mistaken for a taken slot — if some future index also
 * trips, reporting "that time was taken" would be a lie.
 */
function isSlotTaken(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown })?.cause];

  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const { code, constraint, message } = candidate as {
      code?: string;
      constraint?: string;
      message?: string;
    };
    if (code !== UNIQUE_VIOLATION) return false;
    return (
      constraint === 'appointments_one_per_slot_idx' ||
      (message ?? '').includes('appointments_one_per_slot_idx')
    );
  });
}

/**
 * Why a requested instant was never on offer.
 *
 * `not_bookable` used to be one undifferentiated outcome, and the assistant had
 * to pick an explanation for it. Given the choice between "somebody got there
 * first" and "that cannot be held", it told clients their slot had been taken
 * when nothing had been taken — the calendar was empty. These three values are
 * what let every layer above state the true reason instead of guessing one.
 */
export type NotBookableDetail =
  /**
   * A real slot, now inside the minimum-notice window. The conversation
   * outlasted the offer, which is the failure the offer buffer exists to make
   * rare and this value exists to describe honestly when it still happens.
   */
  | 'too_soon'
  /** Already gone. */
  | 'in_the_past'
  /** Off the grid, outside business hours, blacked out, or past the horizon. */
  | 'not_on_the_calendar';

/** What happened when a booking was attempted. */
export type BookingResult =
  | {
      ok: true;
      appointment: Appointment;
      alreadyBooked: boolean;
      /**
       * Whether the client's confirmation email actually went out.
       *
       * Carried on the success case rather than inferred by the caller, because
       * the assistant must not tell a client a confirmation was sent unless one
       * was. The booking itself is unaffected either way — the row is already
       * committed by the time this is known.
       */
      confirmation: ConfirmationOutcome;
      /** Whether Joey's own heads-up went out. Logged, not shown to the client. */
      joeyNotified: boolean;
    }
  | { ok: false; reason: 'slot_taken'; alternatives: Slot[] }
  | {
      ok: false;
      reason: 'not_bookable';
      detail: NotBookableDetail;
      alternatives: Slot[];
    }
  | { ok: false; reason: 'unavailable' };

export interface BookRequest {
  leadId: string;
  /** The exact instant requested. Must match a free slot on the grid. */
  startsAt: Date;
  channel?: AppointmentChannel;
  notes?: string;
  createdBy?: 'assistant' | 'joey';
}

/** How many alternatives to offer when a request cannot be honoured. */
const ALTERNATIVES = 4;

/** Bookings from now to the horizon, used to subtract from availability. */
async function scheduledFrom(now: Date): Promise<Date[]> {
  const rows = await db
    .select({ startsAt: appointments.startsAt })
    .from(appointments)
    .where(
      and(eq(appointments.status, 'scheduled'), gte(appointments.startsAt, now)),
    );

  return rows.map((row) => row.startsAt);
}

/**
 * Book a consultation.
 *
 * @param now - Injected rather than read from the clock so the booking window
 *   is testable, and so a caller cannot end up validating against a different
 *   instant than it offered slots for.
 */
export async function book(
  request: BookRequest,
  now: Date = new Date(),
): Promise<BookingResult> {
  let booked: Date[];
  try {
    booked = await scheduledFrom(now);
  } catch (err) {
    // Fail closed. Offering a slot without knowing what is already taken is how
    // Joey ends up double-booked, which costs more than a missed booking.
    console.error('[booking] could not read existing appointments:', err);
    return { ok: false, reason: 'unavailable' };
  }

  const options = { booked };
  // Validation uses the real notice rule; the alternatives handed back are
  // offers, so they carry the margin. Anything else would re-create the bug
  // this function is being fixed for, one turn later — the client picks an
  // alternative that expires while they are picking it.
  const available = freeSlots(now, options);
  const offerable = offerableSlots(now, options);

  // Idempotency before validation: a lead who asks twice for a slot they already
  // hold should be told yes, not that it is taken. The assistant retrying a tool
  // call is the common cause.
  const existing = await existingFor(request.leadId, request.startsAt);
  if (existing) {
    // No second confirmation email. One was attempted when the row was created,
    // and claiming a send that did not happen on this call is the exact failure
    // being fixed here.
    return {
      ok: true,
      appointment: existing,
      alreadyBooked: true,
      confirmation: 'not_attempted',
      joeyNotified: false,
    };
  }

  const target = request.startsAt.getTime();
  const isFree = available.some((slot) => slot.startsAt.getTime() === target);

  if (!isFree) {
    // Taken means somebody holds it. Everything else was never on offer, and
    // which kind matters — see NotBookableDetail.
    const taken = booked.some((instant) => instant.getTime() === target);

    if (taken) {
      return {
        ok: false,
        reason: 'slot_taken',
        alternatives: offerable.slice(0, ALTERNATIVES),
      };
    }

    return {
      ok: false,
      reason: 'not_bookable',
      detail: whyNotBookable(request.startsAt, now, options),
      alternatives: offerable.slice(0, ALTERNATIVES),
    };
  }

  try {
    const [created] = await db
      .insert(appointments)
      .values({
        leadId: request.leadId,
        startsAt: request.startsAt,
        endsAt: new Date(request.startsAt.getTime() + SLOT_MINUTES * 60_000),
        channel: request.channel ?? 'phone',
        createdBy: request.createdBy ?? 'assistant',
        ...(request.notes ? { notes: request.notes } : {}),
      })
      .returning();

    if (!created) {
      console.error('[booking] insert returned no row');
      return { ok: false, reason: 'unavailable' };
    }

    // The row is committed. Everything below is best effort and cannot change
    // that — see confirm().
    const { confirmation, joeyNotified } = await confirm(created);

    return { ok: true, appointment: created, alreadyBooked: false, confirmation, joeyNotified };
  } catch (err) {
    if (isSlotTaken(err)) {
      // The race, lost. An ordinary outcome: somebody booked it between the
      // check above and this insert. Alternatives are re-derived so they
      // exclude the slot that just went.
      console.log(
        `[booking] slot ${request.startsAt.toISOString()} was taken concurrently`,
      );
      const fresh = offerableSlots(now, { booked: [...booked, request.startsAt] });
      return { ok: false, reason: 'slot_taken', alternatives: fresh.slice(0, ALTERNATIVES) };
    }

    console.error('[booking] could not create the appointment:', err);
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Which kind of "never on offer" this was.
 *
 * Too-soon is the one worth getting exactly right, because it is the only
 * failure caused by the passage of time rather than by the instant being wrong
 * — the only case where the slot genuinely was free when the client was shown
 * it, which is what makes "the window has closed on it" the honest thing to
 * say. So it is decided by asking whether this would have been a real slot with
 * the notice rule lifted, not by measuring the gap: an instant that is both
 * off-grid and imminent is not "too soon", it was never a slot, and reporting
 * the notice window for it would be a different untruth in place of the one
 * being fixed.
 */
function whyNotBookable(
  startsAt: Date,
  now: Date,
  options: SlotOptions,
): NotBookableDetail {
  if (startsAt.getTime() < now.getTime()) return 'in_the_past';

  // Reaching here means the instant is not currently free, so if it is on the
  // grid and unbooked with zero notice required, the notice rule is the only
  // thing standing between the client and the slot they picked.
  const wouldHaveBeenASlot = isBookable(startsAt, now, {
    ...options,
    minNoticeMinutes: 0,
  });

  return wouldHaveBeenASlot ? 'too_soon' : 'not_on_the_calendar';
}

/**
 * Tell the client and Joey that the appointment exists.
 *
 * Runs after the insert has committed, and is structurally incapable of undoing
 * it: nothing here throws, and the worst outcome is a `'failed'` the caller
 * reports honestly. A booking that happened must never be presented as a
 * booking that did not, and the reverse — claiming a confirmation nobody
 * received — is what started this.
 *
 * Both sends are attempted independently. Joey hearing about a booking does not
 * depend on the client's address being mailable, and the client's confirmation
 * does not depend on Joey's inbox.
 *
 * Any failure — an unverified sending domain, a missing key, an opt-out — is
 * logged here and reported upward as its actual outcome rather than swallowed.
 */
async function confirm(
  appointment: Appointment,
): Promise<{ confirmation: ConfirmationOutcome; joeyNotified: boolean }> {
  let lead: Awaited<ReturnType<typeof leadFor>>;
  try {
    lead = await leadFor(appointment.leadId);
  } catch (err) {
    console.error('[booking] could not read the lead to confirm the booking:', err);
    return { confirmation: 'failed', joeyNotified: false };
  }

  if (!lead) {
    // Nothing to send to, and nothing to tell Joey about the client either.
    console.error(
      `[booking] appointment ${appointment.id} has no lead row; no confirmation sent`,
    );
    return { confirmation: 'failed', joeyNotified: false };
  }

  const details = {
    startsAt: appointment.startsAt,
    channel: appointment.channel,
    lead,
  };

  // Both helpers already absorb their own failures. Guarded again here because
  // this `await` sits inside the try that owns the insert, so an escaping throw
  // would be caught there and reported as `unavailable` — a committed booking
  // described to the client as a failed one. Belt and braces, deliberately.
  let confirmation: ConfirmationOutcome;
  let joeyNotified: boolean;
  try {
    [confirmation, joeyNotified] = await Promise.all([
      sendAppointmentConfirmation(details),
      notifyJoeyOfAppointment(details),
    ]);
  } catch (err) {
    console.error('[booking] confirmation email path threw:', err);
    return { confirmation: 'failed', joeyNotified: false };
  }

  if (confirmation !== 'sent') {
    console.error(
      `[booking] appointment ${appointment.id} is booked but the client ` +
        `confirmation was ${confirmation}`,
    );
  }
  if (!joeyNotified) {
    console.error(
      `[booking] appointment ${appointment.id} is booked but Joey was not notified`,
    );
  }

  return { confirmation, joeyNotified };
}

/** The client an appointment belongs to, in the shape the emails need. */
async function leadFor(leadId: string) {
  const [row] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!row) return undefined;

  const form = readLeadFormData(row);

  return {
    name: resolveLeadName(row) ?? null,
    email: row.email,
    phone: row.phone ?? null,
    intent: toLeadIntent(row.propertyInterest),
    notes: form.additionalNotes ?? null,
  };
}

/** A scheduled booking this lead already holds at this instant, if any. */
async function existingFor(
  leadId: string,
  startsAt: Date,
): Promise<Appointment | undefined> {
  try {
    const [row] = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.leadId, leadId),
          eq(appointments.startsAt, startsAt),
          eq(appointments.status, 'scheduled'),
        ),
      )
      .limit(1);

    return row;
  } catch {
    // Not fatal: the insert below will still be refused by the unique index if
    // this was wrong, so the worst case is a 'slot_taken' answer instead of an
    // idempotent yes.
    return undefined;
  }
}

/**
 * Cancel a booking, freeing its slot.
 *
 * Status change rather than a delete, so the history survives — Joey wants to
 * know that someone booked and cancelled, which a deleted row cannot tell him.
 * The unique index is partial on `scheduled`, so this genuinely frees the slot.
 */
export async function cancel(appointmentId: string): Promise<boolean> {
  const now = new Date();

  const updated = await db
    .update(appointments)
    .set({ status: 'canceled', canceledAt: now, updatedAt: now })
    .where(
      and(eq(appointments.id, appointmentId), eq(appointments.status, 'scheduled')),
    )
    .returning({ id: appointments.id });

  return updated.length > 0;
}

/** A booking as the dashboard and the assistant render it. */
export interface BookingView {
  id: string;
  leadId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  channel: string;
  createdBy: string;
  notes: string | null;
}

/** Scheduled bookings from `from` onward, soonest first. */
export async function upcoming(
  from: Date = new Date(),
  limit = 50,
): Promise<BookingView[]> {
  return db
    .select({
      id: appointments.id,
      leadId: appointments.leadId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      channel: appointments.channel,
      createdBy: appointments.createdBy,
      notes: appointments.notes,
    })
    .from(appointments)
    .where(
      and(eq(appointments.status, 'scheduled'), gte(appointments.startsAt, from)),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(limit);
}

/** Every booking for one lead, for the per-lead history panel. */
export async function forLead(leadId: string): Promise<BookingView[]> {
  return db
    .select({
      id: appointments.id,
      leadId: appointments.leadId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      channel: appointments.channel,
      createdBy: appointments.createdBy,
      notes: appointments.notes,
    })
    .from(appointments)
    .where(eq(appointments.leadId, leadId))
    .orderBy(asc(appointments.startsAt));
}

/**
 * Bookings inside a window, for a calendar view.
 *
 * Bounded like {@link upcoming}, and for the same reason: every row carries a
 * lead's name, email and phone once it passes through {@link withLeads}, so an
 * unbounded window would hand back the whole client list in one response the
 * first time somebody asked for a decade. A caller that wants more pages the
 * window.
 */
export async function between(
  start: Date,
  end: Date,
  limit = 50,
): Promise<BookingView[]> {
  return db
    .select({
      id: appointments.id,
      leadId: appointments.leadId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      channel: appointments.channel,
      createdBy: appointments.createdBy,
      notes: appointments.notes,
    })
    .from(appointments)
    .where(
      and(
        gte(appointments.startsAt, start),
        lt(appointments.startsAt, end),
        inArray(appointments.status, ['scheduled', 'completed', 'no_show']),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(limit);
}

/** Just enough of the lead for Joey to know who he is meeting. */
export interface BookingLeadRef {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
}

/** A booking with its client attached. */
export interface BookingWithLead extends BookingView {
  lead: BookingLeadRef | null;
}

/**
 * Attach lead details to a page of bookings.
 *
 * A second query rather than a drizzle `innerJoin`, for two reasons.
 * `upcoming`, `between` and `forLead` stay usable by callers that do not need
 * lead data — the assistant's availability path is one — and a join would make
 * every one of them pay for it. And an inner join would *drop* a booking whose
 * lead row is gone, which is the wrong failure: losing an appointment from
 * Joey's calendar is worse than showing it unattributed, so a missing lead
 * becomes `lead: null` and keeps its place. The same reasoning the follow-up
 * cron applies when a claimed row references a vanished lead.
 *
 * One batched `inArray` lookup, not one query per row; the volume is a page of
 * bookings.
 */
export async function withLeads(
  bookings: readonly BookingView[],
): Promise<BookingWithLead[]> {
  // An empty `inArray` is not a valid query, and there is nothing to look up.
  if (bookings.length === 0) return [];

  const ids = [...new Set(bookings.map((booking) => booking.leadId))];

  const rows = await db.select().from(leads).where(inArray(leads.id, ids));

  const byId = new Map(rows.map((row) => [row.id, row]));

  return bookings.map((booking) => {
    const row = byId.get(booking.leadId);

    return {
      ...booking,
      lead: row
        ? {
            id: row.id,
            // resolveLeadName owns which of the three name columns wins. A
            // second decider here would eventually disagree with the drip.
            name: resolveLeadName(row) ?? null,
            email: row.email,
            phone: row.phone ?? null,
          }
        : null,
    };
  });
}

/**
 * Free slots the assistant or a picker can offer.
 *
 * `offerableSlots`, not `freeSlots`: these are shown to a client who then has to
 * read them, think, and reply. A slot that is bookable this second but will not
 * be in twenty minutes is worse than not offering it, because the conversation
 * ends with the assistant refusing a time it just listed. See
 * OFFER_BUFFER_MINUTES in ./availability.ts.
 */
export async function offerSlots(
  now: Date = new Date(),
  limit = 12,
): Promise<Slot[]> {
  const booked = await scheduledFrom(now);
  return offerableSlots(now, { booked, limit });
}

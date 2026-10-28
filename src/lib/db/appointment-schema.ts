/**
 * Consultation bookings.
 *
 * Joey's own calendar rather than a wrapper around someone else's. The brief for
 * this was explicit: the calendar is for business only, and it is not tied to
 * Google Calendar yet. So availability is declared in code (see
 * ../services/availability.ts) and bookings live here, which means the assistant
 * can actually book something today instead of handing out a link and hoping.
 *
 * A consequence worth stating plainly: until this is synced to Joey's real
 * calendar, it does not know about anything he schedules elsewhere. It can offer
 * a slot he has already filled in Google. That is the tradeoff of shipping
 * booking now, and the sync is the thing that closes it.
 *
 * ## Preventing a double booking
 *
 * The partial unique index in the SQL is the load-bearing part. Two visitors can
 * request the same slot in the same instant, and no application-level "is this
 * free?" check can prevent it — between the read and the write, the other
 * request writes. The index makes Postgres refuse the second, and the booking
 * service turns that refusal into a polite "just taken, here are other times"
 * rather than an error.
 *
 * It is partial on `status = 'scheduled'` so cancelling frees the slot instead
 * of blocking it permanently, and it compares `starts_at` for equality because
 * every bookable slot comes off one fixed grid. Overlapping arbitrary ranges
 * would need an exclusion constraint and `btree_gist`; the grid makes that
 * unnecessary.
 *
 * ## Applying it
 *
 * DDL is in ./appointment-schema.sql and has NOT been applied, the same handoff
 * as the other three. Nothing here modifies ./schema.ts.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { leads } from './schema';

/**
 * Where a booking ended up.
 *
 * `completed` and `no_show` exist so Joey can record what actually happened —
 * the difference matters when he looks back at which leads were worth the time.
 * Postgres cannot drop an enum value once added, so these are permanent.
 */
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'scheduled',
  'canceled',
  'completed',
  'no_show',
]);

/** How the consultation happens. Joey's stated preference is a phone call. */
export const appointmentChannelEnum = pgEnum('appointment_channel', [
  'phone',
  'video',
  'in_person',
]);

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The person being met. Cascades, consistent with chat transcripts. */
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),

    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),

    status: appointmentStatusEnum('status').notNull().default('scheduled'),
    channel: appointmentChannelEnum('channel').notNull().default('phone'),

    /**
     * `'assistant'` or `'joey'`.
     *
     * A plain varchar rather than an enum: this will grow — a booking made by a
     * future Lofty sync, or by an admin on Joey's behalf — and an enum value
     * cannot be removed once added.
     */
    createdBy: varchar('created_by', { length: 16 }).notNull().default('assistant'),

    notes: text('notes'),

    canceledAt: timestamp('canceled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // See the module note. This is what makes concurrent booking safe.
    uniqueIndex('appointments_one_per_slot_idx')
      .on(table.startsAt)
      .where(sql`status = 'scheduled'`),
    index('appointments_starts_at_idx').on(table.startsAt),
    index('appointments_lead_id_idx').on(table.leadId),
  ],
);

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  lead: one(leads, {
    fields: [appointments.leadId],
    references: [leads.id],
  }),
}));

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type AppointmentStatus = (typeof appointmentStatusEnum.enumValues)[number];
export type AppointmentChannel = (typeof appointmentChannelEnum.enumValues)[number];

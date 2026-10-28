-- Consultation bookings. NOT YET APPLIED.
--
-- Mirrors src/lib/db/appointment-schema.ts. Hand-written for the same reason as
-- the chat, opt-out and mute tables: this project has no migration baseline.
--
-- To apply, against the Neon branch you actually mean to change:
--
--   psql "$DATABASE_URL" -f src/lib/db/appointment-schema.sql
--
-- Safe to run twice.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE appointment_status AS ENUM ('scheduled', 'canceled', 'completed', 'no_show');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_channel') THEN
    CREATE TYPE appointment_channel AS ENUM ('phone', 'video', 'in_person');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS appointments (
  id          uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The person being met. ON DELETE CASCADE so removing a lead removes their
  -- bookings, consistent with the chat transcripts.
  lead_id     uuid                NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  starts_at   timestamp           NOT NULL,
  ends_at     timestamp           NOT NULL,
  status      appointment_status  NOT NULL DEFAULT 'scheduled',
  channel     appointment_channel NOT NULL DEFAULT 'phone',

  -- Who created it: the assistant on the lead's behalf, or Joey by hand. Worth
  -- recording because it changes how much he trusts the details.
  created_by  varchar(16)         NOT NULL DEFAULT 'assistant',
  notes       text,

  canceled_at timestamp,
  created_at  timestamp           NOT NULL DEFAULT now(),
  updated_at  timestamp           NOT NULL DEFAULT now(),

  CONSTRAINT appointments_end_after_start CHECK (ends_at > starts_at)
);

-- THE important one. Two visitors can ask for the same slot at the same moment,
-- and an application-level "is it free?" check cannot stop that — between the
-- read and the write, the other request writes. This makes the database refuse
-- the second one.
--
-- Partial, so a canceled booking frees its slot for rebooking rather than
-- blocking it forever. Equality on starts_at is sufficient because every
-- bookable slot comes off a fixed grid of identical length; overlapping
-- arbitrary ranges would need an exclusion constraint and the btree_gist
-- extension, which the fixed grid makes unnecessary.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_per_slot_idx
  ON appointments (starts_at)
  WHERE status = 'scheduled';

-- The calendar view's query: what is coming up.
CREATE INDEX IF NOT EXISTS appointments_starts_at_idx
  ON appointments (starts_at);

-- FK child column; Postgres does not index this side automatically, so both the
-- per-lead lookup and the ON DELETE CASCADE would scan without it.
CREATE INDEX IF NOT EXISTS appointments_lead_id_idx
  ON appointments (lead_id);

COMMIT;

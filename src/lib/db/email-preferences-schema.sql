-- Email opt-out records. NOT YET APPLIED.
--
-- Mirrors src/lib/db/email-preferences-schema.ts. Hand-written for the same
-- reason as the chat tables: this project has no migration baseline, so
-- generating one would emit a migration describing every existing table.
--
-- To apply, against the Neon branch you actually mean to change:
--
--   psql "$DATABASE_URL" -f src/lib/db/email-preferences-schema.sql
--
-- Safe to run twice.
--
-- NOTE: until this is applied, the send path fails closed — no client follow-up
-- email goes out at all, because an unreadable suppression list cannot be
-- distinguished from an empty one. See src/lib/services/email-preferences.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS email_opt_outs (
  -- Lowercased and trimmed by the application before it ever reaches here, so
  -- Dana@x.com cannot keep receiving mail after dana@x.com unsubscribed.
  email              varchar(255) PRIMARY KEY,
  opted_out_at       timestamp    NOT NULL DEFAULT now(),
  source             varchar(32)  NOT NULL,
  -- Null while suppressed. Set when the address opts back in, rather than
  -- deleting the row, so the opt-out/opt-in history stays provable.
  resubscribed_at    timestamp,
  resubscribe_source varchar(32),
  created_at         timestamp    NOT NULL DEFAULT now(),
  updated_at         timestamp    NOT NULL DEFAULT now()
);

-- Supports "who is currently suppressed". The primary key already covers the
-- single-address lookup the send path does.
CREATE INDEX IF NOT EXISTS email_opt_outs_resubscribed_at_idx
  ON email_opt_outs (resubscribed_at);

COMMIT;

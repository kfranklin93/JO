-- Assistant mute switches. NOT YET APPLIED.
--
-- Mirrors src/lib/db/assistant-mute-schema.ts. Hand-written for the same reason
-- as the chat and opt-out tables: this project has no migration baseline.
--
-- To apply, against the Neon branch you actually mean to change:
--
--   psql "$DATABASE_URL" -f src/lib/db/assistant-mute-schema.sql
--
-- Safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS assistant_mutes (
  -- Either the literal 'global' or a lead's uuid as text. The CHECK below is
  -- what keeps a stringly-typed primary key from rotting: nothing else can be
  -- written here, however a future caller mangles its input. No foreign key,
  -- because the column also holds a non-uuid value for the global row — see the
  -- note in the matching .ts file.
  scope      varchar(64) PRIMARY KEY
             CONSTRAINT assistant_mutes_scope_shape CHECK (
               scope = 'global'
               OR scope ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             ),
  muted_at   timestamp NOT NULL DEFAULT now(),
  note       text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

COMMIT;

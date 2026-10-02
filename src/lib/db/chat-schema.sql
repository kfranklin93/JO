-- Web-chat transcript tables. NOT YET APPLIED.
--
-- Mirrors src/lib/db/chat-schema.ts. Hand-written rather than generated because
-- this project has no migration baseline: drizzle.config.ts points `schema` at
-- the single file src/lib/db/schema.ts, HANDOFF.md documents `npm run db:push`
-- as the one-time setup, and no migration has ever been committed. Pointing
-- drizzle-kit at a glob would emit a migration describing every existing table,
-- not just these two.
--
-- To apply, against the Neon branch you actually mean to change:
--
--   psql "$DATABASE_URL" -f src/lib/db/chat-schema.sql
--
-- Check which branch that is first. Local .env.local and the Netlify production
-- variable have pointed at different Neon endpoints, so "the database" is
-- ambiguous until you look.
--
-- Safe to run twice: every statement is guarded.

BEGIN;

-- CREATE TYPE has no IF NOT EXISTS, so it is guarded explicitly.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_role') THEN
    CREATE TYPE chat_role AS ENUM ('user', 'assistant');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS chat_sessions (
  -- No DEFAULT gen_random_uuid(): the route mints the id so it can return it to
  -- the browser in the same response that creates the session.
  id              uuid        PRIMARY KEY,
  -- Nullable: most turns happen before the visitor gives their details.
  -- ON DELETE CASCADE so removing a lead removes what that person typed.
  lead_id         uuid        REFERENCES leads(id) ON DELETE CASCADE,
  last_message_at timestamp   NOT NULL DEFAULT now(),
  message_count   integer     NOT NULL DEFAULT 0,
  created_at      timestamp   NOT NULL DEFAULT now(),
  updated_at      timestamp   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid      NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  -- Position within the session. created_at ties for both rows of one turn,
  -- because DEFAULT now() inside a transaction is the transaction's timestamp.
  seq           integer   NOT NULL,
  role          chat_role NOT NULL,
  content       text      NOT NULL,
  mode          varchar(10),
  tool_calls    jsonb,
  input_tokens  integer,
  output_tokens integer,
  latency_ms    integer,
  created_at    timestamp NOT NULL DEFAULT now()
);

-- Postgres indexes the referenced primary key, never the referencing column, so
-- both the lookups and the ON DELETE CASCADE need these explicitly.
CREATE INDEX IF NOT EXISTS chat_sessions_last_message_at_idx
  ON chat_sessions (last_message_at);
CREATE INDEX IF NOT EXISTS chat_sessions_lead_id_idx
  ON chat_sessions (lead_id);
CREATE INDEX IF NOT EXISTS chat_messages_session_id_seq_idx
  ON chat_messages (session_id, seq);

COMMIT;

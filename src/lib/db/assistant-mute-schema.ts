/**
 * Switches that stop the assistant replying.
 *
 * Two scopes in one table: a single `'global'` row that silences the assistant
 * everywhere, and one row per lead that silences it for that person only.
 *
 * ## Why a table and not an environment variable
 *
 * A kill switch is reached for when something is going wrong, usually at an
 * inconvenient hour. An env var means a Netlify edit plus a redeploy — minutes
 * of build time between Joey deciding to stop it and it stopping. A row takes
 * effect on the next request. That difference is the entire point of the
 * feature, so it drives the design.
 *
 * ## Why `scope` is a string and not two tables
 *
 * The read path asks one question — "may I reply to this person?" — and with a
 * single table that is one query against a primary key, with the global and
 * per-lead answers arriving together. Two tables would mean two round trips on
 * every chat turn, against a serverless database where the round trip is the
 * expensive part.
 *
 * The cost is a primary key holding either the literal `'global'` or a lead's
 * uuid, which is the kind of stringly-typed column that rots. Two things stop
 * it: a CHECK constraint in the SQL that permits only those shapes, and the
 * fact that nothing constructs a scope by hand — see `globalScope()` and
 * `leadScope()` in ../services/assistant-mute.ts.
 *
 * ## No foreign key, deliberately
 *
 * A per-lead row references a lead but declares no FK, so deleting a lead
 * leaves its mute behind. That is harmless — the row holds an id and a
 * timestamp, no personal data, and a mute for a lead that no longer exists
 * silences nothing. The alternative is a FK on a text column holding a
 * non-uuid value for the global row, which does not work.
 *
 * ## Applying it
 *
 * DDL is in ./assistant-mute-schema.sql and has NOT been applied, the same
 * handoff as the chat and opt-out tables. Nothing here modifies ./schema.ts.
 */

import { pgTable, varchar, text, timestamp } from 'drizzle-orm/pg-core';

/** The literal scope that silences the assistant everywhere. */
export const GLOBAL_SCOPE = 'global';

export const assistantMutes = pgTable('assistant_mutes', {
  /**
   * `'global'`, or a lead's uuid as text.
   *
   * Never build this by hand; use `globalScope()` or `leadScope(leadId)`.
   */
  scope: varchar('scope', { length: 64 }).primaryKey(),

  mutedAt: timestamp('muted_at').notNull().defaultNow(),

  /**
   * Why it was muted, for Joey's own benefit when he finds it still off a week
   * later and cannot remember switching it.
   */
  note: text('note'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type AssistantMute = typeof assistantMutes.$inferSelect;
export type NewAssistantMute = typeof assistantMutes.$inferInsert;

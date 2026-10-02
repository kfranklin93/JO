/**
 * Web-chat transcript tables.
 *
 * A separate file from `./schema.ts` on purpose, and the reasons are worth
 * stating because the obvious move — adding `'web'` to `conversationTypeEnum`
 * and writing chat turns into the existing `conversations` table — is the wrong
 * one here.
 *
 *  1. `conversations` is one row per *message keyed to a lead*: `leadId` is
 *     `notNull`. Most web-chat turns happen before anyone has given a name, so
 *     the majority of rows could not be written at all. A chat transcript has to
 *     exist for an anonymous visitor or it is useless.
 *  2. `conversationTypeEnum` has no `'web'` value, and Postgres cannot drop an
 *     enum value once added — `followUpStatusEnum` in schema.ts carries that
 *     warning already. Widening a shared enum to serve a new feature is a
 *     one-way door.
 *  3. `followUps.conversationId` and `analyticsEvents.conversationId` both
 *     reference `conversations`, so changing what a row in that table means has
 *     reach beyond this feature.
 *
 * So: two new tables, a session and its messages, with their own enum.
 *
 * ## Naming
 *
 * `src/lib/db/index.ts` does `export * from './schema'`, so anything re-exported
 * through that barrel shares one namespace. These tables are named
 * `chatSessions` / `chatMessages` and are imported from this module directly
 * rather than through `@/lib/db`, which keeps the barrel untouched and makes a
 * collision with the existing `conversations` export impossible.
 *
 * Note also that `drizzle()` in index.ts is constructed with `schema.ts` only,
 * so these tables are absent from the relational-query schema. Use the plain
 * query builder (`db.select().from(chatMessages)`), never `db.query.*`.
 *
 * ## Applying it
 *
 * The DDL is written out in ./chat-schema.sql and has NOT been applied. This
 * project has never generated a migration — `drizzle.config.ts` points `schema`
 * at the single file `./src/lib/db/schema.ts` and HANDOFF.md documents
 * `npm run db:push` as the one-time setup step — so there is no migration
 * baseline to add to, and pointing drizzle-kit at a glob would emit a migration
 * describing every table in the database rather than just these two. A
 * hand-written SQL file is the honest artifact. Run it against Neon when you are
 * ready; until then the chat UI works and persistence degrades to a logged
 * warning (see src/lib/services/chat-store.ts).
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { leads } from './schema';

/**
 * Who said it.
 *
 * Only the two roles a transcript can contain. System prompts are not stored —
 * they are reconstructable from the code at any commit, and they are long.
 */
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant']);

/**
 * One visit's conversation.
 *
 * `id` carries no `defaultRandom()`, unlike every table in schema.ts. The route
 * has to know the session id in order to return it to the browser, so it mints
 * the uuid itself and the id arrives with the insert. A database default would
 * mean writing first and reading back to find out what the client should echo.
 */
export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey(),

    /**
     * The lead this conversation produced, once it produced one.
     *
     * Nullable because that is the normal state: a visitor chats first and gives
     * their details later, or never. This is the column `conversations.leadId`
     * could not be, and the reason this table exists.
     *
     * `onDelete: 'cascade'` so removing a lead removes what they typed. A
     * transcript is the person's own words about their finances and their
     * timeline, and "delete my record" has to mean that.
     */
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),

    /** Bumped on every turn, so the dashboard can order by recent activity. */
    lastMessageAt: timestamp('last_message_at').notNull().defaultNow(),

    /**
     * Messages stored for this session, both roles counted.
     *
     * Denormalised so the dashboard list does not need an aggregate per row, and
     * so a session whose messages failed to write is visibly inconsistent rather
     * than silently empty.
     */
    messageCount: integer('message_count').notNull().default(0),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // The dashboard's only ordering.
    index('chat_sessions_last_message_at_idx').on(table.lastMessageAt),
    // FK child column — Postgres indexes the referenced key, not this side, so
    // without it both the lead lookup and the ON DELETE CASCADE scan the table.
    index('chat_sessions_lead_id_idx').on(table.leadId),
  ],
);

/** One message. */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),

    /**
     * Position within the session, starting at 1.
     *
     * Ordering by `createdAt` alone is not safe: a turn writes the visitor's
     * message and the reply in one transaction, and `defaultNow()` inside a
     * transaction returns the *transaction's* timestamp, identical for both rows.
     * Sorting on a tie renders the reply above the question. This column makes
     * the order total.
     */
    seq: integer('seq').notNull(),

    role: chatRoleEnum('role').notNull(),
    content: text('content').notNull(),

    /**
     * `'live'` or `'mock'` — whether a real model produced this, or the
     * development fallback did. Assistant rows only.
     *
     * Kept because a transcript full of the mock reply looks like a model
     * behaving oddly rather than a missing API key, and that was a real
     * afternoon lost in production once.
     */
    mode: varchar('mode', { length: 10 }),

    /** Names of the tools invoked on this turn, as a JSON array. */
    toolCalls: jsonb('tool_calls'),

    /** Token usage and wall time, for cost accounting. Assistant rows only. */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // The transcript query, in the order it reads them.
    index('chat_messages_session_id_seq_idx').on(table.sessionId, table.seq),
  ],
);

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  lead: one(leads, {
    fields: [chatSessions.leadId],
    references: [leads.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type ChatRole = (typeof chatRoleEnum.enumValues)[number];

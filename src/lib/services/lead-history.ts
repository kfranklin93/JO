/**
 * One lead's whole conversation, across every channel.
 *
 * Joey's question is "what has this person been told?", and the answer is
 * currently split across two tables that were built at different times for
 * different reasons:
 *
 *  - `chat_messages`, reached through `chat_sessions.leadId` — what the website
 *    assistant said, and what the visitor typed into it.
 *  - `conversations` — the SMS and email log, one row per message, keyed
 *    directly to a lead.
 *
 * Neither alone answers the question. This module merges them into one ordered
 * list with a single shape, so the dashboard does not have to know that the
 * split exists.
 *
 * ## Ordering
 *
 * Merged in memory rather than with a SQL `UNION`. The two tables have
 * different columns, so a union needs a projection per side and the ordering
 * then has to survive both — and the volume here is one lead's messages, which
 * is tens of rows. The simpler code is worth more than the query.
 *
 * Chat messages carry `seq`, which is the only reliable tiebreak within a turn:
 * both rows of one exchange share a transaction timestamp, so sorting on time
 * alone can render the reply above the question. Sorting is therefore by
 * timestamp first and `seq` second, with `seq` absent for SMS and email rows
 * where each message has its own distinct timestamp anyway.
 *
 * ## Reads are for Joey only
 *
 * Every entry is a client's own words. Callers must sit behind the dashboard
 * session check — see src/app/api/dashboard/leads/[id]/history/route.ts, which
 * verifies the cookie before reaching this module.
 */

import { asc, eq } from 'drizzle-orm';
import { db, conversations } from '@/lib/db';
import { chatMessages, chatSessions } from '@/lib/db/chat-schema';

/** Where a message came from. */
export type HistoryChannel = 'chat' | 'sms' | 'email' | 'phone' | 'in_person';

/** Which way it went. */
export type HistoryDirection = 'inbound' | 'outbound';

/** One message, however it arrived. */
export interface HistoryEntry {
  id: string;
  channel: HistoryChannel;
  direction: HistoryDirection;
  /** The message itself. */
  content: string;
  /** Email subject, where there is one. */
  subject: string | null;
  /**
   * Whether a model wrote it.
   *
   * Requirement 8.3: a model-generated message must be visually distinct from
   * one Joey sent himself, which the dashboard cannot do unless this is
   * carried through honestly. Chat assistant turns are always true; SMS and
   * email rows use the `ai_generated` column.
   */
  aiGenerated: boolean;
  createdAt: Date;
  /** Position within a chat turn. Absent for other channels. */
  seq?: number;
  /** Model metadata, chat assistant turns only. */
  mode?: string | null;
  latencyMs?: number | null;
}

/**
 * Narrow the stored `conversation_type` to a channel we can render.
 *
 * The enum is `sms | email | phone | in_person`. Anything unrecognised is
 * reported as `sms` rather than dropped — losing a message from Joey's view of
 * a client relationship is worse than mislabelling its channel, and a value
 * outside the enum means the enum has grown and this needs updating.
 */
function toChannel(type: string): HistoryChannel {
  switch (type) {
    case 'email':
    case 'phone':
    case 'in_person':
    case 'sms':
      return type;
    default:
      console.warn(`[lead-history] unrecognised conversation type "${type}"`);
      return 'sms';
  }
}

/**
 * Every message for one lead, oldest first.
 *
 * Returns an empty list for a lead with no history, and for a lead id that does
 * not exist — the caller cannot distinguish those, which is deliberate: a
 * dashboard user asking for a missing lead gets an empty history rather than a
 * signal about which ids are real.
 */
export async function leadHistory(leadId: string): Promise<HistoryEntry[]> {
  const [chatRows, logRows] = await Promise.all([
    // Chat lives behind the session join; a lead can own several sessions if
    // they came back on another visit.
    db
      .select({
        id: chatMessages.id,
        seq: chatMessages.seq,
        role: chatMessages.role,
        content: chatMessages.content,
        mode: chatMessages.mode,
        latencyMs: chatMessages.latencyMs,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(eq(chatSessions.leadId, leadId))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.seq)),

    db
      .select({
        id: conversations.id,
        type: conversations.type,
        direction: conversations.direction,
        content: conversations.content,
        subject: conversations.subject,
        aiGenerated: conversations.aiGenerated,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.leadId, leadId))
      .orderBy(asc(conversations.createdAt)),
  ]);

  const fromChat: HistoryEntry[] = chatRows.map((row) => ({
    id: row.id,
    channel: 'chat',
    // The visitor is inbound; the assistant is outbound. Mapped from `role`
    // rather than stored twice.
    direction: row.role === 'user' ? 'inbound' : 'outbound',
    content: row.content,
    subject: null,
    aiGenerated: row.role === 'assistant',
    createdAt: row.createdAt,
    seq: row.seq,
    mode: row.mode,
    latencyMs: row.latencyMs,
  }));

  const fromLog: HistoryEntry[] = logRows.map((row) => ({
    id: row.id,
    channel: toChannel(row.type),
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    content: row.content,
    subject: row.subject,
    // The column is nullable; absent means nobody recorded it, which for a
    // hand-sent message is the same as "not AI".
    aiGenerated: row.aiGenerated === true,
    createdAt: row.createdAt,
  }));

  return [...fromChat, ...fromLog].sort((a, b) => {
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    if (byTime !== 0) return byTime;
    // Same instant: only chat rows can collide, and `seq` separates them.
    return (a.seq ?? 0) - (b.seq ?? 0);
  });
}

/**
 * Reading and writing web-chat transcripts.
 *
 * ## Writes never fail a request
 *
 * {@link recordChatTurn} swallows every error and reports a boolean. That is a
 * deliberate choice, not laziness: by the time this is called the model has
 * already been paid for and the reply is already in hand. Letting a storage
 * problem — an unapplied migration, a cold Neon branch, a dropped socket — turn
 * a good answer into an error page would trade the thing the visitor came for
 * against a record of it. The reply ships; the loss is logged.
 *
 * It follows that the chat feature works before ./. ./../db/chat-schema.sql has
 * been applied. Joey's dashboard shows nothing until it is, and the server logs
 * say why on every turn.
 *
 * ## Reads are for Joey only
 *
 * The listing functions return visitors' own words about their budgets and
 * timelines. Every caller must be behind the dashboard session check — see
 * src/app/api/dashboard/chats/route.ts, which verifies the cookie before it
 * reaches this module.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  chatMessages,
  chatSessions,
  type ChatRole,
} from '@/lib/db/chat-schema';

/** One completed exchange: what the visitor said and how the assistant answered. */
export interface ChatTurnRecord {
  sessionId: string;
  /** What the visitor typed. */
  userMessage: string;
  /** What the assistant replied. */
  reply: string;
  /** Whether a real model produced the reply. */
  mode: 'live' | 'mock';
  /** Names of tools the model invoked on this turn. */
  toolCalls: string[];
  /** Wall time for the model call, in milliseconds. */
  latencyMs: number;
  /** Token usage, when the provider reported it. */
  usage?: { input_tokens: number; output_tokens: number };
  /**
   * The lead this turn produced, if `capture_lead` ran and succeeded.
   *
   * Only ever moves from null to a value: see the conflict clause below.
   */
  leadId?: string;
}

/**
 * Persist one exchange.
 *
 * Both messages and the session row land in a single transaction, so a
 * transcript never contains a question without its answer.
 *
 * @returns `true` when the turn was stored, `false` when it was not. A `false`
 *   has already been logged; callers are not expected to react to it beyond
 *   not treating the transcript as complete.
 */
export async function recordChatTurn(turn: ChatTurnRecord): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      // Create the session on its first turn, touch it on every later one.
      //
      // `leadId` is only written when this turn carries one, and is never
      // overwritten with null. A visitor identifies themselves once; later turns
      // in the same conversation carry no lead id and must not erase it.
      await tx
        .insert(chatSessions)
        .values({
          id: turn.sessionId,
          lastMessageAt: new Date(),
          messageCount: 2,
          ...(turn.leadId ? { leadId: turn.leadId } : {}),
        })
        .onConflictDoUpdate({
          target: chatSessions.id,
          set: {
            lastMessageAt: new Date(),
            updatedAt: new Date(),
            messageCount: sql`${chatSessions.messageCount} + 2`,
            ...(turn.leadId
              ? { leadId: sql`coalesce(${chatSessions.leadId}, ${turn.leadId})` }
              : {}),
          },
        });

      // Next position in the session. Read inside the transaction so two
      // concurrent turns on one session cannot both claim the same seq — the
      // session row above is already locked by this transaction's upsert, which
      // serialises them.
      const [latest] = await tx
        .select({ seq: chatMessages.seq })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, turn.sessionId))
        .orderBy(desc(chatMessages.seq))
        .limit(1);

      const base = latest?.seq ?? 0;

      await tx.insert(chatMessages).values([
        {
          sessionId: turn.sessionId,
          seq: base + 1,
          role: 'user' satisfies ChatRole,
          content: turn.userMessage,
        },
        {
          sessionId: turn.sessionId,
          seq: base + 2,
          role: 'assistant' satisfies ChatRole,
          content: turn.reply,
          mode: turn.mode,
          toolCalls: turn.toolCalls,
          latencyMs: turn.latencyMs,
          ...(turn.usage
            ? {
                inputTokens: turn.usage.input_tokens,
                outputTokens: turn.usage.output_tokens,
              }
            : {}),
        },
      ]);
    });

    return true;
  } catch (err) {
    // Warn, not error: the request succeeded. This is a lost record, not a
    // failed response, and paging on it would be noise.
    console.warn(
      `[chat-store] could not store turn for session=${turn.sessionId} ` +
        '(has src/lib/db/chat-schema.sql been applied?):',
      err,
    );
    return false;
  }
}

/** A session header as the dashboard lists it. */
export interface ChatSessionSummary {
  id: string;
  leadId: string | null;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
}

/** A stored message as the dashboard renders it. */
export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  seq: number;
  role: ChatRole;
  content: string;
  mode: string | null;
  toolCalls: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  createdAt: Date;
}

/** A session together with everything said in it. */
export interface ChatTranscript {
  session: ChatSessionSummary;
  messages: ChatMessageRecord[];
}

/** Longest list the dashboard will ask for, and the default. */
export const MAX_TRANSCRIPTS = 100;

/**
 * Narrow the `jsonb` tool-call column to the string array it is written as.
 *
 * `jsonb` is `unknown` as far as the types go, and the column has existed for
 * longer than any one shape of this code. Anything unexpected becomes an empty
 * list rather than a render-time crash in Joey's dashboard.
 */
function toolCallNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((name): name is string => typeof name === 'string');
}

/**
 * The most recent conversations, newest first, each with its full transcript.
 *
 * Two queries rather than a join or a query-per-session: a join would repeat
 * every session column once per message, and a loop would be N+1 against a
 * serverless database where each round trip is the expensive part.
 */
export async function listRecentChats(
  limit = MAX_TRANSCRIPTS,
): Promise<ChatTranscript[]> {
  const bounded = Math.min(Math.max(1, Math.trunc(limit)), MAX_TRANSCRIPTS);

  const sessions = await db
    .select()
    .from(chatSessions)
    .orderBy(desc(chatSessions.lastMessageAt))
    .limit(bounded);

  if (sessions.length === 0) return [];

  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      inArray(
        chatMessages.sessionId,
        sessions.map((session) => session.id),
      ),
    )
    .orderBy(chatMessages.sessionId, chatMessages.seq);

  const bySession = new Map<string, ChatMessageRecord[]>();
  for (const row of rows) {
    const list = bySession.get(row.sessionId) ?? [];
    list.push({
      id: row.id,
      sessionId: row.sessionId,
      seq: row.seq,
      role: row.role,
      content: row.content,
      mode: row.mode,
      toolCalls: toolCallNames(row.toolCalls),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      latencyMs: row.latencyMs,
      createdAt: row.createdAt,
    });
    bySession.set(row.sessionId, list);
  }

  return sessions.map((session) => ({
    session: {
      id: session.id,
      leadId: session.leadId,
      messageCount: session.messageCount,
      lastMessageAt: session.lastMessageAt,
      createdAt: session.createdAt,
    },
    messages: bySession.get(session.id) ?? [],
  }));
}

/**
 * How many stored conversations never produced a lead.
 *
 * The number Joey actually wants from this feature: conversations that went
 * nowhere are the ones worth reading, because they are where the assistant or
 * the site lost someone.
 */
export async function countAnonymousChats(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatSessions)
    .where(and(isNull(chatSessions.leadId)));

  return row?.count ?? 0;
}

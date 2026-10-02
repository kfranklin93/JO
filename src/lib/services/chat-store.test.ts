import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatMessages, chatSessions } from '@/lib/db/chat-schema';

/**
 * Tests for the chat transcript store.
 *
 * The behaviour that matters most here is the one that looks like a bug: writes
 * that fail are swallowed. By the time this module is called the model has
 * already been paid for and the reply is in hand, so a storage problem — most
 * likely chat-schema.sql not having been applied yet — must not be allowed to
 * turn a good answer into an error page. These tests pin that down, so nobody
 * later "fixes" it into a throw.
 *
 * The second concern is message ordering. `created_at` defaults to `now()`, and
 * inside a transaction `now()` is the *transaction's* timestamp — identical for
 * both rows of one turn. Sorting a transcript on it would put replies above the
 * questions they answer roughly half the time. The `seq` column exists for that
 * reason and is asserted below.
 */

/** Everything the fake db saw, for assertions. */
const captured = {
  sessionValues: [] as Record<string, unknown>[],
  sessionConflicts: [] as Record<string, unknown>[],
  messageValues: [] as Record<string, unknown>[][],
  selectLimits: [] as number[],
  /** Rows the fake returns for each table. */
  rows: new Map<unknown, unknown[]>(),
};

/** Set when a test wants the driver to fail. */
let failWith: Error | null = null;

type Chain = Promise<unknown[]> & {
  from: (table: unknown) => Chain;
  where: (...args: unknown[]) => Chain;
  orderBy: (...args: unknown[]) => Chain;
  limit: (count: number) => Promise<unknown[]>;
};

/**
 * A chainable stand-in for Drizzle's select builder.
 *
 * Drizzle's builder is awaitable *and* chainable, so each link has to be a real
 * promise carrying the next methods — the shape the dashboard route test in this
 * repo already uses.
 */
function selectChain(rows: unknown[]): Chain {
  const chain = Promise.resolve(rows) as Chain;
  chain.from = (table: unknown) => selectChain(captured.rows.get(table) ?? rows);
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = (count: number) => {
    captured.selectLimits.push(count);
    return Promise.resolve(chain as unknown as Promise<unknown[]>);
  };
  return chain;
}

function insertBuilder(table: unknown) {
  return {
    values(value: Record<string, unknown> | Record<string, unknown>[]) {
      if (failWith) return Promise.reject(failWith);

      if (table === chatSessions) {
        captured.sessionValues.push(value as Record<string, unknown>);
      } else {
        captured.messageValues.push(value as Record<string, unknown>[]);
      }

      const result = Promise.resolve(undefined) as Promise<void> & {
        onConflictDoUpdate: (clause: Record<string, unknown>) => Promise<void>;
      };
      result.onConflictDoUpdate = (clause) => {
        captured.sessionConflicts.push(clause);
        return Promise.resolve();
      };
      return result;
    },
  };
}

const fakeDb = {
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    if (failWith) throw failWith;
    return callback({
      insert: insertBuilder,
      select: (projection?: unknown) => selectChain(projection ? [] : []),
    });
  },
  insert: insertBuilder,
  select: (projection?: unknown) => {
    // `countAnonymousChats` projects a count; everything else selects whole rows.
    if (projection && typeof projection === 'object' && 'count' in projection) {
      return selectChain([{ count: 7 }]);
    }
    return selectChain([]);
  },
};

vi.mock('@/lib/db', () => ({ db: fakeDb }));

const { recordChatTurn, listRecentChats, countAnonymousChats, MAX_TRANSCRIPTS } =
  await import('./chat-store');

/** A turn with the fields the route always supplies. */
function turn(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    userMessage: 'Do you work in Marietta?',
    reply: 'Joey works across the Atlanta metro.',
    mode: 'live' as const,
    toolCalls: [],
    latencyMs: 820,
    ...overrides,
  };
}

beforeEach(() => {
  captured.sessionValues = [];
  captured.sessionConflicts = [];
  captured.messageValues = [];
  captured.selectLimits = [];
  captured.rows = new Map();
  failWith = null;

  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recordChatTurn — storing a turn', () => {
  it('writes both sides of the exchange', async () => {
    await recordChatTurn(turn());

    const [batch] = captured.messageValues;
    expect(batch).toHaveLength(2);
    expect(batch?.[0]).toMatchObject({
      role: 'user',
      content: 'Do you work in Marietta?',
    });
    expect(batch?.[1]).toMatchObject({
      role: 'assistant',
      content: 'Joey works across the Atlanta metro.',
    });
  });

  it('numbers the question before the answer', async () => {
    // created_at ties for both rows, because inside a transaction now() is the
    // transaction's timestamp. seq is what makes the order total.
    await recordChatTurn(turn());

    const [batch] = captured.messageValues;
    expect(batch?.[0]?.seq).toBe(1);
    expect(batch?.[1]?.seq).toBe(2);
  });

  it('continues numbering from the last stored message', async () => {
    captured.rows.set(chatMessages, [{ seq: 8 }]);

    await recordChatTurn(turn());

    const [batch] = captured.messageValues;
    expect(batch?.[0]?.seq).toBe(9);
    expect(batch?.[1]?.seq).toBe(10);
  });

  it('records cost metadata on the assistant turn only', async () => {
    await recordChatTurn(
      turn({
        toolCalls: ['capture_lead'],
        usage: { input_tokens: 120, output_tokens: 42 },
      }),
    );

    const [batch] = captured.messageValues;
    expect(batch?.[1]).toMatchObject({
      inputTokens: 120,
      outputTokens: 42,
      latencyMs: 820,
      toolCalls: ['capture_lead'],
      mode: 'live',
    });
    // The visitor's own message has no model cost to report.
    expect(batch?.[0]).not.toHaveProperty('inputTokens');
    expect(batch?.[0]).not.toHaveProperty('mode');
  });

  it('omits usage rather than writing undefined when the provider reported none', async () => {
    await recordChatTurn(turn());

    expect(captured.messageValues[0]?.[1]).not.toHaveProperty('inputTokens');
  });

  it('reports success', async () => {
    await expect(recordChatTurn(turn())).resolves.toBe(true);
  });
});

describe('recordChatTurn — the lead link', () => {
  it('attaches the lead when the turn produced one', async () => {
    await recordChatTurn(turn({ leadId: 'lead-7' }));

    expect(captured.sessionValues[0]).toMatchObject({ leadId: 'lead-7' });
  });

  it('leaves the lead alone on a turn that produced none', async () => {
    // A visitor identifies themselves once. Later turns carry no lead id and
    // must not blank the column.
    await recordChatTurn(turn());

    expect(captured.sessionValues[0]).not.toHaveProperty('leadId');
    expect(captured.sessionConflicts[0]?.set).not.toHaveProperty('leadId');
  });

  it('coalesces rather than overwrites when updating an existing session', async () => {
    await recordChatTurn(turn({ leadId: 'lead-7' }));

    const set = captured.sessionConflicts[0]?.set as Record<string, unknown>;
    expect(set).toHaveProperty('leadId');
    expect(set).toHaveProperty('messageCount');
    expect(set).toHaveProperty('lastMessageAt');
  });
});

describe('recordChatTurn — a write that fails', () => {
  beforeEach(() => {
    failWith = new Error('relation "chat_messages" does not exist');
  });

  it('does not throw, because the reply has already been paid for', async () => {
    await expect(recordChatTurn(turn())).resolves.toBe(false);
  });

  it('warns rather than errors, since the request itself succeeded', async () => {
    await recordChatTurn(turn());

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('chat-schema.sql'),
      expect.any(Error),
    );
  });

  it('names the session so a lost transcript is traceable', async () => {
    await recordChatTurn(turn());

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'),
      expect.any(Error),
    );
  });
});

describe('listRecentChats', () => {
  it('returns nothing without querying messages when there are no sessions', async () => {
    captured.rows.set(chatSessions, []);

    await expect(listRecentChats()).resolves.toEqual([]);
  });

  it('groups messages under their session, in seq order', async () => {
    const now = new Date('2026-09-01T12:00:00.000Z');
    captured.rows.set(chatSessions, [
      { id: 's1', leadId: null, messageCount: 2, lastMessageAt: now, createdAt: now },
      { id: 's2', leadId: 'lead-7', messageCount: 2, lastMessageAt: now, createdAt: now },
    ]);
    captured.rows.set(chatMessages, [
      { id: 'm1', sessionId: 's1', seq: 1, role: 'user', content: 'hi', mode: null, toolCalls: null, inputTokens: null, outputTokens: null, latencyMs: null, createdAt: now },
      { id: 'm2', sessionId: 's1', seq: 2, role: 'assistant', content: 'hello', mode: 'live', toolCalls: ['capture_lead'], inputTokens: 10, outputTokens: 5, latencyMs: 100, createdAt: now },
      { id: 'm3', sessionId: 's2', seq: 1, role: 'user', content: 'other', mode: null, toolCalls: null, inputTokens: null, outputTokens: null, latencyMs: null, createdAt: now },
    ]);

    const result = await listRecentChats();

    expect(result).toHaveLength(2);
    expect(result[0]?.messages.map((m) => m.content)).toEqual(['hi', 'hello']);
    expect(result[1]?.messages.map((m) => m.content)).toEqual(['other']);
    expect(result[1]?.session.leadId).toBe('lead-7');
  });

  it('survives a jsonb tool_calls column holding something unexpected', async () => {
    // jsonb is `unknown`, and the column outlives any one shape of this code. A
    // surprise there must not crash Joey's dashboard at render time.
    const now = new Date('2026-09-01T12:00:00.000Z');
    captured.rows.set(chatSessions, [
      { id: 's1', leadId: null, messageCount: 1, lastMessageAt: now, createdAt: now },
    ]);
    captured.rows.set(chatMessages, [
      { id: 'm1', sessionId: 's1', seq: 1, role: 'assistant', content: 'x', mode: 'live', toolCalls: { not: 'an array' }, inputTokens: null, outputTokens: null, latencyMs: null, createdAt: now },
      { id: 'm2', sessionId: 's1', seq: 2, role: 'assistant', content: 'y', mode: 'live', toolCalls: [1, 'capture_lead', null], inputTokens: null, outputTokens: null, latencyMs: null, createdAt: now },
    ]);

    const [transcript] = await listRecentChats();

    expect(transcript?.messages[0]?.toolCalls).toEqual([]);
    expect(transcript?.messages[1]?.toolCalls).toEqual(['capture_lead']);
  });

  it('caps how much it will return however much is asked for', async () => {
    captured.rows.set(chatSessions, []);

    await listRecentChats(10_000);

    expect(captured.selectLimits).toContain(MAX_TRANSCRIPTS);
  });

  it('asks for at least one row when handed nonsense', async () => {
    captured.rows.set(chatSessions, []);

    await listRecentChats(0);
    await listRecentChats(-5);

    expect(captured.selectLimits).toEqual([1, 1]);
  });
});

describe('countAnonymousChats', () => {
  it('returns the count as a number', async () => {
    // count(*) comes back from pg as a string unless cast, which is why the
    // query casts to int.
    await expect(countAnonymousChats()).resolves.toBe(7);
  });
});

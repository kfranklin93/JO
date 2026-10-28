import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for `withLeads`, the step that turns a page of bookings into something
 * Joey can read.
 *
 * Scoped deliberately. `book`, `cancel`, `upcoming`, `between`, `forLead` and
 * `offerSlots` landed without tests and stay that way here — a known gap, not an
 * oversight — because they are thin wrappers around drizzle queries whose value
 * is in the SQL, and a fake db asserts only that the fake was called.
 *
 * `withLeads` is different: it decides what happens to a booking whose lead row
 * is gone, and it decides which of three name columns becomes the display name.
 * Both are judgements, and both are worth pinning down. A missing lead must keep
 * its booking — an appointment dropped from Joey's calendar is worse than one
 * shown unattributed — and the name resolution has to match the one the drip
 * uses, or the dashboard and the emails would greet the same person differently.
 */

/** Rows the fake db hands back, and what it was asked for. */
const captured = {
  queries: 0,
  whereArgs: [] as unknown[],
};

let leadRows: Record<string, unknown>[] = [];

type Chain = Promise<unknown[]> & {
  from: (table: unknown) => Chain;
  where: (...args: unknown[]) => Chain;
};

/**
 * Drizzle's select builder is awaitable *and* chainable, so each link has to be
 * a real promise carrying the next methods. Same shape as chat-store.test.ts.
 */
function selectChain(): Chain {
  const chain = Promise.resolve(leadRows as unknown[]) as Chain;
  chain.from = () => chain;
  chain.where = (...args: unknown[]) => {
    captured.whereArgs.push(args[0]);
    return chain;
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      captured.queries++;
      return selectChain();
    },
  },
}));

const { withLeads } = await import('./booking');

const AT = new Date('2026-03-12T18:00:00.000Z');

function booking(id: string, leadId: string) {
  return {
    id,
    leadId,
    startsAt: AT,
    endsAt: new Date(AT.getTime() + 15 * 60_000),
    status: 'scheduled',
    channel: 'phone',
    createdBy: 'assistant',
    notes: null,
  };
}

function leadRow(overrides: Record<string, unknown>) {
  return {
    id: 'lead-1',
    email: 'dana@example.com',
    phone: '404-555-0100',
    firstName: null,
    lastName: null,
    fullName: null,
    ...overrides,
  };
}

/**
 * The lead ids the `inArray` filter actually asked for.
 *
 * Read out of the drizzle SQL object rather than trusted from the call count,
 * because one query is also what a non-deduplicated list produces — the
 * assertion that the `new Set` is doing anything has to look at the parameters.
 * A drizzle `Param` is the chunk carrying both a `value` and an `encoder`,
 * which distinguishes it from the literal string chunks around it.
 */
function capturedIds(): unknown[] {
  const ids: unknown[] = [];

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if ('value' in node && 'encoder' in node) {
      ids.push((node as { value: unknown }).value);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    // The bound values sit in an array chunk of their own, between the string
    // chunks that spell out "... in (" and ")".
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) chunks.forEach(visit);
  };

  visit(captured.whereArgs[0]);
  return ids;
}

beforeEach(() => {
  captured.queries = 0;
  captured.whereArgs = [];
  leadRows = [];
});

describe('withLeads', () => {
  it('issues no query for an empty page', async () => {
    // An empty `inArray` is not valid SQL, and there is nothing to look up.
    const result = await withLeads([]);

    expect(result).toEqual([]);
    expect(captured.queries).toBe(0);
  });

  it('looks up each lead once even when bookings share one', async () => {
    leadRows = [leadRow({ fullName: 'Dana Whitfield' })];

    const result = await withLeads([
      booking('a1', 'lead-1'),
      booking('a2', 'lead-1'),
    ]);

    expect(captured.queries).toBe(1);
    // The query count alone does not prove the dedup — `inArray(id, ['lead-1',
    // 'lead-1'])` is also one query — so the id list itself is asserted.
    expect(capturedIds()).toEqual(['lead-1']);
    expect(result).toHaveLength(2);
    expect(result[0]?.lead?.name).toBe('Dana Whitfield');
    expect(result[1]?.lead?.name).toBe('Dana Whitfield');
  });

  it('asks for every distinct lead on the page', async () => {
    leadRows = [
      leadRow({ fullName: 'Dana Whitfield' }),
      leadRow({ id: 'lead-2', fullName: 'Marcus Reyes', email: 'marcus@example.com' }),
    ];

    await withLeads([
      booking('a1', 'lead-1'),
      booking('a2', 'lead-2'),
      booking('a3', 'lead-1'),
    ]);

    expect(captured.queries).toBe(1);
    expect(capturedIds()).toEqual(['lead-1', 'lead-2']);
  });

  it('prefers the full name column', async () => {
    leadRows = [
      leadRow({ fullName: 'Dana Whitfield', firstName: 'Danielle', lastName: 'W' }),
    ];

    const [row] = await withLeads([booking('a1', 'lead-1')]);

    expect(row?.lead?.name).toBe('Dana Whitfield');
  });

  it('falls through to the first and last name when the full name is blank', async () => {
    // A blank string is what the form writes when the field was submitted empty,
    // and it is not a name.
    leadRows = [leadRow({ fullName: '   ', firstName: 'Dana', lastName: 'Whitfield' })];

    const [row] = await withLeads([booking('a1', 'lead-1')]);

    expect(row?.lead?.name).toBe('Dana Whitfield');
  });

  it('reports no name rather than a placeholder when the row has none', async () => {
    leadRows = [leadRow({})];

    const [row] = await withLeads([booking('a1', 'lead-1')]);

    expect(row?.lead?.name).toBeNull();
  });

  it('keeps a booking whose lead row is missing', async () => {
    // The judgement this module makes. An inner join would drop the row, and
    // Joey would have a call on his calendar that the dashboard denies exists.
    leadRows = [];

    const result = await withLeads([booking('a1', 'lead-gone')]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('a1');
    expect(result[0]?.lead).toBeNull();
  });

  it('carries the contact details through', async () => {
    leadRows = [leadRow({ fullName: 'Dana Whitfield' })];

    const [row] = await withLeads([booking('a1', 'lead-1')]);

    expect(row?.lead).toEqual({
      id: 'lead-1',
      name: 'Dana Whitfield',
      email: 'dana@example.com',
      phone: '404-555-0100',
    });
  });

  it('leaves the booking fields untouched', async () => {
    leadRows = [leadRow({ fullName: 'Dana Whitfield' })];

    const [row] = await withLeads([booking('a1', 'lead-1')]);

    expect(row?.startsAt).toBe(AT);
    expect(row?.status).toBe('scheduled');
    expect(row?.channel).toBe('phone');
  });
});

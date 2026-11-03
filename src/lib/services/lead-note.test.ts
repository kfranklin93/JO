import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the write behind the assistant's `log_lead_note` tool.
 *
 * The tool previously wrote nothing and reported success, so what matters here
 * is not only that a line lands but that the outcome distinguishes a write from
 * a non-write: `tools.ts` lets the model claim the note was filed only when
 * this returns `recorded`.
 *
 * The `db` mock refuses any write issued outside a transaction, so the
 * read-then-append assertions are not tautological — moving the update out of
 * the callback fails every success test here. It also records which tables were
 * written, which is how "touches no follow_ups row" is asserted rather than
 * asserted about.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

/** Every update issued, in order, keyed by table. */
let recordedUpdates: Array<{ table: string; values: Record<string, unknown> }>;
/** Every insert issued, in order, keyed by table. */
let recordedInserts: Array<{ table: string; values: unknown }>;
/** The row the mocked `leads` select finds, or null for "no such lead". */
let existingLeadRow: Record<string, unknown> | null;

const LEAD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CREATED_AT = new Date('2026-04-02T09:30:00.000Z');

vi.mock('@/lib/db', () => {
  const tableName = (table: unknown): string =>
    (table as { __name?: string }).__name ?? 'unknown';

  const select = () => ({
    from: (_table: unknown) => ({
      where: (_condition: unknown) => ({
        limit: (_count: number) =>
          Promise.resolve(existingLeadRow === null ? [] : [existingLeadRow]),
      }),
    }),
  });

  const update = (table: unknown) => ({
    set: (values: unknown) => ({
      where: (_condition: unknown) => {
        recordedUpdates.push({
          table: tableName(table),
          values: values as Record<string, unknown>,
        });
        return Promise.resolve(undefined);
      },
    }),
  });

  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      recordedInserts.push({ table: tableName(table), values });
      return Promise.resolve(undefined);
    },
  });

  return {
    leads: { __name: 'leads', id: 'leads.id' },
    followUps: { __name: 'followUps', id: 'follow_ups.id' },
    db: {
      update: () => {
        throw new Error(
          'db.update called outside a transaction — the read that decides what ' +
            'the notes column holds and the write that extends it must not be ' +
            'separable'
        );
      },
      insert: () => {
        throw new Error('db.insert called outside a transaction');
      },
      transaction: async <T,>(
        callback: (tx: {
          select: typeof select;
          update: typeof update;
          insert: typeof insert;
        }) => Promise<T>
      ) => callback({ select, update, insert }),
    },
  };
});

// Imported after the mocks are registered: the module reads `@/config/env` and
// `@/lib/db` on the way in.
const { appendLeadNote } = await import('./lead-note');
const { MissingEnvError } = await import('@/lib/utils/require-env');

/** The lead row as one chat turn leaves it, with nothing in `notes` yet. */
const STORED_LEAD_ROW = {
  id: LEAD_ID,
  email: 'rosa.alvarez@gowithjoeyo-test.invalid',
  fullName: 'Rosa Alvarez',
  propertyInterest: 'buy',
  notes: null,
  status: 'new',
  source: 'website_form',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

/** What the single UPDATE this path is allowed to issue actually set. */
function leadUpdateValues(): Record<string, unknown> | undefined {
  expect(recordedUpdates.filter((entry) => entry.table !== 'leads')).toEqual([]);
  return recordedUpdates.find((entry) => entry.table === 'leads')?.values;
}

function storedNotes(): string {
  return String(leadUpdateValues()?.notes ?? '');
}

const QUESTION = 'Asked what homes on Oak Grove Drive are selling for.';

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
  recordedUpdates = [];
  recordedInserts = [];
  existingLeadRow = { ...STORED_LEAD_ROW };
  vi.clearAllMocks();
});

describe('appendLeadNote — a lead with no notes yet', () => {
  it('reports the note recorded', async () => {
    expect(await appendLeadNote(LEAD_ID, QUESTION)).toBe('recorded');
  });

  it('writes the note as the first line', async () => {
    await appendLeadNote(LEAD_ID, QUESTION);

    expect(storedNotes()).toContain(QUESTION);
    expect(storedNotes().split('\n')).toHaveLength(1);
  });

  it('stamps the line the way the capture path stamps its audit line', async () => {
    // One format for the column, so a lead's notes read chronologically rather
    // than as two conventions interleaved.
    await appendLeadNote(LEAD_ID, QUESTION);

    expect(storedNotes()).toMatch(
      /^\[assistant \d{4}-\d{2}-\d{2}T[\d:.]+Z\] /
    );
  });

  it('touches updated_at and nothing else on the row', async () => {
    await appendLeadNote(LEAD_ID, QUESTION);

    expect(Object.keys(leadUpdateValues() ?? {}).sort()).toEqual([
      'notes',
      'updatedAt',
    ]);
    expect(leadUpdateValues()?.updatedAt).toBeInstanceOf(Date);
  });

  it('creates no follow-up row and sends nothing', async () => {
    // A client asking a question is not a new lead. Reusing the capture path
    // here is what previously queued sixteen follow-up emails to one address.
    await appendLeadNote(LEAD_ID, QUESTION);

    expect(recordedInserts).toEqual([]);
  });
});

describe('appendLeadNote — a lead that already has notes', () => {
  beforeEach(() => {
    existingLeadRow = { ...STORED_LEAD_ROW, notes: 'Called on Tuesday.' };
  });

  it('appends rather than overwriting', async () => {
    expect(await appendLeadNote(LEAD_ID, QUESTION)).toBe('recorded');

    const lines = storedNotes().split('\n');
    expect(lines[0]).toBe('Called on Tuesday.');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(QUESTION);
  });

  it('appends again on a second note', async () => {
    existingLeadRow = {
      ...STORED_LEAD_ROW,
      notes: 'Called on Tuesday.\n[assistant 2026-04-02T09:40:00.000Z] Wants a lake view.',
    };

    await appendLeadNote(LEAD_ID, QUESTION);

    expect(storedNotes().split('\n')).toHaveLength(3);
    expect(storedNotes()).toContain('Wants a lake view.');
  });

  it('treats a whitespace-only column as empty', async () => {
    existingLeadRow = { ...STORED_LEAD_ROW, notes: '   ' };

    await appendLeadNote(LEAD_ID, QUESTION);

    expect(storedNotes().split('\n')).toHaveLength(1);
  });
});

describe('appendLeadNote — nothing to write to', () => {
  it('reports missing rather than throwing when the lead is gone', async () => {
    // The model may hold a lead id from a session whose row has since been
    // deleted. `missing` is what stops the assistant claiming it filed a note.
    existingLeadRow = null;

    expect(await appendLeadNote(LEAD_ID, QUESTION)).toBe('missing');
  });

  it('writes nothing at all in that case', async () => {
    existingLeadRow = null;

    await appendLeadNote(LEAD_ID, QUESTION);

    expect(recordedUpdates).toEqual([]);
    expect(recordedInserts).toEqual([]);
  });

  it('refuses before writing when DATABASE_URL is absent', async () => {
    delete testEnv.DATABASE_URL;

    await expect(appendLeadNote(LEAD_ID, QUESTION)).rejects.toBeInstanceOf(
      MissingEnvError
    );
    expect(recordedUpdates).toEqual([]);
  });
});

/**
 * An in-memory stand-in for the `follow_ups` queue, shared by the queue tests
 * and the cron route tests.
 *
 * ## Why this is not a plain `vi.fn()`
 *
 * The behaviour under test is a concurrency property: two overlapping runs must
 * not send the same follow-up twice. A mock that simply returns a fixed row list
 * on every call would report success for the very implementation the claim
 * mechanism replaced — the old `SELECT`-then-`UPDATE` loop would look identical
 * to it.
 *
 * So this fake keeps real state and applies the claim's own predicate to it:
 * claiming moves rows out of `scheduled`, which is exactly why a second claim
 * finds nothing. The assertion "each row sent once" then follows from the state
 * transition rather than from how the mock was configured.
 *
 * ## How statements are interpreted
 *
 * `follow-up-queue.ts` talks to the driver through `db.execute(sql`...`)`, so the
 * fake renders each statement with the real Postgres dialect and dispatches on
 * what it says. Parameters are located by matching the assignment or predicate
 * they belong to (`WHERE id = $3`) rather than by position, so reordering a
 * `SET` clause does not silently break the simulation.
 *
 * Anything the fake does not recognise throws. A test that stops exercising the
 * queue fails loudly instead of quietly passing against a no-op.
 */

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { FollowUp, Lead as DbLead } from '@/lib/db/schema';

const dialect = new PgDialect();

/** The kinds of statement the queue is allowed to issue. */
export type StatementKind =
  | 'claim'
  | 'markSent'
  | 'requeue'
  | 'fail'
  | 'abandon'
  | 'countBacklog';

/**
 * Mutable state for one test. Reset between tests by {@link resetFakeDb}.
 *
 * `statements` records the kind of every statement executed, so a test can
 * assert that a claim happened before any send and that nothing extra ran.
 */
export const fakeDb = {
  /** Rows in the simulated `follow_ups` table. Mutated in place, as SQL would. */
  followUps: [] as FollowUp[],
  /** Rows the mocked `leads` select returns. */
  leads: [] as DbLead[],
  /** Every statement the queue issued, in order. */
  statements: [] as StatementKind[],
  /** How many `db.select()` calls the route made. */
  selects: 0,
};

export function resetFakeDb(): void {
  fakeDb.followUps = [];
  fakeDb.leads = [];
  fakeDb.statements = [];
  fakeDb.selects = 0;
}

const FIXED_DATE = new Date('2026-03-01T12:00:00.000Z');

/**
 * Build a complete `follow_ups` row.
 *
 * Every column is present because the claim uses `RETURNING *`, and the route
 * reads `attempts` and `templateType` off whatever comes back.
 */
export function makeFollowUp(overrides: Partial<FollowUp> = {}): FollowUp {
  const base: FollowUp = {
    id: '00000000-0000-4000-8000-000000000000',
    leadId: '11111111-2222-4333-8444-555555555555',
    scheduledFor: FIXED_DATE,
    templateType: 'day3',
    status: 'scheduled',
    sentAt: null,
    deliveredAt: null,
    openedAt: null,
    clickedAt: null,
    repliedAt: null,
    failedAt: null,
    failureReason: null,
    attempts: 0,
    conversationId: null,
    abTestId: null,
    variant: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };

  return { ...base, ...overrides };
}

/** Build a complete `leads` row. */
export function makeDbLead(overrides: Partial<DbLead> = {}): DbLead {
  const base: DbLead = {
    id: '11111111-2222-4333-8444-555555555555',
    email: 'jane.doe@gowithjoeyo-test.invalid',
    phone: null,
    firstName: null,
    lastName: null,
    fullName: null,
    source: 'website_form',
    status: 'new',
    propertyInterest: null,
    priceRange: null,
    timeline: null,
    neighborhoods: null,
    engagementScore: 0,
    lastContactedAt: null,
    lastResponseAt: null,
    totalInteractions: 0,
    emailOpens: 0,
    emailClicks: 0,
    smsReplies: 0,
    loftyContactId: null,
    loftySyncedAt: null,
    formData: null,
    notes: null,
    tags: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };

  return { ...base, ...overrides };
}

/** Locate the parameter belonging to a specific clause. */
function paramFor(text: string, params: unknown[], clause: RegExp): unknown {
  const match = text.match(clause);
  if (!match?.[1]) {
    throw new Error(`fake db: expected ${clause} in statement:\n${text}`);
  }

  const index = Number(match[1]) - 1;
  if (index < 0 || index >= params.length) {
    throw new Error(`fake db: parameter $${match[1]} out of range in:\n${text}`);
  }

  return params[index];
}

/**
 * Read a timestamp parameter.
 *
 * The dialect serialises `Date` values to ISO strings before they reach the
 * driver, so the fake parses them back rather than assuming a `Date` arrives.
 */
function dateParam(text: string, params: unknown[], clause: RegExp): Date {
  const value = paramFor(text, params, clause);
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`fake db: ${String(value)} is not a timestamp in:\n${text}`);
  }
  return date;
}

function numberParam(text: string, params: unknown[], clause: RegExp): number {
  return Number(paramFor(text, params, clause));
}

function stringParam(text: string, params: unknown[], clause: RegExp): string {
  return String(paramFor(text, params, clause));
}

function rowById(id: string): FollowUp {
  const row = fakeDb.followUps.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`fake db: no follow_up with id ${id}`);
  return row;
}

/** Apply one rendered statement to the store and return its result rows. */
function apply(text: string, params: unknown[]): { rows: unknown[] } {
  // The only read the queue issues. Matched on the aggregate rather than on
  // `SELECT count(...)` so wrapping the cast does not silently stop dispatching.
  if (/count\(\*\)/i.test(text)) {
    fakeDb.statements.push('countBacklog');

    // Both figures have to come from one statement, or they could describe
    // different instants. If the second aggregate goes missing the fake cannot
    // find its parameter and the lookup below throws.
    const due = dateParam(text, params, /scheduled_for <= \$(\d+)/);
    const staleBefore = dateParam(text, params, /updated_at < \$(\d+)/);

    const dueCount = fakeDb.followUps.filter(
      (row) => row.status === 'scheduled' && row.scheduledFor <= due
    ).length;
    // Only rows past the reclaim threshold. A freshly claimed row belongs to a
    // live run, and counting it as stranded would read healthy overlap as a fault.
    const strandedCount = fakeDb.followUps.filter(
      (row) => row.status === 'sending' && row.updatedAt < staleBefore
    ).length;

    return { rows: [{ due: dueCount, stranded: strandedCount }] };
  }

  if (/set status = 'sending'/i.test(text)) {
    // These two clauses are the whole point of the claim: the status change and
    // the read are one statement, and a concurrent run skips rather than blocks.
    // If either disappears the claim is no longer atomic, so the fake refuses to
    // simulate it.
    if (!/returning \*/i.test(text)) {
      throw new Error(`fake db: claim must RETURN the rows it claimed:\n${text}`);
    }
    if (!/for update skip locked/i.test(text)) {
      throw new Error(`fake db: claim must use FOR UPDATE SKIP LOCKED:\n${text}`);
    }

    fakeDb.statements.push('claim');

    const now = dateParam(text, params, /updated_at = \$(\d+)/);
    const due = dateParam(text, params, /scheduled_for <= \$(\d+)/);
    const staleBefore = dateParam(text, params, /updated_at < \$(\d+)/);
    const limit = numberParam(text, params, /limit \$(\d+)/i);

    const claimable = fakeDb.followUps
      .filter(
        (row) =>
          (row.status === 'scheduled' && row.scheduledFor <= due) ||
          (row.status === 'sending' && row.updatedAt < staleBefore)
      )
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
      .slice(0, limit);

    for (const row of claimable) {
      row.status = 'sending';
      row.updatedAt = now;
    }

    // Copies, because a real RETURNING hands back a snapshot. The route must not
    // observe later writes through the rows it claimed.
    return { rows: claimable.map((row) => ({ ...row })) };
  }

  if (/set status = 'sent'/i.test(text)) {
    fakeDb.statements.push('markSent');
    if (!/attempts = attempts \+ 1/i.test(text)) {
      throw new Error(`fake db: a successful send must count as an attempt:\n${text}`);
    }

    const row = rowById(stringParam(text, params, /where id = \$(\d+)/i));
    row.status = 'sent';
    row.sentAt = dateParam(text, params, /sent_at = \$(\d+)/);
    row.updatedAt = dateParam(text, params, /updated_at = \$(\d+)/);
    row.attempts += 1;
    row.failureReason = null;
    return { rows: [] };
  }

  if (/set status = 'scheduled'/i.test(text)) {
    fakeDb.statements.push('requeue');
    const row = rowById(stringParam(text, params, /where id = \$(\d+)/i));
    row.status = 'scheduled';
    row.attempts = numberParam(text, params, /attempts = \$(\d+)/);
    row.failureReason = stringParam(text, params, /failure_reason = \$(\d+)/);
    row.updatedAt = dateParam(text, params, /updated_at = \$(\d+)/);
    return { rows: [] };
  }

  if (/set status = 'failed'/i.test(text)) {
    // Two statements land here and they mean different things. `recordFailure`
    // sets `attempts` to a value it computed from the claimed row; `abandon`
    // increments relative to the stored value, because it is not spending a
    // budget, just recording that the row was processed once and cannot succeed.
    const abandoning = /attempts = attempts \+ 1/i.test(text);
    fakeDb.statements.push(abandoning ? 'abandon' : 'fail');

    const row = rowById(stringParam(text, params, /where id = \$(\d+)/i));
    row.status = 'failed';
    if (abandoning) {
      row.attempts += 1;
    } else {
      row.attempts = numberParam(text, params, /attempts = \$(\d+)/);
    }
    row.failedAt = dateParam(text, params, /failed_at = \$(\d+)/);
    row.failureReason = stringParam(text, params, /failure_reason = \$(\d+)/);
    row.updatedAt = dateParam(text, params, /updated_at = \$(\d+)/);

    // `abandon` reads the stored count back rather than guessing it, so the
    // returned outcome cannot disagree with the row.
    if (abandoning) {
      if (!/returning attempts/i.test(text)) {
        throw new Error(
          `fake db: abandon must RETURN the attempts it recorded:\n${text}`
        );
      }
      return { rows: [{ attempts: row.attempts }] };
    }

    return { rows: [] };
  }

  throw new Error(`fake db: unrecognised statement:\n${text}`);
}

/**
 * The `db` object to hand to `vi.mock('@/lib/db', ...)`.
 *
 * `select` is allowed only against `leads`. Reading due rows with a select is
 * the bug this task removes — it leaves the row `scheduled` while the email is
 * in flight — so the fake rejects it rather than letting a regression pass.
 * `update` and `insert` are rejected for the same reason: every status change
 * has to go through the atomic statements above.
 */
export function createFakeDb() {
  const tableName = (table: unknown): string =>
    (table as { __fakeName?: string }).__fakeName ?? 'unknown';

  return {
    leads: { __fakeName: 'leads', id: 'leads.id' },
    followUps: { __fakeName: 'followUps', id: 'followUps.id' },
    db: {
      execute: (query: unknown) => {
        const { sql: text, params } = dialect.sqlToQuery(query as SQL);
        return Promise.resolve(apply(text.replace(/\s+/g, ' ').trim(), params));
      },
      select: () => ({
        from: (table: unknown) => {
          const name = tableName(table);
          if (name !== 'leads') {
            throw new Error(
              `db.select from ${name} — due follow-ups must be claimed by the ` +
                'atomic UPDATE, not read with a select'
            );
          }
          fakeDb.selects++;
          // The `where` is ignored: the route filters by the ids it claimed and
          // then indexes the result by id, so seeding only the leads that should
          // be found is enough to exercise both the hit and the miss path.
          return { where: () => Promise.resolve(fakeDb.leads) };
        },
      }),
      update: () => {
        throw new Error(
          'db.update called — follow-up status changes must go through follow-up-queue.ts'
        );
      },
      insert: () => {
        throw new Error('db.insert called — the cron route writes no new rows');
      },
    },
  };
}

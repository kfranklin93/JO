import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowUp } from '@/lib/db/schema';

/**
 * Queue-level tests for the claim mechanism.
 *
 * These run against the in-memory fake in `__fixtures__/fake-follow-up-db.ts`,
 * which applies the claim's own predicate to real mutable state. That is what
 * makes "a second claim finds nothing" a property of the statement rather than
 * of the mock's configuration.
 *
 * The fake also refuses to simulate a claim that has dropped `RETURNING *` or
 * `FOR UPDATE SKIP LOCKED`, so losing atomicity fails the suite rather than
 * quietly passing.
 */

vi.mock('@/lib/db', async () => {
  const { createFakeDb } = await import('@/lib/db/__fixtures__/fake-follow-up-db');
  return createFakeDb();
});

const { fakeDb, resetFakeDb, makeFollowUp } = await import(
  '@/lib/db/__fixtures__/fake-follow-up-db'
);

const {
  abandon,
  claimDueFollowUps,
  countQueueBacklog,
  markSent,
  recordFailure,
  MAX_SEND_ATTEMPTS,
  STALE_CLAIM_MS,
} = await import('./follow-up-queue');

/** The instant every test treats as "now". */
const NOW = new Date('2026-03-10T11:00:00.000Z');

/** Shorthand for a timestamp relative to NOW. */
const minutesBeforeNow = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000);

beforeEach(() => {
  resetFakeDb();
});

/** Seed a row that is due to send. */
function seedDue(overrides: Partial<FollowUp> = {}): FollowUp {
  const row = makeFollowUp({
    status: 'scheduled',
    scheduledFor: minutesBeforeNow(60),
    ...overrides,
  });
  fakeDb.followUps.push(row);
  return row;
}

const idsOf = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

/** The stored row, so an assertion cannot pass against a missing one. */
function rowOf(id: string): FollowUp {
  const found = fakeDb.followUps.find((row) => row.id === id);
  if (!found) throw new Error(`no seeded follow-up with id ${id}`);
  return found;
}

const statusOf = (id: string) => rowOf(id).status;

describe('claimDueFollowUps', () => {
  it('claims a due row and moves it out of scheduled', async () => {
    const row = seedDue({ id: 'due-1' });

    const claimed = await claimDueFollowUps(10, NOW);

    expect(idsOf(claimed)).toEqual(['due-1']);
    // The status change is what closes the double-send window: the row has left
    // `scheduled` before the caller has done any network I/O.
    expect(statusOf(row.id)).toBe('sending');
  });

  it('leaves a follow-up scheduled for later alone', async () => {
    seedDue({ id: 'future', scheduledFor: new Date(NOW.getTime() + 60_000) });

    expect(await claimDueFollowUps(10, NOW)).toEqual([]);
    expect(statusOf('future')).toBe('scheduled');
  });

  it('returns nothing when the queue is empty', async () => {
    expect(await claimDueFollowUps(10, NOW)).toEqual([]);
  });

  it('claims no more than the limit, oldest first', async () => {
    // A backlog larger than the batch. Without the cap a single run would try to
    // drain all of it and hit the function time limit mid-send.
    for (let index = 0; index < 5; index++) {
      seedDue({ id: `due-${index}`, scheduledFor: minutesBeforeNow(50 - index) });
    }

    const claimed = await claimDueFollowUps(2, NOW);

    expect(idsOf(claimed)).toEqual(['due-0', 'due-1']);
    expect(statusOf('due-2')).toBe('scheduled');
  });

  it('does not hand the same row to a second claim', async () => {
    seedDue({ id: 'due-1' });
    seedDue({ id: 'due-2', scheduledFor: minutesBeforeNow(59) });

    const first = await claimDueFollowUps(10, NOW);
    const second = await claimDueFollowUps(10, NOW);

    // Two overlapping cron runs. The second sees no claimable work because the
    // first moved these rows to `sending` in the same statement that read them.
    expect(idsOf(first)).toEqual(['due-1', 'due-2']);
    expect(second).toEqual([]);
  });

  it('claims disjoint sets when two runs interleave over a backlog', async () => {
    for (let index = 0; index < 4; index++) {
      seedDue({ id: `due-${index}`, scheduledFor: minutesBeforeNow(50 - index) });
    }

    const [first, second] = await Promise.all([
      claimDueFollowUps(2, NOW),
      claimDueFollowUps(2, NOW),
    ]);

    const overlap = idsOf(first).filter((id) => idsOf(second).includes(id));
    expect(overlap).toEqual([]);
    expect([...idsOf(first), ...idsOf(second)].sort()).toEqual([
      'due-0',
      'due-1',
      'due-2',
      'due-3',
    ]);
  });

  describe('stranded rows', () => {
    it('reclaims a row left in sending beyond the staleness threshold', async () => {
      // What a killed function leaves behind: claimed, never resolved. Without a
      // reclaim the touchpoint is lost silently and permanently.
      fakeDb.followUps.push(
        makeFollowUp({
          id: 'stranded',
          status: 'sending',
          scheduledFor: minutesBeforeNow(600),
          updatedAt: new Date(NOW.getTime() - STALE_CLAIM_MS - 1000),
        })
      );

      const claimed = await claimDueFollowUps(10, NOW);

      expect(idsOf(claimed)).toEqual(['stranded']);
    });

    it('leaves a freshly claimed row for the run that owns it', async () => {
      fakeDb.followUps.push(
        makeFollowUp({
          id: 'in-flight',
          status: 'sending',
          scheduledFor: minutesBeforeNow(600),
          updatedAt: minutesBeforeNow(1),
        })
      );

      // Reclaiming eagerly would reintroduce the double-send this exists to
      // prevent: another run is still working this row.
      expect(await claimDueFollowUps(10, NOW)).toEqual([]);
    });

    it('does not reclaim a row exactly at the threshold', async () => {
      fakeDb.followUps.push(
        makeFollowUp({
          id: 'boundary',
          status: 'sending',
          scheduledFor: minutesBeforeNow(600),
          updatedAt: new Date(NOW.getTime() - STALE_CLAIM_MS),
        })
      );

      // The predicate is strictly older-than, so the boundary belongs to the
      // owning run.
      expect(await claimDueFollowUps(10, NOW)).toEqual([]);
    });
  });
});

describe('markSent', () => {
  it('records the send, counts the attempt, and clears any stale reason', async () => {
    const row = seedDue({ id: 'due-1', attempts: 1, failureReason: 'earlier timeout' });
    await claimDueFollowUps(10, NOW);

    await markSent(row.id, NOW);

    expect(rowOf(row.id)).toMatchObject({
      status: 'sent',
      sentAt: NOW,
      attempts: 2,
      failureReason: null,
    });
  });

  /**
   * What `attempts` counts, pinned deliberately, because two readings are
   * plausible and the difference matters to the retry arithmetic.
   *
   * It counts delivery attempts including the successful one — a row that sent
   * first time carries 1, not 0. The alternative reading, "failures so far",
   * would leave a clean send at 0 and make a double-send indistinguishable from
   * a single one in the data.
   */
  it('counts the successful attempt, so a first-time send lands on one', async () => {
    const row = seedDue({ id: 'due-1', attempts: 0 });
    await claimDueFollowUps(10, NOW);

    await markSent(row.id, NOW);

    expect(rowOf(row.id).attempts).toBe(1);
  });
});

describe('recordFailure', () => {
  it('returns the row to scheduled while attempts remain', async () => {
    const row = seedDue({ id: 'due-1' });
    await claimDueFollowUps(10, NOW);

    const outcome = await recordFailure(row.id, 'email: connection reset', 0, NOW);

    expect(outcome).toEqual({ requeued: true, attempts: 1 });
    expect(rowOf(row.id)).toMatchObject({
      status: 'scheduled',
      attempts: 1,
      failureReason: 'email: connection reset',
    });
  });

  it('marks the row failed with the real reason once the budget is spent', async () => {
    const row = seedDue({ id: 'due-1', attempts: MAX_SEND_ATTEMPTS - 1 });
    await claimDueFollowUps(10, NOW);

    const outcome = await recordFailure(
      row.id,
      'email: recipient domain rejected the message',
      MAX_SEND_ATTEMPTS - 1,
      NOW
    );

    expect(outcome).toEqual({ requeued: false, attempts: MAX_SEND_ATTEMPTS });
    expect(rowOf(row.id)).toMatchObject({
      status: 'failed',
      failedAt: NOW,
      // Not the generic 'Send failed' the route used to write for every failure.
      failureReason: 'email: recipient domain rejected the message',
    });
  });

  it('overwrites the previous reason so the record shows why it last failed', async () => {
    const row = seedDue({ id: 'due-1', failureReason: 'email: connection reset' });
    await claimDueFollowUps(10, NOW);

    await recordFailure(row.id, 'email: mailbox full', 1, NOW);

    expect(rowOf(row.id).failureReason).toBe('email: mailbox full');
  });

  /**
   * The whole retry lifecycle in one pass, rather than only its two endpoints.
   *
   * Each iteration is a separate cron run: claim what is due, fail the send,
   * record it. The two properties that make retry real only show up here —
   * that a requeued row is genuinely claimable by the *next* run, and that the
   * budget allows a full `MAX_SEND_ATTEMPTS` worth of failures rather than being
   * quietly shortened by the increment `markSent` also performs.
   */
  it('walks a row from first failure to permanent failure across successive runs', async () => {
    const row = seedDue({ id: 'due-1' });
    const outcomes: Array<{ requeued: boolean; attempts: number }> = [];

    for (let run = 0; run < MAX_SEND_ATTEMPTS; run++) {
      const claimed = await claimDueFollowUps(10, NOW);

      // The row a previous run requeued has to come back, or "retry" is a
      // status change nobody ever acts on.
      expect(idsOf(claimed)).toEqual(['due-1']);
      expect(claimed[0]?.attempts).toBe(run);

      outcomes.push(
        await recordFailure(row.id, `email: connection reset (run ${run})`, run, NOW)
      );
    }

    expect(outcomes).toEqual([
      { requeued: true, attempts: 1 },
      { requeued: true, attempts: 2 },
      { requeued: false, attempts: MAX_SEND_ATTEMPTS },
    ]);

    // Three real failures were tolerated, which is what MAX_SEND_ATTEMPTS means.
    expect(rowOf(row.id)).toMatchObject({
      status: 'failed',
      attempts: MAX_SEND_ATTEMPTS,
      failureReason: 'email: connection reset (run 2)',
      failedAt: NOW,
    });

    // And it stays out of the queue afterwards.
    expect(await claimDueFollowUps(10, NOW)).toEqual([]);
  });

  it('requeues to a state the very next claim picks up', async () => {
    const row = seedDue({ id: 'due-1' });
    await claimDueFollowUps(10, NOW);
    await recordFailure(row.id, 'email: connection reset', 0, NOW);

    // Not waiting on the fifteen-minute stale reclaim: the row is back in
    // `scheduled` with its original due time, so it is claimable immediately.
    const reclaimed = await claimDueFollowUps(10, NOW);

    expect(idsOf(reclaimed)).toEqual(['due-1']);
    expect(reclaimed[0]?.attempts).toBe(1);
  });
});

describe('abandon', () => {
  /**
   * The route needs a way to fail a row that no retry can save — a follow-up
   * whose lead has been deleted. It used to force that through `recordFailure`
   * by passing `Number.MAX_SAFE_INTEGER - 1`, which produced the right status
   * and a stored attempt count of 9007199254740991.
   */
  it('fails the row immediately with a believable attempt count', async () => {
    const row = seedDue({ id: 'orphan' });
    await claimDueFollowUps(10, NOW);

    const outcome = await abandon(row.id, 'Lead not found', NOW);

    expect(outcome).toEqual({ requeued: false, attempts: 1 });
    expect(rowOf(row.id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      failureReason: 'Lead not found',
      failedAt: NOW,
    });
  });

  it('counts on from whatever the row had already spent', async () => {
    const row = seedDue({ id: 'orphan', attempts: 1 });
    await claimDueFollowUps(10, NOW);

    const outcome = await abandon(row.id, 'Lead not found', NOW);

    expect(outcome.attempts).toBe(2);
    expect(rowOf(row.id).attempts).toBe(2);
  });

  it('does not requeue, whatever the budget would have allowed', async () => {
    const row = seedDue({ id: 'orphan', attempts: 0 });
    await claimDueFollowUps(10, NOW);

    await abandon(row.id, 'Lead not found', NOW);

    // A fresh row has its whole budget left; abandoning it must still be final.
    expect(await claimDueFollowUps(10, NOW)).toEqual([]);
    expect(rowOf(row.id).status).toBe('failed');
  });
});

describe('countQueueBacklog', () => {
  it('counts only rows still due, so a hit batch limit is distinguishable', async () => {
    seedDue({ id: 'due-1' });
    seedDue({ id: 'due-2', scheduledFor: minutesBeforeNow(59) });
    seedDue({ id: 'due-3', scheduledFor: minutesBeforeNow(58) });
    seedDue({ id: 'future', scheduledFor: new Date(NOW.getTime() + 60_000) });
    fakeDb.followUps.push(makeFollowUp({ id: 'already-sent', status: 'sent' }));

    await claimDueFollowUps(1, NOW);

    // One claimed and in flight, two still waiting, one not yet due, one done.
    expect(await countQueueBacklog(NOW)).toEqual({ due: 2, stranded: 0 });
  });

  it('reports zero for a drained queue', async () => {
    expect(await countQueueBacklog(NOW)).toEqual({ due: 0, stranded: 0 });
  });

  /**
   * Why this is two numbers.
   *
   * A row a killed run left in `sending` is real outstanding work, but it is not
   * the same kind of thing as a row waiting its turn: it is evidence a run died.
   * Counting it in `due` would let `due` mean "waiting" on a healthy day and
   * "waiting, plus some wreckage" on a bad one, which is exactly when an
   * operator needs the number to be unambiguous.
   */
  it('reports a stranded row separately rather than inside the due count', async () => {
    seedDue({ id: 'due-1' });
    fakeDb.followUps.push(
      makeFollowUp({
        id: 'stranded',
        status: 'sending',
        scheduledFor: minutesBeforeNow(600),
        updatedAt: new Date(NOW.getTime() - STALE_CLAIM_MS - 1000),
      })
    );

    expect(await countQueueBacklog(NOW)).toEqual({ due: 1, stranded: 1 });
  });

  it('does not call a freshly claimed row stranded', async () => {
    seedDue({ id: 'due-1' });

    await claimDueFollowUps(10, NOW);

    // The row is in `sending` because this run is working it. Reporting that as
    // stranded would turn every normal run into an alarm.
    expect(await countQueueBacklog(NOW)).toEqual({ due: 0, stranded: 0 });
  });

  it('ignores rows that already reached a terminal state', async () => {
    fakeDb.followUps.push(
      makeFollowUp({ id: 'sent', status: 'sent' }),
      makeFollowUp({ id: 'failed', status: 'failed' })
    );

    expect(await countQueueBacklog(NOW)).toEqual({ due: 0, stranded: 0 });
  });
});

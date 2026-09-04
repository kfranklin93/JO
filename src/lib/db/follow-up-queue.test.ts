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
  claimDueFollowUps,
  countRemainingDue,
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
});

describe('countRemainingDue', () => {
  it('counts only rows still due, so a hit batch limit is distinguishable', async () => {
    seedDue({ id: 'due-1' });
    seedDue({ id: 'due-2', scheduledFor: minutesBeforeNow(59) });
    seedDue({ id: 'due-3', scheduledFor: minutesBeforeNow(58) });
    seedDue({ id: 'future', scheduledFor: new Date(NOW.getTime() + 60_000) });
    fakeDb.followUps.push(makeFollowUp({ id: 'already-sent', status: 'sent' }));

    await claimDueFollowUps(1, NOW);

    // One claimed and in flight, two still waiting, one not yet due, one done.
    expect(await countRemainingDue(NOW)).toBe(2);
  });

  it('reports zero for a drained queue', async () => {
    expect(await countRemainingDue(NOW)).toBe(0);
  });
});

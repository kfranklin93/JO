import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowUp } from '@/lib/db/schema';
import type { Lead } from '@/lib/services/follow-up-scheduler';

/**
 * Route handler tests for the follow-up cron endpoint.
 *
 * Two concerns are covered here.
 *
 * **Authorisation.** A rejected request must do no work at all. The guard used to
 * fail open when `CRON_SECRET` was unset, so an anonymous caller could drain the
 * queue, mail every due lead, and mark the rows sent.
 *
 * **Exactly-once sending.** The route used to read due rows, send, then mark each
 * one sent. Between the read and the write the row was still `scheduled`, so a
 * second overlapping run picked up the same work and mailed the same leads again.
 * Rows are now claimed by one atomic statement before any network I/O.
 *
 * The database is the in-memory fake from `@/lib/db/__fixtures__`, which holds
 * real state and applies the claim's own predicate to it. It also refuses a
 * `select` against `follow_ups` and any `db.update`, so reinstating the old
 * read-then-write loop fails these tests rather than passing them.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

vi.mock('@/lib/db', async () => {
  const { createFakeDb } = await import('@/lib/db/__fixtures__/fake-follow-up-db');
  return createFakeDb();
});

const { fakeDb, resetFakeDb, makeFollowUp, makeDbLead } = await import(
  '@/lib/db/__fixtures__/fake-follow-up-db'
);
const { DEFAULT_CLAIM_LIMIT, MAX_SEND_ATTEMPTS } = await import(
  '@/lib/db/follow-up-queue'
);

/**
 * Every send attempt, so "no email sent" can be asserted and each row's send
 * counted.
 *
 * `statementsAtFirstSend` records the queue statements that had run by the time
 * the first send began — the evidence that the claim precedes the I/O.
 */
let statementsAtFirstSend: string[] | null = null;

const sendFollowUp = vi.fn(
  async (_lead: Lead, _type: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
    statementsAtFirstSend ??= [...fakeDb.statements];
    return { ok: true };
  }
);

vi.mock('@/lib/services/follow-up-scheduler', () => ({
  sendFollowUp: (lead: Lead, type: string) => sendFollowUp(lead, type),
}));

const { GET, POST } = await import('./route');

// Deliberately fake. Never put a real secret here: Netlify's secret scanner
// fails the build, and a public repo would publish it.
const SECRET = 'test-cron-secret-do-not-use-in-any-environment';

const LEAD_ID = '11111111-2222-4333-8444-555555555555';
const NOW_ISH = new Date('2026-03-10T11:00:00.000Z');

function cronRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest(
    'https://gowithjoeyo.netlify.app/api/cron/follow-ups',
    { headers }
  );
}

const authorised = () => cronRequest(`Bearer ${SECRET}`);

/** Seed a follow-up that is due now, with its lead present. */
function seedDue(overrides: Partial<FollowUp> = {}): FollowUp {
  const row = makeFollowUp({
    status: 'scheduled',
    // Comfortably in the past, so the row is due whatever `new Date()` the route
    // uses. The handler timestamps itself; the test cannot inject one.
    scheduledFor: new Date(NOW_ISH.getTime() - 60 * 60 * 1000),
    ...overrides,
  });
  fakeDb.followUps.push(row);
  return row;
}

const rowOf = (id: string): FollowUp => {
  const found = fakeDb.followUps.find((row) => row.id === id);
  if (!found) throw new Error(`no seeded follow-up with id ${id}`);
  return found;
};

/**
 * How many times each row was sent.
 *
 * `markSent` increments `attempts`, so a row mailed twice carries 2 — which is
 * the double-send this task removes, visible in the data rather than only in a
 * call count.
 */
const sendsPerRow = () => fakeDb.followUps.map((row) => row.attempts);

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks drops recorded calls but not implementations, so a rejection
  // or failure set by one test would otherwise leak into the next.
  sendFollowUp.mockImplementation(async () => {
    statementsAtFirstSend ??= [...fakeDb.statements];
    return { ok: true };
  });
  resetFakeDb();
  statementsAtFirstSend = null;

  seedDue({ id: 'follow-up-1', leadId: LEAD_ID, templateType: 'day3' });
  fakeDb.leads.push(
    makeDbLead({
      id: LEAD_ID,
      email: 'jane.doe@gowithjoeyo-test.invalid',
      fullName: 'Jane Doe',
      firstName: 'Jane',
      lastName: 'Doe',
      propertyInterest: 'buying',
      timeline: '3-6 months',
      status: 'appointment_set',
    })
  );

  testEnv.CRON_SECRET = SECRET;
  testEnv.DATABASE_URL = 'postgresql://localhost/test';
  testEnv.RESEND_API_KEY = 're_test_key';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** Nothing observable happened: no query, no write, no mail. */
function expectNoWorkDone() {
  expect(sendFollowUp).not.toHaveBeenCalled();
  expect(fakeDb.statements).toEqual([]);
  expect(fakeDb.selects).toBe(0);
  expect(rowOf('follow-up-1').status).toBe('scheduled');
}

describe('GET /api/cron/follow-ups — authorisation', () => {
  it('processes due follow-ups when the secret is correct', async () => {
    const response = await GET(authorised());

    expect(response.status).toBe(200);
    expect(sendFollowUp).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ success: true, sent: 1 });
  });

  it('rejects an absent Authorization header and does no work', async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expectNoWorkDone();
  });

  it('rejects a wrong secret and does no work', async () => {
    const response = await GET(cronRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
    expectNoWorkDone();
  });

  /** The fail-open regression: unset secret must not mean open access. */
  it('rejects every caller when CRON_SECRET is unset, and does no work', async () => {
    delete testEnv.CRON_SECRET;

    const response = await GET(authorised());

    expect(response.status).toBe(401);
    expectNoWorkDone();
  });

  it('does not leak which variables are missing to an unauthorised caller', async () => {
    delete testEnv.CRON_SECRET;
    delete testEnv.DATABASE_URL;
    delete testEnv.RESEND_API_KEY;

    const response = await GET(cronRequest());
    const body = await response.json();

    // A 503 naming a variable would tell an anonymous caller how the deployment
    // is configured, so authorisation is checked before requireEnv.
    expect(response.status).toBe(401);
    expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|RESEND_API_KEY/);
  });
});

describe('POST /api/cron/follow-ups — authorisation', () => {
  it('applies the same check as GET', async () => {
    expect((await POST(cronRequest())).status).toBe(401);
    expectNoWorkDone();

    expect((await POST(cronRequest('Bearer wrong'))).status).toBe(401);
    expectNoWorkDone();

    delete testEnv.CRON_SECRET;
    expect((await POST(authorised())).status).toBe(401);
    expectNoWorkDone();
  });

  it('processes the queue when authorised', async () => {
    const response = await POST(authorised());

    expect(response.status).toBe(200);
    expect(sendFollowUp).toHaveBeenCalledTimes(1);
  });
});

describe('exactly-once sending', () => {
  it('claims every row before the first send begins', async () => {
    seedDue({ id: 'follow-up-2', leadId: LEAD_ID });

    await GET(authorised());

    // One claim, and nothing else had run when the first email went out. That
    // ordering is the whole guarantee: by the time any I/O starts, the rows are
    // no longer visible to another run.
    expect(statementsAtFirstSend).toEqual(['claim']);
  });

  it('sends each due row exactly once across two consecutive runs', async () => {
    seedDue({ id: 'follow-up-2', leadId: LEAD_ID });
    seedDue({ id: 'follow-up-3', leadId: LEAD_ID });

    const first = await GET(authorised());
    const second = await GET(authorised());

    // A cron provider retry, or Joey pressing the dashboard button after the
    // scheduled run finished. The sharper case — a second run starting while the
    // first is still sending — is the overlap test below; this one also pins down
    // that a completed row is not picked up again on the next day's run.
    expect(sendFollowUp).toHaveBeenCalledTimes(3);
    expect(sendsPerRow()).toEqual([1, 1, 1]);
    expect(await first.json()).toMatchObject({ claimed: 3, sent: 3 });
    expect(await second.json()).toMatchObject({ claimed: 0, sent: 0 });
    expect(fakeDb.followUps.map((row) => row.status)).toEqual([
      'sent',
      'sent',
      'sent',
    ]);
  });

  it('sends each due row exactly once when two runs overlap', async () => {
    seedDue({ id: 'follow-up-2', leadId: LEAD_ID });
    seedDue({ id: 'follow-up-3', leadId: LEAD_ID });

    const [first, second] = await Promise.all([GET(authorised()), GET(authorised())]);

    // The regression this task exists for. Both runs are in flight at once, and
    // the old read-then-write loop mailed all three twice. Whichever run claims
    // first takes the batch; the other finds nothing claimable.
    //
    // Verified to bite: with the claim's status change removed from the fake,
    // this is the test that fails — six sends instead of three.
    expect(sendFollowUp).toHaveBeenCalledTimes(3);
    expect(sendsPerRow()).toEqual([1, 1, 1]);

    const claims = [
      (await first.json()).claimed as number,
      (await second.json()).claimed as number,
    ];
    expect(claims.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('marks a sent row sent rather than leaving it claimable', async () => {
    await GET(authorised());

    expect(rowOf('follow-up-1')).toMatchObject({
      status: 'sent',
      attempts: 1,
    });
    expect(rowOf('follow-up-1').sentAt).toBeInstanceOf(Date);
  });
});

describe('bounded batch', () => {
  it('claims at most the batch limit and reports the rest as remaining', async () => {
    // A backlog larger than one run should handle. Unbounded, the run would try
    // to drain all of it and be killed part-way through, stranding rows.
    fakeDb.followUps = [];
    const backlog = DEFAULT_CLAIM_LIMIT + 5;
    for (let index = 0; index < backlog; index++) {
      seedDue({
        id: `follow-up-${index}`,
        leadId: LEAD_ID,
        scheduledFor: new Date(NOW_ISH.getTime() - (backlog - index) * 60 * 1000),
      });
    }

    const body = await (await GET(authorised())).json();

    expect(body).toMatchObject({
      claimed: DEFAULT_CLAIM_LIMIT,
      sent: DEFAULT_CLAIM_LIMIT,
      failed: 0,
      requeued: 0,
      remaining: 5,
    });
    expect(sendFollowUp).toHaveBeenCalledTimes(DEFAULT_CLAIM_LIMIT);
  });

  it('reports nothing remaining once the queue is drained', async () => {
    const body = await (await GET(authorised())).json();

    expect(body).toMatchObject({ claimed: 1, sent: 1, remaining: 0 });
  });

  it('reports an empty queue without querying leads or sending', async () => {
    fakeDb.followUps = [];

    const body = await (await GET(authorised())).json();

    expect(body).toMatchObject({ claimed: 0, sent: 0, remaining: 0 });
    expect(fakeDb.selects).toBe(0);
    expect(sendFollowUp).not.toHaveBeenCalled();
  });

  it('processes a full batch without the per-row sleep', async () => {
    fakeDb.followUps = [];
    for (let index = 0; index < DEFAULT_CLAIM_LIMIT; index++) {
      seedDue({ id: `follow-up-${index}`, leadId: LEAD_ID });
    }

    const started = Date.now();
    await GET(authorised());
    const elapsed = Date.now() - started;

    // The loop used to sleep 500 ms per row to spare an LLM endpoint that is no
    // longer in the path — 12.5 seconds for this batch, against a serverless
    // limit measured in seconds. The bound is loose; the old code cannot pass it.
    expect(elapsed).toBeLessThan(3000);
  });

  it('looks leads up in one query for the whole batch', async () => {
    seedDue({ id: 'follow-up-2', leadId: LEAD_ID });
    seedDue({ id: 'follow-up-3', leadId: LEAD_ID });

    await GET(authorised());

    // Per-row lookups would multiply round trips against the batch size.
    expect(fakeDb.selects).toBe(1);
  });
});

describe('lead mapping', () => {
  it('hands the scheduler a normalised lead rather than raw column values', async () => {
    await GET(authorised());

    const lead = sendFollowUp.mock.calls[0]?.[0];

    // `propertyInterest` is free text and `status` is a ten-value database enum.
    // The route used to assert both into narrower unions unchanged.
    expect(lead).toMatchObject({
      name: 'Jane Doe',
      intent: 'buy',
      status: 'engaged',
    });
  });

  it('passes the touchpoint type through', async () => {
    await GET(authorised());

    expect(sendFollowUp.mock.calls[0]?.[1]).toBe('day3');
  });
});

describe('failure handling', () => {
  it('records the real reason rather than a generic string', async () => {
    sendFollowUp.mockResolvedValue({
      ok: false,
      reason: 'email: Resend rejected the message',
    });

    await GET(authorised());

    const row = rowOf('follow-up-1');
    expect(row.failureReason).toBe('email: Resend rejected the message');
    expect(row.failureReason).not.toBe('Send failed');
  });

  it('returns a failed row to scheduled while attempts remain', async () => {
    sendFollowUp.mockResolvedValue({ ok: false, reason: 'email: connection reset' });

    const body = await (await GET(authorised())).json();

    expect(rowOf('follow-up-1')).toMatchObject({ status: 'scheduled', attempts: 1 });
    expect(body).toMatchObject({ sent: 0, requeued: 1, failed: 0 });
  });

  it('gives up once the attempt budget is spent', async () => {
    rowOf('follow-up-1').attempts = MAX_SEND_ATTEMPTS - 1;
    sendFollowUp.mockResolvedValue({ ok: false, reason: 'email: connection reset' });

    const body = await (await GET(authorised())).json();

    expect(rowOf('follow-up-1').status).toBe('failed');
    expect(body).toMatchObject({ sent: 0, requeued: 0, failed: 1 });
  });

  it('fails a row whose lead no longer exists and carries on with the rest', async () => {
    seedDue({ id: 'orphan', leadId: '99999999-9999-4999-8999-999999999999' });
    seedDue({ id: 'follow-up-2', leadId: LEAD_ID });

    const body = await (await GET(authorised())).json();

    // No retry is worth attempting for a deleted lead, so the row is failed
    // outright — but it must not abort the batch.
    expect(rowOf('orphan')).toMatchObject({
      status: 'failed',
      failureReason: 'Lead not found',
    });
    expect(body).toMatchObject({ claimed: 3, sent: 2, failed: 1 });
    expect(sendFollowUp).toHaveBeenCalledTimes(2);
  });

  it('leaves no row stuck in sending after a mixed batch', async () => {
    seedDue({ id: 'follow-up-2', leadId: LEAD_ID });
    // First row succeeds, second fails, so the batch mixes outcomes.
    sendFollowUp.mockImplementation(async () =>
      sendFollowUp.mock.calls.length === 1
        ? { ok: true as const }
        : { ok: false as const, reason: 'email: connection reset' }
    );

    await GET(authorised());

    // A row left in `sending` is invisible to the next run until the staleness
    // reclaim kicks in fifteen minutes later, so every claimed row must reach a
    // terminal state within the run that claimed it.
    expect(fakeDb.followUps.map((row) => row.status)).not.toContain('sending');
  });
});

describe('missing configuration', () => {
  it('returns 503 naming the missing variable for an authorised caller', async () => {
    delete testEnv.RESEND_API_KEY;

    const response = await GET(authorised());

    expect(response.status).toBe(503);
    expect((await response.json()).missing).toEqual(['RESEND_API_KEY']);
  });

  it('claims nothing when configuration is missing', async () => {
    delete testEnv.DATABASE_URL;

    await GET(authorised());

    // The check runs before the claim, so a retry after the variable is set does
    // not find rows stranded in `sending`.
    expect(fakeDb.statements).toEqual([]);
    expect(rowOf('follow-up-1').status).toBe('scheduled');
  });
});

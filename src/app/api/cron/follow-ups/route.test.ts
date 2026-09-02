import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for the follow-up cron endpoint.
 *
 * The focus is authorisation: a rejected request must do no work at all. Before
 * this task the guard failed open when `CRON_SECRET` was unset, so an anonymous
 * caller could drain the queue, mail every due lead, and mark the rows sent.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

/** Every database read and write the handler performs. */
let selects: number;
let updates: Array<Record<string, unknown>>;
/** Rows the mocked `follow_ups` select returns. */
let dueRows: Array<Record<string, unknown>>;
/** Rows the mocked `leads` select returns. */
let leadRows: Array<Record<string, unknown>>;

const LEAD_ID = '11111111-2222-3333-4444-555555555555';
const FOLLOW_UP_ID = '99999999-8888-7777-6666-555555555555';

vi.mock('@/lib/db', () => {
  const tableName = (table: unknown): string =>
    (table as { __name?: string }).__name ?? 'unknown';

  return {
    leads: { __name: 'leads', id: 'leads.id' },
    followUps: {
      __name: 'followUps',
      id: 'followUps.id',
      status: 'followUps.status',
      scheduledFor: 'followUps.scheduledFor',
    },
    db: {
      select: () => ({
        from: (table: unknown) => {
          selects++;
          const rows = tableName(table) === 'leads' ? leadRows : dueRows;
          return {
            where: () => Promise.resolve(rows),
          };
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updates.push(values);
          return { where: () => Promise.resolve(undefined) };
        },
      }),
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: () => 'eq',
  lte: () => 'lte',
  and: () => 'and',
  inArray: () => 'inArray',
}));

/** Send attempts, so "no email sent" can be asserted. */
const sendFollowUp = vi.fn(async () => ({ ok: true }) as const);
vi.mock('@/lib/services/follow-up-scheduler', () => ({
  sendFollowUp: () => sendFollowUp(),
}));

const { GET, POST } = await import('./route');

const SECRET = 'NLonMXX18hoBQCB4gLCa77lp4yVlMWvR';

function cronRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest(
    'https://gowithjoeyo.netlify.app/api/cron/follow-ups',
    { headers }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sendFollowUp.mockResolvedValue({ ok: true } as const);
  selects = 0;
  updates = [];
  dueRows = [
    {
      id: FOLLOW_UP_ID,
      leadId: LEAD_ID,
      templateType: 'day3',
      status: 'scheduled',
      scheduledFor: new Date('2026-01-01T00:00:00Z'),
    },
  ];
  leadRows = [
    {
      id: LEAD_ID,
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      firstName: 'Jane',
      lastName: 'Doe',
      propertyInterest: 'buy',
      timeline: '3-6 months',
      status: 'new',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];
  testEnv.CRON_SECRET = SECRET;
  testEnv.DATABASE_URL = 'postgresql://localhost/test';
  testEnv.RESEND_API_KEY = 're_test_key';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** Nothing observable happened: no query, no write, no mail. */
function expectNoWorkDone() {
  expect(sendFollowUp).not.toHaveBeenCalled();
  expect(updates).toHaveLength(0);
  expect(selects).toBe(0);
}

describe('GET /api/cron/follow-ups — authorisation', () => {
  it('processes due follow-ups when the secret is correct', async () => {
    const response = await GET(cronRequest(`Bearer ${SECRET}`));

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

    const response = await GET(cronRequest(`Bearer ${SECRET}`));

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
    expect((await POST(cronRequest(`Bearer ${SECRET}`))).status).toBe(401);
    expectNoWorkDone();
  });

  it('processes the queue when authorised', async () => {
    const response = await POST(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(sendFollowUp).toHaveBeenCalledTimes(1);
  });
});

describe('failure reporting', () => {
  it('records the real reason rather than a generic string', async () => {
    sendFollowUp.mockResolvedValue({
      ok: false,
      reason: 'email: Resend rejected the message',
    } as never);

    await GET(cronRequest(`Bearer ${SECRET}`));

    const failure = updates.find((u) => u.status === 'failed');
    expect(failure).toBeDefined();
    expect(failure!.failureReason).toBe('email: Resend rejected the message');
    expect(failure!.failureReason).not.toBe('Send failed');
  });

  it('marks a successful send as sent', async () => {
    await GET(cronRequest(`Bearer ${SECRET}`));

    const sent = updates.find((u) => u.status === 'sent');
    expect(sent).toBeDefined();
    expect(sent!.sentAt).toBeInstanceOf(Date);
  });
});

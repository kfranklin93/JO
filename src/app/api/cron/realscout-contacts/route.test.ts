import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for the RealScout contact sync cron endpoint.
 *
 * **Authorisation is the main concern.** This endpoint writes leads, so a
 * rejected request must do no work at all. It uses the shared
 * `requireCronAuth`, which fails **closed** — an unset `CRON_SECRET` rejects
 * everyone rather than admitting everyone, which is the defect the shared guard
 * was written to fix in both cron routes.
 *
 * The second concern is that a RealScout problem is reported as what it is: a
 * 403 names the scope it was missing, and a spent rate limit answers 429 rather
 * than being flattened into one opaque 500.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const syncRealScoutContacts = vi.fn();
vi.mock('@/lib/services/realscout-sync', () => ({ syncRealScoutContacts }));

const { GET, POST } = await import('./route');
const { RealScoutError } = await import('@/lib/services/realscout');

const SECRET = 'cron-secret-for-realscout-tests';

const EMPTY_REPORT = {
  configured: true,
  updatedAfter: '2026-06-03T12:00:00.000Z',
  seen: 0,
  created: 0,
  followUpsCreated: 0,
  skipped: [],
  truncated: false,
  notEmailable: 0,
  createdLeadIds: [],
};

function request(authorization?: string): NextRequest {
  return new NextRequest('https://gowithjoeyo.com/api/cron/realscout-contacts', {
    headers: authorization === undefined ? {} : { authorization },
  });
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
  testEnv.CRON_SECRET = SECRET;

  syncRealScoutContacts.mockReset();
  syncRealScoutContacts.mockResolvedValue(EMPTY_REPORT);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorisation', () => {
  it('runs the sync for a correct bearer secret', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(syncRealScoutContacts).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing Authorization header without syncing', async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(syncRealScoutContacts).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret without syncing', async () => {
    const response = await GET(request('Bearer not-the-secret'));

    expect(response.status).toBe(401);
    expect(syncRealScoutContacts).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer scheme', async () => {
    const response = await GET(request(`Basic ${SECRET}`));

    expect(response.status).toBe(401);
    expect(syncRealScoutContacts).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is unset, rather than admitting everyone', async () => {
    delete testEnv.CRON_SECRET;

    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer anything'))).status).toBe(401);
    expect(syncRealScoutContacts).not.toHaveBeenCalled();
  });

  it('says nothing about which variables are missing to an unauthorised caller', async () => {
    delete testEnv.DATABASE_URL;
    delete testEnv.CRON_SECRET;

    const body = await (await GET(request())).json();

    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('applies the same check to POST, which the dashboard uses to trigger a run', async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request(`Bearer ${SECRET}`))).status).toBe(200);
  });
});

describe('configuration', () => {
  it('answers 503 naming DATABASE_URL when the deployment lacks it', async () => {
    delete testEnv.DATABASE_URL;

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.missing).toEqual(['DATABASE_URL']);
    expect(syncRealScoutContacts).not.toHaveBeenCalled();
  });

  it('runs — and reports `configured: false` — when there is no RealScout token', async () => {
    // Deliberately not a failure. A deployment without RealScout has nothing to
    // sync, and a red run in the schedule every day for that is noise.
    syncRealScoutContacts.mockResolvedValue({ ...EMPTY_REPORT, configured: false });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, configured: false });
  });
});

describe('reporting', () => {
  it('states that zero follow-ups were created, rather than leaving it implied', async () => {
    syncRealScoutContacts.mockResolvedValue({
      ...EMPTY_REPORT,
      seen: 4,
      created: 2,
      createdLeadIds: ['lead-1', 'lead-2'],
    });

    const body = await (await GET(request(`Bearer ${SECRET}`))).json();

    expect(body).toMatchObject({
      success: true,
      seen: 4,
      created: 2,
      followUpsCreated: 0,
    });
  });

  it('names the missing scope when RealScout answers 403', async () => {
    syncRealScoutContacts.mockRejectedValue(
      new RealScoutError(
        'scope',
        'RealScout requires the contacts:read scope, which this token was not granted.',
        { status: 403, missingScope: 'contacts:read', requestId: 'req-7' },
      ),
    );

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      reason: 'scope',
      missingScope: 'contacts:read',
      requestId: 'req-7',
    });
  });

  it('answers 429 for a spent rate limit, so "try later" is distinguishable', async () => {
    syncRealScoutContacts.mockRejectedValue(
      new RealScoutError('rate_limited', 'Rate limit exceeded.', {
        status: 429,
        retryAfterSeconds: 30,
      }),
    );

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({ reason: 'rate_limited', retryAfterSeconds: 30 });
  });

  it('answers 500 for anything that is not a RealScout failure', async () => {
    syncRealScoutContacts.mockRejectedValue(new Error('relation "leads" does not exist'));

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
  });

  it('does not echo an internal error message to the caller', async () => {
    syncRealScoutContacts.mockRejectedValue(
      new Error('connection string postgres://user:pass@host/db refused'),
    );

    const body = await (await GET(request(`Bearer ${SECRET}`))).json();

    expect(JSON.stringify(body)).not.toContain('postgres://');
  });
});

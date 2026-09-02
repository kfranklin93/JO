import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Authorisation tests for the daily-summary cron endpoint.
 *
 * Same fail-open defect as the follow-up route: with `CRON_SECRET` unset, any
 * caller could make the deployment email Joey on demand.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const sendDailyLeadSummary = vi.fn(async (_leads: unknown[]) => true);
vi.mock('@/lib/services/email-service', () => ({
  sendDailyLeadSummary: (leads: unknown[]) => sendDailyLeadSummary(leads),
}));

const { GET, POST } = await import('./route');

// Deliberately fake. Never put a real secret here: Netlify's secret scanner
// fails the build, and a public repo would publish it.
const SECRET = 'test-cron-secret-do-not-use-in-any-environment';

function cronRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest(
    'https://gowithjoeyo.netlify.app/api/cron/daily-summary',
    { headers }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sendDailyLeadSummary.mockResolvedValue(true);
  testEnv.CRON_SECRET = SECRET;
  testEnv.RESEND_API_KEY = 're_test_key';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/cron/daily-summary — authorisation', () => {
  it('sends the digest when the secret is correct', async () => {
    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(sendDailyLeadSummary).toHaveBeenCalledTimes(1);
  });

  it('rejects an absent Authorization header and sends nothing', async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret and sends nothing', async () => {
    const response = await GET(cronRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });

  it('rejects every caller when CRON_SECRET is unset, and sends nothing', async () => {
    delete testEnv.CRON_SECRET;

    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(401);
    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });

  it('checks authorisation before asserting configuration', async () => {
    delete testEnv.CRON_SECRET;
    delete testEnv.RESEND_API_KEY;

    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain(
      'RESEND_API_KEY'
    );
  });
});

describe('POST /api/cron/daily-summary — authorisation', () => {
  it('applies the same check as GET', async () => {
    expect((await POST(cronRequest())).status).toBe(401);
    expect((await POST(cronRequest('Bearer wrong'))).status).toBe(401);

    delete testEnv.CRON_SECRET;
    expect((await POST(cronRequest(`Bearer ${SECRET}`))).status).toBe(401);

    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });

  it('sends the digest when authorised', async () => {
    const response = await POST(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(sendDailyLeadSummary).toHaveBeenCalledTimes(1);
  });
});

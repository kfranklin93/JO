import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const { requireCronAuth } = await import('./cron-auth');

const SECRET = 'NLonMXX18hoBQCB4gLCa77lp4yVlMWvR';

function cronRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) {
    headers.set('authorization', authorization);
  }
  return new NextRequest('https://gowithjoeyo.netlify.app/api/cron/follow-ups', {
    headers,
  });
}

beforeEach(() => {
  testEnv.CRON_SECRET = SECRET;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('requireCronAuth', () => {
  it('authorises a correct bearer secret', () => {
    expect(requireCronAuth(cronRequest(`Bearer ${SECRET}`))).toBeNull();
  });

  it('rejects an absent Authorization header', async () => {
    const denied = requireCronAuth(cronRequest());

    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);
    await expect(denied!.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects a mismatched secret', () => {
    const denied = requireCronAuth(cronRequest('Bearer not-the-secret'));
    expect(denied?.status).toBe(401);
  });

  /**
   * The regression this task exists for. The previous guard read
   * `if (cronSecret && ...)`, so an unset secret authorised everyone. Since
   * CRON_SECRET is optional in the env schema and was absent from the
   * deployment, both cron endpoints were world-accessible.
   */
  describe('fails closed when CRON_SECRET is unconfigured', () => {
    it('rejects even a well-formed request when the secret is absent', () => {
      delete testEnv.CRON_SECRET;

      const denied = requireCronAuth(cronRequest(`Bearer ${SECRET}`));

      expect(denied).not.toBeNull();
      expect(denied!.status).toBe(401);
    });

    it('rejects when the secret is an empty or whitespace string', () => {
      testEnv.CRON_SECRET = '';
      expect(requireCronAuth(cronRequest(`Bearer ${SECRET}`))?.status).toBe(401);

      testEnv.CRON_SECRET = '   ';
      expect(requireCronAuth(cronRequest(`Bearer ${SECRET}`))?.status).toBe(401);
    });

    it('rejects a request carrying no header either', () => {
      delete testEnv.CRON_SECRET;
      expect(requireCronAuth(cronRequest())?.status).toBe(401);
    });
  });

  describe('header shape', () => {
    it('rejects a bare secret with no Bearer scheme', () => {
      expect(requireCronAuth(cronRequest(SECRET))?.status).toBe(401);
    });

    it('rejects a different auth scheme carrying the right secret', () => {
      expect(requireCronAuth(cronRequest(`Basic ${SECRET}`))?.status).toBe(401);
    });

    it('rejects Bearer with an empty value', () => {
      expect(requireCronAuth(cronRequest('Bearer '))?.status).toBe(401);
    });

    it('is case-sensitive about the scheme, matching the documented header', () => {
      expect(requireCronAuth(cronRequest(`bearer ${SECRET}`))?.status).toBe(401);
    });

    it('does not accept a secret that merely starts correctly', () => {
      expect(
        requireCronAuth(cronRequest(`Bearer ${SECRET.slice(0, -1)}`))?.status
      ).toBe(401);
    });

    it('does not accept a secret with trailing content appended', () => {
      expect(requireCronAuth(cronRequest(`Bearer ${SECRET}x`))?.status).toBe(401);
    });
  });

  it('reveals nothing about why a request was rejected', async () => {
    delete testEnv.CRON_SECRET;
    const noSecretConfigured = await requireCronAuth(
      cronRequest(`Bearer ${SECRET}`)
    )!.json();

    testEnv.CRON_SECRET = SECRET;
    const wrongSecret = await requireCronAuth(
      cronRequest('Bearer wrong')
    )!.json();

    // Identical bodies, so a caller cannot tell a misconfigured deployment from
    // a bad guess and learn whether guessing is worth continuing.
    expect(noSecretConfigured).toEqual(wrongSecret);
  });
});

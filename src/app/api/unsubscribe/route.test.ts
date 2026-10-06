import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for the unsubscribe endpoint.
 *
 * This URL is unauthenticated on purpose — the recipient is not a user of
 * anything and must not need an account to leave a mailing list. The signed
 * token stands in for authentication, so the tests are written from the outside
 * as attempts to misuse it: a tampered address, a foreign signature, no token
 * at all.
 *
 * The other property under test is that GET does not mutate. Mail clients and
 * security scanners prefetch links, so a suppressing GET would unsubscribe
 * people who never clicked. One-click users still get a true single click
 * through the List-Unsubscribe POST, which is the path mailbox providers use.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const suppress = vi.fn(async (_email: string, _source: string) => true);

vi.mock('@/lib/services/email-preferences', () => ({
  suppress: (email: string, source: string) => suppress(email, source),
}));

const { POST, GET } = await import('./route');
const { createUnsubscribeToken } = await import('@/lib/auth/unsubscribe-token');

const SECRET = 'test-secret-for-unsubscribe-route';
const SITE = 'https://gowithjoeyo.com';

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  testEnv.NEXT_PUBLIC_SITE_URL = SITE;

  suppress.mockReset();
  suppress.mockResolvedValue(true);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** A mailbox provider's one-click POST: token in the query, RFC body. */
function oneClickRequest(token?: string): NextRequest {
  const url = new URL(`${SITE}/api/unsubscribe`);
  if (token !== undefined) url.searchParams.set('token', token);

  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  });
}

/** Our own confirm page's POST: token in a form field, redirect requested. */
function confirmPageRequest(token?: string): NextRequest {
  const body = new URLSearchParams();
  if (token !== undefined) body.set('token', token);

  return new NextRequest(`${SITE}/api/unsubscribe?redirect=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

describe('POST — one-click from a mailbox provider', () => {
  it('suppresses the signed address', async () => {
    const token = createUnsubscribeToken('dana@x.invalid');

    const response = await POST(oneClickRequest(token));

    expect(response.status).toBe(200);
    expect(suppress).toHaveBeenCalledWith('dana@x.invalid', 'one_click');
  });

  it('answers with a plain 200, as RFC 8058 expects — not a redirect', async () => {
    const response = await POST(oneClickRequest(createUnsubscribeToken('dana@x.invalid')));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('tolerates being sent twice for one user action', async () => {
    const token = createUnsubscribeToken('dana@x.invalid');

    expect((await POST(oneClickRequest(token))).status).toBe(200);
    expect((await POST(oneClickRequest(token))).status).toBe(200);
  });
});

describe('POST — the confirm page', () => {
  it('suppresses and redirects to the done state', async () => {
    const response = await POST(confirmPageRequest(createUnsubscribeToken('dana@x.invalid')));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${SITE}/unsubscribe?status=done`);
    expect(suppress).toHaveBeenCalledWith('dana@x.invalid', 'link');
  });
});

describe('POST — tokens that must not work', () => {
  it('refuses a token with a swapped address', async () => {
    // The attack: take your own valid link, change the address, unsubscribe
    // somebody else — Joey included.
    const token = createUnsubscribeToken('dana@x.invalid');
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ typ: 'unsub', email: 'joey@gowithjoeyo.com' }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await POST(oneClickRequest(`${forged}.${signature}`));

    expect(response.status).toBe(400);
    expect(suppress).not.toHaveBeenCalled();
  });

  it('refuses a token signed with another deployment’s secret', async () => {
    testEnv.SESSION_SECRET = 'someone-elses-secret';
    const foreign = createUnsubscribeToken('dana@x.invalid');
    testEnv.SESSION_SECRET = SECRET;

    expect((await POST(oneClickRequest(foreign))).status).toBe(400);
    expect(suppress).not.toHaveBeenCalled();
  });

  it('refuses a request with no token', async () => {
    expect((await POST(oneClickRequest())).status).toBe(400);
    expect(suppress).not.toHaveBeenCalled();
  });

  it('sends the confirm page to its invalid state rather than a 400 body', async () => {
    const response = await POST(confirmPageRequest('not-a-token'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${SITE}/unsubscribe?status=invalid`);
  });

  it('says the same thing however the token is wrong', async () => {
    // A caller does not need to learn whether it was malformed, tampered with,
    // or signed elsewhere.
    const malformed = await (await POST(oneClickRequest('abc'))).json();
    const tampered = await (
      await POST(oneClickRequest(createUnsubscribeToken('d@x.invalid').slice(0, -1) + 'z'))
    ).json();

    expect(malformed).toEqual(tampered);
  });
});

describe('POST — when the write fails', () => {
  beforeEach(() => {
    suppress.mockRejectedValue(new Error('connection terminated'));
  });

  it('does not claim success to a mailbox provider', async () => {
    const response = await POST(oneClickRequest(createUnsubscribeToken('dana@x.invalid')));

    expect(response.status).toBe(500);
  });

  it('shows the error state rather than a false confirmation', async () => {
    // If the page said "you're unsubscribed" and the write failed, the next
    // email is a spam report.
    const response = await POST(confirmPageRequest(createUnsubscribeToken('dana@x.invalid')));

    expect(response.headers.get('location')).toBe(`${SITE}/unsubscribe?status=error`);
  });

  it('leaks no database detail', async () => {
    const body = await (
      await POST(oneClickRequest(createUnsubscribeToken('dana@x.invalid')))
    ).json();

    expect(JSON.stringify(body)).not.toContain('connection terminated');
  });
});

describe('GET — the footer link', () => {
  it('does not suppress, because scanners prefetch links', async () => {
    const token = createUnsubscribeToken('dana@x.invalid');

    await GET(new NextRequest(`${SITE}/api/unsubscribe?token=${encodeURIComponent(token)}`));

    expect(suppress).not.toHaveBeenCalled();
  });

  it('redirects to the confirm page, carrying the token', async () => {
    const token = createUnsubscribeToken('dana@x.invalid');

    const response = await GET(
      new NextRequest(`${SITE}/api/unsubscribe?token=${encodeURIComponent(token)}`),
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/unsubscribe');
    expect(location.searchParams.get('token')).toBe(token);
  });

  it('still reaches the page when there is no token', async () => {
    const response = await GET(new NextRequest(`${SITE}/api/unsubscribe`));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${SITE}/unsubscribe`);
  });
});

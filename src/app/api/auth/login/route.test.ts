import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FAILED_ATTEMPTS } from '@/lib/auth/rate-limit';

/**
 * Route handler tests for POST /api/auth/login.
 *
 * Neither the session module nor the rate limiter is mocked. The success case
 * therefore proves something worth proving: the cookie the client receives
 * passes the real `verifySession`, the same function that will guard the
 * dashboard and the data route. A mocked issuer could only prove a cookie was
 * set.
 *
 * `@/config/env` is mocked with a mutable object because the real module parses
 * `process.env` once at import — removing a variable mid-test is otherwise
 * impossible, and the unconfigured-deployment cases are the point.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

const { POST } = await import('./route');
const { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifySession } =
  await import('@/lib/auth/session');

const PASSWORD = 'correct-horse-battery-staple';
const SECRET = 'test-session-secret-do-not-use-in-production';

/** The literal that worked as a credential before this spec. */
const OLD_HARDCODED_TOKEN = 'joey_dashboard_authenticated';

/** Whatever the handler returns, so helpers cover every branch's response type. */
type LoginResponse = Awaited<ReturnType<typeof POST>>;

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.ADMIN_PASSWORD = PASSWORD;
  testEnv.SESSION_SECRET = SECRET;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

let ipCounter = 0;

/**
 * An address no other test has used.
 *
 * The limiter's state is module-scoped and survives between tests, exactly as it
 * does in a warm function instance. Rather than reach for a test-only reset,
 * each test gets its own client.
 */
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

interface LoginOptions {
  /** Value sent as `password`. Ignored when `raw` is given. */
  password?: string;
  /** Client address, defaulting to one no other test has used. */
  ip?: string;
  /** Body sent verbatim, for malformed-request cases. */
  raw?: string;
  /** Send no client IP header at all. */
  anonymous?: boolean;
}

function loginRequest(options: LoginOptions = {}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options.anonymous !== true) {
    headers.set('x-nf-client-connection-ip', options.ip ?? freshIp());
  }

  return new NextRequest('https://gowithjoeyo.com/api/auth/login', {
    method: 'POST',
    headers,
    body: options.raw ?? JSON.stringify({ password: options.password ?? PASSWORD }),
  });
}

/** The session cookie on a response, or `undefined` when none was set. */
function sessionCookie(response: LoginResponse) {
  return response.cookies.get(SESSION_COOKIE_NAME);
}

/** True when the response sets no cookie at all. */
function setsNoCookie(response: LoginResponse): boolean {
  return (
    sessionCookie(response) === undefined && response.headers.get('set-cookie') === null
  );
}

/** The `exp` claim inside an issued token, decoded from the outside. */
function decodeExpiry(token: string): unknown {
  const [payloadSegment = ''] = token.split('.');
  const payload = Buffer.from(payloadSegment, 'base64url').toString('utf8');

  return (JSON.parse(payload) as { exp?: unknown }).exp;
}

/** Spend the whole allowance for one address on wrong-password attempts. */
async function exhaustAllowance(ip: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
    const response = await POST(loginRequest({ password: 'wrong', ip }));
    expect(response.status).toBe(401);
  }
}

describe('POST /api/auth/login — correct password', () => {
  it('returns 200', async () => {
    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('sets a session cookie the real verifier accepts', async () => {
    const response = await POST(loginRequest());

    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();
    expect(verifySession(cookie?.value)).toBe(true);
  });

  it('does not set the hardcoded token this spec replaces', async () => {
    // Regression test for the actual vulnerability: the old value was a fixed
    // string in the source, so anyone who read the repo could set it themselves.
    const value = sessionCookie(await POST(loginRequest()))?.value;

    expect(value).not.toBe(OLD_HARDCODED_TOKEN);
    expect(value?.split('.')).toHaveLength(2);
  });

  it('signs an expiry that agrees with the cookie maxAge', async () => {
    // The two have to move together: `maxAge` is what the browser honours, `exp`
    // is what a crafted request cannot alter.
    const value = sessionCookie(await POST(loginRequest()))?.value ?? '';
    const expected = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;

    expect(decodeExpiry(value)).toBeGreaterThanOrEqual(expected - 5);
    expect(decodeExpiry(value)).toBeLessThanOrEqual(expected);
  });

  it('keeps the cookie inaccessible to JavaScript, lax, and site-wide', async () => {
    const cookie = sessionCookie(await POST(loginRequest()));

    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
  });

  it('expires the cookie after seven days', async () => {
    expect(sessionCookie(await POST(loginRequest()))?.maxAge).toBe(
      SESSION_MAX_AGE_SECONDS,
    );
  });

  it('marks the cookie secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(sessionCookie(await POST(loginRequest()))?.secure).toBe(true);
  });

  it('leaves the cookie usable over plain HTTP outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const response = await POST(loginRequest());

    expect(sessionCookie(response)?.secure).not.toBe(true);
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('clears earlier failures, so a mistyped attempt is not held against the operator', async () => {
    const ip = freshIp();
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt += 1) {
      await POST(loginRequest({ password: 'wrong', ip }));
    }

    expect((await POST(loginRequest({ ip }))).status).toBe(200);

    // The counter restarted, so the full allowance is available again.
    await exhaustAllowance(ip);
  });
});

describe('POST /api/auth/login — wrong password', () => {
  it('returns 401 and sets no cookie', async () => {
    const response = await POST(loginRequest({ password: 'wrong' }));

    expect(response.status).toBe(401);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('rejects a password one character short of the configured one', async () => {
    const response = await POST(loginRequest({ password: PASSWORD.slice(0, -1) }));

    expect(response.status).toBe(401);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('rejects a password with one character appended', async () => {
    expect((await POST(loginRequest({ password: `${PASSWORD}x` }))).status).toBe(401);
  });

  it('rejects an empty password rather than treating it as absent', async () => {
    const response = await POST(loginRequest({ password: '' }));

    expect(response.status).toBe(401);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('rejects the old hardcoded token submitted as the password', async () => {
    expect((await POST(loginRequest({ password: OLD_HARDCODED_TOKEN }))).status).toBe(401);
  });
});

describe('POST /api/auth/login — malformed request', () => {
  const malformed: Array<[string, string]> = [
    ['a body that is not JSON', 'not json at all'],
    ['a body with no password field', JSON.stringify({})],
    ['a numeric password', JSON.stringify({ password: 12345 })],
    ['a null password', JSON.stringify({ password: null })],
    ['a JSON array body', JSON.stringify([PASSWORD])],
  ];

  for (const [label, raw] of malformed) {
    it(`returns 400 for ${label}`, async () => {
      const response = await POST(loginRequest({ raw }));

      expect(response.status).toBe(400);
      expect(setsNoCookie(response)).toBe(true);
    });
  }
});

describe('POST /api/auth/login — unconfigured deployment', () => {
  it('returns 503 when ADMIN_PASSWORD is absent', async () => {
    delete testEnv.ADMIN_PASSWORD;

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('returns 503 when SESSION_SECRET is absent, rather than an unsigned session', async () => {
    delete testEnv.SESSION_SECRET;

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('names every missing variable in one response', async () => {
    delete testEnv.ADMIN_PASSWORD;
    delete testEnv.SESSION_SECRET;

    const body = await (await POST(loginRequest())).json();

    expect(body.missing).toEqual(['ADMIN_PASSWORD', 'SESSION_SECRET']);
  });

  it('treats a blank ADMIN_PASSWORD as unconfigured, not as a blank password', async () => {
    // Netlify stores a cleared variable as an empty string. Without this the
    // dashboard would be open to anyone submitting ''.
    testEnv.ADMIN_PASSWORD = '';

    const response = await POST(loginRequest({ password: '' }));

    expect(response.status).toBe(503);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('treats a whitespace-only ADMIN_PASSWORD as unconfigured', async () => {
    testEnv.ADMIN_PASSWORD = '   ';

    expect((await POST(loginRequest({ password: '   ' }))).status).toBe(503);
  });

  it('treats a blank SESSION_SECRET as unconfigured', async () => {
    // An empty HMAC key still produces signatures that verify — a signed session
    // whose key everyone knows.
    testEnv.SESSION_SECRET = '';

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('answers 503 before looking at the password', async () => {
    delete testEnv.SESSION_SECRET;

    expect((await POST(loginRequest({ password: 'wrong' }))).status).toBe(503);
  });
});

describe('POST /api/auth/login — rate limit', () => {
  it('allows every attempt up to the threshold', async () => {
    await exhaustAllowance(freshIp());
  });

  it('refuses the next attempt with 429', async () => {
    const ip = freshIp();
    await exhaustAllowance(ip);

    const response = await POST(loginRequest({ password: 'wrong', ip }));

    expect(response.status).toBe(429);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('sends Retry-After with a positive wait', async () => {
    const ip = freshIp();
    await exhaustAllowance(ip);

    const response = await POST(loginRequest({ password: 'wrong', ip }));

    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('refuses the correct password too, so this is a limit and not a delay', async () => {
    // The load-bearing assertion. Were the check placed after the comparison, a
    // blocked client would still be able to log in.
    const ip = freshIp();
    await exhaustAllowance(ip);

    const response = await POST(loginRequest({ password: PASSWORD, ip }));

    expect(response.status).toBe(429);
    expect(setsNoCookie(response)).toBe(true);
  });

  it('limits per client, leaving other addresses unaffected', async () => {
    const blocked = freshIp();
    await exhaustAllowance(blocked);

    expect((await POST(loginRequest())).status).toBe(200);
    expect((await POST(loginRequest({ password: 'wrong', ip: blocked }))).status).toBe(429);
  });

  it('counts header-less requests against one shared bucket', async () => {
    // Otherwise stripping the forwarded headers would be a free bypass.
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      await POST(loginRequest({ password: 'wrong', anonymous: true }));
    }

    expect((await POST(loginRequest({ password: PASSWORD, anonymous: true }))).status).toBe(
      429,
    );
  });
});

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for GET /api/dashboard/data.
 *
 * This endpoint returns every lead's name, email, and phone number, and `/api/*`
 * sits outside the request interceptor's matcher, so the handler's own check is
 * the only thing standing in front of that data. The tests are written from the
 * outside as attempts to get it: the old committed literal, no cookie at all, a
 * token signed with someone else's secret, an expired one, a tampered one.
 *
 * The session module is not mocked. Cookies are forged with the real
 * `createSession`, so the success case proves the handler accepts what the login
 * route actually issues, and the rejection cases exercise the real verifier.
 *
 * `@/config/env` is mocked with a mutable object because the real module parses
 * `process.env` once at import, and `@/lib/db` because these run with no Neon
 * connection.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

/** Cookie the mocked `next/headers` store will report, if any. */
let requestCookie: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'dashboard_auth' && requestCookie !== undefined
        ? { name, value: requestCookie }
        : undefined,
  }),
}));

/** Tables the handler read during a request, in order. */
let queriedTables: string[];

const LEAD_ID = '11111111-2222-3333-4444-555555555555';

const leadRows = [
  {
    id: LEAD_ID,
    fullName: 'Dana Whitfield',
    firstName: 'Dana',
    lastName: 'Whitfield',
    email: 'dana@example.com',
    phone: '(770) 555-0188',
    propertyInterest: 'buy',
    status: 'new',
    timeline: 'short_term',
    createdAt: new Date(),
    lastContactedAt: null,
    engagementScore: 4,
    formData: { location: 'Marietta', budget: '450k' },
  },
];

const followUpRows = [
  { leadId: LEAD_ID, status: 'scheduled', scheduledFor: new Date() },
  { leadId: LEAD_ID, status: 'sent', scheduledFor: new Date() },
];

vi.mock('@/lib/db', () => {
  /** Drizzle's builder is awaitable and chainable, so `limit` hangs off a real promise. */
  const resultOf = (rows: unknown[]) => {
    const promise = Promise.resolve(rows) as Promise<unknown[]> & {
      limit: (count: number) => Promise<unknown[]>;
    };
    promise.limit = () => Promise.resolve(rows);
    return promise;
  };

  return {
    leads: { __name: 'leads', createdAt: 'leads.created_at' },
    followUps: { __name: 'followUps', scheduledFor: 'follow_ups.scheduled_for' },
    db: {
      select: () => ({
        from: (table: { __name: string }) => {
          queriedTables.push(table.__name);
          return {
            orderBy: () =>
              resultOf(table.__name === 'leads' ? leadRows : followUpRows),
          };
        },
      }),
    },
  };
});

const { GET } = await import('./route');
const { SESSION_MAX_AGE_SECONDS, createSession } = await import('@/lib/auth/session');

const SECRET = 'test-session-secret-do-not-use-in-production';
const OTHER_SECRET = 'a-different-secret-an-attacker-might-hold';

/**
 * The value that worked as a credential before this spec.
 *
 * It was a constant in three committed files, so anyone who read the repository
 * could set it in devtools and pull the lead table.
 */
const OLD_HARDCODED_TOKEN = 'joey_dashboard_authenticated';

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
  testEnv.SESSION_SECRET = SECRET;
  requestCookie = undefined;
  queriedTables = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function dataRequest(): NextRequest {
  return new NextRequest('https://gowithjoeyo.com/api/dashboard/data');
}

/** Issue a request carrying `cookie` as the session, or none when omitted. */
async function requestWithCookie(cookie?: string) {
  requestCookie = cookie;
  return GET(dataRequest());
}

/** A `Date` the given number of seconds in the past. */
function secondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

/** A session signed under a secret the deployment does not hold. */
function sessionFromOtherSecret(): string {
  testEnv.SESSION_SECRET = OTHER_SECRET;
  const forged = createSession();
  testEnv.SESSION_SECRET = SECRET;

  return forged;
}

describe('GET /api/dashboard/data — forged cookie', () => {
  it('returns 401 for the hardcoded token this spec replaces', async () => {
    // The regression test for the vulnerability itself: this exact literal
    // returned 200 and the full lead table before this spec.
    const response = await requestWithCookie(OLD_HARDCODED_TOKEN);

    expect(response.status).toBe(401);
  });

  it('returns no lead data alongside that 401', async () => {
    const body = await (await requestWithCookie(OLD_HARDCODED_TOKEN)).json();

    expect(body).toEqual({ error: 'Unauthorized' });
    expect(body.leads).toBeUndefined();
    expect(body.stats).toBeUndefined();
  });

  it('does not touch the database for the forged token', async () => {
    // Rejecting before the query is what keeps a forged cookie from being a way
    // to probe whether the lead table has rows in it.
    await requestWithCookie(OLD_HARDCODED_TOKEN);

    expect(queriedTables).toEqual([]);
  });

  it('returns 401 for a session signed with a different secret', async () => {
    expect((await requestWithCookie(sessionFromOtherSecret())).status).toBe(401);
  });

  it('returns 401 for a payload edited after signing', async () => {
    const [payloadSegment = '', signatureSegment = ''] = createSession().split('.');
    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8'),
    );

    payload.exp += SESSION_MAX_AGE_SECONDS * 52;
    const tampered = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    expect((await requestWithCookie(`${tampered}.${signatureSegment}`)).status).toBe(401);
  });

  it('returns 401 for a malformed cookie rather than a 500', async () => {
    // A 500 here would read as a transient fault worth retrying. It is not.
    const response = await requestWithCookie('!!! not a token !!!');

    expect(response.status).toBe(401);
  });
});

describe('GET /api/dashboard/data — no session', () => {
  it('returns 401 when the cookie is absent', async () => {
    const response = await requestWithCookie(undefined);

    expect(response.status).toBe(401);
    expect(queriedTables).toEqual([]);
  });

  it('returns 401 when the cookie is empty', async () => {
    expect((await requestWithCookie('')).status).toBe(401);
  });

  it('returns 401 once the session has expired', async () => {
    const expired = createSession(secondsAgo(SESSION_MAX_AGE_SECONDS + 60));

    expect((await requestWithCookie(expired)).status).toBe(401);
  });

  it('returns 401 for a session issued under the previous secret after rotation', async () => {
    const issued = createSession();
    testEnv.SESSION_SECRET = OTHER_SECRET;

    expect((await requestWithCookie(issued)).status).toBe(401);
  });
});

describe('GET /api/dashboard/data — valid session', () => {
  it('returns 200 with stats and leads', async () => {
    const response = await requestWithCookie(createSession());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stats.total).toBe(1);
    expect(body.leads).toHaveLength(1);
  });

  it('reads both tables', async () => {
    await requestWithCookie(createSession());

    expect(queriedTables).toEqual(['leads', 'followUps']);
  });

  it('accepts a session issued earlier in the window', async () => {
    const issued = createSession(secondsAgo(SESSION_MAX_AGE_SECONDS - 60));

    expect((await requestWithCookie(issued)).status).toBe(200);
  });

  it('returns the lead detail the dashboard renders', async () => {
    const body = await (await requestWithCookie(createSession())).json();

    expect(body.leads[0]).toMatchObject({
      id: LEAD_ID,
      fullName: 'Dana Whitfield',
      email: 'dana@example.com',
      location: 'Marietta',
      followUps: { scheduled: 1, sent: 1, total: 2 },
    });
  });
});

describe('GET /api/dashboard/data — configuration', () => {
  it('returns 503 naming DATABASE_URL when a valid session asks and it is absent', async () => {
    delete testEnv.DATABASE_URL;

    const response = await requestWithCookie(createSession());

    expect(response.status).toBe(503);
    expect((await response.json()).missing).toEqual(['DATABASE_URL']);
  });

  it('answers 401 before configuration, so a forged cookie learns nothing about the deploy', async () => {
    delete testEnv.DATABASE_URL;

    const response = await requestWithCookie(OLD_HARDCODED_TOKEN);

    expect(response.status).toBe(401);
  });

  it('returns 401 when SESSION_SECRET is absent, rather than opening up', async () => {
    // A deploy that cannot verify a signature must deny access, not skip the
    // check. `verifySession` returns false rather than throwing for exactly this.
    const issued = createSession();
    delete testEnv.SESSION_SECRET;

    const response = await requestWithCookie(issued);

    expect(response.status).toBe(401);
    expect(queriedTables).toEqual([]);
  });
});

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for GET /api/dashboard/appointments.
 *
 * This returns who Joey is meeting, when, and how to reach them — names, emails
 * and phone numbers — so it is the same class of data as `/api/dashboard/data`
 * and it gets the same treatment here. `/api/*` sits outside the request
 * interceptor's matcher, so the handler's own cookie check is the only thing
 * standing in front of it. A forged dashboard cookie has already exposed the
 * lead table in this repo once; the authorization tests are written from the
 * outside as attempts to repeat that.
 *
 * The session module is deliberately not mocked. Cookies are forged with the
 * real `createSession`, so the success case proves the handler accepts what the
 * login route actually issues and the rejections exercise the real verifier.
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

const upcoming = vi.fn();
const between = vi.fn();
const withLeads = vi.fn();

vi.mock('@/lib/services/booking', () => ({ upcoming, between, withLeads }));

const { GET } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const SECRET = 'test-signing-secret-for-dashboard-appointments';

const STARTS_AT = new Date('2026-03-12T18:00:00.000Z');

const BOOKINGS = [
  {
    id: 'a1',
    leadId: 'lead-7',
    startsAt: STARTS_AT,
    endsAt: new Date('2026-03-12T18:15:00.000Z'),
    status: 'scheduled',
    channel: 'phone',
    createdBy: 'assistant',
    notes: 'Budget around 450',
  },
];

const WITH_LEAD = [
  {
    ...BOOKINGS[0],
    lead: {
      id: 'lead-7',
      name: 'Dana Whitfield',
      email: 'dana@example.com',
      phone: '404-555-0100',
    },
  },
];

/** Call the handler the way Next does, with a real NextRequest. */
function get(query = '') {
  return GET(
    new NextRequest(`https://gowithjoeyo.com/api/dashboard/appointments${query}`),
  );
}

beforeEach(() => {
  // Both the signing key and requireEnv read through @/config/env, which is
  // mocked above — so these go on testEnv, not process.env.
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  testEnv.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

  requestCookie = createSession();

  upcoming.mockReset();
  upcoming.mockResolvedValue(BOOKINGS);
  between.mockReset();
  between.mockResolvedValue(BOOKINGS);
  withLeads.mockReset();
  withLeads.mockResolvedValue(WITH_LEAD);

  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/dashboard/appointments — authorization', () => {
  it('serves a cookie the login route would actually issue', async () => {
    expect((await get()).status).toBe(200);
  });

  it.each([
    ['no cookie', undefined],
    ['the literal that used to be the password', 'joey_dashboard_authenticated'],
    ['a malformed token', 'not.a.token'],
  ])('refuses %s', async (_label, cookie) => {
    requestCookie = cookie as string | undefined;

    expect((await get()).status).toBe(401);
  });

  it('refuses a token signed with another deployment’s secret', async () => {
    testEnv.SESSION_SECRET = 'someone-elses-secret';
    const foreign = createSession();
    testEnv.SESSION_SECRET = SECRET;
    requestCookie = foreign;

    expect((await get()).status).toBe(401);
  });

  it('refuses an expired token', async () => {
    requestCookie = createSession(
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
    );

    expect((await get()).status).toBe(401);
  });

  it('reads no bookings for an unauthorized caller', async () => {
    requestCookie = undefined;

    await get();

    expect(upcoming).not.toHaveBeenCalled();
    expect(between).not.toHaveBeenCalled();
  });

  it('leaks nothing about the clients in a refusal', async () => {
    requestCookie = undefined;

    const body = await (await get()).json();

    expect(JSON.stringify(body)).not.toContain('Dana');
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('checks the cookie before asserting configuration', async () => {
    // Otherwise an unauthenticated caller can probe which environment variables
    // a deployment is missing.
    delete testEnv.DATABASE_URL;
    requestCookie = undefined;

    expect(await (await get()).json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('GET /api/dashboard/appointments — query handling', () => {
  it('returns the next page of bookings by default', async () => {
    await get();

    expect(upcoming).toHaveBeenCalledTimes(1);
    expect(upcoming.mock.calls[0]?.[0]).toBeInstanceOf(Date);
    expect(upcoming.mock.calls[0]?.[1]).toBe(50);
  });

  it('moves the starting point for from alone', async () => {
    await get('?from=2026-03-01T00:00:00.000Z');

    expect(upcoming).toHaveBeenCalledTimes(1);
    expect((upcoming.mock.calls[0]?.[0] as Date).toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
    expect(between).not.toHaveBeenCalled();
  });

  it('switches to a window when both ends are given', async () => {
    // A month view asks for a range, which also brings back completed and
    // no-show bookings — a calendar looking backwards should show what happened.
    await get('?from=2026-03-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z');

    expect(between).toHaveBeenCalledTimes(1);
    expect((between.mock.calls[0]?.[0] as Date).toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
    expect((between.mock.calls[0]?.[1] as Date).toISOString()).toBe(
      '2026-04-01T00:00:00.000Z',
    );
    expect(upcoming).not.toHaveBeenCalled();
  });

  it('honours a limit inside the ceiling', async () => {
    await get('?limit=10');

    expect(upcoming.mock.calls[0]?.[1]).toBe(10);
  });

  it('bounds a window too, rather than returning every booking in it', async () => {
    // Each row carries a name, an email and a phone number once the leads are
    // attached, so a decade-wide window must not be a way to ask for the whole
    // client list in one response.
    await get('?from=1970-01-01T00:00:00.000Z&to=2100-01-01T00:00:00.000Z');

    expect(between.mock.calls[0]?.[2]).toBe(50);
  });

  it('applies an explicit limit to a window', async () => {
    await get('?from=2026-03-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z&limit=5');

    expect(between.mock.calls[0]?.[2]).toBe(5);
  });

  it.each([
    ['to without from', '?to=2026-04-01T00:00:00.000Z'],
    ['an unparseable from', '?from=next%20tuesday'],
    ['an unparseable to', '?from=2026-03-01T00:00:00.000Z&to=soon'],
    ['an inverted range', '?from=2026-04-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z'],
    ['a zero limit', '?limit=0'],
    ['a limit past the ceiling', '?limit=500'],
  ])('refuses %s', async (_label, query) => {
    const response = await get(query);

    expect(response.status).toBe(400);
    expect(upcoming).not.toHaveBeenCalled();
    expect(between).not.toHaveBeenCalled();
  });

  it('names the parameter it objected to', async () => {
    const body = await (await get('?limit=500')).json();

    expect(body.error).toContain('limit');
  });
});

describe('GET /api/dashboard/appointments — payload', () => {
  it('serialises dates as ISO strings and keeps the client attached', async () => {
    const body = await (await get()).json();

    expect(body.appointments).toHaveLength(1);
    expect(body.appointments[0].startsAt).toBe(STARTS_AT.toISOString());
    expect(body.appointments[0].lead).toEqual({
      id: 'lead-7',
      name: 'Dana Whitfield',
      email: 'dana@example.com',
      phone: '404-555-0100',
    });
  });

  it('reports the window it answered for', async () => {
    const body = await (
      await get('?from=2026-03-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z')
    ).json();

    expect(body.range).toEqual({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-04-01T00:00:00.000Z',
    });
  });

  it('reports a null end for an open-ended request', async () => {
    const body = await (await get()).json();

    expect(body.range.to).toBeNull();
    expect(typeof body.range.from).toBe('string');
  });

  it('explains a missing table instead of showing an empty calendar', async () => {
    // "Nobody has booked" and "the table does not exist" look identical from an
    // empty list, and the second is by far the more likely — the DDL has not
    // been applied.
    upcoming.mockRejectedValue(
      new Error('relation "appointments" does not exist'),
    );

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('appointment-schema.sql');
  });
});

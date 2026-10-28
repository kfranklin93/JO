import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for GET /api/dashboard/leads/[id]/history.
 *
 * This returns one client's entire conversation — what they said about their
 * budget, their timeline, their address. `/api/*` sits outside the request
 * interceptor's matcher, so this handler's own cookie check is the only thing
 * in front of it, and a forged dashboard cookie has already exposed the lead
 * table in this repo once. The tests are written from the outside as attempts
 * to repeat that.
 *
 * The session module is deliberately not mocked: cookies are forged with the
 * real `createSession`, so the success case proves the handler accepts what the
 * login route issues and the rejections exercise the real verifier.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

let requestCookie: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'dashboard_auth' && requestCookie !== undefined
        ? { name, value: requestCookie }
        : undefined,
  }),
}));

const leadHistory = vi.fn();
vi.mock('@/lib/services/lead-history', () => ({ leadHistory }));

const assistantMuteState = vi.fn();
vi.mock('@/lib/services/assistant-mute', () => ({ assistantMuteState }));

const forLead = vi.fn();
const withLeads = vi.fn();
vi.mock('@/lib/services/booking', () => ({ forLead, withLeads }));

const { GET } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const SECRET = 'test-secret-for-lead-history';
const LEAD = '11111111-2222-4333-8444-555555555555';

const AT = new Date('2026-09-01T12:00:00.000Z');

const HISTORY = [
  {
    id: 'm1',
    channel: 'chat',
    direction: 'inbound',
    content: 'My budget is around 450',
    subject: null,
    aiGenerated: false,
    createdAt: AT,
    seq: 1,
  },
  {
    id: 'm2',
    channel: 'chat',
    direction: 'outbound',
    content: 'Joey will talk that through with you.',
    subject: null,
    aiGenerated: true,
    createdAt: AT,
    seq: 2,
  },
];

/** One booking, as `withLeads` hands it back. */
const BOOKING = {
  id: 'appt-1',
  leadId: LEAD,
  startsAt: new Date('2026-03-12T18:00:00.000Z'),
  endsAt: new Date('2026-03-12T18:15:00.000Z'),
  status: 'scheduled',
  channel: 'phone',
  createdBy: 'assistant',
  notes: null,
  lead: {
    id: LEAD,
    name: 'Dana Whitfield',
    email: 'dana@example.com',
    phone: '404-555-0100',
  },
};

/** Call the handler the way Next does, with params as a promise. */
function get(id = LEAD) {
  return GET(new Request(`https://gowithjoeyo.com/api/dashboard/leads/${id}/history`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  testEnv.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

  requestCookie = createSession();

  leadHistory.mockReset();
  leadHistory.mockResolvedValue(HISTORY);
  assistantMuteState.mockReset();
  assistantMuteState.mockResolvedValue({ muted: false, reason: null });
  forLead.mockReset();
  forLead.mockResolvedValue([]);
  withLeads.mockReset();
  withLeads.mockResolvedValue([]);

  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorization', () => {
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
    requestCookie = createSession(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30));

    expect((await get()).status).toBe(401);
  });

  it('reads nothing for an unauthorized caller', async () => {
    requestCookie = undefined;

    await get();

    expect(leadHistory).not.toHaveBeenCalled();
  });

  it('leaks no message content in a refusal', async () => {
    requestCookie = undefined;

    const body = await (await get()).json();

    expect(JSON.stringify(body)).not.toContain('budget');
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('checks the cookie before asserting configuration', async () => {
    // Otherwise an unauthenticated caller can probe which variables are missing.
    delete testEnv.DATABASE_URL;
    requestCookie = undefined;

    expect(await (await get()).json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('scoping', () => {
  it('asks only for the lead in the path', async () => {
    // Requirement 8.6. The existing dashboard route already fetches every lead
    // unbounded; this one must not widen that.
    await get(LEAD);

    expect(leadHistory).toHaveBeenCalledWith(LEAD);
    expect(leadHistory).toHaveBeenCalledTimes(1);
  });

  it('does not return another lead’s messages', async () => {
    const other = '99999999-8888-4777-8666-555555555555';
    leadHistory.mockResolvedValue([]);

    const body = await (await get(other)).json();

    expect(leadHistory).toHaveBeenCalledWith(other);
    expect(body.history).toEqual([]);
  });
});

describe('payload', () => {
  it('returns the history with direction, channel and the AI flag intact', async () => {
    // Requirements 8.1-8.3: the dashboard cannot distinguish a model-written
    // message from one Joey sent unless these survive serialisation.
    const body = await (await get()).json();

    expect(body.history).toHaveLength(2);
    expect(body.history[0]).toMatchObject({
      channel: 'chat',
      direction: 'inbound',
      aiGenerated: false,
    });
    expect(body.history[1]).toMatchObject({
      direction: 'outbound',
      aiGenerated: true,
    });
  });

  it('reports the mute state alongside, so the panel needs one request', async () => {
    assistantMuteState.mockResolvedValue({ muted: true, reason: 'lead' });

    const body = await (await get()).json();

    expect(body.assistant).toEqual({ muted: true, reason: 'lead' });
  });

  it('returns this lead’s bookings alongside the conversation', async () => {
    // Requirement 8.4. The panel renders date, time and status, so all three
    // have to survive serialisation — `startsAt` in particular, which is a Date
    // on the way out and an ISO string on the way in.
    withLeads.mockResolvedValue([BOOKING]);

    const body = await (await get()).json();

    expect(body.appointments).toHaveLength(1);
    expect(body.appointments[0]).toMatchObject({
      id: 'appt-1',
      startsAt: '2026-03-12T18:00:00.000Z',
      status: 'scheduled',
      channel: 'phone',
    });
    expect(body.appointments[0].lead.name).toBe('Dana Whitfield');
  });

  it('asks for bookings scoped to the lead in the path', async () => {
    await get(LEAD);

    expect(forLead).toHaveBeenCalledWith(LEAD);
    expect(forLead).toHaveBeenCalledTimes(1);
  });

  it('still serves the conversation when the calendar read fails', async () => {
    // appointment-schema.sql has not been applied, so a missing relation is the
    // likely case. Losing the transcript over a missing bookings section would
    // break the panel's primary job, which works today.
    forLead.mockRejectedValue(new Error('relation "appointments" does not exist'));

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.history).toHaveLength(2);
    expect(body.appointments).toEqual([]);
  });

  it('explains a missing table rather than showing an empty history', async () => {
    leadHistory.mockRejectedValue(new Error('relation "chat_messages" does not exist'));

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('chat-schema.sql');
  });
});

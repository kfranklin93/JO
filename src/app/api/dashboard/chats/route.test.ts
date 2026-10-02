import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for GET /api/dashboard/chats.
 *
 * This endpoint returns what visitors typed into the chat panel — budgets,
 * timelines, addresses, whatever they volunteered — so it is the same class of
 * data as `/api/dashboard/data`, and it gets the same treatment here. `/api/*`
 * sits outside the request interceptor's matcher, so the handler's own cookie
 * check is the only thing standing in front of it. A forged dashboard cookie has
 * already exposed the lead table in this repo once; these tests are written from
 * the outside as attempts to repeat that.
 *
 * The session module is deliberately not mocked. Cookies are forged with the real
 * `createSession`, so the success case proves the handler accepts what the login
 * route actually issues and the rejections exercise the real verifier.
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

const listRecentChats = vi.fn();
const countAnonymousChats = vi.fn();

vi.mock('@/lib/services/chat-store', () => ({
  listRecentChats,
  countAnonymousChats,
  MAX_TRANSCRIPTS: 100,
}));

const { GET } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const SECRET = 'test-signing-secret-for-dashboard-chats';

const TRANSCRIPTS = [
  {
    session: {
      id: '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      leadId: 'lead-7',
      messageCount: 2,
      lastMessageAt: new Date('2026-09-01T12:00:00.000Z'),
      createdAt: new Date('2026-09-01T11:59:00.000Z'),
    },
    messages: [
      { id: 'm1', sessionId: 's1', seq: 1, role: 'user', content: 'My budget is around 450', mode: null, toolCalls: [], inputTokens: null, outputTokens: null, latencyMs: null, createdAt: new Date() },
    ],
  },
  {
    session: {
      id: '4f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      leadId: null,
      messageCount: 2,
      lastMessageAt: new Date('2026-09-01T10:00:00.000Z'),
      createdAt: new Date('2026-09-01T09:59:00.000Z'),
    },
    messages: [],
  },
];

beforeEach(() => {
  // Both the signing key and requireEnv read through @/config/env, which is
  // mocked above — so these go on testEnv, not process.env.
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  testEnv.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

  requestCookie = createSession();

  listRecentChats.mockReset();
  listRecentChats.mockResolvedValue(TRANSCRIPTS);
  countAnonymousChats.mockReset();
  countAnonymousChats.mockResolvedValue(1);

  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/dashboard/chats — authorization', () => {
  it('serves a cookie the login route would actually issue', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
  });

  it('refuses a request with no cookie', async () => {
    requestCookie = undefined;

    expect((await GET()).status).toBe(401);
  });

  it('refuses the literal that used to be the password', async () => {
    requestCookie = 'joey_dashboard_authenticated';

    expect((await GET()).status).toBe(401);
  });

  it('refuses a token signed with a different secret', async () => {
    testEnv.SESSION_SECRET = 'someone-elses-secret';
    const foreign = createSession();
    testEnv.SESSION_SECRET = SECRET;
    requestCookie = foreign;

    expect((await GET()).status).toBe(401);
  });

  it('refuses an expired token', async () => {
    const longAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    requestCookie = createSession(longAgo);

    expect((await GET()).status).toBe(401);
  });

  it('refuses a tampered token', async () => {
    const valid = createSession();
    // Flip the last character of the signature.
    requestCookie = valid.slice(0, -1) + (valid.endsWith('a') ? 'b' : 'a');

    expect((await GET()).status).toBe(401);
  });

  it('reads no transcripts for an unauthorized caller', async () => {
    requestCookie = undefined;

    await GET();

    expect(listRecentChats).not.toHaveBeenCalled();
  });

  it('leaks nothing about the data in a refusal', async () => {
    requestCookie = undefined;

    const body = await (await GET()).json();

    expect(JSON.stringify(body)).not.toContain('budget');
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

describe('GET /api/dashboard/chats — configuration', () => {
  it('checks the cookie before asserting configuration', async () => {
    // Otherwise an unauthenticated caller can probe which environment variables
    // a deployment is missing.
    delete testEnv.DATABASE_URL;
    requestCookie = undefined;

    const body = await (await GET()).json();

    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

describe('GET /api/dashboard/chats — payload', () => {
  it('returns the transcripts with a converted/anonymous split', async () => {
    const body = await (await GET()).json();

    expect(body.transcripts).toHaveLength(2);
    expect(body.stats).toEqual({ sessions: 2, anonymous: 1, converted: 1 });
  });

  it('explains a missing table instead of showing an empty dashboard', async () => {
    // "No one has used the chat" and "the table does not exist" look identical
    // from an empty list, and the second is by far the more likely.
    listRecentChats.mockRejectedValue(
      new Error('relation "chat_sessions" does not exist'),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('chat-schema.sql');
  });
});

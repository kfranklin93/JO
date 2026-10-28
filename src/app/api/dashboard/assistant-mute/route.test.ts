import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for the assistant mute switches.
 *
 * This endpoint is different from the other dashboard routes: it does not read
 * data, it changes what real visitors experience. An unauthorised caller who
 * reached it could silence Joey's assistant site-wide, which is a denial of his
 * lead capture — so the auth tests matter more here, not less.
 *
 * The other property under test is that a scope is either the literal 'global'
 * or a lead uuid, and nothing else. The column is a stringly-typed primary key
 * with a CHECK constraint behind it; this is the layer that keeps the database
 * from having to reject anything.
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

const mute = vi.fn();
const unmute = vi.fn();
const listMutes = vi.fn();

vi.mock('@/lib/services/assistant-mute', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/assistant-mute')>(
    '@/lib/services/assistant-mute',
  );
  return {
    // The scope helpers are the validation under test, so the real ones are
    // used; only the database-touching functions are replaced.
    GLOBAL_SCOPE: actual.GLOBAL_SCOPE,
    globalScope: actual.globalScope,
    leadScope: actual.leadScope,
    mute,
    unmute,
    listMutes,
  };
});

const { GET, POST } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const SECRET = 'test-secret-for-assistant-mute';
const LEAD = '11111111-2222-4333-8444-555555555555';

function post(body: unknown) {
  return POST(
    new NextRequest('https://gowithjoeyo.com/api/dashboard/assistant-mute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  testEnv.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

  requestCookie = createSession();

  mute.mockReset();
  mute.mockResolvedValue(undefined);
  unmute.mockReset();
  unmute.mockResolvedValue(undefined);
  listMutes.mockReset();
  listMutes.mockResolvedValue([]);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorization', () => {
  it('lets a real dashboard session read the switches', async () => {
    expect((await GET()).status).toBe(200);
  });

  it('lets a real dashboard session flip one', async () => {
    expect((await post({ scope: 'global', muted: true })).status).toBe(200);
  });

  it.each([
    ['no cookie', undefined],
    ['the old hardcoded literal', 'joey_dashboard_authenticated'],
  ])('refuses a read with %s', async (_label, cookie) => {
    requestCookie = cookie as string | undefined;

    expect((await GET()).status).toBe(401);
  });

  it('refuses a write with no cookie, and changes nothing', async () => {
    // The damaging direction: an anonymous caller silencing the assistant.
    requestCookie = undefined;

    expect((await post({ scope: 'global', muted: true })).status).toBe(401);
    expect(mute).not.toHaveBeenCalled();
    expect(unmute).not.toHaveBeenCalled();
  });

  it('refuses a write signed with another secret', async () => {
    testEnv.SESSION_SECRET = 'someone-elses-secret';
    const foreign = createSession();
    testEnv.SESSION_SECRET = SECRET;
    requestCookie = foreign;

    expect((await post({ scope: 'global', muted: true })).status).toBe(401);
    expect(mute).not.toHaveBeenCalled();
  });
});

describe('scope validation', () => {
  it('accepts the global scope', async () => {
    await post({ scope: 'global', muted: true });

    expect(mute).toHaveBeenCalledWith('global', undefined);
  });

  it('accepts a lead id and normalises its case', async () => {
    await post({ scope: LEAD.toUpperCase(), muted: true });

    expect(mute).toHaveBeenCalledWith(LEAD, undefined);
  });

  it.each([
    ['a missing scope', { muted: true }],
    ['an empty scope', { scope: '   ', muted: true }],
    ['a non-string scope', { scope: 42, muted: true }],
    ['an arbitrary string', { scope: 'all-of-them', muted: true }],
    ['a SQL fragment', { scope: "'; delete from assistant_mutes; --", muted: true }],
  ])('refuses %s', async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(mute).not.toHaveBeenCalled();
  });

  it('refuses a missing or non-boolean muted flag', async () => {
    // A truthy string would silently mute when the caller meant to unmute.
    expect((await post({ scope: 'global' })).status).toBe(400);
    expect((await post({ scope: 'global', muted: 'false' })).status).toBe(400);
    expect(mute).not.toHaveBeenCalled();
    expect(unmute).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    expect((await post('not json')).status).toBe(400);
  });
});

describe('flipping the switch', () => {
  it('unmutes when asked to', async () => {
    await post({ scope: LEAD, muted: false });

    expect(unmute).toHaveBeenCalledWith(LEAD);
    expect(mute).not.toHaveBeenCalled();
  });

  it('carries a note through, trimmed and capped', async () => {
    await post({ scope: 'global', muted: true, note: '  said the wrong price  ' });

    expect(mute).toHaveBeenCalledWith('global', 'said the wrong price');
  });

  it('caps a very long note rather than rejecting it', async () => {
    await post({ scope: 'global', muted: true, note: 'x'.repeat(900) });

    expect((mute.mock.calls[0]?.[1] as string).length).toBe(500);
  });

  it('reports failure rather than claiming success', async () => {
    // A switch that reports success without flipping would leave Joey believing
    // the assistant is silent while it keeps replying.
    mute.mockRejectedValue(new Error('relation "assistant_mutes" does not exist'));

    const response = await post({ scope: 'global', muted: true });

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('relation');
  });
});

describe('reading the switches', () => {
  it('reports whether the global switch is on', async () => {
    listMutes.mockResolvedValue([
      { scope: 'global', mutedAt: new Date(), note: null },
      { scope: LEAD, mutedAt: new Date(), note: 'handling personally' },
    ]);

    const body = await (await GET()).json();

    expect(body.global).toBe(true);
    expect(body.mutes).toHaveLength(2);
  });

  it('reports global off when only leads are muted', async () => {
    listMutes.mockResolvedValue([{ scope: LEAD, mutedAt: new Date(), note: null }]);

    expect((await (await GET()).json()).global).toBe(false);
  });

  it('explains a missing table', async () => {
    listMutes.mockRejectedValue(new Error('relation does not exist'));

    const body = await (await GET()).json();

    expect(body.error).toContain('assistant-mute-schema.sql');
  });
});

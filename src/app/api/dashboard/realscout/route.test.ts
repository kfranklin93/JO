import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for GET /api/dashboard/realscout — the connectivity
 * check.
 *
 * `/api/*` sits outside the request interceptor's matcher, so this handler's own
 * cookie check is the only thing in front of it. The session module is
 * deliberately not mocked: cookies are forged with the real `createSession`, so
 * the success case proves the handler accepts what the login route issues and
 * the rejections exercise the real verifier.
 *
 * The other assertion is that the diagnostic never leaks the credential it is
 * diagnosing. The token is secret-scoped in Netlify precisely so nobody can
 * read it, and an endpoint that echoed it would undo that.
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

const { GET } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const SECRET = 'test-secret-for-realscout-diagnostics';
const TOKEN = 'rs_agent_do_not_leak_me';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  testEnv.REALSCOUT_API_TOKEN = TOKEN;

  requestCookie = createSession();

  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorisation', () => {
  it('runs the probe for a valid dashboard session', async () => {
    fetchMock.mockImplementation(() => jsonResponse(200, { id: 'a', scopes: [] }));

    const response = await GET();

    expect(response.status).toBe(200);
  });

  it('rejects a request with no cookie, without calling RealScout', async () => {
    requestCookie = undefined;

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a forged cookie', async () => {
    requestCookie = 'eyJ0eXAiOiJkYXNoYm9hcmQiLCJleHAiOjk5OTk5OTk5OTl9.not-a-signature';

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells an unauthenticated caller nothing about the deployment', async () => {
    requestCookie = undefined;

    const body = await (await GET()).json();

    // Not even whether this deployment has a RealScout token.
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

describe('the report', () => {
  it('reports the scopes and whether the push direction can work', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'QWdlbnQtMjcyNDY1',
          full_name: 'Joey O.',
          brokerage_name: 'eXp Realty',
          scopes: ['account:read', 'contacts:read', 'contacts:write'],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));

    const body = await (await GET()).json();

    expect(body.canWriteContacts).toBe(true);
    expect(body.scopes).toContain('contacts:write');
    expect(body.probes.map((probe: { endpoint: string }) => probe.endpoint)).toEqual([
      'GET /me',
      'GET /contacts?limit=1',
      'GET /activity?limit=1',
    ]);
  });

  it('answers 200 with the finding when a probe fails, not an error status', async () => {
    // "The token is valid but has no contacts:read" is a successful diagnosis.
    // A non-200 here would make the dashboard show a fetch failure instead.
    fetchMock.mockImplementation(() =>
      jsonResponse(403, {
        error: {
          code: 'missing_scope',
          message:
            'This call requires the contacts:read scope, which this credential was not granted.',
        },
      }),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.probes[1]).toMatchObject({
      reachable: false,
      status: 403,
      reason: 'scope',
      missingScope: 'contacts:read',
    });
  });

  it('reports `unconfigured` without a network call when there is no token', async () => {
    delete testEnv.REALSCOUT_API_TOKEN;

    const body = await (await GET()).json();

    expect(body.configured).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never returns the token, on any path', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(401, { error: { code: 'unauthorized', message: 'nope' } }),
    );

    const body = await (await GET()).text();

    expect(body).not.toContain(TOKEN);
  });
});

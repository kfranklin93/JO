import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for POST /api/dashboard/leads/import.
 *
 * Two things are being guarded. The first is the boundary: this endpoint writes
 * rows into the lead table, `/api/*` is outside the request interceptor's
 * matcher, and its own cookie check is the only thing in front of it. The
 * session module is not mocked, so the cookies here are the ones the login
 * route issues.
 *
 * The second is that a request without `commit: true` cannot write. The preview
 * is the whole safety mechanism of this feature — the screen Joey reads before
 * 200 contacts are created — and a default that wrote would make it decorative.
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

const previewImport = vi.fn();
const runImport = vi.fn();
vi.mock('@/lib/services/lead-import', () => ({ previewImport, runImport }));

const { POST } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const SECRET = 'test-secret-for-lead-import';

const TEXT = 'Dana,(770) 555-0100,dana@example.com,Active,note';

const PLAN = {
  delimiter: ',',
  headerDetected: false,
  columns: { name: 0, phone: 1, email: 2, status: 3, notes: 4 },
  totalRows: 1,
  create: [
    {
      line: 1,
      fullName: 'Dana',
      email: 'dana@example.com',
      phone: '(770) 555-0100',
      status: 'qualified',
      spreadsheetStatus: 'Active',
      notes: 'note',
    },
  ],
  skipped: [],
  rejected: [],
};

function post(body: unknown, raw?: string) {
  return POST(
    new Request('https://gowithjoeyo.com/api/dashboard/leads/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw ?? JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
  );
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  testEnv.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

  requestCookie = createSession();

  previewImport.mockReset();
  previewImport.mockResolvedValue({ ok: true, plan: PLAN });
  runImport.mockReset();
  runImport.mockResolvedValue({
    ok: true,
    result: {
      plan: PLAN,
      created: [
        {
          id: 'lead-1',
          line: 1,
          fullName: 'Dana',
          email: 'dana@example.com',
          status: 'qualified',
        },
      ],
      followUpsCreated: 0,
      wrote: true,
      batchId: 'batch-1',
    },
  });

  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorization', () => {
  it('accepts a cookie the login route would actually issue', async () => {
    expect((await post({ text: TEXT })).status).toBe(200);
  });

  it.each([
    ['no cookie', undefined],
    ['the literal that used to be the password', 'joey_dashboard_authenticated'],
    ['a malformed token', 'not.a.token'],
  ])('refuses %s with 401', async (_label, cookie) => {
    requestCookie = cookie as string | undefined;

    const response = await post({ text: TEXT, commit: true });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('refuses a token signed with another deployment’s secret', async () => {
    testEnv.SESSION_SECRET = 'someone-elses-secret';
    const foreign = createSession();
    testEnv.SESSION_SECRET = SECRET;
    requestCookie = foreign;

    expect((await post({ text: TEXT })).status).toBe(401);
  });

  it('refuses an expired token', async () => {
    requestCookie = createSession(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30));

    expect((await post({ text: TEXT })).status).toBe(401);
  });

  it('neither plans nor writes for an unauthorized caller', async () => {
    requestCookie = undefined;

    await post({ text: TEXT, commit: true });

    expect(previewImport).not.toHaveBeenCalled();
    expect(runImport).not.toHaveBeenCalled();
  });

  it('checks the cookie before asserting configuration', async () => {
    delete testEnv.DATABASE_URL;
    requestCookie = undefined;

    expect(await (await post({ text: TEXT })).json()).toEqual({
      error: 'Unauthorized',
    });
  });
});

describe('the preview cannot write', () => {
  it('plans and does not import when commit is absent', async () => {
    const response = await post({ text: TEXT });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.committed).toBe(false);
    expect(body.plan).toMatchObject({ totalRows: 1 });
    expect(previewImport).toHaveBeenCalledWith(TEXT);
    expect(runImport).not.toHaveBeenCalled();
  });

  it('plans and does not import when commit is false', async () => {
    await post({ text: TEXT, commit: false });

    expect(runImport).not.toHaveBeenCalled();
  });

  it('refuses a non-boolean commit rather than treating it as truthy', async () => {
    // `commit: "yes"` coerced to true is 200 contacts written by a typo.
    const response = await post({ text: TEXT, commit: 'yes' });

    expect(response.status).toBe(400);
    expect(runImport).not.toHaveBeenCalled();
  });
});

describe('request validation', () => {
  it('rejects a malformed body as 400', async () => {
    const response = await post(undefined, 'not json');

    expect(response.status).toBe(400);
    expect(previewImport).not.toHaveBeenCalled();
  });

  it('requires text', async () => {
    expect((await post({ commit: true })).status).toBe(400);
    expect(runImport).not.toHaveBeenCalled();
  });

  it('refuses text too large to process in one request', async () => {
    const response = await post({ text: 'x'.repeat(1_000_001) });

    expect(response.status).toBe(413);
    expect(previewImport).not.toHaveBeenCalled();
  });

  it('reports a plan the service refused as 422, not 500', async () => {
    previewImport.mockResolvedValue({
      ok: false,
      error: 'No email column found.',
    });

    const response = await post({ text: TEXT });

    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('No email column');
  });
});

describe('the commit', () => {
  it('re-plans from the text rather than trusting a plan from the browser', async () => {
    // Accepting a client-supplied row list would make this a general
    // "write these rows to the lead table" primitive behind one cookie.
    await post({ text: TEXT, commit: true, plan: { create: [{ email: 'x@y.z' }] } });

    expect(runImport).toHaveBeenCalledWith(TEXT);
    expect(runImport).toHaveBeenCalledTimes(1);
  });

  it('reports the created rows, the counts, and zero follow-ups', async () => {
    const body = await (await post({ text: TEXT, commit: true })).json();

    expect(body).toMatchObject({
      committed: true,
      wrote: true,
      createdCount: 1,
      followUpsCreated: 0,
      batchId: 'batch-1',
    });
    expect(body.created[0]).toMatchObject({ line: 1, email: 'dana@example.com' });
  });

  it('states that nothing was written when there was nothing new', async () => {
    runImport.mockResolvedValue({
      ok: true,
      result: {
        plan: { ...PLAN, create: [] },
        created: [],
        followUpsCreated: 0,
        wrote: false,
        batchId: 'batch-2',
      },
    });

    const body = await (await post({ text: TEXT, commit: true })).json();

    expect(body.wrote).toBe(false);
    expect(body.createdCount).toBe(0);
  });

  it('says plainly that nothing was written when the write fails', async () => {
    // The alternative reading — "some unknown subset of 200 contacts landed" —
    // is the one state nobody can clean up.
    runImport.mockRejectedValue(new Error('connection terminated'));

    const response = await post({ text: TEXT, commit: true });

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('nothing was written');
  });
});

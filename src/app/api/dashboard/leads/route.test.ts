import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for POST /api/dashboard/leads.
 *
 * This is the dashboard's first lead write path, so the boundary gets the same
 * treatment as the read-only routes beside it: `/api/*` sits outside the request
 * interceptor's matcher, this handler's own cookie check is the only thing in
 * front of it, and a forged dashboard cookie has already exposed the lead table
 * in this repo once. The session module is deliberately not mocked — cookies are
 * forged with the real `createSession`, so the success cases prove the handler
 * accepts what the login route issues and the rejections exercise the real
 * verifier.
 *
 * The one behavioural assertion that is not about HTTP: an omitted
 * `scheduleFollowUps` must reach the service as `false`. A request body that
 * forgets the field cannot be allowed to mean "send five marketing emails".
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

const createManualLead = vi.fn();
vi.mock('@/lib/services/lead-import', () => ({ createManualLead }));

const { POST } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const SECRET = 'test-secret-for-manual-lead-entry';

const VALID = {
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  phone: '(770) 555-0100',
  intent: 'buy',
  status: 'contacted',
  notes: 'Referral from the Hales',
};

function post(body: unknown, raw?: string) {
  return POST(
    new Request('https://gowithjoeyo.com/api/dashboard/leads', {
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

  createManualLead.mockReset();
  createManualLead.mockResolvedValue({
    leadId: 'lead-1',
    status: 'contacted',
    followUpsCreated: 0,
  });

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorization', () => {
  it('accepts a cookie the login route would actually issue', async () => {
    expect((await post(VALID)).status).toBe(201);
  });

  it.each([
    ['no cookie', undefined],
    ['the literal that used to be the password', 'joey_dashboard_authenticated'],
    ['a malformed token', 'not.a.token'],
  ])('refuses %s with 401', async (_label, cookie) => {
    requestCookie = cookie as string | undefined;

    const response = await post(VALID);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('refuses a token signed with another deployment’s secret', async () => {
    testEnv.SESSION_SECRET = 'someone-elses-secret';
    const foreign = createSession();
    testEnv.SESSION_SECRET = SECRET;
    requestCookie = foreign;

    expect((await post(VALID)).status).toBe(401);
  });

  it('refuses an expired token', async () => {
    requestCookie = createSession(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30));

    expect((await post(VALID)).status).toBe(401);
  });

  it('writes nothing for an unauthorized caller', async () => {
    requestCookie = undefined;

    await post(VALID);

    expect(createManualLead).not.toHaveBeenCalled();
  });

  it('checks the cookie before asserting configuration', async () => {
    // Otherwise an unauthenticated caller can probe which variables are missing.
    delete testEnv.DATABASE_URL;
    requestCookie = undefined;

    expect(await (await post(VALID)).json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('validation', () => {
  it('rejects a malformed body as 400 without writing', async () => {
    const response = await post(undefined, 'not json');

    expect(response.status).toBe(400);
    expect(createManualLead).not.toHaveBeenCalled();
  });

  it('reports a bad email as a field error, not a 500', async () => {
    const response = await post({ ...VALID, email: 'dana-at-example' });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.fieldErrors.email).toBe('Enter a valid email address');
    expect(createManualLead).not.toHaveBeenCalled();
  });

  it('reports every broken field in one response', async () => {
    // Two round trips to discover two problems with one form is a worse form.
    const response = await post({
      ...VALID,
      name: '',
      email: 'nope',
      status: 'Active',
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(Object.keys(body.fieldErrors).sort()).toEqual([
      'email',
      'name',
      'status',
    ]);
  });

  it('refuses a status the lead_status column does not have', async () => {
    // `Active` is Joey's spreadsheet word, not an enum member. Accepting it
    // would surface as a Postgres enum error inside a 500.
    const response = await post({ ...VALID, status: 'Active' });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.fieldErrors.status).toBe('Select a status');
  });

  it('uses the public form’s validation, so the caps are the column widths', async () => {
    const response = await post({ ...VALID, phone: '9'.repeat(40) });

    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors.phone).toBeTruthy();
  });

  it('refuses a non-boolean scheduleFollowUps rather than coercing it', async () => {
    const response = await post({ ...VALID, scheduleFollowUps: 'yes' });

    expect(response.status).toBe(400);
    expect(createManualLead).not.toHaveBeenCalled();
  });
});

describe('the write', () => {
  it('passes the validated submission and the chosen status through', async () => {
    await post(VALID);

    expect(createManualLead).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Dana Whitfield',
        firstName: 'Dana',
        lastName: 'Whitfield',
        email: 'dana@example.com',
        phone: '(770) 555-0100',
        intent: 'buy',
        additionalNotes: 'Referral from the Hales',
      }),
      { status: 'contacted', scheduleFollowUps: false }
    );
  });

  it('defaults scheduleFollowUps to false when the field is absent', async () => {
    const { ...withoutFlag } = VALID;

    await post(withoutFlag);

    expect(createManualLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scheduleFollowUps: false })
    );
  });

  it('only schedules follow-ups on an explicit true', async () => {
    await post({ ...VALID, scheduleFollowUps: true });

    expect(createManualLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scheduleFollowUps: true })
    );
  });

  it('returns the new lead id and the follow-up count it created', async () => {
    createManualLead.mockResolvedValue({
      leadId: 'lead-9',
      status: 'contacted',
      followUpsCreated: 5,
    });

    const response = await post({ ...VALID, scheduleFollowUps: true });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      leadId: 'lead-9',
      status: 'contacted',
      followUpsCreated: 5,
    });
  });

  it('reports a failed write as a failure rather than optimistically', async () => {
    // A form that says "saved" without writing is how a referral taken down on
    // a phone call is lost — Joey has no other copy of it.
    createManualLead.mockRejectedValue(new Error('connection terminated'));

    const response = await post(VALID);

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Could not save that lead');
  });
});

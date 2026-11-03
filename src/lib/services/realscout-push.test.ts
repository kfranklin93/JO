import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead } from '@/lib/services/follow-up-scheduler';

/**
 * Pushing a site lead into RealScout.
 *
 * Two properties are asserted above all others.
 *
 * **It cannot fail lead capture.** By the time this runs the lead is committed.
 * A RealScout outage, a revoked token, a withdrawn scope or a 500 must surface
 * as a logged line and a reported outcome — never as a rejected promise, because
 * `captureLead` settles this alongside the other integrations and a throw here
 * would be a failed form or a failed chat turn for a lead that is already
 * stored.
 *
 * **It does not subscribe anybody to email they did not ask for.**
 * `price_status_alerts_enabled` and `exclusives_alerts_enabled` are sent
 * explicitly `false` on every create. The documented request example shows them
 * `true`, so omitting them is not neutral.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const fetchMock = vi.fn();

const { pushBody, pushLeadToRealScout, pushNote } = await import('./realscout-push');

const LEAD: Lead = {
  id: '11111111-2222-4333-8444-555555555555',
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  phone: '770-555-0100',
  intent: 'sell',
  budget: '$400k - $600k',
  timeline: '3-6 months',
  location: 'Buckhead',
  createdAt: new Date('2026-06-10T12:00:00.000Z'),
  status: 'new',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The body of the nth fetch call, parsed. */
const sentBody = (index = 0): Record<string, unknown> =>
  JSON.parse(String((fetchMock.mock.calls[index]?.[1] as RequestInit).body));

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.REALSCOUT_API_TOKEN = 'rs_agent_test';

  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the create body', () => {
  it('sends both alert toggles explicitly false', () => {
    // The documented example shows these `true`. Leaving them to the default
    // would put a person who filled in a contact form onto recurring marketing
    // email they never asked for.
    expect(pushBody(LEAD)).toMatchObject({
      price_status_alerts_enabled: false,
      exclusives_alerts_enabled: false,
    });
  });

  it('sets external_user_key to our lead id, so no column is needed here', () => {
    expect(pushBody(LEAD).external_user_key).toBe(LEAD.id);
  });

  it('sends nothing that could enable auto nurture', () => {
    expect(Object.keys(pushBody(LEAD))).not.toContain('auto_nurture');
  });

  it('identifies this site as the lead source and files the stated intent', () => {
    const body = pushBody(LEAD);

    expect(body.lead_source).toContain('gowithjoeyo.com');
    expect(body.contact_type).toBe('SELLER');
    expect(body.note).toContain('intent: sell');
    expect(body.note).toContain('Buckhead');
    expect(body.note).toContain('3-6 months');
  });

  it('sends no contact_type for an intent RealScout has no value for', () => {
    expect(Object.keys(pushBody({ ...LEAD, intent: 'insurance' }))).not.toContain(
      'contact_type',
    );
  });

  it('splits a stored full name back into the two fields RealScout takes', () => {
    expect(pushBody({ ...LEAD, name: 'Mary Anne van der Berg' })).toMatchObject({
      first_name: 'Mary',
      last_name: 'Anne van der Berg',
    });
  });

  it('caps the note rather than sending an unbounded field', () => {
    const note = pushNote({ ...LEAD, additionalNotes: 'x'.repeat(5_000) });
    expect(note.length).toBeLessThanOrEqual(1_000);
  });
});

describe('the two documented hazards', () => {
  it('treats an address a live contact already holds as success, not failure', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: {
          code: 'invalid_request',
          message: 'email has already been taken.',
          field: 'email',
          request_id: 'req-1',
        },
      }),
    );

    const outcome = await pushLeadToRealScout(LEAD);

    // The person is in RealScout, which is the whole point of the push.
    expect(outcome.status).toBe('exists');
  });

  it('does not patch the existing contact, so Joey’s own entries are not overwritten', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: { code: 'invalid_request', message: 'taken', field: 'email' },
      }),
    );

    await pushLeadToRealScout(LEAD);

    // Exactly one call, and it was the create. No PATCH follows.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
  });

  it('flags that a 201 may have revived a contact Joey deleted', async () => {
    // The spec: a create matching a deleted contact's address brings them back,
    // and answers with an ordinary 201 — so the two are indistinguishable. The
    // honest claim is "this could have been either", and the log names the lead.
    fetchMock.mockResolvedValue(jsonResponse(201, { contact: { id: 'VXNlci05OQ==' } }));

    const outcome = await pushLeadToRealScout(LEAD);

    expect(outcome).toEqual({
      status: 'created',
      contactId: 'VXNlci05OQ==',
      revivedIfPreviouslyDeleted: true,
    });
  });

  it('logs the lead id on a create, so a revival can be traced back', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonResponse(201, { contact: { id: 'c' } }));

    await pushLeadToRealScout(LEAD);

    expect(log.mock.calls.flat().join(' ')).toContain(LEAD.id);
  });
});

describe('a RealScout failure never fails lead capture', () => {
  const failures: Array<[string, () => void]> = [
    [
      'a revoked token (401)',
      () =>
        fetchMock.mockImplementation(() =>
          jsonResponse(401, {
            error: { code: 'unauthorized', message: 'Invalid or missing credentials.' },
          }),
        ),
    ],
    [
      'a withdrawn scope (403)',
      () =>
        fetchMock.mockImplementation(() =>
          jsonResponse(403, {
            error: {
              code: 'missing_scope',
              message:
                'This call requires the contacts:write scope, which this credential was not granted.',
            },
          }),
        ),
    ],
    [
      'a spent rate limit (429)',
      () =>
        fetchMock.mockImplementation(
          () =>
            new Response(
              JSON.stringify({ error: { code: 'rate_limited', message: 'slow down' } }),
              { status: 429, headers: { 'Retry-After': '600' } },
            ),
        ),
    ],
    [
      'an outage (500)',
      () =>
        fetchMock.mockImplementation(() =>
          jsonResponse(500, {
            error: { code: 'internal_error', message: 'Something went wrong.' },
          }),
        ),
    ],
    [
      'an unreachable host',
      () => fetchMock.mockRejectedValue(new Error('ECONNREFUSED')),
    ],
  ];

  for (const [label, arrange] of failures) {
    it(`resolves rather than rejecting on ${label}`, async () => {
      arrange();

      const outcome = await pushLeadToRealScout(LEAD);

      expect(outcome.status).toBe('failed');
    });
  }

  it('names the missing scope on a 403, rather than reporting "forbidden"', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(403, {
        error: {
          code: 'missing_scope',
          message:
            'This call requires the contacts:write scope, which this credential was not granted.',
          request_id: 'req-9',
        },
      }),
    );

    const outcome = await pushLeadToRealScout(LEAD);

    expect(outcome).toMatchObject({
      status: 'failed',
      reason: 'scope',
      missingScope: 'contacts:write',
      requestId: 'req-9',
    });
  });

  it('skips without a network call when the deployment has no token', async () => {
    delete testEnv.REALSCOUT_API_TOKEN;

    const outcome = await pushLeadToRealScout(LEAD);

    expect(outcome).toEqual({ status: 'skipped', reason: 'unconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never puts the token in a log line', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(() =>
      jsonResponse(401, { error: { code: 'unauthorized', message: 'nope' } }),
    );

    await pushLeadToRealScout(LEAD);

    expect(error.mock.calls.flat().join(' ')).not.toContain('rs_agent_test');
  });
});

describe('what it sends on the wire', () => {
  it('posts once to the contacts endpoint with a bearer token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { contact: { id: 'c' } }));

    await pushLeadToRealScout(LEAD);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://www.realscout.com/api/agent/v1/contacts',
    );
    expect(sentBody()).toMatchObject({
      email: 'dana@example.com',
      external_user_key: LEAD.id,
      price_status_alerts_enabled: false,
      exclusives_alerts_enabled: false,
    });
  });
});

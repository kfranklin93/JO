import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for POST /api/leads.
 *
 * The database and all four outbound integrations are mocked, so these run with
 * no Neon connection, no Resend key, and no AWS credentials.
 */

/**
 * Configuration the handler asserts at request time. Mutable so a variable can
 * be removed per test; the real module parses `process.env` once at import.
 */
const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

/** Rows returned by the mocked `leads` insert. */
let insertedLeadRows: Array<{ id: string; createdAt: Date }>;
/** Values passed to each mocked insert, keyed by table. */
let recordedInserts: Array<{ table: string; values: unknown }>;
/** Forces the follow-up insert to reject, for the rollback test. */
let followUpInsertError: Error | null;

const LEAD_ID = '11111111-2222-3333-4444-555555555555';
const CREATED_AT = new Date('2026-03-01T12:00:00.000Z');

/** True once the mocked transaction callback has rejected. */
let transactionRejected: boolean;

vi.mock('@/lib/db', () => {
  const tableName = (table: unknown): string =>
    (table as { __name?: string }).__name ?? 'unknown';

  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      const name = tableName(table);
      recordedInserts.push({ table: name, values });

      if (name === 'followUps' && followUpInsertError) {
        return Promise.reject(followUpInsertError);
      }

      // Drizzle's builder is both awaitable and chainable, so the mock
      // attaches `returning` to a real promise rather than faking a thenable.
      const promise = Promise.resolve(undefined) as Promise<undefined> & {
        returning: () => Promise<unknown[]>;
      };
      promise.returning = () => Promise.resolve(insertedLeadRows);
      return promise;
    },
  });

  return {
    leads: { __name: 'leads' },
    followUps: { __name: 'followUps' },
    db: {
      // Any write issued outside a transaction is a defect, so the top-level
      // handle refuses. This is what makes the transaction tests meaningful
      // rather than tautological: if a future edit moves an insert back out of
      // the callback, every success test fails.
      insert: () => {
        throw new Error(
          'db.insert called outside a transaction — lead writes must be atomic'
        );
      },
      transaction: async <T,>(callback: (tx: { insert: typeof insert }) => Promise<T>) => {
        try {
          return await callback({ insert });
        } catch (error) {
          // A real driver issues ROLLBACK here. The mock records that the
          // callback rejected, which is the observable behaviour the route
          // depends on; the rollback itself is a Postgres guarantee and is
          // covered by the manual verification step against a live database.
          transactionRejected = true;
          throw error;
        }
      },
    },
  };
});

/** The lead object the route hands to each integration. */
type LeadArg = Record<string, unknown>;

const sendImmediateFollowUp = vi.fn(async (_lead: LeadArg) => true);
const sendLeadToLofty = vi.fn(async (_lead: LeadArg) => true);
const notifyJoeyOfNewLead = vi.fn(async (_lead: LeadArg) => true);
const sendSMSAlert = vi.fn(async (_subject: string, _body: string) => true);

vi.mock('@/lib/services/follow-up-scheduler', () => ({
  sendImmediateFollowUp: (lead: LeadArg) => sendImmediateFollowUp(lead),
}));
vi.mock('@/lib/api/lofty', () => ({
  sendLeadToLofty: (lead: LeadArg) => sendLeadToLofty(lead),
}));
vi.mock('@/lib/services/email-service', () => ({
  notifyJoeyOfNewLead: (lead: LeadArg) => notifyJoeyOfNewLead(lead),
}));
vi.mock('@/lib/services/sms-service', () => ({
  sendSMSAlert: (subject: string, body: string) => sendSMSAlert(subject, body),
}));

const { POST } = await import('./route');

const validPayload = {
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  intent: 'buy',
};

function postRequest(body: unknown, options: { raw?: string } = {}) {
  return new NextRequest('https://gowithjoeyo.com/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: options.raw ?? JSON.stringify(body),
  });
}

/** The values handed to the `leads` insert, or undefined if none happened. */
function leadInsertValues(): Record<string, unknown> | undefined {
  const entry = recordedInserts.find((item) => item.table === 'leads');
  return entry?.values as Record<string, unknown> | undefined;
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
  testEnv.RESEND_API_KEY = 're_test_key';
  insertedLeadRows = [{ id: LEAD_ID, createdAt: CREATED_AT }];
  recordedInserts = [];
  followUpInsertError = null;
  transactionRejected = false;
  vi.clearAllMocks();
  sendImmediateFollowUp.mockResolvedValue(true);
  sendLeadToLofty.mockResolvedValue(true);
  notifyJoeyOfNewLead.mockResolvedValue(true);
  sendSMSAlert.mockResolvedValue(true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/leads — success', () => {
  it('returns 201 with the new lead id', async () => {
    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      leadId: LEAD_ID,
    });
  });

  it('reports the outcome of each integration', async () => {
    sendLeadToLofty.mockResolvedValue(false);

    const body = await (await POST(postRequest(validPayload))).json();

    expect(body.integrations).toEqual({
      followUp: true,
      loftyCRM: false,
      emailNotification: true,
      smsAlert: true,
    });
  });

  it('still returns 201 when every integration fails, because the lead is stored', async () => {
    sendImmediateFollowUp.mockRejectedValue(new Error('bedrock down'));
    sendLeadToLofty.mockResolvedValue(false);
    notifyJoeyOfNewLead.mockResolvedValue(false);
    sendSMSAlert.mockResolvedValue(false);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    expect((await response.json()).integrations.followUp).toBe(false);
  });

  it('persists the normalised values rather than the raw body', async () => {
    await POST(
      postRequest({
        name: '  Marcus Bell  ',
        email: '  Marcus.Bell@Example.COM  ',
        intent: 'sell',
        timeline: 'short_term',
        phone: '(770) 555-0188',
      })
    );

    expect(leadInsertValues()).toMatchObject({
      email: 'marcus.bell@example.com',
      fullName: 'Marcus Bell',
      firstName: 'Marcus',
      lastName: 'Bell',
      propertyInterest: 'sell',
      timeline: 'short_term',
      phone: '(770) 555-0188',
      status: 'new',
      source: 'website_form',
    });
  });

  it('stores absent optional details as null rather than undefined', async () => {
    // A mononym so `lastName` is genuinely absent; nullable columns must
    // receive null, not undefined, or Drizzle omits them from the statement.
    await POST(postRequest({ ...validPayload, name: 'Prince' }));

    expect(leadInsertValues()).toMatchObject({
      phone: null,
      lastName: null,
      timeline: null,
      formData: {
        budget: null,
        location: null,
        bedrooms: null,
        bathrooms: null,
        propertyType: null,
        additionalNotes: null,
      },
    });
  });

  it('schedules the four follow-up touchpoints at the right offsets', async () => {
    await POST(postRequest(validPayload));

    const followUpEntry = recordedInserts.find(
      (item) => item.table === 'followUps'
    );
    const rows = followUpEntry?.values as Array<{
      templateType: string;
      scheduledFor: Date;
      leadId: string;
    }>;

    expect(rows.map((row) => row.templateType)).toEqual([
      'day3',
      'day7',
      'day14',
      'day30',
    ]);
    expect(rows.every((row) => row.leadId === LEAD_ID)).toBe(true);

    const dayOffset = (row: { scheduledFor: Date }) =>
      Math.round(
        (row.scheduledFor.getTime() - CREATED_AT.getTime()) / (24 * 60 * 60 * 1000)
      );
    expect(rows.map(dayOffset)).toEqual([3, 7, 14, 30]);
  });

  it('passes the canonical intent through to the follow-up integration', async () => {
    await POST(postRequest({ ...validPayload, intent: 'general' }));

    expect(sendImmediateFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'general', id: LEAD_ID })
    );
  });

  it('omits absent optional keys on the lead handed to integrations', async () => {
    await POST(postRequest(validPayload));

    const lead = sendImmediateFollowUp.mock.calls[0]?.[0];

    expect(lead).toBeDefined();
    expect(Object.keys(lead ?? {})).not.toContain('phone');
    expect(Object.keys(lead ?? {})).not.toContain('budget');
  });
});

describe('POST /api/leads — validation', () => {
  it('returns 422 with field errors for a malformed email', async () => {
    const response = await POST(
      postRequest({ ...validPayload, email: 'not-an-email' })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe('Validation failed');
    expect(body.fieldErrors).toHaveProperty('email');
  });

  it('returns 422 when intent is missing', async () => {
    const response = await POST(
      postRequest({ name: 'Dana', email: 'dana@example.com' })
    );

    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toHaveProperty('intent');
  });

  it('returns 422 for an intent outside the canonical set', async () => {
    const response = await POST(
      postRequest({ ...validPayload, intent: 'refinance' })
    );

    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toHaveProperty('intent');
  });

  it('returns 422 when no name is supplied', async () => {
    const response = await POST(
      postRequest({ email: 'dana@example.com', intent: 'buy' })
    );

    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toHaveProperty('name');
  });

  it('names every failing field in one response', async () => {
    const response = await POST(
      postRequest({ email: 'bad', intent: 'refinance' })
    );

    const { fieldErrors } = await response.json();
    expect(Object.keys(fieldErrors).sort()).toEqual([
      'email',
      'intent',
      'name',
    ]);
  });

  it('rejects an oversized phone with 422 instead of a Postgres truncation 500', async () => {
    const response = await POST(
      postRequest({
        ...validPayload,
        phone: '+1 (770) 555-0188 extension 4471',
      })
    );

    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toHaveProperty('phone');
  });

  it('writes nothing to the database when validation fails', async () => {
    await POST(postRequest({ email: 'bad', intent: 'refinance' }));

    expect(recordedInserts).toHaveLength(0);
  });

  it('triggers no integrations when validation fails', async () => {
    await POST(postRequest({ email: 'bad', intent: 'refinance' }));

    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
    expect(notifyJoeyOfNewLead).not.toHaveBeenCalled();
    expect(sendSMSAlert).not.toHaveBeenCalled();
    expect(sendLeadToLofty).not.toHaveBeenCalled();
  });
});

describe('POST /api/leads — malformed requests', () => {
  it('returns 400 for a body that is not valid JSON', async () => {
    const response = await POST(postRequest(null, { raw: 'not json at all' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('JSON');
  });

  it('returns 400 for an empty body', async () => {
    const response = await POST(postRequest(null, { raw: '' }));

    expect(response.status).toBe(400);
  });

  it('returns 422 for a JSON body that is not an object', async () => {
    const response = await POST(postRequest(null, { raw: '"a string"' }));

    expect(response.status).toBe(422);
  });

  it('writes nothing for a malformed body', async () => {
    await POST(postRequest(null, { raw: '{oops' }));

    expect(recordedInserts).toHaveLength(0);
  });
});

describe('POST /api/leads — atomic persistence', () => {
  it('writes the lead and its follow-ups inside one transaction', async () => {
    // The mocked top-level `db.insert` throws, so reaching 201 proves both
    // writes were issued against the transaction handle.
    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    expect(recordedInserts.map((entry) => entry.table)).toEqual([
      'leads',
      'followUps',
    ]);
  });

  it('rolls back the lead when the follow-up insert fails', async () => {
    followUpInsertError = new Error('connection terminated');

    const response = await POST(postRequest(validPayload));

    // The failure propagates out of the transaction callback, which is what
    // drives the driver's ROLLBACK, so no orphaned lead row survives.
    expect(transactionRejected).toBe(true);
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Failed to submit lead');
  });

  it('reports failure rather than false success when the write is rolled back', async () => {
    followUpInsertError = new Error('connection terminated');

    const body = await (await POST(postRequest(validPayload))).json();

    // The visitor must not be told the submission worked, or they will not
    // retry and the lead is silently lost.
    expect(body.success).toBeUndefined();
    expect(body.leadId).toBeUndefined();
  });

  it('runs no integrations when the transaction is rolled back', async () => {
    followUpInsertError = new Error('connection terminated');

    await POST(postRequest(validPayload));

    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
    expect(notifyJoeyOfNewLead).not.toHaveBeenCalled();
  });

  it('rolls back when the lead insert yields no row', async () => {
    insertedLeadRows = [];

    const response = await POST(postRequest(validPayload));

    expect(transactionRejected).toBe(true);
    expect(response.status).toBe(500);
  });

  it('does not schedule follow-ups when the lead insert yields no row', async () => {
    insertedLeadRows = [];

    await POST(postRequest(validPayload));

    expect(recordedInserts.map((entry) => entry.table)).toEqual(['leads']);
  });

  it('keeps integration failures outside the transaction', async () => {
    // A Resend or Twilio outage must not roll back a stored lead.
    notifyJoeyOfNewLead.mockRejectedValue(new Error('resend unavailable'));

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    expect(transactionRejected).toBe(false);
  });
});

describe('POST /api/leads — missing configuration', () => {
  it('returns 503 naming RESEND_API_KEY when it is absent', async () => {
    delete testEnv.RESEND_API_KEY;

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.missing).toEqual(['RESEND_API_KEY']);
    expect(body.message).toContain('RESEND_API_KEY');
  });

  it('returns 503 naming DATABASE_URL when it is absent', async () => {
    delete testEnv.DATABASE_URL;

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(503);
    expect((await response.json()).missing).toEqual(['DATABASE_URL']);
  });

  it('names every missing variable in one response', async () => {
    delete testEnv.DATABASE_URL;
    delete testEnv.RESEND_API_KEY;

    const response = await POST(postRequest(validPayload));

    expect((await response.json()).missing).toEqual([
      'DATABASE_URL',
      'RESEND_API_KEY',
    ]);
  });

  it('treats a blank value as absent', async () => {
    // A cleared Netlify variable arrives as an empty string, which the schema
    // accepts, so the check has to look at the value rather than the key.
    testEnv.RESEND_API_KEY = '';

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(503);
  });

  it('stores nothing and sends nothing when configuration is missing', async () => {
    // The check runs before the transaction, so a retry after the variable is
    // set cannot produce a duplicate lead.
    delete testEnv.RESEND_API_KEY;

    await POST(postRequest(validPayload));

    expect(recordedInserts).toHaveLength(0);
    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
    expect(notifyJoeyOfNewLead).not.toHaveBeenCalled();
    expect(sendSMSAlert).not.toHaveBeenCalled();
  });

  it('validates the payload before reporting configuration, so a bad body still gets 422', async () => {
    delete testEnv.RESEND_API_KEY;

    const response = await POST(postRequest({ email: 'bad', intent: 'refinance' }));

    expect(response.status).toBe(422);
  });

  it('proceeds normally once the variables are present', async () => {
    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    expect(notifyJoeyOfNewLead).toHaveBeenCalledTimes(1);
  });

  it('still returns 500 for an unrelated failure rather than 503', async () => {
    followUpInsertError = new Error('connection terminated');

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(500);
  });
});

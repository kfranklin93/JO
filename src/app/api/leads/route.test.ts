import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowUp } from '@/lib/db/schema';
import { fakeDb, resetFakeDb } from '@/lib/db/__fixtures__/fake-follow-up-db';
import { claimDueFollowUps } from '@/lib/db/follow-up-queue';

/**
 * Route handler tests for POST /api/leads.
 *
 * The database and all four outbound integrations are mocked, so these run with
 * no Neon connection, no Resend key, and no AWS credentials.
 *
 * `follow-up-queue.ts` is deliberately *not* mocked. The route drives the
 * immediate touchpoint's status through it, and what matters is the row's end
 * state, not that a function was called. So the mocked `db.execute` is the
 * SQL-interpreting fake the queue's own tests use, and the follow-up insert
 * seeds it. The queue's real statements then run against real in-memory rows,
 * and these tests can assert what Joey's dashboard would actually read.
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
/**
 * Overrides what the follow-up insert's `RETURNING` yields. Null means the
 * default: one row per inserted value, as Postgres would give.
 */
let followUpReturningOverride: Array<{ id: string; templateType: string }> | null;
/** Forces every queue statement to reject, for the unrecordable-outcome test. */
let queueWriteError: Error | null;

const LEAD_ID = '11111111-2222-3333-4444-555555555555';
const CREATED_AT = new Date('2026-03-01T12:00:00.000Z');

/** True once the mocked transaction callback has rejected. */
let transactionRejected: boolean;

/**
 * The id the fake assigns to a touchpoint's row.
 *
 * Derived from the template type rather than random so an assertion failure
 * names the touchpoint it is about.
 */
function followUpId(templateType: string): string {
  return `follow-up-${templateType}`;
}

vi.mock('@/lib/db', async () => {
  const { createFakeDb, fakeDb: store, makeFollowUp } = await import(
    '@/lib/db/__fixtures__/fake-follow-up-db'
  );
  const fake = createFakeDb();

  const tableName = (table: unknown): string =>
    (table as { __name?: string }).__name ?? 'unknown';

  type FollowUpInsertValue = {
    leadId: string;
    templateType: string;
    scheduledFor: Date;
    status: FollowUp['status'];
  };

  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      const name = tableName(table);
      recordedInserts.push({ table: name, values });

      if (name === 'followUps' && followUpInsertError) {
        // The route awaits the `returning` builder rather than the bare values
        // promise, so both have to reject or the driver failure never surfaces.
        const rejected = Promise.reject(followUpInsertError) as Promise<undefined> & {
          returning: () => Promise<unknown[]>;
        };
        rejected.returning = () => Promise.reject(followUpInsertError);
        // Whichever of the two the route does not await would otherwise be
        // reported as an unhandled rejection.
        void rejected.catch(() => {});
        return rejected;
      }

      // The inserted rows become the queue's in-memory table, so the status
      // transitions the route drives through follow-up-queue.ts act on the same
      // rows this insert created. Seeding happens only on the success path: a
      // rejected insert leaves the store empty, which is what rollback looks
      // like from the outside.
      if (name === 'followUps') {
        for (const row of values as FollowUpInsertValue[]) {
          store.followUps.push(
            makeFollowUp({ ...row, id: followUpId(row.templateType) })
          );
        }
      }

      // Drizzle's builder is both awaitable and chainable, so the mock
      // attaches `returning` to a real promise rather than faking a thenable.
      const promise = Promise.resolve(undefined) as Promise<undefined> & {
        returning: () => Promise<unknown[]>;
      };
      promise.returning = () => {
        if (name === 'leads') return Promise.resolve(insertedLeadRows);
        return Promise.resolve(
          followUpReturningOverride ??
            (values as FollowUpInsertValue[]).map((row) => ({
              id: followUpId(row.templateType),
              templateType: row.templateType,
            }))
        );
      };
      return promise;
    },
  });

  return {
    leads: { __name: 'leads' },
    followUps: {
      __name: 'followUps',
      id: 'follow_ups.id',
      templateType: 'follow_ups.template_type',
    },
    db: {
      // The queue's statements run for real against the fake's store. Wrapped so
      // a test can simulate the database going away between the send and the
      // status update.
      execute: (query: unknown) => {
        if (queueWriteError) return Promise.reject(queueWriteError);
        return fake.db.execute(query);
      },
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
        const before = [...store.followUps];
        try {
          return await callback({ insert });
        } catch (error) {
          // A real driver issues ROLLBACK here. The mock records that the
          // callback rejected and discards rows the callback seeded, so a test
          // can assert nothing persisted; the rollback itself is a Postgres
          // guarantee and is covered by the manual verification step against a
          // live database.
          store.followUps = before;
          transactionRejected = true;
          throw error;
        }
      },
    },
  };
});

/** The lead object the route hands to each integration. */
type LeadArg = Record<string, unknown>;

/**
 * `sendImmediateFollowUp` returns a discriminated result rather than a boolean,
 * so a failure can carry the reason through to the caller.
 */
type SendResult = { ok: true } | { ok: false; reason: string };
const SEND_OK: SendResult = { ok: true };
const SEND_FAILURE_REASON = 'email: test failure';
const SEND_FAILED: SendResult = { ok: false, reason: SEND_FAILURE_REASON };

const sendImmediateFollowUp = vi.fn(
  async (_lead: LeadArg): Promise<SendResult> => SEND_OK
);
const sendLeadToLofty = vi.fn(async (_lead: LeadArg) => true);
/** Options carry whether the lead actually heard from us, so they are recorded. */
type NotifyOptions = { immediateFollowUpSent?: boolean } | undefined;
const notifyJoeyOfNewLead = vi.fn(
  async (_lead: LeadArg, _options?: NotifyOptions) => true
);
const sendSMSAlert = vi.fn(async (_subject: string, _body: string) => true);

vi.mock('@/lib/services/follow-up-scheduler', () => ({
  sendImmediateFollowUp: (lead: LeadArg) => sendImmediateFollowUp(lead),
}));
vi.mock('@/lib/api/lofty', () => ({
  sendLeadToLofty: (lead: LeadArg) => sendLeadToLofty(lead),
}));
vi.mock('@/lib/services/email-service', () => ({
  notifyJoeyOfNewLead: (lead: LeadArg, options?: NotifyOptions) =>
    notifyJoeyOfNewLead(lead, options),
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

/** The rows handed to the `follow_ups` insert, as inserted. */
function followUpInsertValues(): Array<{
  templateType: string;
  scheduledFor: Date;
  leadId: string;
  status: string;
}> {
  const entry = recordedInserts.find((item) => item.table === 'followUps');
  return (entry?.values ?? []) as Array<{
    templateType: string;
    scheduledFor: Date;
    leadId: string;
    status: string;
  }>;
}

/** A stored follow-up row by touchpoint, after the request has finished. */
function storedRow(templateType: string): FollowUp | undefined {
  return fakeDb.followUps.find((row) => row.templateType === templateType);
}

beforeEach(() => {
  resetFakeDb();
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
  testEnv.RESEND_API_KEY = 're_test_key';
  insertedLeadRows = [{ id: LEAD_ID, createdAt: CREATED_AT }];
  recordedInserts = [];
  followUpInsertError = null;
  followUpReturningOverride = null;
  queueWriteError = null;
  transactionRejected = false;
  vi.clearAllMocks();
  sendImmediateFollowUp.mockResolvedValue(SEND_OK);
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

  it('schedules all five follow-up touchpoints at the right offsets', async () => {
    await POST(postRequest(validPayload));

    const rows = followUpInsertValues();

    expect(rows.map((row) => row.templateType)).toEqual([
      'immediate',
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
    // The immediate touchpoint carries offset zero, so it sits on the same
    // timeline as the rest rather than needing a null `scheduled_for`.
    expect(rows.map(dayOffset)).toEqual([0, 3, 7, 14, 30]);
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
    expect(fakeDb.followUps).toHaveLength(0);
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

  it('rolls back when the immediate follow-up insert yields no row', async () => {
    // Without that id the row cannot be moved out of `sending`, so it would be
    // reclaimed later and the lead would get the same email twice. Failing the
    // submission lets the visitor retry into a clean record.
    followUpReturningOverride = [];

    const response = await POST(postRequest(validPayload));

    expect(transactionRejected).toBe(true);
    expect(response.status).toBe(500);
    expect(fakeDb.followUps).toHaveLength(0);
    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
  });
});

describe('POST /api/leads — the immediate touchpoint', () => {
  const SCHEDULED = ['day3', 'day7', 'day14', 'day30'];

  it('records a row for the immediate touchpoint alongside the scheduled ones', async () => {
    // Requirement 6.1. It used to be sent with no row at all, so the dashboard
    // undercounted by one per lead.
    await POST(postRequest(validPayload));

    expect(fakeDb.followUps).toHaveLength(5);
    expect(storedRow('immediate')).toBeDefined();
  });

  it('produces five rows with the immediate one marked sent', async () => {
    // Requirement 6.4, end to end: the counts the dashboard reads.
    await POST(postRequest(validPayload));

    const immediate = storedRow('immediate');
    expect(immediate?.status).toBe('sent');
    expect(immediate?.sentAt).toBeInstanceOf(Date);
    expect(immediate?.attempts).toBe(1);
    expect(immediate?.failureReason).toBeNull();

    // Requirement 6.2 must not disturb the rest of the sequence.
    expect(SCHEDULED.map((type) => storedRow(type)?.status)).toEqual([
      'scheduled',
      'scheduled',
      'scheduled',
      'scheduled',
    ]);
    expect(SCHEDULED.map((type) => storedRow(type)?.attempts)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('inserts the immediate row as sending, already claimed', async () => {
    await POST(postRequest(validPayload));

    const inserted = followUpInsertValues();
    expect(inserted[0]).toMatchObject({
      templateType: 'immediate',
      status: 'sending',
    });
    expect(inserted.slice(1).map((row) => row.status)).toEqual([
      'scheduled',
      'scheduled',
      'scheduled',
      'scheduled',
    ]);
  });

  it('leaves nothing claimable for a cron run that lands mid-send', async () => {
    // The transaction commits before the inline send finishes. Inserted as
    // `scheduled` the row would be due the moment it existed, so a cron run in
    // that window would claim it and send the same email again. Claiming it up
    // front is what closes the window, and this asserts it from the cron's side.
    let claimedMidSend: FollowUp[] = [];
    sendImmediateFollowUp.mockImplementation(async () => {
      claimedMidSend = await claimDueFollowUps(25, CREATED_AT);
      return SEND_OK;
    });

    await POST(postRequest(validPayload));

    expect(claimedMidSend).toEqual([]);
    // And the request's own update still lands, rather than the row being left
    // behind in `sending`.
    expect(storedRow('immediate')?.status).toBe('sent');
  });

  it('returns the immediate row for retry when the send fails', async () => {
    // Requirement 6.3. The failure used to leave no trace at all.
    sendImmediateFollowUp.mockResolvedValue(SEND_FAILED);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    const immediate = storedRow('immediate');
    expect(immediate?.status).toBe('scheduled');
    expect(immediate?.attempts).toBe(1);
    expect(immediate?.failureReason).toBe(SEND_FAILURE_REASON);
    expect(immediate?.sentAt).toBeNull();
  });

  it('makes a failed immediate touchpoint claimable by the next cron run', async () => {
    // "Eligible for retry" means the cron actually picks it up, not just that
    // the status string changed.
    sendImmediateFollowUp.mockResolvedValue(SEND_FAILED);

    await POST(postRequest(validPayload));
    const claimed = await claimDueFollowUps(25, new Date(CREATED_AT.getTime() + 1000));

    expect(claimed.map((row) => row.templateType)).toEqual(['immediate']);
  });

  it('records the real reason when the send throws rather than resolves', async () => {
    sendImmediateFollowUp.mockRejectedValue(new Error('bedrock unavailable'));

    await POST(postRequest(validPayload));

    expect(storedRow('immediate')?.failureReason).toContain('bedrock unavailable');
  });

  it('tells Joey the lead heard from us when the immediate send succeeds', async () => {
    await POST(postRequest(validPayload));

    expect(notifyJoeyOfNewLead).toHaveBeenCalledWith(
      expect.objectContaining({ id: LEAD_ID }),
      { immediateFollowUpSent: true }
    );
  });

  it('tells Joey the lead did not hear from us when the immediate send fails', async () => {
    sendImmediateFollowUp.mockResolvedValue(SEND_FAILED);

    await POST(postRequest(validPayload));

    expect(notifyJoeyOfNewLead).toHaveBeenCalledWith(
      expect.objectContaining({ id: LEAD_ID }),
      { immediateFollowUpSent: false }
    );
  });

  it('still returns 201 when the outcome cannot be recorded', async () => {
    // The lead is committed and the email has gone. A 500 here would tell the
    // visitor to submit again and duplicate the lead, which is worse than a row
    // left in `sending` for the staleness reclaim to pick up.
    queueWriteError = new Error('connection terminated');

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    expect((await response.json()).integrations.followUp).toBe(true);
    expect(storedRow('immediate')?.status).toBe('sending');
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

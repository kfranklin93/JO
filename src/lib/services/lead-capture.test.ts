import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the transport-agnostic lead capture entry point.
 *
 * `POST /api/leads` has its own suite covering the HTTP surface. This one covers
 * what the route cannot: that the pipeline is reachable, and reportable, without
 * a `Request` at all — which is what the assistant's `capture_lead` tool needs.
 *
 * Two things are deliberately asserted about *how* failures surface, because the
 * distinction is the reason this is a union-and-throw rather than one shape:
 *
 *   - a rejected payload comes back as a value (`ok: false`), so a caller can
 *     ask the client to fix one field;
 *   - a broken deployment or a failed write throws, so a caller cannot mistake
 *     it for the client's fault and cannot receive an id for a lead that was
 *     never written.
 *
 * The `db` mock refuses any write issued outside a transaction, so the atomicity
 * assertions below are not tautological: moving an insert out of the callback
 * fails every success test here.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

/** Rows the mocked `leads` insert returns from `RETURNING`. */
let insertedLeadRows: Array<{ id: string; createdAt: Date }>;
/** Every insert issued, in order, keyed by table. */
let recordedInserts: Array<{ table: string; values: unknown }>;
/** Forces the follow-up insert to reject. */
let followUpInsertError: Error | null;
/** Overrides what the follow-up insert's `RETURNING` yields. */
let followUpReturningOverride: Array<{ id: string; templateType: string }> | null;
/** True once the transaction callback has rejected. */
let transactionRejected: boolean;
/** Call order across the queue writes and the outbound integrations. */
let callOrder: string[];

const LEAD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CREATED_AT = new Date('2026-04-02T09:30:00.000Z');

vi.mock('@/lib/db', () => {
  const tableName = (table: unknown): string =>
    (table as { __name?: string }).__name ?? 'unknown';

  type FollowUpInsertValue = { templateType: string };

  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      const name = tableName(table);
      recordedInserts.push({ table: name, values });

      if (name === 'followUps' && followUpInsertError) {
        const rejected = Promise.reject(followUpInsertError) as Promise<undefined> & {
          returning: () => Promise<unknown[]>;
        };
        rejected.returning = () => Promise.reject(followUpInsertError);
        void rejected.catch(() => {});
        return rejected;
      }

      const promise = Promise.resolve(undefined) as Promise<undefined> & {
        returning: () => Promise<unknown[]>;
      };
      promise.returning = () => {
        if (name === 'leads') return Promise.resolve(insertedLeadRows);
        return Promise.resolve(
          followUpReturningOverride ??
            (values as FollowUpInsertValue[]).map((row) => ({
              id: `follow-up-${row.templateType}`,
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
      // A write outside a transaction is a defect, so the top-level handle
      // refuses it outright.
      insert: () => {
        throw new Error(
          'db.insert called outside a transaction — lead writes must be atomic'
        );
      },
      transaction: async <T,>(callback: (tx: { insert: typeof insert }) => Promise<T>) => {
        try {
          return await callback({ insert });
        } catch (error) {
          transactionRejected = true;
          throw error;
        }
      },
    },
  };
});

const markSent = vi.fn(async (_id: string) => {
  callOrder.push('markSent');
});
const recordFailure = vi.fn(
  async (_id: string, _reason: string, _attempts: number) => {
    callOrder.push('recordFailure');
    return { requeued: true as const, attempts: 1 };
  }
);

vi.mock('@/lib/db/follow-up-queue', () => ({
  markSent: (id: string) => markSent(id),
  recordFailure: (id: string, reason: string, attempts: number) =>
    recordFailure(id, reason, attempts),
}));

type LeadArg = Record<string, unknown>;
type SendResult = { ok: true } | { ok: false; reason: string };
const SEND_OK: SendResult = { ok: true };
const SEND_FAILURE_REASON = 'email: recipient rejected';
const SEND_FAILED: SendResult = { ok: false, reason: SEND_FAILURE_REASON };

const sendImmediateFollowUp = vi.fn(async (_lead: LeadArg): Promise<SendResult> => {
  callOrder.push('sendImmediateFollowUp');
  return SEND_OK;
});
const sendLeadToLofty = vi.fn(async (_lead: LeadArg) => {
  callOrder.push('sendLeadToLofty');
  return true;
});
type NotifyOptions = { immediateFollowUpSent?: boolean } | undefined;
const notifyJoeyOfNewLead = vi.fn(
  async (_lead: LeadArg, _options?: NotifyOptions) => {
    callOrder.push('notifyJoeyOfNewLead');
    return true;
  }
);
const sendSMSAlert = vi.fn(async (_subject: string, _body: string) => {
  callOrder.push('sendSMSAlert');
  return true;
});

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

// Imported after the mocks are registered, not at the top of the file: both
// modules read `@/config/env` on the way in, and a static import would evaluate
// them before `testEnv` exists.
const { captureLead, FOLLOW_UP_SCHEDULE } = await import('./lead-capture');
const { MissingEnvError } = await import('@/lib/utils/require-env');

/** Raw input as a non-HTTP caller would build it: a plain object, no Request. */
const validInput = {
  name: 'Rosa Alvarez',
  email: 'rosa.alvarez@gowithjoeyo-test.invalid',
  intent: 'buy',
  additionalNotes: 'Relocating in the spring, wants three bedrooms.',
};

function leadInsertValues(): Record<string, unknown> | undefined {
  return recordedInserts.find((entry) => entry.table === 'leads')?.values as
    | Record<string, unknown>
    | undefined;
}

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

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
  testEnv.RESEND_API_KEY = 're_test_key';
  insertedLeadRows = [{ id: LEAD_ID, createdAt: CREATED_AT }];
  recordedInserts = [];
  followUpInsertError = null;
  followUpReturningOverride = null;
  transactionRejected = false;
  callOrder = [];

  // `clearAllMocks` clears calls but leaves any previously set resolved value in
  // place, so every implementation is re-established explicitly.
  vi.clearAllMocks();
  markSent.mockImplementation(async () => {
    callOrder.push('markSent');
  });
  recordFailure.mockImplementation(async () => {
    callOrder.push('recordFailure');
    return { requeued: true as const, attempts: 1 };
  });
  sendImmediateFollowUp.mockImplementation(async () => {
    callOrder.push('sendImmediateFollowUp');
    return SEND_OK;
  });
  sendLeadToLofty.mockImplementation(async () => {
    callOrder.push('sendLeadToLofty');
    return true;
  });
  notifyJoeyOfNewLead.mockImplementation(async () => {
    callOrder.push('notifyJoeyOfNewLead');
    return true;
  });
  sendSMSAlert.mockImplementation(async () => {
    callOrder.push('sendSMSAlert');
    return true;
  });

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('captureLead — the non-HTTP entry point', () => {
  it('takes raw input and returns the new lead id', async () => {
    const outcome = await captureLead(validInput);

    expect(outcome).toEqual({
      ok: true,
      leadId: LEAD_ID,
      integrations: {
        followUp: true,
        loftyCRM: true,
        emailNotification: true,
        smsAlert: true,
      },
    });
  });

  it('validates with leadSubmissionSchema, so it normalises the same way the form does', async () => {
    await captureLead({
      name: '  Marcus Bell  ',
      email: '  Marcus.Bell@GoWithJoeyO-Test.INVALID  ',
      intent: 'sell',
      additionalNotes: 'Listing the lake house.',
    });

    expect(leadInsertValues()).toMatchObject({
      email: 'marcus.bell@gowithjoeyo-test.invalid',
      fullName: 'Marcus Bell',
      firstName: 'Marcus',
      lastName: 'Bell',
      propertyInterest: 'sell',
      status: 'new',
      source: 'website_form',
    });
  });

  it('stores the notes it was given', async () => {
    await captureLead(validInput);

    expect(leadInsertValues()?.formData).toMatchObject({
      additionalNotes: validInput.additionalNotes,
    });
  });

  it('needs no Request and no fetch — a plain object is the whole input', async () => {
    // Stated as a test because the previous blocker was precisely that the only
    // server-side path went through a relative fetch, which cannot resolve
    // inside a route handler. A global fetch call here would be that regression.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const outcome = await captureLead(validInput);

    expect(outcome.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('captureLead — rejected input', () => {
  it('returns the field errors rather than throwing', async () => {
    const outcome = await captureLead({ email: 'not-an-email', intent: 'buy' });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected a rejected outcome');
    expect(Object.keys(outcome.fieldErrors).sort()).toEqual(['email', 'name']);
  });

  it('names an intent outside the canonical set', async () => {
    const outcome = await captureLead({ ...validInput, intent: 'buying' });

    if (outcome.ok) throw new Error('expected a rejected outcome');
    expect(outcome.fieldErrors).toHaveProperty('intent');
  });

  it('carries a message the caller can put to the client', async () => {
    const outcome = await captureLead({ ...validInput, email: 'nope' });

    if (outcome.ok) throw new Error('expected a rejected outcome');
    expect(outcome.fieldErrors.email).toMatch(/valid email/i);
  });

  it('writes nothing and sends nothing', async () => {
    await captureLead({ email: 'bad', intent: 'refinance' });

    expect(recordedInserts).toHaveLength(0);
    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
    expect(notifyJoeyOfNewLead).not.toHaveBeenCalled();
    expect(sendSMSAlert).not.toHaveBeenCalled();
    expect(sendLeadToLofty).not.toHaveBeenCalled();
  });

  it('rejects input that is not an object at all', async () => {
    const outcome = await captureLead('a string');

    expect(outcome.ok).toBe(false);
  });
});

describe('captureLead — atomic persistence', () => {
  it('writes the lead and its follow-ups inside one transaction', async () => {
    const outcome = await captureLead(validInput);

    expect(outcome.ok).toBe(true);
    expect(recordedInserts.map((entry) => entry.table)).toEqual([
      'leads',
      'followUps',
    ]);
  });

  it('schedules the whole sequence at the documented offsets', async () => {
    await captureLead(validInput);

    const rows = followUpInsertValues();
    const dayOffset = (row: { scheduledFor: Date }) =>
      Math.round(
        (row.scheduledFor.getTime() - CREATED_AT.getTime()) / (24 * 60 * 60 * 1000)
      );

    expect(rows.map((row) => row.templateType)).toEqual(
      FOLLOW_UP_SCHEDULE.map((entry) => entry.templateType)
    );
    expect(rows.map(dayOffset)).toEqual([0, 3, 7, 14, 30]);
    expect(rows.every((row) => row.leadId === LEAD_ID)).toBe(true);
  });

  it('inserts the immediate touchpoint already claimed', async () => {
    await captureLead(validInput);

    const rows = followUpInsertValues();
    expect(rows[0]).toMatchObject({ templateType: 'immediate', status: 'sending' });
    expect(rows.slice(1).map((row) => row.status)).toEqual([
      'scheduled',
      'scheduled',
      'scheduled',
      'scheduled',
    ]);
  });

  it('throws rather than returning an id when the follow-up insert fails', async () => {
    followUpInsertError = new Error('connection terminated');

    await expect(captureLead(validInput)).rejects.toThrow('connection terminated');
    expect(transactionRejected).toBe(true);
    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
  });

  it('throws when the lead insert yields no row', async () => {
    insertedLeadRows = [];

    await expect(captureLead(validInput)).rejects.toThrow(/returned no row/);
    expect(transactionRejected).toBe(true);
    expect(recordedInserts.map((entry) => entry.table)).toEqual(['leads']);
  });

  it('throws when the immediate row is missing from RETURNING', async () => {
    followUpReturningOverride = [];

    await expect(captureLead(validInput)).rejects.toThrow(/Immediate follow-up/);
    expect(transactionRejected).toBe(true);
    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
  });

  it('keeps integration failures outside the transaction', async () => {
    notifyJoeyOfNewLead.mockRejectedValue(new Error('resend unavailable'));

    const outcome = await captureLead(validInput);

    expect(outcome.ok).toBe(true);
    expect(transactionRejected).toBe(false);
  });
});

describe('captureLead — missing configuration', () => {
  it('throws MissingEnvError naming every absent variable', async () => {
    delete testEnv.DATABASE_URL;
    delete testEnv.RESEND_API_KEY;

    await expect(captureLead(validInput)).rejects.toThrow(MissingEnvError);
    await expect(captureLead(validInput)).rejects.toMatchObject({
      variables: ['DATABASE_URL', 'RESEND_API_KEY'],
    });
  });

  it('stores nothing and sends nothing', async () => {
    delete testEnv.RESEND_API_KEY;

    await expect(captureLead(validInput)).rejects.toThrow(MissingEnvError);

    expect(recordedInserts).toHaveLength(0);
    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
  });

  it('validates before asserting configuration, so bad input is still reported as bad input', async () => {
    delete testEnv.RESEND_API_KEY;

    const outcome = await captureLead({ email: 'bad', intent: 'refinance' });

    // Not a throw: the caller must be able to tell the client what to fix even
    // on a half-configured deploy.
    expect(outcome.ok).toBe(false);
  });
});

describe('captureLead — the immediate touchpoint', () => {
  it('records the send before notifying Joey, and notifies with the real outcome', async () => {
    await captureLead(validInput);

    expect(callOrder).toEqual([
      'sendImmediateFollowUp',
      'markSent',
      'sendLeadToLofty',
      'notifyJoeyOfNewLead',
      'sendSMSAlert',
    ]);
    expect(notifyJoeyOfNewLead).toHaveBeenCalledWith(
      expect.objectContaining({ id: LEAD_ID }),
      { immediateFollowUpSent: true }
    );
  });

  it('records the carried reason when the send reports failure', async () => {
    sendImmediateFollowUp.mockResolvedValue(SEND_FAILED);

    const outcome = await captureLead(validInput);

    expect(outcome.ok).toBe(true);
    expect(recordFailure).toHaveBeenCalledWith(
      'follow-up-immediate',
      SEND_FAILURE_REASON,
      0
    );
    expect(notifyJoeyOfNewLead).toHaveBeenCalledWith(expect.anything(), {
      immediateFollowUpSent: false,
    });
  });

  it('records the real reason when the send throws', async () => {
    sendImmediateFollowUp.mockRejectedValue(new Error('bedrock unavailable'));

    await captureLead(validInput);

    expect(recordFailure).toHaveBeenCalledWith(
      'follow-up-immediate',
      expect.stringContaining('bedrock unavailable'),
      0
    );
  });

  it('swallows a failure to record the outcome and still reports success', async () => {
    // The lead is committed and the email has gone. Failing here would tell the
    // caller to submit again and duplicate the lead.
    markSent.mockRejectedValue(new Error('connection terminated'));

    const outcome = await captureLead(validInput);

    expect(outcome).toMatchObject({ ok: true, leadId: LEAD_ID });
  });

  it('reports each integration outcome independently', async () => {
    sendLeadToLofty.mockResolvedValue(false);
    sendSMSAlert.mockRejectedValue(new Error('twilio down'));

    const outcome = await captureLead(validInput);

    if (!outcome.ok) throw new Error('expected success');
    expect(outcome.integrations).toEqual({
      followUp: true,
      loftyCRM: false,
      emailNotification: true,
      smsAlert: false,
    });
  });
});

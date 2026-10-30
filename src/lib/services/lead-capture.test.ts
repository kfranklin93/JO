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
/** Every update issued, in order, keyed by table. */
let recordedUpdates: Array<{ table: string; values: Record<string, unknown> }>;
/** The row the mocked `leads` select finds, or null for "no such lead". */
let existingLeadRow: Record<string, unknown> | null;
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

  /** The read the update path does before it decides what is empty. */
  const select = () => ({
    from: (_table: unknown) => ({
      where: (_condition: unknown) => ({
        limit: (_count: number) =>
          Promise.resolve(existingLeadRow === null ? [] : [existingLeadRow]),
      }),
    }),
  });

  const update = (table: unknown) => ({
    set: (values: unknown) => ({
      where: (_condition: unknown) => {
        recordedUpdates.push({
          table: tableName(table),
          values: values as Record<string, unknown>,
        });
        return Promise.resolve(undefined);
      },
    }),
  });

  return {
    leads: { __name: 'leads', id: 'leads.id' },
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
      update: () => {
        throw new Error(
          'db.update called outside a transaction — the read that decides what ' +
            'is empty and the write that fills it must not be separable'
        );
      },
      transaction: async <T,>(
        callback: (tx: {
          insert: typeof insert;
          select: typeof select;
          update: typeof update;
        }) => Promise<T>
      ) => {
        try {
          return await callback({ insert, select, update });
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
const recordFreshConsent = vi.fn(async (_email: string, _source: string) => {
  callOrder.push('recordFreshConsent');
  return true;
});

vi.mock('@/lib/services/follow-up-scheduler', () => ({
  sendImmediateFollowUp: (lead: LeadArg) => sendImmediateFollowUp(lead),
}));
vi.mock('@/lib/services/email-preferences', () => ({
  recordFreshConsent: (email: string, source: string) =>
    recordFreshConsent(email, source),
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
const {
  ASSISTANT_CHAT_SOURCE,
  captureLead,
  updateCapturedLead,
  FOLLOW_UP_SCHEDULE,
} = await import('./lead-capture');
const { MissingEnvError } = await import('@/lib/utils/require-env');

/** Raw input as a non-HTTP caller would build it: a plain object, no Request. */
const validInput = {
  name: 'Rosa Alvarez',
  email: 'rosa.alvarez@gowithjoeyo-test.invalid',
  intent: 'buy',
  additionalNotes: 'Relocating in the spring, wants three bedrooms.',
};

/**
 * The lead row as it stands after one chat turn has captured it.
 *
 * Shaped the way `persistLead` leaves it: the name and intent set, the softer
 * details in `form_data`, everything the client has not said yet null.
 */
const STORED_LEAD_ROW = {
  id: LEAD_ID,
  email: 'rosa.alvarez@gowithjoeyo-test.invalid',
  phone: null,
  firstName: 'Rosa',
  lastName: 'Alvarez',
  fullName: 'Rosa Alvarez',
  propertyInterest: 'buy',
  timeline: null,
  notes: null,
  status: 'new',
  source: 'website_form',
  formData: {
    budget: null,
    location: null,
    bedrooms: null,
    bathrooms: null,
    propertyType: null,
    additionalNotes: 'Relocating in the spring, wants three bedrooms.',
  },
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

/** What the single UPDATE this path is allowed to issue actually set. */
function leadUpdateValues(): Record<string, unknown> | undefined {
  expect(recordedUpdates.filter((entry) => entry.table !== 'leads')).toEqual([]);
  return recordedUpdates.find((entry) => entry.table === 'leads')?.values;
}

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
  recordedUpdates = [];
  existingLeadRow = { ...STORED_LEAD_ROW };
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
  recordFreshConsent.mockImplementation(async () => {
    callOrder.push('recordFreshConsent');
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
      // Clearing a prior opt-out has to come first. The immediate follow-up
      // goes through the suppression check like every other client email, so
      // clearing afterwards would swallow the one reply they are waiting for.
      'recordFreshConsent',
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

describe('captureLead — which touchpoint the lead arrived through', () => {
  it('stores the public form by default, as every caller did before', async () => {
    await captureLead(validInput);

    expect(leadInsertValues()).toMatchObject({ source: 'website_form' });
  });

  it('stores the chat source when the assistant captured the lead', async () => {
    // Without this, a conversation and a form submission are the same row in
    // Joey's dashboard. Needs the matching enum label in the database first —
    // see src/lib/db/lead-source-schema.sql.
    await captureLead(validInput, { source: ASSISTANT_CHAT_SOURCE });

    expect(leadInsertValues()).toMatchObject({ source: 'assistant_chat' });
  });
});

/**
 * The update path: what a second `capture_lead` in one conversation does.
 *
 * This is the half of the duplicate-lead fix that can be stated about storage
 * alone. The route decides *when* to update (see route-capture.test.ts); these
 * tests pin what an update is allowed to write — above all that it writes no
 * second follow-up drip, because four duplicate rows are what queued sixteen
 * follow-up emails to one address.
 */
describe('updateCapturedLead — adding detail to a lead that exists', () => {
  it('fills a field that was empty and says which', async () => {
    const outcome = await updateCapturedLead(LEAD_ID, {
      ...validInput,
      phone: '(770) 555-0188',
      timeline: '3 months',
    });

    expect(outcome).toMatchObject({ status: 'updated', leadId: LEAD_ID });
    if (outcome.status !== 'updated') throw new Error('expected an update');
    expect(outcome.filled.sort()).toEqual(['phone', 'timeline']);
    expect(outcome.conflicts).toEqual([]);
    expect(leadUpdateValues()).toMatchObject({
      phone: '(770) 555-0188',
      timeline: '3 months',
    });
  });

  it('creates no follow-up drip and sends nothing', async () => {
    // The whole point. `persistLead` writes the lead and its five touchpoints
    // in one transaction, so reusing it here would have been a second drip.
    await updateCapturedLead(LEAD_ID, {
      ...validInput,
      phone: '(770) 555-0188',
    });

    expect(recordedInserts).toEqual([]);
    expect(sendImmediateFollowUp).not.toHaveBeenCalled();
    expect(notifyJoeyOfNewLead).not.toHaveBeenCalled();
    expect(sendSMSAlert).not.toHaveBeenCalled();
    expect(sendLeadToLofty).not.toHaveBeenCalled();
    expect(recordFreshConsent).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
  });

  it('leaves the identity of the row alone', async () => {
    await updateCapturedLead(LEAD_ID, {
      ...validInput,
      phone: '(770) 555-0188',
    });

    const written = leadUpdateValues() ?? {};
    expect(written).not.toHaveProperty('id');
    expect(written).not.toHaveProperty('createdAt');
    expect(written).not.toHaveProperty('status');
    expect(written).not.toHaveProperty('source');
  });

  it('fills a gap in form_data without dropping what is already there', async () => {
    const outcome = await updateCapturedLead(LEAD_ID, {
      ...validInput,
      location: 'Marietta',
      budget: '$450k',
    });

    if (outcome.status !== 'updated') throw new Error('expected an update');
    expect(outcome.filled.sort()).toEqual(['budget', 'location']);
    expect(leadUpdateValues()?.formData).toEqual({
      budget: '$450k',
      location: 'Marietta',
      bedrooms: null,
      bathrooms: null,
      propertyType: null,
      additionalNotes: STORED_LEAD_ROW.formData.additionalNotes,
    });
  });

  it('writes nothing at all when the same details are captured again', async () => {
    // Idempotent, not merely non-duplicating: a repeat identical capture leaves
    // no trace, not even a touched updated_at.
    const outcome = await updateCapturedLead(LEAD_ID, validInput);

    expect(outcome).toEqual({
      status: 'updated',
      leadId: LEAD_ID,
      filled: [],
      conflicts: [],
    });
    expect(recordedUpdates).toEqual([]);
  });

  it('treats a differently-cased or padded value as the same value', async () => {
    await updateCapturedLead(LEAD_ID, {
      ...validInput,
      name: '  rosa ALVAREZ  ',
    });

    expect(recordedUpdates).toEqual([]);
  });
});

describe('updateCapturedLead — a field that already has a value', () => {
  it('keeps the stored email and never overwrites it', async () => {
    // The server cannot tell a client correcting themselves from a model
    // garbling what it was told. Overwriting would let the second case
    // redirect the drip to an address the client never gave.
    const outcome = await updateCapturedLead(LEAD_ID, {
      ...validInput,
      email: 'rosa.alvarez+typo@gowithjoeyo-test.invalid',
    });

    if (outcome.status !== 'updated') throw new Error('expected an update');
    expect(outcome.conflicts).toEqual([
      {
        field: 'email',
        kept: STORED_LEAD_ROW.email,
        proposed: 'rosa.alvarez+typo@gowithjoeyo-test.invalid',
      },
    ]);
    expect(leadUpdateValues()).not.toHaveProperty('email');
  });

  it('records the value it refused in the lead’s notes, so nothing is lost', async () => {
    await updateCapturedLead(LEAD_ID, {
      ...validInput,
      email: 'rosa.alvarez+typo@gowithjoeyo-test.invalid',
      intent: 'sell',
    });

    const notes = leadUpdateValues()?.notes;
    expect(notes).toMatch(/capture_lead offered/);
    expect(notes).toContain('rosa.alvarez+typo@gowithjoeyo-test.invalid');
    expect(notes).toContain('intent kept "buy", offered "sell"');
  });

  it('appends to notes already on the row rather than replacing them', async () => {
    existingLeadRow = { ...STORED_LEAD_ROW, notes: 'Called once, no answer.' };

    await updateCapturedLead(LEAD_ID, { ...validInput, intent: 'sell' });

    expect(leadUpdateValues()?.notes).toMatch(/^Called once, no answer\.\n\[assistant /);
  });
});

describe('updateCapturedLead — refusals', () => {
  it('returns field errors rather than throwing, and writes nothing', async () => {
    const outcome = await updateCapturedLead(LEAD_ID, {
      ...validInput,
      email: 'not-an-email',
    });

    expect(outcome).toMatchObject({ status: 'rejected' });
    if (outcome.status !== 'rejected') throw new Error('expected a rejection');
    expect(outcome.fieldErrors.email).toMatch(/valid email/i);
    expect(recordedUpdates).toEqual([]);
    expect(recordedInserts).toEqual([]);
  });

  it('reports a lead id that names no row, rather than inventing one', async () => {
    existingLeadRow = null;

    const outcome = await updateCapturedLead(LEAD_ID, validInput);

    expect(outcome).toEqual({ status: 'missing' });
    expect(recordedUpdates).toEqual([]);
  });

  it('needs DATABASE_URL and nothing else, because it sends no email', async () => {
    delete testEnv.RESEND_API_KEY;

    const outcome = await updateCapturedLead(LEAD_ID, {
      ...validInput,
      phone: '(770) 555-0188',
    });

    expect(outcome).toMatchObject({ status: 'updated' });
  });

  it('throws MissingEnvError without reading or writing when DATABASE_URL is absent', async () => {
    delete testEnv.DATABASE_URL;

    await expect(updateCapturedLead(LEAD_ID, validInput)).rejects.toThrow(
      MissingEnvError
    );
    expect(recordedUpdates).toEqual([]);
  });
});

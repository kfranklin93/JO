import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEAD_INTENTS, leadSubmissionSchema } from '@/lib/validation/lead';

/**
 * Alignment tests for the assistant's `capture_lead` tool.
 *
 * The point of this file is that the tool's declared contract and
 * `leadSubmissionSchema` cannot drift apart silently. Before this alignment the
 * tool offered `buying / selling / buying_and_selling / general_question` and
 * required only `intent` and `notes`, so *every* capture would have failed
 * validation — on the intent value, or on the missing name and email, or both.
 * Nothing in the codebase would have caught that, because the two vocabularies
 * never met at a type boundary.
 *
 * So the assertions here run the tool's own declared field names through the real
 * schema rather than comparing two hand-written lists.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

const {
  TOOL_DEFINITIONS,
  CAPTURE_LEAD_FIELD_MAP,
  LeadCaptureValidationError,
  MockToolExecutor,
  createToolExecutor,
  toLeadSubmissionInput,
} = await import('./tools');

const captureLead = TOOL_DEFINITIONS.capture_lead;

/** A complete payload, as the model would emit it after a good conversation. */
const assistantPayload = {
  name: 'Rosa Alvarez',
  email: 'rosa.alvarez@gowithjoeyo-test.invalid',
  phone: '770-555-0133',
  intent: 'sell',
  location: 'Lake Oconee',
  timeline: 'this summer',
  notes: 'Selling the lake house first, then buying closer to town.',
};

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('capture_lead — intent vocabulary', () => {
  it('offers the canonical six and nothing else', () => {
    const described = captureLead.schema.properties.intent?.description ?? '';

    for (const intent of LEAD_INTENTS) {
      expect(described).toContain(intent);
    }
  });

  it('no longer offers the vocabulary the schema rejects', () => {
    const described = captureLead.schema.properties.intent?.description ?? '';

    for (const stale of ['buying_and_selling', 'general_question']) {
      expect(described).not.toContain(stale);
    }
  });

  it('asks for one primary intent, with secondary goals in notes', () => {
    const described = captureLead.schema.properties.intent?.description ?? '';

    expect(described).toMatch(/PRIMARY/);
    expect(described).toMatch(/notes/);
  });

  it('accepts every canonical intent through the schema', () => {
    for (const intent of LEAD_INTENTS) {
      const parsed = leadSubmissionSchema.safeParse(
        toLeadSubmissionInput({ ...assistantPayload, intent })
      );
      expect(parsed.success, `intent ${intent}`).toBe(true);
    }
  });
});

describe('capture_lead — required fields', () => {
  it('requires exactly name, email, intent and notes', () => {
    expect([...captureLead.schema.required].sort()).toEqual([
      'email',
      'intent',
      'name',
      'notes',
    ]);
  });

  it('requires every field the schema requires', () => {
    // Derived from the schema, not from a second hand-written list: a field that
    // becomes required in lead.ts and is not asked for here fails this.
    const empty = leadSubmissionSchema.safeParse({});
    const schemaRequired = empty.success
      ? []
      : [...new Set(empty.error.issues.map((issue) => issue.path.join('.')))];

    const declared = new Set(
      captureLead.schema.required.map(
        (field) => CAPTURE_LEAD_FIELD_MAP[field as keyof typeof CAPTURE_LEAD_FIELD_MAP]
      )
    );

    for (const field of schemaRequired) {
      expect(declared, `schema requires ${field}`).toContain(field);
    }
  });

  it('leaves phone optional, as the schema does', () => {
    const { phone: _phone, ...withoutPhone } = assistantPayload;

    expect(captureLead.schema.required).not.toContain('phone');
    expect(
      leadSubmissionSchema.safeParse(toLeadSubmissionInput(withoutPhone)).success
    ).toBe(true);
  });
});

describe('toLeadSubmissionInput — the field map', () => {
  it('maps a full payload straight through the schema', () => {
    const parsed = leadSubmissionSchema.safeParse(
      toLeadSubmissionInput(assistantPayload)
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      fullName: 'Rosa Alvarez',
      firstName: 'Rosa',
      lastName: 'Alvarez',
      email: 'rosa.alvarez@gowithjoeyo-test.invalid',
      intent: 'sell',
      phone: '770-555-0133',
      location: 'Lake Oconee',
      timeline: 'this summer',
      additionalNotes: assistantPayload.notes,
    });
  });

  it('renames notes to additionalNotes — the one rename in the map', () => {
    const mapped = toLeadSubmissionInput(assistantPayload);

    expect(mapped.additionalNotes).toBe(assistantPayload.notes);
    expect('notes' in mapped).toBe(false);
  });

  it('covers every property the tool declares', () => {
    expect(Object.keys(CAPTURE_LEAD_FIELD_MAP).sort()).toEqual(
      Object.keys(captureLead.schema.properties).sort()
    );
  });

  it('leaves absent fields absent rather than defaulting them', () => {
    const mapped = toLeadSubmissionInput({
      name: 'Prince',
      email: 'prince@gowithjoeyo-test.invalid',
      intent: 'general',
      notes: 'Just browsing for now.',
    });

    expect(Object.keys(mapped).sort()).toEqual([
      'additionalNotes',
      'email',
      'intent',
      'name',
    ]);
  });

  it('drops anything the tool does not declare', () => {
    const mapped = toLeadSubmissionInput({
      ...assistantPayload,
      status: 'qualified',
      source: 'assistant',
    });

    expect(mapped).not.toHaveProperty('status');
    expect(mapped).not.toHaveProperty('source');
  });
});

describe('LeadCaptureValidationError', () => {
  it('carries the rejected field messages in its text', () => {
    const error = new LeadCaptureValidationError({
      email: 'Enter a valid email address',
    });

    expect(String(error)).toContain('email: Enter a valid email address');
  });

  it('tells the model to ask rather than guess', () => {
    const error = new LeadCaptureValidationError({ name: 'Name is required' });

    expect(error.message).toMatch(/call capture_lead again/i);
    expect(error.message).toMatch(/do not guess/i);
  });

  it('keeps the field errors available structurally', () => {
    const fieldErrors = { intent: 'Select what you need help with' };

    expect(new LeadCaptureValidationError(fieldErrors).fieldErrors).toEqual(
      fieldErrors
    );
  });
});

describe('MockToolExecutor — capture_lead', () => {
  it('returns the id the local pipeline assigned', async () => {
    const executor = new MockToolExecutor(async () => ({ lead_id: 'lead-1' }));

    const result = await executor.execute({
      name: 'capture_lead',
      input: assistantPayload,
    });

    expect(result).toMatchObject({ lead_id: 'lead-1', status: 'captured_local' });
  });

  it('propagates a validation failure instead of inventing a lead id', async () => {
    // The agent loop turns a thrown error into an errored tool_result, which is
    // how the model learns to ask for the missing field. Swallowing it here and
    // handing back a synthetic id told the model a lead existed that did not.
    const executor = new MockToolExecutor(async () => {
      throw new LeadCaptureValidationError({ email: 'Email is required' });
    });

    await expect(
      executor.execute({ name: 'capture_lead', input: { intent: 'buy' } })
    ).rejects.toBeInstanceOf(LeadCaptureValidationError);
  });

  it('still degrades to mock mode when the failure is an outage rather than the payload', async () => {
    const executor = new MockToolExecutor(async () => {
      throw new Error('connection terminated');
    });

    const result = await executor.execute({
      name: 'capture_lead',
      input: assistantPayload,
    });

    expect(result.status).toBe('captured_mock_only');
  });

  it('is what the factory selects without a Composio key', () => {
    expect(createToolExecutor(async () => ({ lead_id: 'x' }))).toBeInstanceOf(
      MockToolExecutor
    );
  });
});

/**
 * `log_lead_note`, which used to write nothing.
 *
 * Both executors answered `{ status: 'logged_mock' }` and persisted nothing
 * anywhere, so the model read the call as filed and told clients their question
 * had been passed to Joey. The claim is now gated on `note_recorded`, the same
 * way the confirmation-email claim is gated on the send outcome: every path
 * that did not write says so, and says what the model may still do.
 */
describe('log_lead_note', () => {
  const call = {
    name: 'log_lead_note' as const,
    input: {
      lead_id: 'lead-from-the-model',
      note: 'Asked what homes on Oak Grove Drive are selling for.',
    },
  };

  it('permits the claim when the note was written', async () => {
    const note = vi.fn(async () => 'recorded' as const);

    const result = await new MockToolExecutor(undefined, undefined, note).execute(call);

    expect(result.note_recorded).toBe(true);
    expect(result.status).toBe('logged');
    expect(String(result.message)).toMatch(/you may tell the client/i);
  });

  it('passes the note text and only the note text to the hook', async () => {
    // The lead id comes from the route's closure, never from the model: an
    // argument for it is somewhere "write this on somebody else's lead"
    // would land. Same defence as book_appointment.
    const note = vi.fn(async () => 'recorded' as const);

    await new MockToolExecutor(undefined, undefined, note).execute(call);

    expect(note).toHaveBeenCalledWith(call.input.note);
    expect(note).toHaveBeenCalledTimes(1);
  });

  it('forbids the claim when there was no lead row to write to', async () => {
    const note = vi.fn(async () => 'missing' as const);

    const result = await new MockToolExecutor(undefined, undefined, note).execute(call);

    expect(result.note_recorded).toBe(false);
    expect(result.status).toBe('not_recorded');
    expect(String(result.message)).toMatch(/do NOT tell the client/i);
    expect(String(result.message)).toMatch(/capture_lead/);
  });

  it('forbids the claim when the write threw', async () => {
    const note = vi.fn(async () => {
      throw new Error('connection terminated');
    });

    const result = await new MockToolExecutor(undefined, undefined, note).execute(call);

    expect(result.note_recorded).toBe(false);
    expect(String(result.message)).toMatch(/was NOT saved/i);
  });

  it('forbids the claim when no hook is wired up at all', async () => {
    // The configuration that shipped. "logged_mock" read as success to the
    // model; this reads as what it is.
    const result = await new MockToolExecutor().execute(call);

    expect(result.note_recorded).toBe(false);
    expect(result.status).toBe('not_recorded');
  });

  it('writes the note through the Composio executor too', async () => {
    // ACTION_MAP sends log_lead_note to an unimplemented HubSpot action that
    // throws, so without local handling one environment variable would turn
    // note-writing from "works" into "throws".
    testEnv.COMPOSIO_API_KEY = 'composio-key-for-the-crm-mirror';
    const note = vi.fn(async () => 'recorded' as const);

    const result = await createToolExecutor({ note }).execute(call);

    expect(result.note_recorded).toBe(true);
    expect(note).toHaveBeenCalledWith(call.input.note);
  });
});

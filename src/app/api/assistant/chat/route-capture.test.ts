import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The `capture_lead` hook POST /api/assistant/chat hands the agent.
 *
 * This is the regression suite for the duplicate-lead bug: one conversation
 * produced one lead row per turn in which the model called `capture_lead`, so
 * six rows and sixteen queued follow-up emails stood behind one person, and the
 * single appointment hung off the wrong row.
 *
 * Why the hook is exercised rather than the capture service: the service cannot
 * see a chat session, and a session is the only thing the de-duplication is
 * allowed to key on. `leads.email` is deliberately non-unique — the same person
 * is legitimately a buyer lead now and a seller lead later — so "same email" is
 * not the question being asked here.
 *
 * The split of what is proved where:
 *
 *   - here: a second call in one session does not reach the insert path at all,
 *     and a booking lands on the lead the session is bound to;
 *   - lead-capture.test.ts: the update path writes the lead row and no
 *     `follow_ups` row, which is what makes "exactly one drip" true.
 *
 * A separate file from route.test.ts and route-booking.test.ts so each keeps
 * its own setup; the mocks match theirs.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const runAssistantTurn = vi.fn();
vi.mock('@/lib/assistant/agent', () => ({ runAssistantTurn }));

const recordChatTurn = vi.fn();
const sessionLeadId = vi.fn();
vi.mock('@/lib/services/chat-store', () => ({ recordChatTurn, sessionLeadId }));

const assistantMuteState = vi.fn();
vi.mock('@/lib/services/assistant-mute', () => ({ assistantMuteState }));

const captureLead = vi.fn();
const updateCapturedLead = vi.fn();
vi.mock('@/lib/services/lead-capture', () => ({
  captureLead,
  updateCapturedLead,
}));

const book = vi.fn();
const bookableSlots = vi.fn();
const offerSlots = vi.fn();
vi.mock('@/lib/services/booking', () => ({ book, bookableSlots, offerSlots }));

const { POST } = await import('./route');
const { LeadCaptureValidationError } = await import('@/lib/assistant/tools');

type CaptureHook = (input: Record<string, unknown>) => Promise<{ lead_id: string }>;
type BookingHooks = {
  availability: () => Promise<unknown>;
  book: (startTime: string) => Promise<Record<string, unknown>>;
};

/** The lead the first turn of the conversation created. */
const FIRST_LEAD = '248ef4a8-0000-4000-8000-000000000001';
/** The row a second insert would have produced — the bug's signature. */
const DUPLICATE_LEAD = 'a5f720a2-0000-4000-8000-000000000002';

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';

/** What the model sends: the assistant's field names, not the schema's. */
const CAPTURE_INPUT = {
  name: 'Rosa Alvarez',
  email: 'rosa.alvarez@gowithjoeyo-test.invalid',
  intent: 'buy',
};

let ipCounter = 150;

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];

  runAssistantTurn.mockReset();
  recordChatTurn.mockReset();
  recordChatTurn.mockResolvedValue(true);
  sessionLeadId.mockReset();
  sessionLeadId.mockResolvedValue(undefined);
  assistantMuteState.mockReset();
  assistantMuteState.mockResolvedValue({ muted: false, reason: null });

  captureLead.mockReset();
  captureLead.mockResolvedValue({
    ok: true,
    leadId: FIRST_LEAD,
    integrations: {
      followUp: true,
      loftyCRM: true,
      emailNotification: true,
      smsAlert: true,
    },
  });
  updateCapturedLead.mockReset();
  updateCapturedLead.mockImplementation(async (leadId: string) => ({
    status: 'updated',
    leadId,
    filled: [],
    conflicts: [],
  }));

  book.mockReset();
  book.mockResolvedValue({
    ok: true,
    appointment: { id: 'appt-1', startsAt: new Date('2026-10-30T19:45:00.000Z') },
    alreadyBooked: false,
    confirmation: 'sent',
    joeyNotified: true,
  });
  bookableSlots.mockReset();
  bookableSlots.mockResolvedValue([]);
  offerSlots.mockReset();
  offerSlots.mockResolvedValue([]);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Run one HTTP turn and hand back the hooks the route built for it.
 *
 * A fresh address each time, because the limiter's store is module-scoped and
 * survives between tests exactly as it does in a warm function instance.
 */
async function turn(sessionId = SESSION): Promise<{
  capture: CaptureHook;
  booking: BookingHooks;
}> {
  let captured: { capture: CaptureHook; booking: BookingHooks } | undefined;

  runAssistantTurn.mockImplementation(
    async (
      _turn: unknown,
      options: { localCapture: CaptureHook; booking: BookingHooks },
    ) => {
      captured = { capture: options.localCapture, booking: options.booking };
      return { reply: 'Got it.', toolCalls: [], mode: 'mock' as const };
    },
  );

  ipCounter += 1;
  const request = new NextRequest('https://gowithjoeyo.com/api/assistant/chat', {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      'x-nf-client-connection-ip': `203.0.113.${ipCounter}`,
    }),
    body: JSON.stringify({ message: "I'm looking in Marietta", sessionId }),
  });

  await POST(request);

  if (!captured) throw new Error('the route built no hooks');
  return captured;
}

describe('capture_lead — one conversation, one lead', () => {
  it('inserts on the first call of a session with no lead yet', async () => {
    const { capture } = await turn();

    const result = await capture(CAPTURE_INPUT);

    expect(result).toEqual({ lead_id: FIRST_LEAD });
    expect(captureLead).toHaveBeenCalledTimes(1);
    expect(updateCapturedLead).not.toHaveBeenCalled();
  });

  it('maps the assistant’s field names before validating', async () => {
    const { capture } = await turn();

    await capture({ ...CAPTURE_INPUT, notes: 'Wants three bedrooms.' });

    // `notes` becomes `additionalNotes`; nothing is defaulted in.
    expect(captureLead).toHaveBeenCalledWith({
      name: CAPTURE_INPUT.name,
      email: CAPTURE_INPUT.email,
      intent: CAPTURE_INPUT.intent,
      additionalNotes: 'Wants three bedrooms.',
    });
  });

  it('folds a second call in the same turn into the first row', async () => {
    const { capture } = await turn();

    const first = await capture(CAPTURE_INPUT);
    const second = await capture({ ...CAPTURE_INPUT, phone: '(770) 555-0188' });

    expect(second).toEqual(first);
    expect(captureLead).toHaveBeenCalledTimes(1);
    expect(updateCapturedLead).toHaveBeenCalledWith(FIRST_LEAD, expect.anything());
  });

  it('folds a call on a later HTTP turn into the row the session is bound to', async () => {
    // The production shape: turn one captured, the session now carries the id,
    // and the model — which cannot see its own tool results after the fact —
    // captures again on turn two.
    captureLead.mockResolvedValue({
      ok: true,
      leadId: DUPLICATE_LEAD,
      integrations: {
        followUp: true,
        loftyCRM: true,
        emailNotification: true,
        smsAlert: true,
      },
    });
    sessionLeadId.mockResolvedValue(FIRST_LEAD);

    const { capture } = await turn();
    const result = await capture(CAPTURE_INPUT);

    expect(result).toEqual({ lead_id: FIRST_LEAD });
    expect(captureLead).not.toHaveBeenCalled();
    expect(updateCapturedLead).toHaveBeenCalledTimes(1);
  });

  it('passes the new detail through to the update, so a later turn is not lost', async () => {
    sessionLeadId.mockResolvedValue(FIRST_LEAD);
    const { capture } = await turn();

    await capture({ ...CAPTURE_INPUT, phone: '(770) 555-0188' });

    expect(updateCapturedLead).toHaveBeenCalledWith(FIRST_LEAD, {
      name: CAPTURE_INPUT.name,
      email: CAPTURE_INPUT.email,
      intent: CAPTURE_INPUT.intent,
      phone: '(770) 555-0188',
    });
  });

  it('captures afresh when the session points at a lead that no longer exists', async () => {
    sessionLeadId.mockResolvedValue(FIRST_LEAD);
    updateCapturedLead.mockResolvedValue({ status: 'missing' });

    const { capture } = await turn();
    const result = await capture(CAPTURE_INPUT);

    expect(result).toEqual({ lead_id: FIRST_LEAD });
    expect(captureLead).toHaveBeenCalledTimes(1);
  });
});

describe('capture_lead — rejected input still throws', () => {
  it('throws rather than returning an id when the insert path rejects', async () => {
    // A thrown error is what the agent loop turns into an errored tool_result,
    // which is how the model learns which field to ask about again. Returning
    // an id for a write that never happened is the failure a prior fix removed.
    captureLead.mockResolvedValue({
      ok: false,
      fieldErrors: { email: 'Enter a valid email address' },
    });
    const { capture } = await turn();

    await expect(capture({ ...CAPTURE_INPUT, email: 'nope' })).rejects.toThrow(
      LeadCaptureValidationError,
    );
  });

  it('throws rather than returning an id when the update path rejects', async () => {
    sessionLeadId.mockResolvedValue(FIRST_LEAD);
    updateCapturedLead.mockResolvedValue({
      status: 'rejected',
      fieldErrors: { email: 'Enter a valid email address' },
    });
    const { capture } = await turn();

    const rejection = capture({ ...CAPTURE_INPUT, email: 'nope' });

    await expect(rejection).rejects.toThrow(LeadCaptureValidationError);
    await expect(rejection).rejects.toMatchObject({
      fieldErrors: { email: 'Enter a valid email address' },
    });
  });
});

describe('book_appointment — the lead the session is bound to', () => {
  it('books against the session’s lead, not one captured in this request', async () => {
    // The production symptom: the appointment landed on the second row while
    // the lead the session points at showed none. `recordChatTurn` binds the
    // session with coalesce(), so the session keeps the first lead it saw, and
    // that is the row the booking has to reach.
    sessionLeadId.mockResolvedValue(FIRST_LEAD);
    const { capture, booking } = await turn();

    await capture(CAPTURE_INPUT);
    await booking.book('2026-10-30T19:45:00.000Z');

    expect(book).toHaveBeenCalledTimes(1);
    expect(book.mock.calls[0]![0].leadId).toBe(FIRST_LEAD);
  });

  it('books against the lead this turn captured when the session has none yet', async () => {
    sessionLeadId.mockResolvedValue(undefined);
    const { capture, booking } = await turn();

    await capture(CAPTURE_INPUT);
    await booking.book('2026-10-30T19:45:00.000Z');

    expect(book.mock.calls[0]![0].leadId).toBe(FIRST_LEAD);
  });
});

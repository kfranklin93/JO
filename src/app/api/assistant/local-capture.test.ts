import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The wiring between `POST /api/assistant` and the lead capture service.
 *
 * The route's existing suite covers the request limit and deliberately treats the
 * agent as a black box. This file covers the one thing that was left unset: the
 * `localCapture` hook the agent hands to `capture_lead`. It is reached by taking
 * the hook the handler actually passed to `runAssistantTurn` and calling it, so
 * what is asserted is the wiring in the handler rather than a re-implementation
 * of it.
 *
 * The capture service is mocked here — its own behaviour has its own suite. What
 * matters is that the hook exists, translates the assistant's field names, and
 * distinguishes a rejected payload from a fault.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

type Outcome =
  | { ok: true; leadId: string; integrations: Record<string, boolean> }
  | { ok: false; fieldErrors: Record<string, string> };

const captureLead = vi.fn<(input: unknown) => Promise<Outcome>>();

vi.mock('@/lib/services/lead-capture', () => ({
  captureLead: (input: unknown) => captureLead(input),
}));

const runAssistantTurn = vi.fn();

vi.mock('@/lib/assistant/agent', () => ({ runAssistantTurn }));

const { POST } = await import('./route');
const { LeadCaptureValidationError } = await import('@/lib/assistant/tools');

const CAPTURED: Outcome = {
  ok: true,
  leadId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  integrations: {
    followUp: true,
    loftyCRM: true,
    emailNotification: true,
    smsAlert: true,
  },
};

/** What the model sends to capture_lead after a good conversation. */
const ASSISTANT_INPUT = {
  name: 'Rosa Alvarez',
  email: 'rosa.alvarez@gowithjoeyo-test.invalid',
  phone: '770-555-0133',
  intent: 'sell',
  location: 'Lake Oconee',
  timeline: 'this summer',
  notes: 'Selling the lake house first, then buying closer to town.',
};

let ipCounter = 0;

/** A fresh client each time: the limiter's store is module-scoped, as in a warm
 *  function instance. */
function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

function assistantRequest(): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.set('x-nf-client-connection-ip', freshIp());
  return new NextRequest('https://gowithjoeyo.com/api/assistant', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: `local-capture-${ipCounter}`,
      message: 'I want to sell my lake house.',
    }),
  });
}

/**
 * The hook the handler passed to the agent on its last turn.
 *
 * Read off the mock rather than reconstructed, so this cannot pass while the
 * handler leaves `localCapture` unset.
 */
async function localCaptureHook(): Promise<
  (input: Record<string, unknown>) => Promise<{ lead_id: string }>
> {
  await POST(assistantRequest());
  const options = runAssistantTurn.mock.calls.at(-1)?.[1] as
    | { localCapture?: (input: Record<string, unknown>) => Promise<{ lead_id: string }> }
    | undefined;
  const hook = options?.localCapture;
  if (!hook) throw new Error('the handler passed no localCapture hook');
  return hook;
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.CALENDLY_LINK = 'https://calendly.com/example/intro';

  // `clearAllMocks` leaves previously set resolved values in place, so both
  // implementations are reset and re-established.
  runAssistantTurn.mockReset();
  runAssistantTurn.mockResolvedValue({
    reply: 'Happy to help.',
    toolCalls: [],
    mode: 'mock',
  });
  captureLead.mockReset();
  captureLead.mockResolvedValue(CAPTURED);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/assistant — capture_lead wiring', () => {
  it('supplies a localCapture hook to the agent', async () => {
    await expect(localCaptureHook()).resolves.toBeInstanceOf(Function);
  });

  it('writes through the capture service, not a relative fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const hook = await localCaptureHook();

    await hook(ASSISTANT_INPUT);

    expect(captureLead).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('translates the assistant field names on the way in', async () => {
    const hook = await localCaptureHook();

    await hook(ASSISTANT_INPUT);

    expect(captureLead).toHaveBeenCalledWith({
      name: 'Rosa Alvarez',
      email: 'rosa.alvarez@gowithjoeyo-test.invalid',
      phone: '770-555-0133',
      intent: 'sell',
      location: 'Lake Oconee',
      timeline: 'this summer',
      additionalNotes: ASSISTANT_INPUT.notes,
    });
  });

  it('returns the stored lead id in the shape the tool expects', async () => {
    const hook = await localCaptureHook();

    await expect(hook(ASSISTANT_INPUT)).resolves.toEqual({
      lead_id: CAPTURED.ok ? CAPTURED.leadId : '',
    });
  });

  it('rejects a bad payload as a validation error the model can act on', async () => {
    captureLead.mockResolvedValue({
      ok: false,
      fieldErrors: { email: 'Email is required' },
    });
    const hook = await localCaptureHook();

    await expect(hook({ intent: 'sell', notes: 'Lake house.' })).rejects.toBeInstanceOf(
      LeadCaptureValidationError
    );
  });

  it('carries the field errors through for the model to read', async () => {
    captureLead.mockResolvedValue({
      ok: false,
      fieldErrors: { email: 'Email is required', name: 'Name is required' },
    });
    const hook = await localCaptureHook();

    await expect(hook({ intent: 'sell' })).rejects.toMatchObject({
      fieldErrors: { email: 'Email is required', name: 'Name is required' },
    });
  });

  it('lets a fault propagate rather than reporting it as the client’s mistake', async () => {
    // A missing DATABASE_URL is not something the client can correct, and the
    // model must not be handed an id for a lead that was never written.
    captureLead.mockRejectedValue(new Error('connection terminated'));
    const hook = await localCaptureHook();

    await expect(hook(ASSISTANT_INPUT)).rejects.toThrow('connection terminated');
  });
});

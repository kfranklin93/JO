import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The retry path for a rejected `capture_lead`.
 *
 * The requirement is that a validation failure reaches the model as an *errored*
 * tool result, so it asks the client for the field that was wrong and calls the
 * tool again. That is a property of the loop, not of the executor, so the
 * Anthropic client is mocked and the loop is run for real: two rounds, with the
 * second round's request inspected for what the model was actually told.
 *
 * Asserting on the executor alone would not show this. The loop could catch and
 * discard the error, or report it as a successful result, and an executor test
 * would still pass.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

const create = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = { create };
    constructor(_options: unknown) {}
  },
}));

const { runAssistantTurn } = await import('./agent');
const { LeadCaptureValidationError } = await import('./tools');

/** What the model emits when it has not yet asked for an email. */
const INCOMPLETE_CAPTURE = {
  stop_reason: 'tool_use',
  content: [
    {
      type: 'tool_use',
      id: 'toolu_missing_email',
      name: 'capture_lead',
      input: { name: 'Rosa Alvarez', intent: 'sell', notes: 'Lake house.' },
    },
  ],
  usage: { input_tokens: 10, output_tokens: 5 },
};

/** The follow-up turn, once the model has read the error. */
const ASKS_FOR_EMAIL = {
  stop_reason: 'end_turn',
  content: [
    {
      type: 'text',
      text: "Happy to help, Rosa — what's the best email to send that to?",
    },
  ],
  usage: { input_tokens: 20, output_tokens: 8 },
};

/** The tool_result blocks the loop sent on the second round. */
function toolResultsFromSecondCall(): Array<Record<string, unknown>> {
  const secondCall = create.mock.calls[1]?.[0] as
    | { messages: Array<{ role: string; content: unknown }> }
    | undefined;
  const last = secondCall?.messages.at(-1);
  return Array.isArray(last?.content)
    ? (last.content as Array<Record<string, unknown>>)
    : [];
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.ANTHROPIC_API_KEY = 'sk-ant-not-a-real-key';
  testEnv.ANTHROPIC_MODEL = 'claude-haiku-4-5';
  testEnv.ANTHROPIC_MAX_TOKENS = 1024;
  testEnv.NEXT_PUBLIC_SITE_NAME = 'Joey O. Real Estate';

  create.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runAssistantTurn — a rejected capture_lead', () => {
  /** A hook that rejects the payload exactly as the route's adapter does. */
  const rejectingCapture = async () => {
    throw new LeadCaptureValidationError({ email: 'Email is required' });
  };

  it('reports it to the model as an errored tool_result', async () => {
    create.mockResolvedValueOnce(INCOMPLETE_CAPTURE);
    create.mockResolvedValueOnce(ASKS_FOR_EMAIL);

    await runAssistantTurn(
      { sessionId: 's1', message: 'I want to sell my lake house.' },
      { localCapture: rejectingCapture }
    );

    const [result] = toolResultsFromSecondCall();
    expect(result).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_missing_email',
      is_error: true,
    });
  });

  it('includes the rejected field so the model knows what to ask for', async () => {
    create.mockResolvedValueOnce(INCOMPLETE_CAPTURE);
    create.mockResolvedValueOnce(ASKS_FOR_EMAIL);

    await runAssistantTurn(
      { sessionId: 's2', message: 'I want to sell my lake house.' },
      { localCapture: rejectingCapture }
    );

    expect(String(toolResultsFromSecondCall()[0]?.content)).toContain(
      'email: Email is required'
    );
  });

  it('never hands the model a lead id for a lead that was not written', async () => {
    create.mockResolvedValueOnce(INCOMPLETE_CAPTURE);
    create.mockResolvedValueOnce(ASKS_FOR_EMAIL);

    await runAssistantTurn(
      { sessionId: 's3', message: 'I want to sell my lake house.' },
      { localCapture: rejectingCapture }
    );

    expect(String(toolResultsFromSecondCall()[0]?.content)).not.toMatch(/lead_id/);
  });

  it('gives the model another round to retry rather than ending the turn', async () => {
    create.mockResolvedValueOnce(INCOMPLETE_CAPTURE);
    create.mockResolvedValueOnce(ASKS_FOR_EMAIL);

    const result = await runAssistantTurn(
      { sessionId: 's4', message: 'I want to sell my lake house.' },
      { localCapture: rejectingCapture }
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.reply).toContain('best email');
  });
});

describe('runAssistantTurn — an accepted capture_lead', () => {
  it('passes the stored lead id back as a normal result', async () => {
    create.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_ok',
          name: 'capture_lead',
          input: {
            name: 'Rosa Alvarez',
            email: 'rosa.alvarez@gowithjoeyo-test.invalid',
            intent: 'sell',
            notes: 'Lake house, then buying closer to town.',
          },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    create.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: "Got it — I've passed this to Joey." }],
      usage: { input_tokens: 20, output_tokens: 8 },
    });

    await runAssistantTurn(
      { sessionId: 's5', message: 'Selling my lake house.' },
      { localCapture: async () => ({ lead_id: 'lead-7' }) }
    );

    const [result] = toolResultsFromSecondCall();
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_ok' });
    expect(result?.is_error).toBeUndefined();
    expect(String(result?.content)).toContain('lead-7');
  });
});

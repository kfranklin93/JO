import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The seam, not the regexes — those are covered in ./plain-text.test.ts.
 *
 * What this asserts is that the strip is actually applied to the reply
 * `runAssistantTurn` hands back, which is the string both API routes return to
 * the panel and persist to `chat_messages`. A sanitizer that is written and
 * never called would pass its own unit tests.
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

function modelSays(text: string) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.ANTHROPIC_API_KEY = 'sk-ant-not-a-real-key';
  testEnv.ANTHROPIC_MODEL = 'claude-haiku-4-5';
  testEnv.ANTHROPIC_MAX_TOKENS = 1024;
  testEnv.NEXT_PUBLIC_SITE_NAME = 'Joey O. Real Estate';

  create.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runAssistantTurn — the reply is plain text', () => {
  it('strips the markdown a real production reply contained', async () => {
    create.mockResolvedValue(
      modelSays(
        'Perfect! Joey has some time open. Here are your options:\n\n' +
          '**Friday, October 30**\n- 9:00 AM\n- 9:15 AM',
      ),
    );

    const result = await runAssistantTurn({
      sessionId: 'pt1',
      message: 'any time friday?',
    });

    expect(result.reply).toBe(
      'Perfect! Joey has some time open. Here are your options:\n\n' +
        'Friday, October 30\n9:00 AM\n9:15 AM',
    );
    expect(result.reply).not.toContain('*');
  });

  it('leaves a reply that was already plain exactly as the model wrote it', async () => {
    const plain =
      "I've got Friday, March 13 at 9:00 AM Eastern Time, or 9:15 and 9:45 that " +
      'same morning — which works? Joey-Anne can join too.';
    create.mockResolvedValue(modelSays(plain));

    const result = await runAssistantTurn({
      sessionId: 'pt2',
      message: 'when is he free?',
    });

    expect(result.reply).toBe(plain);
  });
});

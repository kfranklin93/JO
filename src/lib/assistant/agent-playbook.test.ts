import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The playbook only earns its keep if the directive reaches the model. Matching
 * is covered in answer-playbook.test.ts; what this file asserts is the wiring —
 * that `runAssistantTurn` puts the approved answer in the `system` field of the
 * request it actually sends, keeps the base prompt alongside it, and stays quiet
 * when nothing matches.
 *
 * A unit test of the matcher cannot show any of that. The directive could be
 * built and dropped on the floor and the matcher's tests would still pass.
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
const { ANSWER_PLAYBOOK } = await import('./answer-playbook-content');

const REPLY = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'Happy to help with that.' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

/** The system string the loop sent on its first (only) request. */
function systemSent(): string {
  const call = create.mock.calls[0]?.[0] as { system?: string } | undefined;
  return call?.system ?? '';
}

function entryById(id: string) {
  const found = ANSWER_PLAYBOOK.find((e) => e.id === id);
  if (!found) throw new Error(`fixture drift: no playbook entry "${id}"`);
  return found;
}

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.ANTHROPIC_API_KEY = 'sk-ant-not-a-real-key';
  testEnv.ANTHROPIC_MODEL = 'claude-haiku-4-5';
  testEnv.ANTHROPIC_MAX_TOKENS = 1024;
  testEnv.NEXT_PUBLIC_SITE_NAME = 'Joey O. Real Estate';

  create.mockReset();
  create.mockResolvedValue(REPLY);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runAssistantTurn — playbook injection', () => {
  it('sends the approved answer for a question the playbook covers', async () => {
    await runAssistantTurn({ sessionId: 'p1', message: 'what is your commission?' });

    expect(systemSent()).toContain(entryById('commission-and-fees').answer);
  });

  it('keeps the base prompt and its hard rules alongside the directive', async () => {
    await runAssistantTurn({ sessionId: 'p2', message: 'what is your commission?' });

    const system = systemSent();
    expect(system).toContain('## HARD RULES (never break)');
    expect(system).toContain('## APPROVED ANSWER FOR THIS QUESTION');
    // Order matters for the restated precedence to make sense: the rules are
    // stated first, the directive defers to them last.
    expect(system.indexOf('## HARD RULES')).toBeLessThan(
      system.indexOf('## APPROVED ANSWER'),
    );
  });

  it('sends the base prompt unchanged when nothing matches', async () => {
    await runAssistantTurn({
      sessionId: 'p3',
      message: 'my neighbour keeps parking across my driveway',
    });

    const system = systemSent();
    expect(system).toContain('## HARD RULES (never break)');
    expect(system).not.toContain('APPROVED ANSWER');
  });

  it('matches on the new message, not on the history', async () => {
    // Otherwise a topic raised three turns ago keeps overriding the answer to
    // what was just asked.
    await runAssistantTurn({
      sessionId: 'p4',
      message: 'thanks, that helps',
      history: [{ role: 'user', content: 'what is your commission?' }],
    });

    expect(systemSent()).not.toContain('APPROVED ANSWER');
  });

  it('answers from the base prompt when the playbook is switched off', async () => {
    testEnv.ASSISTANT_ANSWER_PLAYBOOK = 'off';

    await runAssistantTurn({ sessionId: 'p5', message: 'what is your commission?' });

    expect(systemSent()).not.toContain('APPROVED ANSWER');
  });
});

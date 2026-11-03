import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guards on the prose the assistant speaks when no ASSISTANT_* variable is set.
 *
 * This is the configuration production actually ran under: none of the six
 * variables existed in Netlify, so the live prompt read
 * "Buying representation: {{BUYER_SERVICES_SUMMARY}}" and the assistant knew
 * neither what Joey offers nor where he works. The defaults are now the
 * fallback, which makes their content client-facing copy — so it is checked
 * like client-facing copy.
 *
 * The last block is the one that would have caught the original defect: it
 * drives `runAssistantTurn` with an environment that sets no ASSISTANT_*
 * variable at all and asserts the prompt that reaches the model carries no
 * token.
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

const { ASSISTANT_FACT_DEFAULTS } = await import('./assistant-facts');
const { runAssistantTurn } = await import('./agent');

/**
 * The word Joey replaced, assembled rather than written.
 *
 * Same device as `REPLACED_FEE_WORD` in src/app/(marketing)/service-pages.test.tsx:
 * spelling it here would put it in the repo-wide grep and make the grep useless
 * to the next person who runs it.
 */
const REPLACED_FEE_WORD = ['com', 'mission'].join('');

const FACT_KEYS = [
  'SERVICE_AREA',
  'SERVICE_AREA_LIST',
  'BUYER_SERVICES_SUMMARY',
  'SELLER_SERVICES_SUMMARY',
  'GUIDE_SUMMARY',
  'TEAM_SUMMARY',
] as const;

const entries = Object.entries(ASSISTANT_FACT_DEFAULTS);

describe('ASSISTANT_FACT_DEFAULTS — every slot is filled', () => {
  it('covers all six placeholders in the system prompt', () => {
    expect(Object.keys(ASSISTANT_FACT_DEFAULTS).sort()).toEqual(
      [...FACT_KEYS].sort(),
    );
  });

  it.each(FACT_KEYS)('gives %s real text rather than a stub', (key) => {
    expect(ASSISTANT_FACT_DEFAULTS[key].trim().length).toBeGreaterThan(20);
  });

  it('leaves no placeholder token inside a default', () => {
    // A default that still contained a token would reproduce the live defect
    // one level down.
    for (const [key, value] of entries) {
      expect(value, key).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });
});

describe('ASSISTANT_FACT_DEFAULTS — Joey’s vocabulary', () => {
  it('never uses the fee word he replaced', () => {
    for (const [key, value] of entries) {
      expect(value.toLowerCase(), key).not.toContain(REPLACED_FEE_WORD);
    }
  });

  it('says compensation where the subject comes up', () => {
    expect(ASSISTANT_FACT_DEFAULTS.SELLER_SERVICES_SUMMARY).toMatch(
      /compensation/i,
    );
  });

  it('spells his name and his brand the way he spells them', () => {
    for (const [key, value] of entries) {
      // Any mention has to be the exact spelling, so a near-miss like
      // "Joey Obendorfer" or "Go with Joey O" fails rather than shipping.
      for (const near of value.match(/\bjoey\s+ob\w+/gi) ?? []) {
        expect(near, key).toBe('Joey Oberndorfer');
      }
      for (const near of value.match(/\bgo\s+with\s+joey\s+o\.?/gi) ?? []) {
        expect(near, key).toBe('Go With Joey O.');
      }
    }
  });
});

describe('ASSISTANT_FACT_DEFAULTS — nothing a tool cannot prove', () => {
  it('quotes no dollar figure', () => {
    for (const [key, value] of entries) {
      expect(value, key).not.toContain('$');
    }
  });

  it('quotes no percentage', () => {
    for (const [key, value] of entries) {
      expect(value, key).not.toMatch(/\d+\s*(%|percent)/i);
    }
  });

  it('tells the assistant it holds no market statistics', () => {
    // The slot that used to read {{GUIDE_SUMMARY}}. An empty slot labelled
    // "guide" is an invitation to invent a guide and a market report to go
    // with it.
    expect(ASSISTANT_FACT_DEFAULTS.GUIDE_SUMMARY).toMatch(
      /no market statistics/i,
    );
    expect(ASSISTANT_FACT_DEFAULTS.GUIDE_SUMMARY).toMatch(
      /no downloadable guide/i,
    );
  });
});

describe('ASSISTANT_FACT_DEFAULTS — licensing boundaries', () => {
  it.each([
    ['an insurance agent', /is an insurance agent/i],
    ['a title provider', /provides (title|escrow)/i],
    ['a title company', /title (company|services)/i],
  ])('never implies Joey is %s', (_label, pattern) => {
    for (const [key, value] of entries) {
      expect(value, key).not.toMatch(pattern);
    }
  });
});

/**
 * The prompt as the model receives it, with the environment production had.
 *
 * `getAssistantEnv` is not exported, so this goes through `runAssistantTurn`
 * and reads the `system` field off the request the loop sent — the same harness
 * agent-playbook.test.ts uses for the directive.
 */
describe('the live prompt with no ASSISTANT_* variable set', () => {
  const REPLY = {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Happy to help.' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };

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

  /** The system string the loop sent on its first (only) request. */
  function systemSent(): string {
    const call = create.mock.calls[0]?.[0] as { system?: string } | undefined;
    return call?.system ?? '';
  }

  it('leaves no unfilled token in the prompt the model sees', async () => {
    await runAssistantTurn({ sessionId: 'f1', message: 'do you work in Marietta?' });

    expect(systemSent()).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('states what Joey offers instead of naming the slot', async () => {
    await runAssistantTurn({ sessionId: 'f2', message: 'what do you do for buyers?' });

    const system = systemSent();
    expect(system).toContain(ASSISTANT_FACT_DEFAULTS.BUYER_SERVICES_SUMMARY);
    expect(system).toContain(ASSISTANT_FACT_DEFAULTS.SELLER_SERVICES_SUMMARY);
    expect(system).toContain(ASSISTANT_FACT_DEFAULTS.SERVICE_AREA_LIST);
    expect(system).toContain(ASSISTANT_FACT_DEFAULTS.TEAM_SUMMARY);
    expect(system).toContain(ASSISTANT_FACT_DEFAULTS.GUIDE_SUMMARY);
  });

  it('still lets an environment variable override a default', async () => {
    // The point of keeping env first: Joey can retune a line in Netlify without
    // a deploy, and the default is only the floor.
    testEnv.ASSISTANT_SERVICE_AREA = 'Greater Savannah';

    // A message the playbook does not match, so the only service-area wording
    // in the prompt is the substituted one.
    await runAssistantTurn({ sessionId: 'f3', message: 'just saying hello' });

    expect(systemSent()).toContain('Greater Savannah');
    expect(systemSent()).not.toContain(ASSISTANT_FACT_DEFAULTS.SERVICE_AREA);
  });
});

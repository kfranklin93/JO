import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Lead } from './follow-up-scheduler';

/**
 * Configuration is read when `getContentSource` is called, so the flag can be
 * flipped between cases. The real module parses `process.env` once at import.
 */
const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

/** Records every Bedrock invocation so "no model call" can be asserted. */
const generateJoeyEmail = vi.fn(async (_prompt: string, _system: string) =>
  'Hey Jane!\n\nModel-authored body.\n\nTalk soon,\nJoey'
);

vi.mock('@/lib/api/bedrock', () => ({
  generateJoeyEmail: (prompt: string, system: string) =>
    generateJoeyEmail(prompt, system),
}));

const {
  getContentSource,
  templateContentSource,
  aiContentSource,
  renderFollowUp,
} = await import('./follow-up-content');

const lead: Lead = {
  id: 'lead-1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  intent: 'buy',
  location: 'Marietta',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  status: 'new',
};

beforeEach(() => {
  vi.clearAllMocks();
  delete testEnv.FOLLOW_UP_CONTENT_SOURCE;
});

describe('getContentSource', () => {
  it('returns templates when the flag is unset', () => {
    expect(getContentSource()).toBe(templateContentSource);
    expect(getContentSource().name).toBe('template');
  });

  it('returns templates when the flag explicitly selects them', () => {
    testEnv.FOLLOW_UP_CONTENT_SOURCE = 'template';
    expect(getContentSource()).toBe(templateContentSource);
  });

  it('returns the AI source only when the flag selects it', () => {
    testEnv.FOLLOW_UP_CONTENT_SOURCE = 'ai';
    expect(getContentSource()).toBe(aiContentSource);
    expect(getContentSource().name).toBe('ai');
  });

  it('falls back to templates for an unrecognised value', () => {
    // The Zod enum rejects this in the real env, but the guard is explicit
    // rather than relying on that, because degrading to no email is worse than
    // degrading to a templated one.
    testEnv.FOLLOW_UP_CONTENT_SOURCE = 'gpt';
    expect(getContentSource()).toBe(templateContentSource);
  });
});

describe('templateContentSource', () => {
  it('never calls Bedrock', async () => {
    await templateContentSource.generate(lead, 'day3');
    expect(generateJoeyEmail).not.toHaveBeenCalled();
  });

  it('produces exactly what the template renders', async () => {
    const content = await templateContentSource.generate(lead, 'day3');
    expect(content).toEqual(renderFollowUp(lead, 'day3'));
  });

  it('is used by default for every touchpoint, with no model call', async () => {
    for (const type of ['immediate', 'day3', 'day7', 'day14', 'day30'] as const) {
      const content = await getContentSource().generate(lead, type);
      expect(content.subject.length).toBeGreaterThan(0);
      expect(content.body.length).toBeGreaterThan(0);
    }
    expect(generateJoeyEmail).not.toHaveBeenCalled();
  });
});

describe('aiContentSource', () => {
  it('uses the model for the body', async () => {
    const content = await aiContentSource.generate(lead, 'day3');

    expect(generateJoeyEmail).toHaveBeenCalledTimes(1);
    expect(content.body).toContain('Model-authored body.');
  });

  it('takes the subject from the template, not the model', async () => {
    // The old subject map produced "Quick check-in, there" for a nameless lead.
    // Sourcing subjects from the template keeps that handling on this path too.
    const nameless: Lead = { ...lead, name: 'there' };
    const content = await aiContentSource.generate(nameless, 'day3');

    expect(content.subject).toBe(renderFollowUp(nameless, 'day3').subject);
    expect(content.subject).not.toMatch(/, there\b/);
  });

  it('does not hand the model a bare "N/A" as a previous message', async () => {
    await aiContentSource.generate(lead, 'day3');

    const prompt = generateJoeyEmail.mock.calls[0]![0];
    expect(prompt).not.toMatch(/Previous message:\s*N\/A/);
  });

  it('fails loudly when the model returns nothing', async () => {
    generateJoeyEmail.mockResolvedValueOnce('   ');

    await expect(aiContentSource.generate(lead, 'day3')).rejects.toThrow(
      'empty body'
    );
  });
});

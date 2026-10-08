import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What `book_intro_call` hands the model.
 *
 * A separate file from tools.test.ts so that file's setup stays untouched.
 *
 * The failure being guarded against is specific: the previous versions returned
 * the literal string `"{{CALENDLY_LINK}}"` or an empty string when no booking
 * link was configured. A model handed either will present it to a client as a
 * link, or — worse — invent a plausible URL to fill the gap, which is the one
 * thing the system prompt's hard rules forbid. Naming the absence is what stops
 * that, so these tests assert the model is told *and* told what to do instead.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const { MockToolExecutor } = await import('./tools');

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const call = { name: 'book_intro_call' as const, input: { lead_id: 'lead-7' } };

describe('book_intro_call — with a link configured', () => {
  it('hands back the configured URL', async () => {
    testEnv.BOOKING_LINK = 'https://calendar.app.google/abc123';

    const result = await new MockToolExecutor().execute(call);

    expect(result).toEqual({ booking_url: 'https://calendar.app.google/abc123' });
  });

  it('still honours the deprecated variable', async () => {
    testEnv.CALENDLY_LINK = 'https://calendly.com/joey-real/intro';

    const result = await new MockToolExecutor().execute(call);

    expect(result.booking_url).toBe('https://calendly.com/joey-real/intro');
  });
});

describe('book_intro_call — with no link configured', () => {
  it('returns no URL rather than a placeholder', async () => {
    const result = await new MockToolExecutor().execute(call);

    expect(result.booking_url).toBeNull();
    expect(JSON.stringify(result)).not.toContain('{{');
    expect(JSON.stringify(result)).not.toContain('calendly.com/joey');
  });

  it('tells the model not to invent one', async () => {
    const result = await new MockToolExecutor().execute(call);

    expect(String(result.message)).toMatch(/do not invent/i);
  });

  it('tells the model what to offer instead', async () => {
    // Otherwise a dead end: the model knows it has no link and has nothing to
    // say, which is how a conversation ends without a next step.
    const result = await new MockToolExecutor().execute(call);

    expect(String(result.message)).toMatch(/reach out personally/i);
    expect(String(result.message)).toMatch(/name and email/i);
  });

  it('is flagged so the condition is greppable in logs', async () => {
    const result = await new MockToolExecutor().execute(call);

    expect(result.status).toBe('no_booking_link');
  });
});

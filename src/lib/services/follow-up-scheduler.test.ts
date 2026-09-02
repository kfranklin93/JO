import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Lead } from './follow-up-scheduler';

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

/** Captures delivery attempts and lets the outcome be varied. */
const sendFollowUpEmail = vi.fn(
  async (_to: string, _subject: string, _body: string) => true
);
vi.mock('@/lib/services/email-service', () => ({
  sendFollowUpEmail: (to: string, subject: string, body: string) =>
    sendFollowUpEmail(to, subject, body),
}));

const generateJoeyEmail = vi.fn(async () => 'Model body');
vi.mock('@/lib/api/bedrock', () => ({
  generateJoeyEmail: () => generateJoeyEmail(),
}));

const { sendFollowUp, sendImmediateFollowUp } = await import(
  './follow-up-scheduler'
);

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
  // clearAllMocks resets recorded calls but not implementations, so a rejection
  // set by one case would otherwise leak into the next.
  sendFollowUpEmail.mockResolvedValue(true);
  generateJoeyEmail.mockResolvedValue('Model body');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sendFollowUp', () => {
  it('reports success with no failure reason attached', async () => {
    const result = await sendFollowUp(lead, 'day3');
    expect(result).toEqual({ ok: true });
  });

  it('sends templated content without touching Bedrock by default', async () => {
    await sendFollowUp(lead, 'day3');

    expect(generateJoeyEmail).not.toHaveBeenCalled();
    expect(sendFollowUpEmail).toHaveBeenCalledTimes(1);

    const [to, subject, body] = sendFollowUpEmail.mock.calls[0]!;
    expect(to).toBe('jane@example.com');
    expect(subject).toContain('Jane');
    expect(body).toContain('Hey Jane!');
  });

  /**
   * The whole point of the result object. `failureReason` in the database was
   * the literal 'Send failed' for every failure, so a missing API key looked
   * identical to a rejected recipient.
   */
  it('reports a specific reason when delivery is rejected', async () => {
    sendFollowUpEmail.mockResolvedValue(false);

    const result = await sendFollowUp(lead, 'day3');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toContain('email');
    expect(result.reason).not.toBe('Send failed');
  });

  it('reports a specific reason when delivery throws', async () => {
    sendFollowUpEmail.mockRejectedValue(new Error('RESEND_API_KEY missing'));

    const result = await sendFollowUp(lead, 'day3');

    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toContain('RESEND_API_KEY missing');
  });

  it('distinguishes a content failure from a delivery failure', async () => {
    testEnv.FOLLOW_UP_CONTENT_SOURCE = 'ai';
    generateJoeyEmail.mockRejectedValue(new Error('AccessDeniedException'));

    const result = await sendFollowUp(lead, 'day3');

    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toContain('content:ai');
    expect(result.reason).toContain('AccessDeniedException');
    // Nothing was sent, so there is nothing to retry at the delivery layer.
    expect(sendFollowUpEmail).not.toHaveBeenCalled();
  });

  it('uses the model when the flag selects it', async () => {
    testEnv.FOLLOW_UP_CONTENT_SOURCE = 'ai';

    const result = await sendFollowUp(lead, 'day3');

    expect(result).toEqual({ ok: true });
    expect(generateJoeyEmail).toHaveBeenCalledTimes(1);
    expect(sendFollowUpEmail.mock.calls[0]![2]).toBe('Model body');
  });
});

describe('sendImmediateFollowUp', () => {
  it('delegates to the immediate touchpoint', async () => {
    const result = await sendImmediateFollowUp(lead);

    expect(result).toEqual({ ok: true });
    expect(sendFollowUpEmail.mock.calls[0]![1]).toContain(
      'Thanks for reaching out'
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * How the opt-out list affects outbound mail.
 *
 * A separate file from email-service.test.ts so that file's mocks stay as they
 * are; this one needs the suppression module stubbed, which that one does not.
 *
 * Three properties are load-bearing:
 *
 *  1. A suppressed address receives nothing.
 *  2. Joey's own notifications cannot be suppressed by a client's unsubscribe.
 *     This is why the check sits in `sendFollowUpEmail` rather than in
 *     `sendEmail` — the obvious placement would have stopped Joey hearing about
 *     his own leads the moment one of them opted out.
 *  3. Client mail carries both List-Unsubscribe headers. One without the other
 *     is not one-click under RFC 8058, and Gmail simply ignores it.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

const sentEmails: SentEmail[] = [];

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: SentEmail) => {
        sentEmails.push(payload);
        return { data: { id: 'mock-email-id' }, error: null };
      },
    };
  },
}));

class FakeSuppressionUnavailable extends Error {
  constructor() {
    super('Could not read the email suppression list');
    this.name = 'SuppressionUnavailableError';
  }
}

const isSuppressed = vi.fn(async (_email: string) => false);

vi.mock('@/lib/services/email-preferences', () => ({
  isSuppressed: (email: string) => isSuppressed(email),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

const { sendFollowUpEmail, notifyJoeyOfNewLead } = await import('./email-service');

beforeEach(() => {
  sentEmails.length = 0;
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.RESEND_API_KEY = 're_test_key';
  testEnv.JOEY_EMAIL = 'joey@gowithjoeyo.com';
  testEnv.JOEY_PHONE = '(770) 555-0100';
  testEnv.MAIL_FROM = 'joeyo@gowithjoeyo.com';
  testEnv.NEXT_PUBLIC_SITE_URL = 'https://gowithjoeyo.com';
  testEnv.SESSION_SECRET = 'test-secret-for-unsubscribe-links';

  isSuppressed.mockReset();
  isSuppressed.mockResolvedValue(false);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sendFollowUpEmail — a suppressed recipient', () => {
  it('sends nothing', async () => {
    isSuppressed.mockResolvedValue(true);

    await sendFollowUpEmail('dana@x.invalid', 'Quick check-in', 'Hey Dana!');

    expect(sentEmails).toHaveLength(0);
  });

  it('reports success, because withholding it is the correct outcome', async () => {
    // Returning false would make the cron record a delivery failure and retry,
    // burning the attempt budget on something that must never be sent.
    isSuppressed.mockResolvedValue(true);

    await expect(
      sendFollowUpEmail('dana@x.invalid', 'Quick check-in', 'Hey Dana!'),
    ).resolves.toBe(true);
  });

  it('logs that it was suppressed, so a quiet drip is explainable', async () => {
    isSuppressed.mockResolvedValue(true);

    await sendFollowUpEmail('Dana@X.invalid', 'Quick check-in', 'Hey Dana!');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('suppressed'));
  });
});

describe('sendFollowUpEmail — when the list cannot be read', () => {
  it('fails closed rather than sending', async () => {
    isSuppressed.mockRejectedValue(new FakeSuppressionUnavailable());

    await expect(
      sendFollowUpEmail('dana@x.invalid', 'Quick check-in', 'Hey Dana!'),
    ).rejects.toThrow(/suppression list/);

    expect(sentEmails).toHaveLength(0);
  });
});

describe('sendFollowUpEmail — a normal send', () => {
  const send = () =>
    sendFollowUpEmail('Dana@X.invalid', 'Quick check-in', 'Hey Dana!');

  it('delivers to the lead', async () => {
    await send();

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe('Dana@X.invalid');
  });

  it('carries both List-Unsubscribe headers', async () => {
    // Either one alone does not qualify as one-click, and the mailbox provider
    // shows no unsubscribe control at all.
    await send();

    const headers = sentEmails[0]!.headers ?? {};
    expect(headers['List-Unsubscribe']).toMatch(/^<https:\/\/gowithjoeyo\.com\/api\/unsubscribe\?token=/);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('puts a working link in the body for clients that show no control', async () => {
    await send();

    expect(sentEmails[0]!.html).toContain('Unsubscribe from these emails');
    expect(sentEmails[0]!.text).toContain('Unsubscribe: https://gowithjoeyo.com/api/unsubscribe');
  });

  it('renders the footer as a real link rather than escaped markup', async () => {
    // textToHtml escapes everything it is given, so the anchor has to be added
    // after it runs. Folding it into the text body would show the tag.
    await send();

    expect(sentEmails[0]!.html).toContain('<a href="https://gowithjoeyo.com/api/unsubscribe');
    expect(sentEmails[0]!.html).not.toContain('&lt;a href');
  });

  it('signs the link for the recipient, normalised', async () => {
    const { readUnsubscribeToken } = await import('@/lib/auth/unsubscribe-token');
    await send();

    const match = sentEmails[0]!.text?.match(/token=([^\s]+)/);
    const token = decodeURIComponent(match![1]!);

    expect(readUnsubscribeToken(token)).toBe('dana@x.invalid');
  });

  it('gives two recipients different links', async () => {
    // A shared link would let one recipient unsubscribe the other.
    await sendFollowUpEmail('dana@x.invalid', 's', 'b');
    await sendFollowUpEmail('sam@x.invalid', 's', 'b');

    expect(sentEmails[0]!.text).not.toBe(sentEmails[1]!.text);
  });
});

describe("Joey's own notifications", () => {
  const lead = { name: 'Dana Whitfield', email: 'dana@x.invalid', intent: 'sell' };

  it('go out even when the lead has unsubscribed', async () => {
    // The reason the check is in sendFollowUpEmail and not sendEmail. Joey must
    // not stop hearing about his own leads because one of them opted out.
    isSuppressed.mockResolvedValue(true);

    await notifyJoeyOfNewLead(lead);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe('joey@gowithjoeyo.com');
  });

  it('never consult the suppression list at all', async () => {
    await notifyJoeyOfNewLead(lead);

    expect(isSuppressed).not.toHaveBeenCalled();
  });

  it('carry no unsubscribe headers, being transactional mail to the operator', async () => {
    await notifyJoeyOfNewLead(lead);

    expect(sentEmails[0]!.headers).toBeUndefined();
  });
});

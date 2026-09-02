import { beforeEach, describe, it, expect, vi } from 'vitest';

/**
 * Configuration read at request time. Mutable so the missing-key case can be
 * exercised; the real module parses `process.env` once at import.
 */
const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

/** A payload as handed to Resend. `from` and `replyTo` are asserted on below. */
interface SentEmail {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

/** Every payload handed to Resend, so the rendered source can be inspected. */
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

const { textToHtml, notifyJoeyOfNewLead, sendDailyLeadSummary, sendEmail } =
  await import('./email-service');

beforeEach(() => {
  sentEmails.length = 0;
  testEnv.RESEND_API_KEY = 're_test_key';
  testEnv.JOEY_EMAIL = 'joey@gowithjoeyo.com';
  testEnv.JOEY_PHONE = '(770) 555-0100';
  testEnv.MAIL_FROM = 'onboarding@resend.dev';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('email-service escaping integration', () => {
  describe('textToHtml', () => {
    it('should escape HTML before adding markup', () => {
      const text = '<script>alert(1)</script>';
      const result = textToHtml(text);
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should preserve paragraph structure after escaping', () => {
      const text = 'First paragraph\n\nSecond paragraph';
      const result = textToHtml(text);
      expect(result).toContain('<p>First paragraph</p>');
      expect(result).toContain('<p>Second paragraph</p>');
    });

    it('should preserve line breaks after escaping', () => {
      const text = 'Line 1\nLine 2';
      const result = textToHtml(text);
      expect(result).toContain('Line 1<br>Line 2');
    });

    it('should escape injection payload before converting to HTML', () => {
      const payload = '"><script>alert(1)</script>';
      const result = textToHtml(payload);
      // Should be escaped
      expect(result).toContain('&quot;&gt;&lt;script&gt;');
      // Should not contain unescaped payload
      expect(result).not.toContain('"><script>');
    });

    it('should handle apostrophes in names correctly', () => {
      const text = "O'Brien family";
      const result = textToHtml(text);
      // Apostrophe should be entity-encoded but will render correctly
      expect(result).toContain('O&#39;Brien');
    });

    it('should handle mixed content with special characters', () => {
      const text = 'Contact: <john@example.com> & call (555) 123-4567';
      const result = textToHtml(text);
      expect(result).toContain('&lt;john@example.com&gt;');
      expect(result).toContain('&amp;');
      expect(result).not.toContain('<john@example.com>');
    });
  });

  /**
   * The end-to-end form of Requirement 1.3: rather than testing the escaping
   * helpers in isolation, these assert against the exact HTML string handed to
   * Resend. That string is the email source Joey would view, so an escaping
   * call omitted at a single interpolation site fails here.
   */
  describe('notifyJoeyOfNewLead source (Requirement 1.3)', () => {
    /** The payload from the spec's verification step. */
    const PAYLOAD = '"><script>alert(1)</script>';

    async function renderNotification(
      overrides: Partial<Parameters<typeof notifyJoeyOfNewLead>[0]> = {}
    ) {
      await notifyJoeyOfNewLead({
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '(770) 555-0188',
        intent: 'buy',
        additionalNotes: PAYLOAD,
        ...overrides,
      });
      expect(sentEmails).toHaveLength(1);
      return sentEmails[0]!.html;
    }

    it('renders a script payload in the notes as inert text', async () => {
      const html = await renderNotification();

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('</script>');
      expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('renders the payload inert in every lead-derived field', async () => {
      const html = await renderNotification({
        name: PAYLOAD,
        intent: PAYLOAD,
        location: PAYLOAD,
        budget: PAYLOAD,
        timeline: PAYLOAD,
      });

      expect(html).not.toContain('<script>');
      expect(html).not.toContain(PAYLOAD);
    });

    it('leaves no unbalanced tag that a payload could have opened', async () => {
      const html = await renderNotification({ name: PAYLOAD });

      // The payload's leading `">` would otherwise close an attribute and an
      // element. Counting delimiters proves no extra markup was produced.
      const opens = html.split('<').length - 1;
      const closes = html.split('>').length - 1;
      expect(opens).toBe(closes);
    });

    it('produces no javascript: href from a hostile email or phone', async () => {
      const html = await renderNotification({
        email: 'javascript:alert(1)',
        phone: 'javascript:alert(1)',
      });

      expect(html).not.toContain('href="javascript:');
      expect(html).toContain('href="mailto:"');
      expect(html).toContain('href="tel:"');
    });

    it('keeps an apostrophe in a name readable rather than as raw markup', async () => {
      const html = await renderNotification({ name: "Siobhán O'Brien" });

      // Entity-encoded, which an HTML mail client renders as the glyph.
      expect(html).toContain('O&#39;Brien');
    });

    it('escapes the payload in the daily summary rows as well', async () => {
      await sendDailyLeadSummary([
        {
          name: PAYLOAD,
          email: 'jane@example.com',
          phone: '(770) 555-0188',
          intent: 'buy',
          location: PAYLOAD,
          budget: PAYLOAD,
          createdAt: new Date('2026-03-01T12:00:00.000Z'),
        },
      ]);

      const html = sentEmails[0]!.html;
      expect(html).not.toContain('<script>');
      expect(html).not.toContain(PAYLOAD);
    });
  });

  /**
   * Requirement 5.2 at the service boundary: an absent key surfaces as a thrown
   * MissingEnvError naming the variable, which the route maps to a 503, rather
   * than a logged `false` that reads as an ordinary send failure.
   */
  describe('missing RESEND_API_KEY (Requirement 5.1, 5.2)', () => {
    it('throws an error naming the variable instead of returning false', async () => {
      delete testEnv.RESEND_API_KEY;

      await expect(
        notifyJoeyOfNewLead({ name: 'Jane Doe', email: 'jane@example.com', intent: 'buy' })
      ).rejects.toThrow('RESEND_API_KEY');
    });

    it('sends nothing when the key is absent', async () => {
      delete testEnv.RESEND_API_KEY;

      await notifyJoeyOfNewLead({
        name: 'Jane Doe',
        email: 'jane@example.com',
        intent: 'buy',
      }).catch(() => undefined);

      expect(sentEmails).toHaveLength(0);
    });
  });
});

/**
 * Regression tests for the sending identity.
 *
 * Every outbound email previously failed in production with a Resend 403,
 * because `from` was built from JOEY_EMAIL — a gmail.com address, which Resend
 * will never let you send from. The sender now comes from MAIL_FROM, which is
 * expected to be an address on a verified domain.
 */
describe('outbound sending identity', () => {
  const lead = { name: 'Jane Doe', email: 'jane@example.com', intent: 'buy' };

  it('sends from MAIL_FROM, not from JOEY_EMAIL', async () => {
    await notifyJoeyOfNewLead(lead);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.from).toBe('Joey Oberndorfer <onboarding@resend.dev>');
    expect(sentEmails[0]!.from).not.toContain('joey@gowithjoeyo.com');
  });

  it('keeps the lead as Reply-To on the internal notification, so Joey replies to the lead', async () => {
    await notifyJoeyOfNewLead(lead);

    // Deliberate: the notification goes to Joey, but hitting reply reaches the
    // lead rather than himself. Changing the `from` must not disturb this.
    expect(sentEmails[0]!.to).toBe('joey@gowithjoeyo.com');
    expect(sentEmails[0]!.replyTo).toBe('jane@example.com');
  });

  it('falls back to JOEY_EMAIL for Reply-To when a caller supplies none', async () => {
    await sendEmail({
      to: 'someone@example.com',
      subject: 'no replyTo supplied',
      html: '<p>body</p>',
    });

    expect(sentEmails[0]!.from).toBe('Joey Oberndorfer <onboarding@resend.dev>');
    expect(sentEmails[0]!.replyTo).toBe('joey@gowithjoeyo.com');
  });

  it('honours a verified-domain MAIL_FROM once DNS is in place', async () => {
    testEnv.MAIL_FROM = 'joey@gowithjoeyo.com';

    await notifyJoeyOfNewLead(lead);

    expect(sentEmails[0]!.from).toBe('Joey Oberndorfer <joey@gowithjoeyo.com>');
  });

  it('never sends from a gmail.com address, which Resend cannot verify', async () => {
    testEnv.MAIL_FROM = 'onboarding@resend.dev';
    testEnv.JOEY_EMAIL = 'kfranklin93@gmail.com';

    await notifyJoeyOfNewLead(lead);

    expect(sentEmails[0]!.from).not.toContain('gmail.com');
  });
});

/**
 * The notification previously asserted "An immediate follow-up email has been
 * sent to the lead" unconditionally, while the send ran in parallel and could
 * fail. Joey acted on a claim the system had not verified.
 */
describe('immediate follow-up claim in the notification', () => {
  const lead = { name: 'Jane Doe', email: 'jane@example.com', intent: 'buy' };

  it('confirms the follow-up only when it actually sent', async () => {
    await notifyJoeyOfNewLead(lead, { immediateFollowUpSent: true });

    expect(sentEmails[0]!.html).toContain(
      'An immediate follow-up email has been sent to the lead.'
    );
    expect(sentEmails[0]!.html).not.toContain('did NOT send');
  });

  it('warns Joey to reach out manually when the follow-up failed', async () => {
    await notifyJoeyOfNewLead(lead, { immediateFollowUpSent: false });

    expect(sentEmails[0]!.html).toContain('did NOT send');
    expect(sentEmails[0]!.html).toContain('reach out manually');
    expect(sentEmails[0]!.html).not.toContain(
      'An immediate follow-up email has been sent to the lead.'
    );
  });

  it('claims nothing when the outcome was not supplied', async () => {
    await notifyJoeyOfNewLead(lead);

    expect(sentEmails[0]!.html).not.toContain('has been sent to the lead');
    expect(sentEmails[0]!.html).not.toContain('did NOT send');
  });
});

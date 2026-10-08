import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for booking-link resolution and the places it is rendered.
 *
 * The bug this replaces: two call sites defaulted an absent link to the literal
 * `https://calendly.com/joey`, a URL nobody owns. A deployment that had simply
 * never configured a booking link therefore put a dead link into every
 * follow-up email signature and every SMS, and nothing errored to say so. So
 * the assertions here are mostly negative — the absence of a fabricated URL is
 * the whole point.
 *
 * The second concern is the rename. `CALENDLY_LINK` has to keep working, because
 * a deploy that lands before the Netlify variable is renamed must not silently
 * lose the link.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}
const sentEmails: SentEmail[] = [];

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: SentEmail) => {
        sentEmails.push(payload);
        return { data: { id: 'mock' }, error: null };
      },
    };
  },
}));

const sentSms: { to: string; body: string }[] = [];

vi.mock('twilio', () => ({
  default: () => ({
    messages: {
      create: async ({ to, body }: { to: string; body: string }) => {
        sentSms.push({ to, body });
        return { sid: 'SM_mock' };
      },
    },
  }),
}));

const { bookingLink, bookingLine } = await import('./booking-link');
const { formatEmailWithSignature } = await import('./email-service');
const { sendSMSWithBooking } = await import('./sms-service');

const DEAD_FALLBACK = 'calendly.com/joey';

beforeEach(() => {
  sentEmails.length = 0;
  sentSms.length = 0;
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.JOEY_PHONE = '(770) 555-0100';
  testEnv.JOEY_EMAIL = 'joey@gowithjoeyo.com';
  testEnv.MAIL_FROM = 'joeyo@gowithjoeyo.com';
  testEnv.TWILIO_ACCOUNT_SID = 'AC_test';
  testEnv.TWILIO_AUTH_TOKEN = 'token_test';
  testEnv.TWILIO_PHONE_NUMBER = '+15555550100';

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('bookingLink', () => {
  it('uses BOOKING_LINK when set', () => {
    testEnv.BOOKING_LINK = 'https://calendar.app.google/abc123';

    expect(bookingLink()).toBe('https://calendar.app.google/abc123');
  });

  it('still reads the deprecated CALENDLY_LINK', () => {
    // So a deploy landing before the Netlify rename does not lose the link.
    testEnv.CALENDLY_LINK = 'https://calendly.com/joey-real/intro';

    expect(bookingLink()).toBe('https://calendly.com/joey-real/intro');
  });

  it('prefers the new name when both are set', () => {
    testEnv.BOOKING_LINK = 'https://cal.com/joeyo/intro';
    testEnv.CALENDLY_LINK = 'https://calendly.com/old';

    expect(bookingLink()).toBe('https://cal.com/joeyo/intro');
  });

  it('is undefined when neither is set', () => {
    expect(bookingLink()).toBeUndefined();
  });

  it('treats a blank value as absent', () => {
    // Netlify stores a cleared variable as an empty string, and an empty href is
    // a link to the current page — a button that looks broken rather than
    // missing.
    testEnv.BOOKING_LINK = '   ';

    expect(bookingLink()).toBeUndefined();
  });

  it('never invents a URL', () => {
    expect(bookingLine()).toBe('');
  });
});

describe('the email signature', () => {
  it('invites a booking when a link is configured', () => {
    testEnv.BOOKING_LINK = 'https://calendar.app.google/abc123';

    expect(formatEmailWithSignature('Hey Dana!')).toContain(
      '📅 Book a call: https://calendar.app.google/abc123',
    );
  });

  it('says nothing about booking when no link is configured', () => {
    const signature = formatEmailWithSignature('Hey Dana!');

    expect(signature).not.toContain('Book a call');
    expect(signature).not.toContain(DEAD_FALLBACK);
  });

  it('leaves no gap where the booking line would have been', () => {
    // Assembled from blocks rather than a template literal, so an omitted line
    // does not leave a double blank line in the middle of the signature.
    expect(formatEmailWithSignature('Hey Dana!')).not.toMatch(/\n{3,}/);
  });

  it('keeps the rest of the signature intact either way', () => {
    const withoutLink = formatEmailWithSignature('Hey Dana!');
    testEnv.BOOKING_LINK = 'https://cal.com/joeyo/intro';
    const withLink = formatEmailWithSignature('Hey Dana!');

    for (const signature of [withoutLink, withLink]) {
      expect(signature).toContain('Hey Dana!');
      expect(signature).toContain('Joey Oberndorfer');
      expect(signature).toContain('(770) 555-0100');
      expect(signature).toContain('Atlanta metro area');
    }
  });
});

describe('sendSMSWithBooking', () => {
  it('appends the link when one is configured', async () => {
    testEnv.BOOKING_LINK = 'https://cal.com/joeyo/intro';

    await sendSMSWithBooking('+15555551234', 'Great talking to you.');

    expect(sentSms[0]!.body).toContain('https://cal.com/joeyo/intro');
  });

  it('sends the message alone when none is', async () => {
    // A text is the worst place for a dead link: there is no surrounding
    // context to explain it.
    await sendSMSWithBooking('+15555551234', 'Great talking to you.');

    expect(sentSms[0]!.body).toBe('Great talking to you.');
    expect(sentSms[0]!.body).not.toContain(DEAD_FALLBACK);
  });
});

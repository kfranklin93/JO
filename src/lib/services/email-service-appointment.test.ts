import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two appointment emails.
 *
 * Neither existed. A booking made through the assistant wrote a row and told
 * nobody: the client got no confirmation, and Joey — who gets a new-lead email —
 * got nothing saying an appointment now existed or when it was. The assistant
 * meanwhile told a client a confirmation email was on its way, which is the
 * claim that started this.
 *
 * So two properties are load-bearing here and neither is about the HTML.
 *
 * The first is that these functions report what happened and never throw. They
 * run after the appointment row has committed, so an exception escaping either
 * one would be caught by the booking service's insert handler and reported to
 * the client as a failed booking — a booking that happened, denied.
 *
 * The second is that no claim outruns the fact. A suppressed address and a
 * provider rejection are different outcomes from a successful send, and the
 * caller has to be able to tell all three apart.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

/** Whether this address has opted out, and whether the list can be read. */
let suppressed = false;
let suppressionThrows = false;
const isSuppressed = vi.fn(async (_email: string) => {
  if (suppressionThrows) throw new Error('relation "email_opt_outs" does not exist');
  return suppressed;
});
vi.mock('@/lib/services/email-preferences', () => ({
  isSuppressed,
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

interface SentEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

const sentEmails: SentEmail[] = [];

/** How Resend answers. `error` is the shape an unverified domain produces. */
let sendOutcome: 'ok' | 'error' | 'throw' = 'ok';

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: SentEmail) => {
        if (sendOutcome === 'throw') throw new Error('network reset');
        sentEmails.push(payload);
        if (sendOutcome === 'error') {
          return { data: null, error: { message: 'domain is not verified' } };
        }
        return { data: { id: 'mock-email-id' }, error: null };
      },
    };
  },
}));

const { notifyJoeyOfAppointment, sendAppointmentConfirmation } = await import(
  './email-service'
);

/** 19:00 UTC on a Thursday in March — 3:00 PM Eastern. */
const STARTS_AT = new Date('2026-03-12T19:00:00.000Z');

const LEAD = {
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  phone: '(770) 555-0188',
  intent: 'buy',
  notes: 'Looking for a three-bed near the lake, moving in the spring.',
};

function details(overrides: Record<string, unknown> = {}) {
  return {
    startsAt: STARTS_AT,
    channel: 'phone',
    lead: { ...LEAD, ...(overrides.lead as object | undefined) },
    ...overrides,
  } as Parameters<typeof sendAppointmentConfirmation>[0];
}

beforeEach(() => {
  sentEmails.length = 0;
  suppressed = false;
  suppressionThrows = false;
  sendOutcome = 'ok';
  isSuppressed.mockClear();

  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.RESEND_API_KEY = 're_test_key';
  testEnv.JOEY_EMAIL = 'joey@gowithjoeyo.com';
  testEnv.JOEY_PHONE = '(770) 555-0100';
  testEnv.MAIL_FROM = 'joeyo@gowithjoeyo.com';
  testEnv.NEXT_PUBLIC_SITE_URL = 'https://gowithjoeyo.com';

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sendAppointmentConfirmation — what the client is told', () => {
  it('names the time in Joey’s zone, spelled the way the assistant said it', async () => {
    // The same label the assistant read out and the dashboard shows. If this
    // disagreed by an hour, somebody would miss a call.
    expect(await sendAppointmentConfirmation(details())).toBe('sent');

    const { html, text } = sentEmails[0]!;
    expect(html).toContain('Thursday, March 12 at 3:00 PM Eastern Time');
    expect(text).toContain('Thursday, March 12 at 3:00 PM Eastern Time');
    expect(html).not.toContain('7:00 PM');
  });

  it('says how long it is and how it happens', async () => {
    await sendAppointmentConfirmation(details());

    expect(sentEmails[0]!.html).toContain('15 minutes');
    expect(sentEmails[0]!.html).toContain('phone call');
    expect(sentEmails[0]!.subject).toContain('15-minute');
  });

  it('describes a video booking as a video call', async () => {
    await sendAppointmentConfirmation(details({ channel: 'video' }));

    expect(sentEmails[0]!.html).toContain('video call');
  });

  it('tells them how to reach Joey', async () => {
    await sendAppointmentConfirmation(details());

    const { html } = sentEmails[0]!;
    expect(html).toContain('href="mailto:joey@gowithjoeyo.com"');
    expect(html).toContain('href="tel:7705550100"');
  });

  it('reads the phone from the same place the signature does', async () => {
    // Production JOEY_PHONE and the value in src/config/site.ts currently
    // disagree. Sourcing it from the environment, as formatEmailWithSignature
    // does, keeps that one thing to fix rather than two.
    testEnv.JOEY_PHONE = '6789749864';

    await sendAppointmentConfirmation(details());

    expect(sentEmails[0]!.html).toContain('6789749864');
    expect(sentEmails[0]!.text).toContain('6789749864');
  });

  it('greets somebody with no name on file without a placeholder', async () => {
    await sendAppointmentConfirmation(details({ lead: { ...LEAD, name: null } }));

    expect(sentEmails[0]!.html).toContain('Hi there,');
    expect(sentEmails[0]!.html).not.toContain('null');
  });

  it('sends from the verified domain, not from Joey’s own inbox', async () => {
    await sendAppointmentConfirmation(details());

    expect(sentEmails[0]!.from).toBe('Joey Oberndorfer <joeyo@gowithjoeyo.com>');
    expect(sentEmails[0]!.to).toBe('dana@example.com');
  });
});

/**
 * Lead-supplied text in an email Joey or a client will open in a mail client
 * that renders HTML. Same hardening as the lead notification, reusing the same
 * helpers rather than a second implementation of them.
 */
describe('appointment emails — lead-supplied text is inert', () => {
  const PAYLOAD = '"><script>alert(1)</script>';

  it('renders a hostile name as text in the client confirmation', async () => {
    await sendAppointmentConfirmation(details({ lead: { ...LEAD, name: PAYLOAD } }));

    const { html } = sentEmails[0]!;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain(PAYLOAD);
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders every lead-derived field inert in Joey’s notification', async () => {
    await notifyJoeyOfAppointment(
      details({ lead: { ...LEAD, name: PAYLOAD, intent: PAYLOAD, notes: PAYLOAD } }),
    );

    const { html } = sentEmails[0]!;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain(PAYLOAD);
  });

  it('leaves no unbalanced tag a payload could have opened', async () => {
    await notifyJoeyOfAppointment(details({ lead: { ...LEAD, name: PAYLOAD } }));

    const { html } = sentEmails[0]!;
    expect(html.split('<').length - 1).toBe(html.split('>').length - 1);
  });

  it('produces no javascript: href from a hostile email or phone', async () => {
    await notifyJoeyOfAppointment(
      details({
        lead: { ...LEAD, email: 'javascript:alert(1)', phone: 'javascript:alert(1)' },
      }),
    );

    const { html } = sentEmails[0]!;
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="mailto:"');
  });

  it('keeps an apostrophe in a name readable', async () => {
    await notifyJoeyOfAppointment(
      details({ lead: { ...LEAD, name: "Siobhán O'Brien" } }),
    );

    expect(sentEmails[0]!.html).toContain('O&#39;Brien');
  });
});

describe('notifyJoeyOfAppointment — what Joey is told', () => {
  it('gives him the time, the client and their contact details', async () => {
    expect(await notifyJoeyOfAppointment(details())).toBe(true);

    const { html, subject, to, replyTo } = sentEmails[0]!;
    expect(to).toBe('joey@gowithjoeyo.com');
    expect(html).toContain('Thursday, March 12 at 3:00 PM Eastern Time');
    expect(html).toContain('Dana Whitfield');
    expect(html).toContain('dana@example.com');
    expect(html).toContain('(770) 555-0188');
    expect(subject).toContain('Dana Whitfield');
    // Reply reaches the client, matching the new-lead notification.
    expect(replyTo).toBe('dana@example.com');
  });

  it('carries their stated intent and their own words', async () => {
    await notifyJoeyOfAppointment(details());

    const { html } = sentEmails[0]!;
    expect(html).toContain('buy');
    expect(html).toContain('three-bed near the lake');
  });

  it('says a detail is missing rather than leaving a blank line', async () => {
    await notifyJoeyOfAppointment(
      details({ lead: { ...LEAD, name: null, phone: null, notes: null } }),
    );

    const { html, subject } = sentEmails[0]!;
    expect(html).toContain('Not given');
    expect(html).not.toContain('null');
    // With no name, the subject still has to identify somebody.
    expect(subject).toContain('dana@example.com');
  });

  it('puts the time in the subject so his inbox is sortable at a glance', async () => {
    await notifyJoeyOfAppointment(details());

    expect(sentEmails[0]!.subject).toContain('Mar 12');
    expect(sentEmails[0]!.subject).toContain('3:00 PM');
  });

  it('is not gated on the client’s opt-out', async () => {
    // Joey is not a recipient of marketing. A client's unsubscribe must not be
    // able to stop him hearing that somebody booked his time.
    suppressed = true;

    expect(await notifyJoeyOfAppointment(details())).toBe(true);
    expect(sentEmails).toHaveLength(1);
  });
});

/**
 * The outcome, which is the thing the assistant's wording hangs off. Reporting
 * `'sent'` for any of these would put the original lie back in place.
 */
describe('the confirmation outcome is the truth, not an assumption', () => {
  it('reports sent only when the provider accepted it', async () => {
    expect(await sendAppointmentConfirmation(details())).toBe('sent');
  });

  it('reports failed when the provider rejects the send', async () => {
    // What an unverified sending domain looks like from here.
    sendOutcome = 'error';

    expect(await sendAppointmentConfirmation(details())).toBe('failed');
  });

  it('reports failed rather than throwing when the transport dies', async () => {
    sendOutcome = 'throw';

    expect(await sendAppointmentConfirmation(details())).toBe('failed');
  });

  it('reports failed rather than throwing when the API key is missing', async () => {
    // `sendEmail` asserts the key with requireEnv, which throws. That exception
    // must not escape: the appointment row is already committed, and the
    // booking service would report a committed booking as `unavailable`.
    delete testEnv.RESEND_API_KEY;

    expect(await sendAppointmentConfirmation(details())).toBe('failed');
    expect(sentEmails).toHaveLength(0);
  });

  it('never throws from Joey’s notification either', async () => {
    delete testEnv.RESEND_API_KEY;

    expect(await notifyJoeyOfAppointment(details())).toBe(false);
  });

  it('logs a rejected send rather than swallowing it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendOutcome = 'throw';

    await sendAppointmentConfirmation(details());

    expect(error).toHaveBeenCalled();
  });
});

/**
 * Opt-out handling, and the judgement behind it.
 *
 * A booking confirmation is transactional, and an argument exists for sending
 * it over an opt-out. The decision here is not to: we were asked to stop, and
 * the time was already said out loud in the conversation. What makes that safe
 * is that the outcome is reported rather than hidden — the assistant says
 * plainly that no email was sent — and Joey's own notification still goes, so
 * he knows to expect them.
 */
describe('a client who has asked us to stop emailing', () => {
  beforeEach(() => {
    suppressed = true;
  });

  it('is not emailed', async () => {
    expect(await sendAppointmentConfirmation(details())).toBe('suppressed');
    expect(sentEmails).toHaveLength(0);
  });

  it('is reported as suppressed, not as sent and not as failed', async () => {
    // Three distinct outcomes because the assistant says something different
    // for each. Collapsing suppressed into sent is the lie; collapsing it into
    // failed would have Joey chasing a provider problem that does not exist.
    const outcome = await sendAppointmentConfirmation(details());

    expect(outcome).not.toBe('sent');
    expect(outcome).not.toBe('failed');
  });

  it('is checked against the normalised address', async () => {
    await sendAppointmentConfirmation(details({ lead: { ...LEAD, email: 'Dana@Example.com' } }));

    expect(isSuppressed).toHaveBeenCalledWith('Dana@Example.com');
  });

  it('fails closed when the opt-out list cannot be read', async () => {
    // An unreadable list and an empty list are indistinguishable, so the only
    // safe reading of "I don't know" is "don't send" — and the caller is told
    // `failed` rather than `sent`.
    suppressionThrows = true;

    expect(await sendAppointmentConfirmation(details())).toBe('failed');
    expect(sentEmails).toHaveLength(0);
  });
});

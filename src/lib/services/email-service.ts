import { Resend } from 'resend';
import { env } from '@/config/env';
import { escapeHtml, escapeAttr, safeMailto, safeTel } from '@/lib/utils/escape';
import { requireEnv } from '@/lib/utils/require-env';
import { createUnsubscribeToken } from '@/lib/auth/unsubscribe-token';
import { isSuppressed, normalizeEmail } from '@/lib/services/email-preferences';
import { bookingLine } from '@/lib/services/booking-link';
import { SLOT_MINUTES } from '@/lib/services/availability';
import {
  describeSlot,
  describeSlotDay,
  describeSlotShort,
} from '@/lib/services/slot-label';

// Initialize Resend client
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient && env.RESEND_API_KEY) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  if (!resendClient) {
    throw new Error('Resend API key not configured');
  }
  return resendClient;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /**
   * Extra SMTP headers.
   *
   * Added for `List-Unsubscribe` and `List-Unsubscribe-Post`, which are what
   * Gmail and Outlook read to offer their own unsubscribe button. Both are
   * required together: the header alone, without the POST form, does not
   * qualify as one-click and the mailbox provider ignores it.
   */
  headers?: Record<string, string>;
}

/**
 * Send an email using Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  // Asserted outside the try on purpose. A missing key is a configuration gap,
  // not a send failure, so it propagates as a MissingEnvError naming the
  // variable instead of being logged and reported as an ordinary `false`.
  requireEnv('RESEND_API_KEY');

  try {
    const resend = getResendClient();
    
    const emailData: any = {
      // The sending identity must be on a Resend-verified domain, so it comes
      // from MAIL_FROM rather than JOEY_EMAIL. Replies still route to Joey.
      from: `Joey Oberndorfer <${env.MAIL_FROM}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo || env.JOEY_EMAIL,
    };
    
    if (options.text) {
      emailData.text = options.text;
    }

    if (options.headers) {
      emailData.headers = options.headers;
    }

    const { data, error } = await resend.emails.send(emailData);

    if (error) {
      console.error('Email send error:', error);
      return false;
    }

    console.log('Email sent successfully:', data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

/**
 * Format email content with Joey's signature
 */
export function formatEmailWithSignature(content: string): string {
  // Assembled as blocks so an absent booking line leaves no double gap. The
  // line is omitted entirely when no link is configured — this used to default
  // to `https://calendly.com/joey`, a URL nobody owns, so every signature
  // carried a dead link and nothing errored to say so.
  const blocks = [
    content,
    `Joey Oberndorfer
Real Estate Agent
${env.JOEY_PHONE}
${env.JOEY_EMAIL}`,
    bookingLine(),
    'Helping families find their perfect home in the Atlanta metro area.',
  ];

  return blocks.filter((block) => block.trim().length > 0).join('\n\n');
}

/**
 * Convert plain text email to HTML
 */
export function textToHtml(text: string): string {
  // Escape the text first, then apply markup
  const escaped = escapeHtml(text);
  return escaped
    .split('\n\n')
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * The unsubscribe URL for an address.
 *
 * Absolute, because it lives in an email — a relative path has nothing to
 * resolve against in a mail client.
 */
function unsubscribeUrl(email: string): string {
  const token = createUnsubscribeToken(normalizeEmail(email));
  return `${env.NEXT_PUBLIC_SITE_URL}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Send a follow-up email to a lead.
 *
 * This is the only function in the codebase that mails a client, which is why
 * the opt-out check lives here and nowhere else. Joey's own notifications —
 * `notifyJoeyOfNewLead` and `sendDailyLeadSummary` — call `sendEmail` directly,
 * so they are structurally incapable of being suppressed by a client's
 * unsubscribe. Putting the check in `sendEmail` instead would have stopped Joey
 * hearing about his own leads.
 *
 * Fails closed: if the suppression list cannot be read, nothing is sent and the
 * error propagates. See src/lib/services/email-preferences.ts for why that
 * asymmetry is deliberate, and for the one deployment-ordering rule it implies.
 *
 * @throws {SuppressionUnavailableError} When the opt-out list cannot be read.
 */
export async function sendFollowUpEmail(
  to: string,
  subject: string,
  content: string
): Promise<boolean> {
  if (await isSuppressed(to)) {
    // Not a failure. The system did the right thing, and saying so plainly
    // means a quiet drip can be explained without reading code.
    console.log(`[email] suppressed, not sending "${subject}" to ${normalizeEmail(to)}`);
    return true;
  }

  const formattedContent = formatEmailWithSignature(content);
  const url = unsubscribeUrl(to);

  // The footer is appended to the HTML *after* textToHtml, not folded into the
  // text body, because textToHtml escapes everything it is given — an anchor
  // tag passed through it would render as visible markup.
  const html =
    textToHtml(formattedContent) +
    `\n<p style="margin-top:24px;font-size:12px;color:#707070">` +
    `<a href="${escapeAttr(url)}" style="color:#707070">Unsubscribe from these emails</a>` +
    `</p>`;

  return sendEmail({
    to,
    subject,
    html,
    text: `${formattedContent}\n\nUnsubscribe: ${url}`,
    headers: {
      'List-Unsubscribe': `<${url}>`,
      // Declares that the URL accepts a POST, which is what makes this
      // one-click under RFC 8058. Without it Gmail will not show its own
      // unsubscribe control.
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

/**
 * What happened to a client's appointment confirmation.
 *
 * Four values rather than a boolean because the assistant has to say something
 * different for each, and because `false` was being read as "probably sent".
 * `'not_attempted'` is the idempotent rebooking case: the row already existed,
 * so no second confirmation went out and no claim may be made about one.
 */
export type ConfirmationOutcome = 'sent' | 'suppressed' | 'failed' | 'not_attempted';

/** The client an appointment belongs to, as the two templates below need them. */
export interface AppointmentEmailLead {
  name: string | null;
  email: string;
  phone: string | null;
  /** Their stated goal, already normalised to the canonical intent vocabulary. */
  intent: string;
  /** What they said in their own words, if anything. */
  notes: string | null;
}

/** One booking, in the shape the appointment emails render. */
export interface AppointmentEmailDetails {
  startsAt: Date;
  /** `phone`, `video` or `in_person`. */
  channel: string;
  lead: AppointmentEmailLead;
}

/** How the consultation happens, as a person would say it. */
function channelPhrase(channel: string): string {
  if (channel === 'video') return 'video call';
  if (channel === 'in_person') return 'in-person meeting';
  return 'phone call';
}

/**
 * Confirm a booking to the client.
 *
 * Sent after the appointment row is committed, so this cannot and must not
 * affect whether the booking stands. It returns what happened instead of
 * throwing, and the assistant keys its wording off that — the failure that
 * prompted this function was the assistant telling a client a confirmation
 * email was on its way when no email code existed at all.
 *
 * Honours the opt-out list, for the same reason `sendFollowUpEmail` does and
 * with the same consequence: somebody who asked us to stop emailing gets
 * `'suppressed'`, not a confirmation. The judgement is deliberate. A booking
 * confirmation is transactional and a narrow argument could be made for
 * overriding an opt-out, but the honest position is that we were asked to stop
 * and the time was already spoken aloud in the conversation — so the right
 * answer is to say plainly that no email was sent rather than to send one
 * anyway. Joey's notification is unaffected, so he still knows to expect them.
 *
 * Fails closed when the suppression list cannot be read, which reports
 * `'failed'` rather than sending blind.
 */
export async function sendAppointmentConfirmation(
  details: AppointmentEmailDetails,
): Promise<ConfirmationOutcome> {
  const { lead, startsAt } = details;
  const when = describeSlot(startsAt);

  try {
    if (await isSuppressed(lead.email)) {
      console.log(
        `[email] suppressed, no appointment confirmation to ${normalizeEmail(lead.email)}`,
      );
      return 'suppressed';
    }
  } catch (err) {
    console.error('[email] could not check the opt-out list, so nothing was sent:', err);
    return 'failed';
  }

  const greeting = lead.name ? `Hi ${lead.name},` : 'Hi there,';

  // Built as text and escaped on the way into HTML, which is how the follow-up
  // path handles lead-supplied names too. The only interpolation is the name.
  const body = `${greeting}

You're booked in with Joey. Here are the details:

When: ${when}
How long: ${SLOT_MINUTES} minutes
Format: ${channelPhrase(details.channel)}

If you need to move it or something comes up, just reply to this email or call
and we'll sort it out.`;

  const formatted = formatEmailWithSignature(body);

  // Joey's own contact details, not the lead's — but still run through the
  // link sanitisers rather than interpolated raw, so a mistyped environment
  // variable cannot produce an active href. No unsubscribe footer: this is a
  // transactional confirmation for something the client just asked for, and
  // anyone who had opted out was already turned away above.
  const mail = safeMailto(env.JOEY_EMAIL);
  const tel = safeTel(env.JOEY_PHONE);
  const contact = [
    mail
      ? `<a href="mailto:${escapeAttr(mail)}">${escapeHtml(env.JOEY_EMAIL)}</a>`
      : '',
    tel ? `<a href="tel:${escapeAttr(tel)}">${escapeHtml(env.JOEY_PHONE)}</a>` : '',
  ].filter(Boolean);

  const html =
    `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">` +
    `<h2>Your consultation is confirmed</h2>` +
    `<p>${escapeHtml(greeting)}</p>` +
    `<p><strong>When:</strong> ${escapeHtml(when)}<br>` +
    `<strong>How long:</strong> ${SLOT_MINUTES} minutes<br>` +
    `<strong>Format:</strong> ${escapeHtml(channelPhrase(details.channel))}</p>` +
    `<p>Need to move it? Reply to this email` +
    (contact.length > 0 ? ` or reach Joey at ${contact.join(' or ')}` : '') +
    `.</p>` +
    `<hr>` +
    textToHtml(formatEmailWithSignature('')) +
    `</div>`;

  try {
    const sent = await sendEmail({
      to: lead.email,
      subject: `Confirmed: your ${SLOT_MINUTES}-minute consultation on ${describeSlotDay(startsAt)}`,
      html,
      text: formatted,
    });

    return sent ? 'sent' : 'failed';
  } catch (err) {
    // A missing RESEND_API_KEY throws, and an unverified sending domain fails.
    // Neither may reach the caller as an exception: the appointment is already
    // in the database.
    console.error('[email] appointment confirmation did not send:', err);
    return 'failed';
  }
}

/**
 * Tell Joey an appointment exists.
 *
 * He was getting `notifyJoeyOfNewLead` and nothing else, so a booking made
 * through the assistant reached his calendar without reaching him. The time,
 * who it is with, how to contact them and what they want — enough to pick up
 * the phone without opening the dashboard.
 *
 * Never throws, for the same reason as the confirmation above.
 */
export async function notifyJoeyOfAppointment(
  details: AppointmentEmailDetails,
): Promise<boolean> {
  const { lead, startsAt } = details;
  const when = describeSlot(startsAt);
  const who = lead.name ?? lead.email;

  const mail = safeMailto(lead.email);
  const tel = safeTel(lead.phone);

  const rows = [
    `<h2>New appointment booked</h2>`,
    `<p><strong>When:</strong> ${escapeHtml(when)} (${SLOT_MINUTES} minutes)</p>`,
    `<p><strong>Format:</strong> ${escapeHtml(channelPhrase(details.channel))}</p>`,
    `<p><strong>Name:</strong> ${escapeHtml(lead.name ?? 'Not given')}</p>`,
    `<p><strong>Email:</strong> <a href="mailto:${escapeAttr(mail)}">${escapeHtml(lead.email)}</a></p>`,
    lead.phone
      ? `<p><strong>Phone:</strong> <a href="tel:${escapeAttr(tel)}">${escapeHtml(lead.phone)}</a></p>`
      : `<p><strong>Phone:</strong> Not given</p>`,
    `<p><strong>They want:</strong> ${escapeHtml(lead.intent)}</p>`,
    lead.notes ? `<p><strong>In their words:</strong> ${escapeHtml(lead.notes)}</p>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    return await sendEmail({
      to: env.JOEY_EMAIL,
      subject: `📅 ${describeSlotShort(startsAt)} — consultation with ${who}`,
      html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${rows}
    </div>
  `,
      replyTo: lead.email,
    });
  } catch (err) {
    console.error('[email] appointment notification to Joey did not send:', err);
    return false;
  }
}

/**
 * Send Joey a notification about a new lead
 */
export async function notifyJoeyOfNewLead(lead: {
  name: string;
  email: string;
  phone?: string;
  intent: string;
  budget?: string;
  timeline?: string;
  location?: string;
  additionalNotes?: string;
}, options?: {
  /**
   * Whether the immediate follow-up to the lead actually sent.
   *
   * Omit when the outcome is not known at the time of notification. This
   * previously read as an unconditional claim that a follow-up had been sent,
   * which was false whenever the send failed — and it fails whenever Bedrock is
   * unconfigured. Joey would then chase a lead believing they had already been
   * contacted, or leave them alone believing the drip had it covered.
   */
  immediateFollowUpSent?: boolean;
}): Promise<boolean> {
  const subject = `🎯 New ${escapeHtml(lead.intent).toUpperCase()} Lead: ${escapeHtml(lead.name)}`;

  const followUpNote =
    options?.immediateFollowUpSent === true
      ? `<p><em>An immediate follow-up email has been sent to the lead.</em></p>`
      : options?.immediateFollowUpSent === false
        ? `<p><strong>⚠️ The immediate follow-up email did NOT send.</strong> This lead has not heard from us — reach out manually.</p>`
        : '';
  
  const details = [
    `<h2>New Lead Submitted</h2>`,
    `<p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>`,
    `<p><strong>Email:</strong> <a href="mailto:${escapeAttr(safeMailto(lead.email))}">${escapeHtml(lead.email)}</a></p>`,
    lead.phone ? `<p><strong>Phone:</strong> <a href="tel:${escapeAttr(safeTel(lead.phone))}">${escapeHtml(lead.phone)}</a></p>` : '',
    `<p><strong>Intent:</strong> ${escapeHtml(lead.intent)}</p>`,
    lead.location ? `<p><strong>Location:</strong> ${escapeHtml(lead.location)}</p>` : '',
    lead.budget ? `<p><strong>Budget:</strong> ${escapeHtml(lead.budget)}</p>` : '',
    lead.timeline ? `<p><strong>Timeline:</strong> ${escapeHtml(lead.timeline)}</p>` : '',
    lead.additionalNotes ? `<p><strong>Notes:</strong> ${escapeHtml(lead.additionalNotes)}</p>` : '',
    `<hr>`,
    followUpNote,
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${details}
    </div>
  `;

  return sendEmail({
    to: env.JOEY_EMAIL,
    subject,
    html,
    replyTo: lead.email,
  });
}

/**
 * Send Joey a daily summary of all leads from the previous day
 */
export async function sendDailyLeadSummary(leads: Array<{
  name: string;
  email: string;
  phone?: string;
  intent: string;
  budget?: string;
  timeline?: string;
  location?: string;
  createdAt: Date;
}>): Promise<boolean> {
  if (leads.length === 0) {
    // No leads yesterday, send a simple notification
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>📊 Daily Lead Summary</h2>
        <p>No new leads were submitted yesterday.</p>
        <p><em>Keep up the great work! Leads will come.</em></p>
      </div>
    `;

    return sendEmail({
      to: env.JOEY_EMAIL,
      subject: '📊 Daily Lead Summary - No New Leads',
      html,
    });
  }

  // Group leads by intent
  const leadsByIntent = leads.reduce((acc, lead) => {
    if (!acc[lead.intent]) {
      acc[lead.intent] = [];
    }
    acc[lead.intent]!.push(lead);
    return acc;
  }, {} as Record<string, typeof leads>);

  // Build summary HTML
  const summaryRows = leads.map((lead, index) => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px 8px;">${index + 1}</td>
      <td style="padding: 12px 8px;"><strong>${escapeHtml(lead.name)}</strong></td>
      <td style="padding: 12px 8px;">
        <a href="mailto:${escapeAttr(safeMailto(lead.email))}">${escapeHtml(lead.email)}</a>
        ${lead.phone ? `<br><a href="tel:${escapeAttr(safeTel(lead.phone))}">${escapeHtml(lead.phone)}</a>` : ''}
      </td>
      <td style="padding: 12px 8px;">
        <span style="background: #e3f2fd; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
          ${escapeHtml(lead.intent).toUpperCase()}
        </span>
      </td>
      <td style="padding: 12px 8px;">
        ${lead.location ? escapeHtml(lead.location) : '-'}<br>
        ${lead.budget ? escapeHtml(lead.budget) : '-'}
      </td>
      <td style="padding: 12px 8px; font-size: 12px; color: #666;">
        ${new Date(lead.createdAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })}
      </td>
    </tr>
  `).join('');

  const intentSummary = Object.entries(leadsByIntent)
    .map(([intent, intentLeads]) =>
      `<li><strong>${escapeHtml(intent).toUpperCase()}:</strong> ${intentLeads.length}</li>`
    )
    .join('');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h2 style="color: #1976d2;">📊 Daily Lead Summary</h2>
      <p style="color: #666; font-size: 14px;">${dateStr}</p>
      
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Summary</h3>
        <p style="font-size: 24px; font-weight: bold; margin: 8px 0;">${leads.length} New Lead${leads.length > 1 ? 's' : ''}</p>
        <ul style="margin: 8px 0; padding-left: 20px;">
          ${intentSummary}
        </ul>
      </div>

      <h3>Lead Details</h3>
      <table style="width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
            <th style="padding: 12px 8px; text-align: left;">#</th>
            <th style="padding: 12px 8px; text-align: left;">Name</th>
            <th style="padding: 12px 8px; text-align: left;">Contact</th>
            <th style="padding: 12px 8px; text-align: left;">Intent</th>
            <th style="padding: 12px 8px; text-align: left;">Details</th>
            <th style="padding: 12px 8px; text-align: left;">Time</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows}
        </tbody>
      </table>

      <div style="margin-top: 24px; padding: 16px; background: #e8f5e9; border-radius: 8px;">
        <p style="margin: 0; color: #2e7d32;">
          ✅ All leads have been sent immediate follow-up emails and synced to Lofty CRM.
        </p>
      </div>
    </div>
  `;

  return sendEmail({
    to: env.JOEY_EMAIL,
    subject: `📊 Daily Lead Summary - ${leads.length} New Lead${leads.length > 1 ? 's' : ''}`,
    html,
  });
}


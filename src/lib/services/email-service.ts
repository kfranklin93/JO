import { Resend } from 'resend';
import { env } from '@/config/env';
import { escapeHtml, escapeAttr, safeMailto, safeTel } from '@/lib/utils/escape';
import { requireEnv } from '@/lib/utils/require-env';

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
      from: `Joey Oberndorfer <${env.JOEY_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo || env.JOEY_EMAIL,
    };
    
    if (options.text) {
      emailData.text = options.text;
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
  const calendlyLink = env.CALENDLY_LINK || 'https://calendly.com/joey';
  
  return `${content}

Joey Oberndorfer
Real Estate Agent
${env.JOEY_PHONE}
${env.JOEY_EMAIL}

📅 Book a call: ${calendlyLink}

Helping families find their perfect home in the Atlanta metro area.`;
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
 * Send a follow-up email to a lead
 */
export async function sendFollowUpEmail(
  to: string,
  subject: string,
  content: string
): Promise<boolean> {
  const formattedContent = formatEmailWithSignature(content);
  const html = textToHtml(formattedContent);

  return sendEmail({
    to,
    subject,
    html,
    text: formattedContent,
  });
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
}): Promise<boolean> {
  const subject = `🎯 New ${escapeHtml(lead.intent).toUpperCase()} Lead: ${escapeHtml(lead.name)}`;
  
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
    `<p><em>An immediate follow-up email has been sent to the lead.</em></p>`,
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


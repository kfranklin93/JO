import { sendFollowUpEmail } from '@/lib/services/email-service';
import { getContentSource, type FollowUpType } from '@/lib/services/follow-up-content';
import type { LeadIntentValue } from '@/lib/validation/lead';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /**
   * Sourced from the canonical set in src/lib/validation/lead.ts rather than
   * redeclared here.
   *
   * This union previously listed only buy / sell / insurance / closing, while
   * the UI has always offered `general` as well — which is why
   * api/cron/follow-ups/route.ts casts `'general'` into it. Referencing the
   * validated set means the two cannot drift apart again.
   */
  intent: LeadIntentValue;
  budget?: string;
  timeline?: string;
  location?: string;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  additionalNotes?: string;
  createdAt: Date;
  lastContactedAt?: Date;
  status: 'new' | 'contacted' | 'engaged' | 'qualified' | 'closed' | 'inactive';
}

export interface FollowUpSchedule {
  leadId: string;
  type: FollowUpType;
  scheduledFor: Date;
  sent: boolean;
}

/**
 * Outcome of a single send attempt.
 *
 * A bare boolean is why `failureReason` in the database was the generic
 * 'Send failed' for every failure: the caller had no way to learn what went
 * wrong. The reason travels with the result so it can be recorded.
 */
export type SendResult = { ok: true } | { ok: false; reason: string };

/**
 * Generate and send a follow-up email.
 *
 * Content comes from whichever source is configured — templates by default, so
 * this no longer depends on Bedrock. Previously every touchpoint called the
 * model directly, meaning absent AWS credentials stopped the whole sequence.
 */
export async function sendFollowUp(
  lead: Lead,
  type: FollowUpType
): Promise<SendResult> {
  const source = getContentSource();

  let subject: string;
  let body: string;

  // Content generation and delivery fail for different reasons and the
  // distinction matters when deciding whether a retry is worthwhile, so they
  // are reported separately.
  try {
    const content = await source.generate(lead, type);
    subject = content.subject;
    body = content.body;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `content:${source.name}: ${detail}` };
  }

  try {
    const sent = await sendFollowUpEmail(lead.email, subject, body);

    if (!sent) {
      return { ok: false, reason: 'email: Resend rejected the message' };
    }

    console.log(`Follow-up sent to ${lead.email} (${type}, via ${source.name})`);
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `email: ${detail}` };
  }
}

/**
 * Send the immediate follow-up when a new lead is created.
 */
export async function sendImmediateFollowUp(lead: Lead): Promise<SendResult> {
  return sendFollowUp(lead, 'immediate');
}

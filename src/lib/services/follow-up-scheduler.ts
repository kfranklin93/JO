import { generateJoeyEmail } from '@/lib/api/bedrock';
import { sendFollowUpEmail } from '@/lib/services/email-service';
import {
  JOEY_PERSONALITY,
  FOLLOW_UP_PROMPTS,
  fillPromptTemplate,
  formatLeadContext,
} from '@/lib/prompts/joey-voice';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  intent: 'buy' | 'sell' | 'insurance' | 'closing';
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
  type: 'immediate' | 'day3' | 'day7' | 'day14' | 'day30' | 'pastClient60';
  scheduledFor: Date;
  sent: boolean;
}

/**
 * Calculate when follow-ups should be sent
 */
export function calculateFollowUpSchedule(lead: Lead): FollowUpSchedule[] {
  const now = new Date();
  const createdAt = new Date(lead.createdAt);
  
  return [
    {
      leadId: lead.id,
      type: 'immediate',
      scheduledFor: createdAt,
      sent: false,
    },
    {
      leadId: lead.id,
      type: 'day3',
      scheduledFor: new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000),
      sent: false,
    },
    {
      leadId: lead.id,
      type: 'day7',
      scheduledFor: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      sent: false,
    },
    {
      leadId: lead.id,
      type: 'day14',
      scheduledFor: new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000),
      sent: false,
    },
    {
      leadId: lead.id,
      type: 'day30',
      scheduledFor: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      sent: false,
    },
  ];
}

/**
 * Generate and send a follow-up email
 */
export async function sendFollowUp(
  lead: Lead,
  type: FollowUpSchedule['type'],
  previousMessage?: string
): Promise<boolean> {
  try {
    // Get the appropriate prompt template
    const promptTemplate = FOLLOW_UP_PROMPTS[type];
    if (!promptTemplate) {
      console.error(`Unknown follow-up type: ${type}`);
      return false;
    }

    // Format lead context
    const leadContext = formatLeadContext(lead);

    // Fill in the prompt template
    const prompt = fillPromptTemplate(promptTemplate, {
      name: lead.name,
      intent: lead.intent,
      details: leadContext,
      area: lead.location || 'Atlanta metro area',
      previousMessage: previousMessage || 'N/A',
      history: 'Initial contact',
    });

    // Generate email content using AI
    const emailContent = await generateJoeyEmail(prompt, JOEY_PERSONALITY);

    // Extract subject line (first line) and body
    const lines = emailContent.trim().split('\n');
    const subject = getSubjectForFollowUpType(type, lead);
    const body = emailContent;

    // Send the email
    const sent = await sendFollowUpEmail(lead.email, subject, body);

    if (sent) {
      console.log(`Follow-up sent to ${lead.email} (${type})`);
    }

    return sent;
  } catch (error) {
    console.error(`Failed to send follow-up to ${lead.email}:`, error);
    return false;
  }
}

/**
 * Get email subject based on follow-up type
 */
function getSubjectForFollowUpType(
  type: FollowUpSchedule['type'],
  lead: Lead
): string {
  const subjects = {
    immediate: `Thanks for reaching out, ${lead.name}!`,
    day3: `Quick check-in, ${lead.name}`,
    day7: `Market update for ${lead.location || 'your area'}`,
    day14: `Let's find your perfect home, ${lead.name}`,
    day30: `Still thinking about ${lead.intent === 'buy' ? 'buying' : 'selling'}?`,
    pastClient60: `Hope you're loving the new place!`,
  };

  return subjects[type] || `Following up with you, ${lead.name}`;
}

/**
 * Process all pending follow-ups
 * This should be called by a cron job
 */
export async function processPendingFollowUps(
  leads: Lead[],
  schedules: FollowUpSchedule[]
): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  let sent = 0;
  let failed = 0;

  for (const schedule of schedules) {
    // Skip if already sent or not yet time
    if (schedule.sent || schedule.scheduledFor > now) {
      continue;
    }

    // Find the lead
    const lead = leads.find((l) => l.id === schedule.leadId);
    if (!lead) {
      console.error(`Lead not found: ${schedule.leadId}`);
      failed++;
      continue;
    }

    // Send the follow-up
    const success = await sendFollowUp(lead, schedule.type);
    if (success) {
      sent++;
      schedule.sent = true;
    } else {
      failed++;
    }

    // Add a small delay between emails to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { sent, failed };
}

/**
 * Send immediate follow-up when a new lead is created
 */
export async function sendImmediateFollowUp(lead: Lead): Promise<boolean> {
  return sendFollowUp(lead, 'immediate');
}

// Made with Bob

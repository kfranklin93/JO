/**
 * Database Service Layer
 * 
 * Provides CRUD operations for all database entities:
 * - Leads
 * - Conversations
 * - Follow-ups
 * - Analytics Events
 * - A/B Tests
 */

import { db, leads, conversations, followUps, analyticsEvents, abTests } from '@/lib/db';
import type { 
  NewLead, 
  Lead, 
  NewConversation, 
  Conversation,
  NewFollowUp,
  FollowUp,
  NewAnalyticsEvent,
  AnalyticsEvent,
  NewABTest,
  ABTest
} from '@/lib/db/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

// ============================================================================
// LEAD OPERATIONS
// ============================================================================

export async function createLead(data: NewLead): Promise<Lead> {
  const [lead] = await db.insert(leads).values(data).returning();
  if (!lead) throw new Error('Failed to create lead');
  return lead;
}

export async function getLeadById(id: string): Promise<Lead | undefined> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  return lead;
}

export async function getLeadByEmail(email: string): Promise<Lead | undefined> {
  const [lead] = await db.select().from(leads).where(eq(leads.email, email));
  return lead;
}

export async function getLeadByPhone(phone: string): Promise<Lead | undefined> {
  const [lead] = await db.select().from(leads).where(eq(leads.phone, phone));
  return lead;
}

export async function updateLead(id: string, data: Partial<NewLead>): Promise<Lead> {
  const [lead] = await db
    .update(leads)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();
  if (!lead) throw new Error('Lead not found');
  return lead;
}

export async function updateLeadEngagement(
  id: string,
  updates: {
    emailOpens?: number;
    emailClicks?: number;
    smsReplies?: number;
    lastContactedAt?: Date;
    lastResponseAt?: Date;
  }
): Promise<Lead> {
  const lead = await getLeadById(id);
  if (!lead) throw new Error('Lead not found');

  const newEngagementScore = calculateEngagementScore({
    emailOpens: updates.emailOpens ?? lead.emailOpens ?? 0,
    emailClicks: updates.emailClicks ?? lead.emailClicks ?? 0,
    smsReplies: updates.smsReplies ?? lead.smsReplies ?? 0,
  });

  return updateLead(id, {
    ...updates,
    engagementScore: newEngagementScore,
    totalInteractions: (lead.totalInteractions ?? 0) + 1,
  });
}

export async function getAllLeads(limit = 100, offset = 0): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getLeadsByStatus(
  status: 'new' | 'contacted' | 'qualified' | 'appointment_set' | 'showing_scheduled' | 'offer_made' | 'under_contract' | 'closed' | 'lost' | 'nurture'
): Promise<Lead[]> {
  return db.select().from(leads).where(eq(leads.status, status));
}

export async function getLeadsCreatedToday(): Promise<Lead[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return db
    .select()
    .from(leads)
    .where(gte(leads.createdAt, today))
    .orderBy(desc(leads.createdAt));
}

export async function getLeadsCreatedBetween(startDate: Date, endDate: Date): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(and(gte(leads.createdAt, startDate), lte(leads.createdAt, endDate)))
    .orderBy(desc(leads.createdAt));
}

// ============================================================================
// CONVERSATION OPERATIONS
// ============================================================================

export async function createConversation(data: NewConversation): Promise<Conversation> {
  const [conversation] = await db.insert(conversations).values(data).returning();
  if (!conversation) throw new Error('Failed to create conversation');
  return conversation;
}

export async function getConversationById(id: string): Promise<Conversation | undefined> {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  return conversation;
}

export async function getConversationsByLeadId(leadId: string): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.leadId, leadId))
    .orderBy(desc(conversations.createdAt));
}

export async function getRecentConversations(leadId: string, limit = 10): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.leadId, leadId))
    .orderBy(desc(conversations.createdAt))
    .limit(limit);
}

export async function updateConversation(
  id: string,
  data: Partial<NewConversation>
): Promise<Conversation> {
  const [conversation] = await db
    .update(conversations)
    .set(data)
    .where(eq(conversations.id, id))
    .returning();
  if (!conversation) throw new Error('Conversation not found');
  return conversation;
}

export async function markConversationAsOpened(id: string): Promise<Conversation> {
  return updateConversation(id, { openedAt: new Date() });
}

export async function markConversationAsClicked(id: string): Promise<Conversation> {
  return updateConversation(id, { clickedAt: new Date() });
}

export async function markConversationAsReplied(id: string): Promise<Conversation> {
  return updateConversation(id, { repliedAt: new Date() });
}

// ============================================================================
// FOLLOW-UP OPERATIONS
// ============================================================================

export async function createFollowUp(data: NewFollowUp): Promise<FollowUp> {
  const [followUp] = await db.insert(followUps).values(data).returning();
  if (!followUp) throw new Error('Failed to create follow-up');
  return followUp;
}

export async function getFollowUpById(id: string): Promise<FollowUp | undefined> {
  const [followUp] = await db.select().from(followUps).where(eq(followUps.id, id));
  return followUp;
}

export async function getFollowUpsByLeadId(leadId: string): Promise<FollowUp[]> {
  return db
    .select()
    .from(followUps)
    .where(eq(followUps.leadId, leadId))
    .orderBy(desc(followUps.scheduledFor));
}

export async function getPendingFollowUps(): Promise<FollowUp[]> {
  const now = new Date();
  return db
    .select()
    .from(followUps)
    .where(and(eq(followUps.status, 'scheduled'), lte(followUps.scheduledFor, now)))
    .orderBy(followUps.scheduledFor);
}

export async function updateFollowUp(
  id: string,
  data: Partial<NewFollowUp>
): Promise<FollowUp> {
  const [followUp] = await db
    .update(followUps)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(followUps.id, id))
    .returning();
  if (!followUp) throw new Error('Follow-up not found');
  return followUp;
}

export async function markFollowUpAsSent(
  id: string,
  conversationId: string
): Promise<FollowUp> {
  return updateFollowUp(id, {
    status: 'sent',
    sentAt: new Date(),
    conversationId,
  });
}

export async function markFollowUpAsOpened(id: string): Promise<FollowUp> {
  return updateFollowUp(id, {
    status: 'opened',
    openedAt: new Date(),
  });
}

export async function markFollowUpAsClicked(id: string): Promise<FollowUp> {
  return updateFollowUp(id, {
    status: 'clicked',
    clickedAt: new Date(),
  });
}

export async function markFollowUpAsReplied(id: string): Promise<FollowUp> {
  return updateFollowUp(id, {
    status: 'replied',
    repliedAt: new Date(),
  });
}

export async function markFollowUpAsFailed(
  id: string,
  reason: string
): Promise<FollowUp> {
  return updateFollowUp(id, {
    status: 'failed',
    failedAt: new Date(),
    failureReason: reason,
  });
}

// ============================================================================
// ANALYTICS OPERATIONS
// ============================================================================

export async function trackEvent(data: NewAnalyticsEvent): Promise<AnalyticsEvent> {
  const [event] = await db.insert(analyticsEvents).values(data).returning();
  if (!event) throw new Error('Failed to track event');
  return event;
}

export async function getEventsByLeadId(leadId: string): Promise<AnalyticsEvent[]> {
  return db
    .select()
    .from(analyticsEvents)
    .where(eq(analyticsEvents.leadId, leadId))
    .orderBy(desc(analyticsEvents.createdAt));
}

export async function getEventsByType(
  eventType: 'lead_created' | 'form_submitted' | 'email_sent' | 'email_opened' | 'email_clicked' | 'sms_sent' | 'sms_received' | 'sms_replied' | 'call_made' | 'appointment_booked' | 'showing_completed' | 'offer_submitted' | 'contract_signed' | 'deal_closed' | 'deal_lost'
): Promise<AnalyticsEvent[]> {
  return db
    .select()
    .from(analyticsEvents)
    .where(eq(analyticsEvents.eventType, eventType))
    .orderBy(desc(analyticsEvents.createdAt));
}

export async function getEventsInDateRange(
  startDate: Date,
  endDate: Date
): Promise<AnalyticsEvent[]> {
  return db
    .select()
    .from(analyticsEvents)
    .where(and(gte(analyticsEvents.createdAt, startDate), lte(analyticsEvents.createdAt, endDate)))
    .orderBy(desc(analyticsEvents.createdAt));
}

// ============================================================================
// A/B TEST OPERATIONS
// ============================================================================

export async function createABTest(data: NewABTest): Promise<ABTest> {
  const [test] = await db.insert(abTests).values(data).returning();
  if (!test) throw new Error('Failed to create A/B test');
  return test;
}

export async function getABTestById(id: string): Promise<ABTest | undefined> {
  const [test] = await db.select().from(abTests).where(eq(abTests.id, id));
  return test;
}

export async function getActiveABTests(): Promise<ABTest[]> {
  return db.select().from(abTests).where(eq(abTests.isActive, true));
}

export async function getABTestByTemplateType(templateType: string): Promise<ABTest | undefined> {
  const [test] = await db
    .select()
    .from(abTests)
    .where(and(eq(abTests.templateType, templateType), eq(abTests.isActive, true)));
  return test;
}

export async function updateABTest(id: string, data: Partial<NewABTest>): Promise<ABTest> {
  const [test] = await db
    .update(abTests)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(abTests.id, id))
    .returning();
  if (!test) throw new Error('A/B test not found');
  return test;
}

export async function incrementABTestMetric(
  id: string,
  variant: 'A' | 'B',
  metric: 'sent' | 'opened' | 'clicked' | 'replied'
): Promise<ABTest> {
  const test = await getABTestById(id);
  if (!test) throw new Error('A/B test not found');

  const field = `variant${variant}${metric.charAt(0).toUpperCase() + metric.slice(1)}` as keyof ABTest;
  const currentValue = (test[field] as number) || 0;

  return updateABTest(id, {
    [field]: currentValue + 1,
  } as Partial<NewABTest>);
}

export async function endABTest(id: string, winner: 'A' | 'B'): Promise<ABTest> {
  return updateABTest(id, {
    isActive: false,
    endedAt: new Date(),
    winner,
  });
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

export async function getLeadStats() {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      new: sql<number>`count(*) filter (where status = 'new')`,
      contacted: sql<number>`count(*) filter (where status = 'contacted')`,
      qualified: sql<number>`count(*) filter (where status = 'qualified')`,
      closed: sql<number>`count(*) filter (where status = 'closed')`,
      avgEngagementScore: sql<number>`avg(engagement_score)`,
    })
    .from(leads);

  return stats;
}

export async function getConversionFunnel(startDate: Date, endDate: Date) {
  const [funnel] = await db
    .select({
      leadsCreated: sql<number>`count(distinct ${leads.id})`,
      emailsSent: sql<number>`count(distinct ${conversations.id}) filter (where ${conversations.type} = 'email')`,
      emailsOpened: sql<number>`count(distinct ${conversations.id}) filter (where ${conversations.openedAt} is not null)`,
      emailsClicked: sql<number>`count(distinct ${conversations.id}) filter (where ${conversations.clickedAt} is not null)`,
      smsReplies: sql<number>`count(distinct ${conversations.id}) filter (where ${conversations.type} = 'sms' and ${conversations.direction} = 'inbound')`,
    })
    .from(leads)
    .leftJoin(conversations, eq(leads.id, conversations.leadId))
    .where(and(gte(leads.createdAt, startDate), lte(leads.createdAt, endDate)));

  return funnel;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateEngagementScore(metrics: {
  emailOpens: number;
  emailClicks: number;
  smsReplies: number;
}): number {
  // Weighted scoring: clicks > replies > opens
  const score =
    metrics.emailOpens * 1 +
    metrics.emailClicks * 3 +
    metrics.smsReplies * 5;

  return Math.min(score, 100); // Cap at 100
}

// Made with Bob

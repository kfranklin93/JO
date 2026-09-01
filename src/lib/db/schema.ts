/**
 * Database Schema for Joey O Lead Management System
 * 
 * Tables:
 * - leads: Core lead information and status
 * - conversations: SMS and email message history
 * - follow_ups: Scheduled and sent follow-up tracking
 * - analytics_events: Event tracking for conversions and engagement
 * - ab_tests: A/B testing for message optimization
 */

import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'qualified',
  'appointment_set',
  'showing_scheduled',
  'offer_made',
  'under_contract',
  'closed',
  'lost',
  'nurture'
]);

export const leadSourceEnum = pgEnum('lead_source', [
  'website_form',
  'sms_inbound',
  'phone_call',
  'referral',
  'social_media',
  'open_house',
  'other'
]);

export const conversationTypeEnum = pgEnum('conversation_type', [
  'sms',
  'email',
  'phone',
  'in_person'
]);

export const conversationDirectionEnum = pgEnum('conversation_direction', [
  'inbound',
  'outbound'
]);

export const followUpStatusEnum = pgEnum('follow_up_status', [
  'scheduled',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'failed'
]);

export const eventTypeEnum = pgEnum('event_type', [
  'lead_created',
  'form_submitted',
  'email_sent',
  'email_opened',
  'email_clicked',
  'sms_sent',
  'sms_received',
  'sms_replied',
  'call_made',
  'appointment_booked',
  'showing_completed',
  'offer_submitted',
  'contract_signed',
  'deal_closed',
  'deal_lost'
]);

// Tables
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  fullName: varchar('full_name', { length: 200 }),
  
  // Lead details
  source: leadSourceEnum('source').notNull().default('website_form'),
  status: leadStatusEnum('status').notNull().default('new'),
  propertyInterest: varchar('property_interest', { length: 100 }), // buying, selling, both
  priceRange: varchar('price_range', { length: 50 }),
  timeline: varchar('timeline', { length: 50 }),
  neighborhoods: text('neighborhoods'), // JSON array of neighborhood names
  
  // Engagement tracking
  engagementScore: integer('engagement_score').default(0),
  lastContactedAt: timestamp('last_contacted_at'),
  lastResponseAt: timestamp('last_response_at'),
  totalInteractions: integer('total_interactions').default(0),
  emailOpens: integer('email_opens').default(0),
  emailClicks: integer('email_clicks').default(0),
  smsReplies: integer('sms_replies').default(0),
  
  // Lofty CRM integration
  loftyContactId: varchar('lofty_contact_id', { length: 100 }),
  loftySyncedAt: timestamp('lofty_synced_at'),
  
  // Metadata
  formData: jsonb('form_data'), // Original form submission data
  notes: text('notes'),
  tags: text('tags'), // JSON array of tags
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  // Lookup by email. Deliberately NOT unique: a repeat client legitimately
  // submits more than once (buy now, sell in three years), and a unique
  // constraint would turn the second inquiry into a 500.
  index('leads_email_idx').on(table.email),
  // Dashboard ordering — see api/dashboard/data/route.ts.
  index('leads_created_at_idx').on(table.createdAt),
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  
  // Conversation details
  type: conversationTypeEnum('type').notNull(),
  direction: conversationDirectionEnum('direction').notNull(),
  content: text('content').notNull(),
  subject: varchar('subject', { length: 255 }), // For emails
  
  // AI tracking
  aiGenerated: boolean('ai_generated').default(false),
  aiModel: varchar('ai_model', { length: 100 }), // e.g., "claude-3-5-sonnet"
  promptUsed: text('prompt_used'),
  
  // Engagement
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
  repliedAt: timestamp('replied_at'),
  
  // Metadata
  metadata: jsonb('metadata'), // Additional data (Twilio SID, email ID, etc.)
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // Postgres does not index foreign-key child columns automatically, only the
  // referenced primary key. Without this, resolving a lead's conversations and
  // every ON DELETE CASCADE both fall back to a sequential scan.
  index('conversations_lead_id_idx').on(table.leadId),
]);

export const followUps = pgTable('follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  
  // Schedule
  scheduledFor: timestamp('scheduled_for').notNull(),
  templateType: varchar('template_type', { length: 50 }).notNull(), // immediate, day3, day7, etc.
  
  // Status tracking
  status: followUpStatusEnum('status').notNull().default('scheduled'),
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
  repliedAt: timestamp('replied_at'),
  failedAt: timestamp('failed_at'),
  failureReason: text('failure_reason'),
  
  // Content
  conversationId: uuid('conversation_id').references(() => conversations.id),
  
  // A/B testing
  abTestId: uuid('ab_test_id').references(() => abTests.id),
  variant: varchar('variant', { length: 10 }), // 'A' or 'B'
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  // The cron job's only query: due follow-ups by status and schedule.
  // See api/cron/follow-ups/route.ts. Without this it sequentially scans the
  // entire follow-up history on every run, forever.
  index('follow_ups_status_scheduled_for_idx').on(table.status, table.scheduledFor),
  // FK child column, not auto-indexed.
  index('follow_ups_lead_id_idx').on(table.leadId),
]);

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  
  // Event details
  eventType: eventTypeEnum('event_type').notNull(),
  eventName: varchar('event_name', { length: 100 }),
  
  // Context
  conversationId: uuid('conversation_id').references(() => conversations.id),
  followUpId: uuid('follow_up_id').references(() => followUps.id),
  
  // Data
  metadata: jsonb('metadata'),
  value: integer('value'), // For conversion value tracking
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // FK child column, not auto-indexed. Nullable here, so the index is partial
  // in effect — rows with a null lead_id are not indexed, which is fine because
  // nothing queries for them.
  index('analytics_events_lead_id_idx').on(table.leadId),
]);

export const abTests = pgTable('ab_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Test details
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  templateType: varchar('template_type', { length: 50 }).notNull(),
  
  // Variants
  variantA: text('variant_a').notNull(),
  variantB: text('variant_b').notNull(),
  
  // Status
  isActive: boolean('is_active').default(true),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  
  // Results
  variantASent: integer('variant_a_sent').default(0),
  variantAOpened: integer('variant_a_opened').default(0),
  variantAClicked: integer('variant_a_clicked').default(0),
  variantAReplied: integer('variant_a_replied').default(0),
  
  variantBSent: integer('variant_b_sent').default(0),
  variantBOpened: integer('variant_b_opened').default(0),
  variantBClicked: integer('variant_b_clicked').default(0),
  variantBReplied: integer('variant_b_replied').default(0),
  
  // Winner
  winner: varchar('winner', { length: 10 }), // 'A', 'B', or null
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Relations
export const leadsRelations = relations(leads, ({ many }) => ({
  conversations: many(conversations),
  followUps: many(followUps),
  analyticsEvents: many(analyticsEvents),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  lead: one(leads, {
    fields: [conversations.leadId],
    references: [leads.id],
  }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  lead: one(leads, {
    fields: [followUps.leadId],
    references: [leads.id],
  }),
  conversation: one(conversations, {
    fields: [followUps.conversationId],
    references: [conversations.id],
  }),
  abTest: one(abTests, {
    fields: [followUps.abTestId],
    references: [abTests.id],
  }),
}));

export const analyticsEventsRelations = relations(analyticsEvents, ({ one }) => ({
  lead: one(leads, {
    fields: [analyticsEvents.leadId],
    references: [leads.id],
  }),
  conversation: one(conversations, {
    fields: [analyticsEvents.conversationId],
    references: [conversations.id],
  }),
  followUp: one(followUps, {
    fields: [analyticsEvents.followUpId],
    references: [followUps.id],
  }),
}));

// Types
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type FollowUp = typeof followUps.$inferSelect;
export type NewFollowUp = typeof followUps.$inferInsert;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type ABTest = typeof abTests.$inferSelect;
export type NewABTest = typeof abTests.$inferInsert;

// Made with Bob

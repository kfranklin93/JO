/**
 * Lead Types
 * 
 * Core data structures for lead management and tracking.
 * These types define the shape of lead data throughout the application.
 */

import type { PropertyRequest } from './property';

/**
 * Lead source tracking - where the lead originated
 */
export enum LeadSource {
  WEBSITE = 'website',
  FACEBOOK = 'facebook',
  GOOGLE = 'google',
  REFERRAL = 'referral',
  DIRECT = 'direct',
  OTHER = 'other',
}

/**
 * User intent - what service they're interested in
 */
export enum LeadIntent {
  BUY = 'buy',
  SELL = 'sell',
  INVEST = 'invest',
  INSURANCE = 'insurance',
  CLOSING = 'closing',
  GENERAL = 'general',
}

/**
 * Lead status in the CRM pipeline
 */
export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  NURTURING = 'nurturing',
  CONVERTED = 'converted',
  LOST = 'lost',
}

/**
 * Timeline for when the lead wants to take action
 */
export enum Timeline {
  IMMEDIATE = 'immediate',        // 0-30 days
  SHORT_TERM = 'short_term',      // 1-3 months
  MEDIUM_TERM = 'medium_term',    // 3-6 months
  LONG_TERM = 'long_term',        // 6+ months
  EXPLORING = 'exploring',        // Just researching
}

/**
 * Core lead data structure
 */
export interface Lead {
  id: string;
  
  // Contact Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  
  // Lead Context
  intent: LeadIntent;
  source: LeadSource;
  status: LeadStatus;
  timeline: Timeline;
  
  // Property Request (optional, populated in multi-step form)
  propertyRequest?: PropertyRequest;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt?: Date;
  
  // CRM Integration
  loftyLeadId?: string;
  
  // Tracking
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
}

/**
 * Lead creation payload (what the form submits)
 */
export interface CreateLeadInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  intent: LeadIntent;
  source: LeadSource;
  timeline: Timeline;
  propertyRequest?: Partial<PropertyRequest>;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
}

/**
 * Lead update payload (for status changes, etc.)
 */
export interface UpdateLeadInput {
  status?: LeadStatus;
  timeline?: Timeline;
  propertyRequest?: Partial<PropertyRequest>;
  lastContactedAt?: Date;
}

// Made with Bob

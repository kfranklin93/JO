/**
 * AI Interaction Types
 * 
 * Types for AI-powered chat, recommendations, and lead follow-up.
 * Used for conversational interfaces and intelligent lead nurturing.
 */

import type { LeadIntent } from './lead';
import type { PropertyRequest } from './property';

/**
 * AI message role
 */
export enum AIMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

/**
 * Individual message in conversation
 */
export interface AIMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * AI conversation context
 */
export interface AIConversationContext {
  leadId: string;
  intent: LeadIntent;
  propertyRequest?: PropertyRequest;
  conversationHistory: AIMessage[];
  lastInteractionAt: Date;
}

/**
 * AI recommendation for lead follow-up
 */
export interface AIRecommendation {
  id: string;
  leadId: string;
  type: 'property_match' | 'follow_up_message' | 'next_step';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  actionUrl?: string;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * AI chat request payload
 */
export interface AIChatRequest {
  leadId: string;
  message: string;
  context?: Partial<AIConversationContext>;
}

/**
 * AI chat response
 */
export interface AIChatResponse {
  message: AIMessage;
  recommendations?: AIRecommendation[];
  suggestedActions?: string[];
}


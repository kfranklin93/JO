/**
 * API Types
 * 
 * Types for API requests, responses, and error handling.
 * Provides consistent structure for all API interactions.
 */

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: {
    timestamp: Date;
    requestId: string;
  };
}

/**
 * API error
 */
export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

/**
 * Lead submission response
 */
export interface LeadSubmissionResponse {
  leadId: string;
  loftyLeadId?: string;
  message: string;
  nextSteps?: string[];
}

/**
 * Lofty CRM webhook payload
 */
export interface LoftyWebhookPayload {
  event: 'lead.created' | 'lead.updated' | 'lead.status_changed';
  leadId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

// Made with Bob

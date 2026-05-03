/**
 * Type System Index
 * 
 * Central export point for all TypeScript types and interfaces.
 * Import types from this file throughout the application.
 * 
 * @example
 * import { Lead, LeadIntent, PropertyType } from '@/types';
 */

// Lead Types
export {
  LeadSource,
  LeadIntent,
  LeadStatus,
  Timeline,
  type Lead,
  type CreateLeadInput,
  type UpdateLeadInput,
} from './lead';

// Property Types
export {
  PropertyType,
  type PropertyRequest,
  type CreatePropertyRequestInput,
} from './property';

// AI Types
export {
  AIMessageRole,
  type AIMessage,
  type AIConversationContext,
  type AIRecommendation,
  type AIChatRequest,
  type AIChatResponse,
} from './ai';

// Form Types
export {
  type FormFieldError,
  type FormValidationState,
  type FormProgress,
  type FormSubmissionState,
  type LeadFormState,
  type FormFieldConfig,
  type FormStepConfig,
} from './form';

// UI Types
export {
  type ModalState,
  type Toast,
  type LoadingState,
  type UIState,
} from './ui';

// API Types
export {
  type ApiResponse,
  type ApiError,
  type LeadSubmissionResponse,
  type LoftyWebhookPayload,
} from './api';

// Type Utilities
export {
  type RequireFields,
  type PartialFields,
  type EnumValues,
  type FormFieldValue,
  type FormStepData,
  type Prettify,
  type RequireAtLeastOne,
  type DeepPartial,
  type DeepReadonly,
  type NonNullableFields,
  type Mutable,
} from './utils';

// Legacy types (can be removed once migration is complete)
export interface PlaceholderPageProps {
  title: string;
  description: string;
}

// Made with Bob

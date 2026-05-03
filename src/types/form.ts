/**
 * Form State Types
 * 
 * Types for form validation, multi-step progress, and submission state.
 * Used throughout the application for form management and user input handling.
 */

import type { CreateLeadInput } from './lead';

/**
 * Form field validation error
 */
export interface FormFieldError {
  field: string;
  message: string;
  type: 'required' | 'invalid' | 'min' | 'max' | 'pattern' | 'custom';
}

/**
 * Form validation state
 */
export interface FormValidationState {
  isValid: boolean;
  errors: FormFieldError[];
  touchedFields: Set<string>;
}

/**
 * Multi-step form progress
 */
export interface FormProgress {
  currentStep: number;
  totalSteps: number;
  completedSteps: Set<number>;
  canProceed: boolean;
}

/**
 * Form submission state
 */
export interface FormSubmissionState {
  isSubmitting: boolean;
  isSuccess: boolean;
  isError: boolean;
  error?: string;
  submittedAt?: Date;
}

/**
 * Complete form state for lead capture
 */
export interface LeadFormState {
  // Form Data
  data: Partial<CreateLeadInput>;
  
  // Validation
  validation: FormValidationState;
  
  // Progress (for multi-step)
  progress: FormProgress;
  
  // Submission
  submission: FormSubmissionState;
  
  // Persistence
  isDirty: boolean;
  lastSavedAt?: Date;
}

/**
 * Form field configuration
 */
export interface FormFieldConfig<T = unknown> {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select' | 'textarea' | 'checkbox' | 'radio';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  defaultValue?: T;
  validation?: {
    pattern?: RegExp;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    custom?: (value: T) => boolean | string;
  };
  options?: Array<{ value: string; label: string }>; // For select/radio
}

/**
 * Form step configuration (for multi-step forms)
 */
export interface FormStepConfig {
  id: string;
  title: string;
  description?: string;
  fields: FormFieldConfig[];
  validation?: (data: Partial<CreateLeadInput>) => FormFieldError[];
  canSkip?: boolean;
}

// Made with Bob

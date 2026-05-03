'use client';

import * as React from 'react';
import { FormStep } from './FormStep';
import { FormProgress } from './FormProgress';
import { FormNavigation } from './FormNavigation';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useFormState } from '@/lib/hooks/useFormState';
import { cn } from '@/lib/utils/cn';
import { formFields, formSteps, stepLabels } from '@/config/form-fields';
import type { CreateLeadInput, FormFieldConfig, LeadSource } from '@/types';

export interface LeadCaptureFormProps {
  /**
   * Initial form data (optional)
   */
  initialData?: Partial<CreateLeadInput>;
  
  /**
   * Lead source for tracking
   */
  source?: LeadSource;
  
  /**
   * Form submission handler
   */
  onSubmit: (data: CreateLeadInput) => Promise<void>;
  
  /**
   * Success callback after submission
   */
  onSuccess?: () => void;
  
  /**
   * Error callback if submission fails
   */
  onError?: (error: Error) => void;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * LeadCaptureForm Component
 * 
 * Multi-step form for capturing real estate leads with:
 * - 3 steps: Contact Info, Lead Intent, Additional Details
 * - Form validation on each step
 * - LocalStorage persistence
 * - Accessibility features (ARIA, focus management)
 * - Loading states and error handling
 */
export function LeadCaptureForm({
  initialData = {},
  source = 'website' as LeadSource,
  onSubmit,
  onSuccess,
  onError,
  className,
}: LeadCaptureFormProps) {
  const {
    state,
    setFieldValue,
    setTouched,
    nextStep,
    previousStep,
    setSubmissionState,
    resetForm,
  } = useFormState({
    fields: formFields,
    steps: formSteps,
    initialData: { ...initialData, source },
  });

  const formRef = React.useRef<HTMLFormElement>(null);
  const errorAnnouncementRef = React.useRef<HTMLDivElement>(null);

  // Focus management: focus on first field when step changes
  React.useEffect(() => {
    const firstInput = formRef.current?.querySelector('input, select, textarea') as HTMLElement;
    firstInput?.focus();
  }, [state.progress.currentStep]);

  const handleFieldChange = React.useCallback(
    (name: string, value: unknown) => {
      setFieldValue(name, value);
    },
    [setFieldValue]
  );

  const handleFieldBlur = React.useCallback(
    (name: string) => {
      setTouched(name);
    },
    [setTouched]
  );

  const getFieldError = React.useCallback(
    (fieldName: string) => {
      const isTouched = state.validation.touchedFields.has(fieldName);
      const error = state.validation.errors.find((err) => err.field === fieldName);
      return isTouched && error ? error.message : undefined;
    },
    [state.validation.errors, state.validation.touchedFields]
  );

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!state.validation.isValid) {
        // Announce validation errors
        if (errorAnnouncementRef.current) {
          errorAnnouncementRef.current.textContent = 
            `Form has ${state.validation.errors.length} error${state.validation.errors.length !== 1 ? 's' : ''}. Please review and correct.`;
        }
        return;
      }

      setSubmissionState({
        isSubmitting: true,
        isSuccess: false,
        isError: false,
      });

      try {
        await onSubmit(state.data as CreateLeadInput);
        
        setSubmissionState({
          isSubmitting: false,
          isSuccess: true,
          isError: false,
          submittedAt: new Date(),
        });

        if (errorAnnouncementRef.current) {
          errorAnnouncementRef.current.textContent = 'Form submitted successfully!';
        }

        onSuccess?.();
        resetForm();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        
        setSubmissionState({
          isSubmitting: false,
          isSuccess: false,
          isError: true,
          error: errorMessage,
        });

        if (errorAnnouncementRef.current) {
          errorAnnouncementRef.current.textContent = `Error: ${errorMessage}`;
        }

        onError?.(error instanceof Error ? error : new Error(errorMessage));
      }
    },
    [state.data, state.validation, onSubmit, onSuccess, onError, setSubmissionState, resetForm]
  );

  const renderField = (field: FormFieldConfig) => {
    const fieldValue = field.name.startsWith('propertyRequest.')
      ? state.data.propertyRequest?.[field.name.replace('propertyRequest.', '') as keyof NonNullable<CreateLeadInput['propertyRequest']>]
      : state.data[field.name as keyof CreateLeadInput];

    const error = getFieldError(field.name);
    const fieldId = `lead-form-${field.name}`;

    const commonProps = {
      id: fieldId,
      name: field.name,
      value: fieldValue as string | undefined,
      placeholder: field.placeholder,
      required: field.required ?? false,
      disabled: state.submission.isSubmitting,
      ...(error ? { error } : {}),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        handleFieldChange(field.name, e.target.value);
      },
      onBlur: () => handleFieldBlur(field.name),
    };

    return (
      <FormField
        key={field.name}
        id={fieldId}
        label={field.label}
        required={field.required ?? false}
        {...(error ? { error } : {})}
      >
        {field.type === 'select' && field.options ? (
          <Select
            {...commonProps}
            options={field.options}
            placeholder={field.placeholder || 'Select an option'}
          />
        ) : field.type === 'textarea' ? (
          <Textarea
            {...commonProps}
            maxLength={field.validation?.maxLength}
            rows={4}
          />
        ) : (
          <Input
            {...commonProps}
            type={field.type}
          />
        )}
      </FormField>
    );
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={cn('w-full space-y-8', className)}
      noValidate
    >
      {/* Progress Indicator */}
      <FormProgress progress={state.progress} stepLabels={stepLabels} />

      {/* Error Announcement for Screen Readers */}
      <div
        ref={errorAnnouncementRef}
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      />

      {/* Form Steps */}
      {formSteps.map((step, index) => (
        <FormStep
          key={step.id}
          id={step.id}
          title={step.title}
          {...(step.description ? { description: step.description } : {})}
          currentStep={state.progress.currentStep}
          stepNumber={index + 1}
        >
          {step.fields.map(renderField)}
        </FormStep>
      ))}

      {/* Navigation */}
      <FormNavigation
        progress={state.progress}
        isSubmitting={state.submission.isSubmitting}
        onPrevious={previousStep}
        onNext={nextStep}
        onSubmit={() => handleSubmit({} as React.FormEvent)}
      />

      {/* Global Error Display */}
      {state.submission.isError && state.submission.error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <strong className="font-semibold">Error:</strong> {state.submission.error}
        </div>
      ) : null}
    </form>
  );
}

// Made with Bob
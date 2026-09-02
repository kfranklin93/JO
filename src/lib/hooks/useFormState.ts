'use client';

import * as React from 'react';
import type {
  CreateLeadInput,
  FormFieldConfig,
  FormFieldError,
  FormStepConfig,
  LeadFormState,
} from '@/types';
import { useFormPersistence } from '@/lib/hooks/useFormPersistence';
import { useFormValidation } from '@/lib/hooks/useFormValidation';

type LeadFormData = Partial<CreateLeadInput>;

export interface UseFormStateOptions {
  fields: FormFieldConfig[];
  steps: FormStepConfig[];
  initialData?: LeadFormData;
  storageKey?: string;
}

function mergeData(current: LeadFormData, name: string, value: unknown): LeadFormData {
  if (name.startsWith('propertyRequest.')) {
    const key = name.replace('propertyRequest.', '');
    return {
      ...current,
      propertyRequest: {
        ...current.propertyRequest,
        [key]: value,
      },
    };
  }

  return {
    ...current,
    [name]: value,
  };
}

export function useFormState({
  fields,
  steps,
  initialData = {},
  storageKey = 'lead-capture-form',
}: UseFormStateOptions) {
  const [state, setState] = React.useState<LeadFormState>({
    data: initialData,
    validation: {
      isValid: false,
      errors: [],
      touchedFields: new Set<string>(),
    },
    progress: {
      currentStep: 1,
      totalSteps: steps.length,
      completedSteps: new Set<number>(),
      canProceed: false,
    },
    submission: {
      isSubmitting: false,
      isSuccess: false,
      isError: false,
    },
    isDirty: false,
  });

  const { validate, validateStep } = useFormValidation({ fields });
  const { hydratedData, clear } = useFormPersistence({
    storageKey,
    data: state.data,
  });

  React.useEffect(() => {
    if (!hydratedData) {
      return;
    }

    setState((current) => ({
      ...current,
      data: hydratedData,
    }));
  }, [hydratedData]);

  React.useEffect(() => {
    const currentStepConfig = steps[state.progress.currentStep - 1];
    const currentStepFields = currentStepConfig?.fields.map((field) => field.name) ?? [];
    const stepValidation = validateStep(state.data, currentStepFields);
    const fullValidation = validate(state.data);

    setState((current) => ({
      ...current,
      validation: {
        ...current.validation,
        isValid: fullValidation.isValid,
        errors: fullValidation.errors,
      },
      progress: {
        ...current.progress,
        canProceed: stepValidation.isValid,
      },
      ...(current.isDirty ? { lastSavedAt: new Date() } : {}),
    }));
  }, [state.data, state.isDirty, state.progress.currentStep, steps, validate, validateStep]);

  const setFieldValue = React.useCallback((name: string, value: unknown) => {
    setState((current) => ({
      ...current,
      data: mergeData(current.data, name, value),
      isDirty: true,
    }));
  }, []);

  const setTouched = React.useCallback((name: string) => {
    setState((current) => {
      const touchedFields = new Set(current.validation.touchedFields);
      touchedFields.add(name);

      return {
        ...current,
        validation: {
          ...current.validation,
          touchedFields,
        },
      };
    });
  }, []);

  const setErrors = React.useCallback((errors: FormFieldError[]) => {
    setState((current) => ({
      ...current,
      validation: {
        ...current.validation,
        isValid: errors.length === 0,
        errors,
      },
    }));
  }, []);

  const goToStep = React.useCallback(
    (nextStep: number) => {
      if (nextStep < 1 || nextStep > steps.length) {
        return false;
      }

      const currentStepConfig = steps[state.progress.currentStep - 1];
      const currentFieldNames = currentStepConfig?.fields.map((field) => field.name) ?? [];
      const stepValidation = validateStep(state.data, currentFieldNames);

      if (nextStep > state.progress.currentStep && !stepValidation.isValid) {
        setErrors(stepValidation.errors);
        return false;
      }

      setState((current) => {
        const completedSteps = new Set(current.progress.completedSteps);
        if (stepValidation.isValid) {
          completedSteps.add(current.progress.currentStep);
        }

        return {
          ...current,
          progress: {
            ...current.progress,
            currentStep: nextStep,
            completedSteps,
          },
        };
      });

      return true;
    },
    [setErrors, state.data, state.progress.currentStep, steps, validateStep]
  );

  const nextStep = React.useCallback(() => goToStep(state.progress.currentStep + 1), [goToStep, state.progress.currentStep]);
  const previousStep = React.useCallback(() => goToStep(state.progress.currentStep - 1), [goToStep, state.progress.currentStep]);

  const resetForm = React.useCallback(() => {
    clear();
    setState({
      data: initialData,
      validation: {
        isValid: false,
        errors: [],
        touchedFields: new Set<string>(),
      },
      progress: {
        currentStep: 1,
        totalSteps: steps.length,
        completedSteps: new Set<number>(),
        canProceed: false,
      },
      submission: {
        isSubmitting: false,
        isSuccess: false,
        isError: false,
      },
      isDirty: false,
    });
  }, [clear, initialData, steps.length]);

  const setSubmissionState = React.useCallback((submission: LeadFormState['submission']) => {
    setState((current) => ({
      ...current,
      submission,
    }));
  }, []);

  return {
    state,
    setFieldValue,
    setTouched,
    setErrors,
    setSubmissionState,
    nextStep,
    previousStep,
    goToStep,
    resetForm,
  };
}


'use client';

import * as React from 'react';
import type { CreateLeadInput, FormFieldConfig, FormFieldError } from '@/types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+()\-\s]{10,20}$/;

type LeadFormData = Partial<CreateLeadInput>;

export interface UseFormValidationOptions {
  fields: FormFieldConfig[];
}

function getValue(data: LeadFormData, name: string): unknown {
  if (name.startsWith('propertyRequest.')) {
    const key = name.replace('propertyRequest.', '') as keyof NonNullable<CreateLeadInput['propertyRequest']>;
    return data.propertyRequest?.[key];
  }

  return data[name as keyof LeadFormData];
}

function validateField(config: FormFieldConfig, data: LeadFormData): FormFieldError | null {
  const value = getValue(data, config.name);
  const stringValue = typeof value === 'string' ? value.trim() : value;

  if (config.required) {
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isEmpty =
      stringValue === '' ||
      stringValue === undefined ||
      stringValue === null ||
      isEmptyArray;

    if (isEmpty) {
      return {
        field: config.name,
        message: `${config.label} is required.`,
        type: 'required',
      };
    }
  }

  if (typeof stringValue === 'string' && stringValue.length > 0) {
    if (config.type === 'email' && !emailPattern.test(stringValue)) {
      return {
        field: config.name,
        message: 'Enter a valid email address.',
        type: 'invalid',
      };
    }

    if (config.type === 'tel' && !phonePattern.test(stringValue)) {
      return {
        field: config.name,
        message: 'Enter a valid phone number.',
        type: 'pattern',
      };
    }

    if (config.validation?.minLength && stringValue.length < config.validation.minLength) {
      return {
        field: config.name,
        message: `${config.label} must be at least ${config.validation.minLength} characters.`,
        type: 'min',
      };
    }

    if (config.validation?.maxLength && stringValue.length > config.validation.maxLength) {
      return {
        field: config.name,
        message: `${config.label} must be no more than ${config.validation.maxLength} characters.`,
        type: 'max',
      };
    }

    if (config.validation?.pattern && !config.validation.pattern.test(stringValue)) {
      return {
        field: config.name,
        message: `${config.label} format is invalid.`,
        type: 'pattern',
      };
    }
  }

  if (typeof value === 'number') {
    if (config.validation?.min !== undefined && value < config.validation.min) {
      return {
        field: config.name,
        message: `${config.label} must be at least ${config.validation.min}.`,
        type: 'min',
      };
    }

    if (config.validation?.max !== undefined && value > config.validation.max) {
      return {
        field: config.name,
        message: `${config.label} must be no more than ${config.validation.max}.`,
        type: 'max',
      };
    }
  }

  if (config.validation?.custom) {
    const result = config.validation.custom(value);
    if (result !== true) {
      return {
        field: config.name,
        message: typeof result === 'string' ? result : `${config.label} is invalid.`,
        type: 'custom',
      };
    }
  }

  return null;
}

export function useFormValidation({ fields }: UseFormValidationOptions) {
  const validate = React.useCallback(
    (data: LeadFormData) => {
      const errors = fields
        .map((field) => validateField(field, data))
        .filter((error): error is FormFieldError => Boolean(error));

      return {
        isValid: errors.length === 0,
        errors,
      };
    },
    [fields]
  );

  const validateStep = React.useCallback(
    (data: LeadFormData, stepFields: string[]) => {
      const scopedFields = fields.filter((field) => stepFields.includes(field.name));
      const errors = scopedFields
        .map((field) => validateField(field, data))
        .filter((error): error is FormFieldError => Boolean(error));

      return {
        isValid: errors.length === 0,
        errors,
      };
    },
    [fields]
  );

  const getError = React.useCallback(
    (fieldName: string, errors: FormFieldError[]) =>
      errors.find((error) => error.field === fieldName)?.message,
    []
  );

  return {
    validate,
    validateStep,
    getError,
  };
}


/**
 * Type Utilities
 * 
 * Reusable type helpers and utility types for enhanced type safety.
 * Provides advanced TypeScript patterns for common use cases.
 */

import type { FormFieldConfig } from './form';

/**
 * Make specific properties required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific properties optional
 */
export type PartialFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract enum values as union type
 */
export type EnumValues<T> = T[keyof T];

/**
 * Form field value type based on field config
 */
export type FormFieldValue<T extends FormFieldConfig> = 
  T['type'] extends 'checkbox' ? boolean :
  T['type'] extends 'select' ? string :
  T['type'] extends 'tel' | 'email' | 'text' | 'textarea' ? string :
  unknown;

/**
 * Discriminated union for form steps
 */
export type FormStepData<T extends string> = {
  [K in T]: {
    step: K;
    data: Record<string, unknown>;
  };
}[T];

/**
 * Prettify - Expand object types for better IDE hints
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Require at least one property from a type
 */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
  Pick<T, Exclude<keyof T, Keys>> & 
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

/**
 * Deep partial - make all nested properties optional
 */
export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

/**
 * Deep readonly - make all nested properties readonly
 */
export type DeepReadonly<T> = T extends object ? {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
} : T;

/**
 * Non-nullable fields - remove null and undefined from all properties
 */
export type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

/**
 * Mutable - remove readonly from all properties
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};


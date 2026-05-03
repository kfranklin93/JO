import type { FormFieldConfig, FormStepConfig } from '@/types';

export const formFields: FormFieldConfig[] = [
  // Step 1: Contact Information
  {
    name: 'firstName',
    label: 'First Name',
    type: 'text',
    placeholder: 'John',
    required: true,
    validation: { minLength: 2, maxLength: 50 },
  },
  {
    name: 'lastName',
    label: 'Last Name',
    type: 'text',
    placeholder: 'Doe',
    required: true,
    validation: { minLength: 2, maxLength: 50 },
  },
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    placeholder: 'john.doe@example.com',
    required: true,
  },
  {
    name: 'phone',
    label: 'Phone Number',
    type: 'tel',
    placeholder: '(555) 123-4567',
    required: true,
  },
  
  // Step 2: Lead Intent & Property Details
  {
    name: 'intent',
    label: 'What can we help you with?',
    type: 'select',
    required: true,
    options: [
      { value: 'buy', label: 'Buy a Home' },
      { value: 'sell', label: 'Sell a Home' },
      { value: 'insurance', label: 'Home Insurance' },
      { value: 'closing', label: 'Closing Services' },
      { value: 'general', label: 'General Inquiry' },
    ],
  },
  {
    name: 'propertyRequest.propertyType',
    label: 'Property Type',
    type: 'select',
    required: false,
    options: [
      { value: 'single_family', label: 'Single Family Home' },
      { value: 'condo', label: 'Condo' },
      { value: 'townhouse', label: 'Townhouse' },
      { value: 'multi_family', label: 'Multi-Family' },
      { value: 'land', label: 'Land' },
      { value: 'commercial', label: 'Commercial' },
    ],
  },
  {
    name: 'timeline',
    label: 'Timeline',
    type: 'select',
    required: true,
    options: [
      { value: 'immediate', label: 'Immediate (0-30 days)' },
      { value: 'short_term', label: 'Short Term (1-3 months)' },
      { value: 'medium_term', label: 'Medium Term (3-6 months)' },
      { value: 'long_term', label: 'Long Term (6+ months)' },
      { value: 'exploring', label: 'Just Exploring' },
    ],
  },
  {
    name: 'propertyRequest.preferredLocations',
    label: 'Preferred Location(s)',
    type: 'text',
    placeholder: 'e.g., Downtown, Suburbs, Specific neighborhoods',
    required: false,
  },
  
  // Step 3: Additional Details & Preferences
  {
    name: 'propertyRequest.additionalNotes',
    label: 'Additional Details',
    type: 'textarea',
    placeholder: 'Tell us more about what you\'re looking for...',
    required: false,
    validation: { maxLength: 1000 },
  },
  {
    name: 'propertyRequest.priceRangeMin',
    label: 'Minimum Budget',
    type: 'text',
    placeholder: '$200,000',
    required: false,
  },
  {
    name: 'propertyRequest.priceRangeMax',
    label: 'Maximum Budget',
    type: 'text',
    placeholder: '$500,000',
    required: false,
  },
];

export const formSteps: FormStepConfig[] = [
  {
    id: 'contact-info',
    title: 'Contact Information',
    description: 'Let\'s start with your basic contact details.',
    fields: formFields.slice(0, 4),
  },
  {
    id: 'lead-intent',
    title: 'Your Needs',
    description: 'Tell us what you\'re looking for and when.',
    fields: formFields.slice(4, 8),
  },
  {
    id: 'additional-details',
    title: 'Additional Details',
    description: 'Help us understand your preferences better.',
    fields: formFields.slice(8),
  },
];

export const stepLabels = ['Contact', 'Your Needs', 'Details'];

// Made with Bob

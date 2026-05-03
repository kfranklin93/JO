# Form Components

Multi-step form system for lead capture with validation, persistence, and accessibility features.

## Components

### LeadCaptureForm

Main form component that orchestrates the entire multi-step lead capture process.

**Features:**
- 3-step form flow (Contact Info → Your Needs → Additional Details)
- Real-time validation with error messages
- LocalStorage persistence (auto-saves on change)
- Full accessibility support (ARIA labels, focus management, screen reader announcements)
- Loading states during submission
- Error handling and display

**Usage:**

```tsx
import { LeadCaptureForm } from '@/components/forms';
import type { CreateLeadInput } from '@/types';

function MyPage() {
  const handleSubmit = async (data: CreateLeadInput) => {
    // Submit to your API
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error('Failed to submit form');
    }
  };

  const handleSuccess = () => {
    console.log('Form submitted successfully!');
    // Show success message, redirect, etc.
  };

  const handleError = (error: Error) => {
    console.error('Form submission failed:', error);
    // Show error toast, etc.
  };

  return (
    <LeadCaptureForm
      source="website"
      onSubmit={handleSubmit}
      onSuccess={handleSuccess}
      onError={handleError}
    />
  );
}
```

### FormStep

Individual step wrapper with conditional rendering and proper ARIA attributes.

**Props:**
- `id`: Unique identifier for the step
- `title`: Step title for accessibility
- `currentStep`: Current step number (1-based)
- `stepNumber`: This step's number (1-based)
- `description?`: Optional description for additional context
- `children`: Step content

### FormProgress

Visual progress indicator with proper ARIA attributes showing current step.

**Props:**
- `progress`: Current form progress state
- `stepLabels`: Array of step labels for display

### FormNavigation

Navigation buttons for multi-step forms with proper disabled states and ARIA.

**Props:**
- `progress`: Current form progress state
- `isSubmitting?`: Whether the form is currently submitting
- `onPrevious`: Handler for previous button click
- `onNext`: Handler for next button click
- `onSubmit`: Handler for submit button click

## Form Structure

### Step 1: Contact Information
- First Name (required)
- Last Name (required)
- Email Address (required)
- Phone Number (required)

### Step 2: Your Needs
- What can we help you with? (required)
- Property Type (optional)
- Timeline (required)
- Preferred Location(s) (optional)

### Step 3: Additional Details
- Additional Details (optional, max 1000 chars)
- Minimum Budget (optional)
- Maximum Budget (optional)

## Accessibility Features

- **Progress Indicator**: Proper ARIA labels and live regions for screen readers
- **Form Steps**: `role="group"` with `aria-labelledby` for step titles
- **Navigation Buttons**: Proper disabled states and descriptive ARIA labels
- **Focus Management**: Automatic focus on first field when step changes
- **Error Announcements**: ARIA live regions for validation errors
- **Keyboard Navigation**: Full keyboard support for all interactions

## Validation

- Real-time validation on field blur
- Step-level validation before proceeding
- Form-level validation before submission
- Clear error messages with proper ARIA attributes
- Visual error indicators (red borders, error text)

## Persistence

- Automatic save to LocalStorage on field change
- Hydrates form data on mount
- Clears storage on successful submission
- Storage key: `lead-capture-form` (configurable)

## Made with Bob
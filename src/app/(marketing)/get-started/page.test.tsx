// @vitest-environment jsdom

/**
 * Component tests for the /get-started page.
 *
 * Verifies loading states, success confirmation, field-level error display, and
 * general error handling for lead form submission.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GetStartedPage from './page';
import * as submitLeadModule from '@/lib/api/submit-lead';

// Mock the LeadCaptureForm to simplify testing
vi.mock('@/components/forms', () => ({
  LeadCaptureForm: ({ onSubmit }: { onSubmit: (data: unknown) => Promise<void> }) => (
    <form
      data-testid="lead-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSubmit({
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            phone: '555-0123',
            intent: 'buy',
            timeline: 'short_term',
          });
        } catch (error) {
          // Catch errors to prevent unhandled rejections in tests
          // The page component handles errors by setting state
        }
      }}
    >
      <button type="submit">Submit</button>
    </form>
  ),
}));

describe('GetStartedPage', () => {
  const originalFetch = global.fetch;
  let submitLeadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    global.fetch = vi.fn();
    submitLeadSpy = vi.spyOn(submitLeadModule, 'submitLead');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the form initially', () => {
    render(<GetStartedPage />);
    
    expect(screen.getByText('Get Started Today')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form')).toBeInTheDocument();
  });

  it('shows loading state during submission', async () => {
    submitLeadSpy.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    const user = userEvent.setup();
    render(<GetStartedPage />);
    
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/submitting your information/i)).toBeInTheDocument();
    });
    
    // Form should be disabled during submission
    const form = screen.getByTestId('lead-form');
    expect(form.parentElement).toHaveClass('opacity-60', 'pointer-events-none');
  });

  it('shows success confirmation after successful submission', async () => {
    submitLeadSpy.mockResolvedValueOnce({ ok: true, leadId: 'lead_123' });
    
    const user = userEvent.setup();
    render(<GetStartedPage />);
    
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/thank you for reaching out/i)).toBeInTheDocument();
    });
    
    expect(screen.getByText(/we've received your information/i)).toBeInTheDocument();
    expect(screen.queryByTestId('lead-form')).not.toBeInTheDocument();
  });

  it('allows submitting another inquiry after success', async () => {
    submitLeadSpy.mockResolvedValueOnce({ ok: true, leadId: 'lead_123' });
    
    const user = userEvent.setup();
    render(<GetStartedPage />);
    
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/thank you for reaching out/i)).toBeInTheDocument();
    });
    
    const anotherInquiryButton = screen.getByRole('button', { name: /submit another inquiry/i });
    await user.click(anotherInquiryButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('lead-form')).toBeInTheDocument();
    });
  });

  it('displays field errors on 422 validation failure', async () => {
    submitLeadSpy.mockResolvedValueOnce({
      ok: false,
      fieldErrors: {
        email: 'Enter a valid email address',
        intent: 'Select what you need help with',
      },
    });
    
    const user = userEvent.setup();
    render(<GetStartedPage />);
    
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/please correct the following/i)).toBeInTheDocument();
    });
    
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Select what you need help with')).toBeInTheDocument();
    
    // Form should still be visible so user can retry
    expect(screen.getByTestId('lead-form')).toBeInTheDocument();
  });

  it('displays general error message on server failure', async () => {
    submitLeadSpy.mockResolvedValueOnce({
      ok: false,
      message: 'Database connection failed',
    });
    
    const user = userEvent.setup();
    render(<GetStartedPage />);
    
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/error:/i)).toBeInTheDocument();
    });
    
    expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    
    // Form should still be visible so user can retry
    expect(screen.getByTestId('lead-form')).toBeInTheDocument();
  });

  it('clears previous errors on new submission', async () => {
    submitLeadSpy
      .mockResolvedValueOnce({
        ok: false,
        message: 'Network error',
      })
      .mockResolvedValueOnce({ ok: true, leadId: 'lead_123' });
    
    const user = userEvent.setup();
    render(<GetStartedPage />);
    
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    
    // First submission fails
    await user.click(submitButton);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
    
    // Second submission succeeds
    await user.click(submitButton);
    await waitFor(() => {
      expect(screen.getByText(/thank you for reaching out/i)).toBeInTheDocument();
    });
    
    // Error should be cleared
    expect(screen.queryByText('Network error')).not.toBeInTheDocument();
  });

  it('blocks duplicate submission while request is in flight', async () => {
    let resolveSubmit: (value: submitLeadModule.SubmitLeadResult) => void;
    const submitPromise = new Promise<submitLeadModule.SubmitLeadResult>((resolve) => {
      resolveSubmit = resolve;
    });
    submitLeadSpy.mockReturnValueOnce(submitPromise);
    
    const user = userEvent.setup();
    render(<GetStartedPage />);
    
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    
    // First click
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/submitting your information/i)).toBeInTheDocument();
    });
    
    // Form should be disabled
    const form = screen.getByTestId('lead-form');
    expect(form.parentElement).toHaveClass('pointer-events-none');
    
    // Resolve the promise
    resolveSubmit!({ ok: true, leadId: 'lead_123' });
    
    await waitFor(() => {
      expect(screen.getByText(/thank you for reaching out/i)).toBeInTheDocument();
    });
    
    // Should only have been called once
    expect(submitLeadSpy).toHaveBeenCalledTimes(1);
  });
});

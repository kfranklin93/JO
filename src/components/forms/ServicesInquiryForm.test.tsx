/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ServicesInquiryForm } from './ServicesInquiryForm';
import * as submitLeadModule from '@/lib/api/submit-lead';
import { LeadIntent } from '@/types/lead';

vi.mock('@/lib/api/submit-lead');

describe('ServicesInquiryForm', () => {
  const mockOnClose = vi.fn();
  const mockSubmitLead = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(submitLeadModule, 'submitLead').mockImplementation(mockSubmitLead);
  });

  it('renders service selection step initially', () => {
    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('How Can I Help You?')).toBeInTheDocument();
    expect(screen.getByText('Buying a Home')).toBeInTheDocument();
    expect(screen.getByText('Selling a Home')).toBeInTheDocument();
    expect(screen.getByText('Buying & Selling')).toBeInTheDocument();
    expect(screen.getByText('General Question')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<ServicesInquiryForm isOpen={false} onClose={mockOnClose} />);

    expect(screen.queryByText('How Can I Help You?')).not.toBeInTheDocument();
  });

  it('advances to details step when a service is selected', async () => {
    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    const buyingButton = screen.getByText('Buying a Home');
    fireEvent.click(buyingButton);

    await waitFor(() => {
      expect(screen.getByText('Tell Me About Your Goals')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
  });

  it('shows back button in details step', async () => {
    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Buying a Home'));

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Back'));

    await waitFor(() => {
      expect(screen.getByText('How Can I Help You?')).toBeInTheDocument();
    });
  });

  it('submits form with correct data and shows success state', async () => {
    mockSubmitLead.mockResolvedValue({ ok: true, leadId: 'lead-123' });

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    // Select service
    fireEvent.click(screen.getByText('Buying a Home'));

    await waitFor(() => {
      expect(screen.getByText('Tell Me About Your Goals')).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'John Smith' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '555-123-4567' },
    });

    // Submit
    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(mockSubmitLead).toHaveBeenCalledWith({
        name: 'John Smith',
        email: 'john@example.com',
        phone: '555-123-4567',
        intent: LeadIntent.BUY,
      });
    });

    // Success state
    await waitFor(() => {
      expect(screen.getByText('Thank you for reaching out!')).toBeInTheDocument();
    });
  });

  it('maps "buying" service type to LeadIntent.BUY', async () => {
    mockSubmitLead.mockResolvedValue({ ok: true, leadId: 'lead-123' });

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Buying a Home'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '555-0000' },
    });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(mockSubmitLead).toHaveBeenCalledWith(
        expect.objectContaining({ intent: LeadIntent.BUY })
      );
    });
  });

  it('maps "selling" service type to LeadIntent.SELL', async () => {
    mockSubmitLead.mockResolvedValue({ ok: true, leadId: 'lead-123' });

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Selling a Home'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '555-0000' },
    });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(mockSubmitLead).toHaveBeenCalledWith(
        expect.objectContaining({ intent: LeadIntent.SELL })
      );
    });
  });

  it('maps "both" service type to LeadIntent.BUY', async () => {
    mockSubmitLead.mockResolvedValue({ ok: true, leadId: 'lead-123' });

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Buying & Selling'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '555-0000' },
    });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(mockSubmitLead).toHaveBeenCalledWith(
        expect.objectContaining({ intent: LeadIntent.BUY })
      );
    });
  });

  it('maps "general" service type to LeadIntent.GENERAL', async () => {
    mockSubmitLead.mockResolvedValue({ ok: true, leadId: 'lead-123' });

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('General Question'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '555-0000' },
    });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(mockSubmitLead).toHaveBeenCalledWith(
        expect.objectContaining({ intent: LeadIntent.GENERAL })
      );
    });
  });

  it('displays field errors when validation fails', async () => {
    mockSubmitLead.mockResolvedValue({
      ok: false,
      fieldErrors: {
        email: 'Invalid email address',
        phone: 'Phone number too short',
      },
    });

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Buying a Home'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'John Smith' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'invalid@' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '123' },
    });

    // Submit the form directly to bypass browser validation
    const form = screen.getByLabelText(/Full Name/i).closest('form')!;
    fireEvent.submit(form);

    // Wait for submitLead to be called
    await waitFor(() => {
      expect(mockSubmitLead).toHaveBeenCalled();
    });

    // Check that field errors summary is displayed
    await waitFor(() => {
      expect(screen.getByText(/Please correct the following/i)).toBeInTheDocument();
    });

    // Field errors should appear (checking with getAllByText since they appear in both summary and field)
    expect(screen.getAllByText('Invalid email address').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Phone number too short').length).toBeGreaterThan(0);
  });

  it('displays general error message on submission failure', async () => {
    mockSubmitLead.mockResolvedValue({
      ok: false,
      message: 'Network error occurred',
    });

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Buying a Home'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'John Smith' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '555-123-4567' },
    });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(screen.getByText(/Network error occurred/)).toBeInTheDocument();
    });
  });

  it('shows loading state during submission', async () => {
    let resolveSubmit: (value: any) => void;
    const submitPromise = new Promise((resolve) => {
      resolveSubmit = resolve;
    });
    mockSubmitLead.mockReturnValue(submitPromise);

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Buying a Home'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'John Smith' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '555-123-4567' },
    });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeInTheDocument();
    });

    // Resolve the promise
    resolveSubmit!({ ok: true, leadId: 'lead-123' });

    await waitFor(() => {
      expect(screen.getByText('Thank you for reaching out!')).toBeInTheDocument();
    });
  });

  it('includes optional fields in submission when provided', async () => {
    mockSubmitLead.mockResolvedValue({ ok: true, leadId: 'lead-123' });

    render(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Buying a Home'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'John Smith' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'john@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), {
      target: { value: '555-123-4567' },
    });
    fireEvent.change(screen.getByLabelText(/Budget Range/i), {
      target: { value: '$500K - $750K' },
    });
    fireEvent.change(screen.getByLabelText(/When are you looking to buy/i), {
      target: { value: 'Within 3 months' },
    });
    fireEvent.change(screen.getByLabelText(/Additional Details/i), {
      target: { value: 'Looking for 3BR in Buckhead' },
    });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(mockSubmitLead).toHaveBeenCalledWith({
        name: 'John Smith',
        email: 'john@example.com',
        phone: '555-123-4567',
        intent: LeadIntent.BUY,
        budget: '$500K - $750K',
        timeline: 'Within 3 months',
        additionalNotes: 'Looking for 3BR in Buckhead',
      });
    });
  });

  it('resets form state when modal closes', async () => {
    const { rerender } = render(
      <ServicesInquiryForm isOpen={true} onClose={mockOnClose} />
    );

    fireEvent.click(screen.getByText('Buying a Home'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'John Smith' },
    });

    // Close modal
    rerender(<ServicesInquiryForm isOpen={false} onClose={mockOnClose} />);

    // Wait for cleanup timeout
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Reopen modal
    rerender(<ServicesInquiryForm isOpen={true} onClose={mockOnClose} />);

    // Should be back at service selection
    expect(screen.getByText('How Can I Help You?')).toBeInTheDocument();
  });
});

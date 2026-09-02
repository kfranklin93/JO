// @vitest-environment jsdom

/**
 * Regression tests for multi-step navigation in LeadCaptureForm.
 *
 * The form previously submitted as soon as the user advanced to the final step.
 * The Next and Submit buttons render at the same position in the DOM, so while
 * Submit was a native `type="submit"` control a single activation could both
 * advance the step and submit the newly rendered form. These tests pin the
 * behaviour that submission happens only on an explicit Submit click.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeadCaptureForm } from './LeadCaptureForm';

async function fillContactStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/First Name/i), 'Jane');
  await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
  await user.type(screen.getByLabelText(/Email Address/i), 'jane@example.com');
  await user.type(screen.getByLabelText(/Phone Number/i), '5551234567');
}

async function fillNeedsStep(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/What can we help you with/i), 'buy');
  await user.selectOptions(screen.getByLabelText(/Timeline/i), 'short_term');
}

/**
 * The final step's textarea. Queried by role rather than label text because
 * FormStep wraps each step in a `role="group"` labelled by its own heading,
 * which is also "Additional Details" -- getByLabelText would match both.
 */
function notesField() {
  return screen.getByRole('textbox', { name: /Additional Details/i });
}

describe('LeadCaptureForm multi-step navigation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not submit when advancing from step 1 to step 2', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LeadCaptureForm onSubmit={onSubmit} />);

    await fillContactStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/What can we help you with/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when advancing from step 2 to the final step', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LeadCaptureForm onSubmit={onSubmit} />);

    await fillContactStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/What can we help you with/i)).toBeInTheDocument();
    });

    await fillNeedsStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));

    // Final step is rendered...
    await waitFor(() => {
      expect(notesField()).toBeInTheDocument();
    });

    // ...and nothing was submitted on the way there.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('leaves final-step fields editable after advancing', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LeadCaptureForm onSubmit={onSubmit} />);

    await fillContactStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));
    await waitFor(() => screen.getByLabelText(/What can we help you with/i));
    await fillNeedsStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));

    const notes = await waitFor(notesField);
    expect(notes).not.toBeDisabled();

    await user.type(notes, 'Looking for a 3BR in Buckhead');
    expect(notes).toHaveValue('Looking for a 3BR in Buckhead');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits only when the Submit button is clicked on the final step', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LeadCaptureForm onSubmit={onSubmit} />);

    await fillContactStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));
    await waitFor(() => screen.getByLabelText(/What can we help you with/i));
    await fillNeedsStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));
    await waitFor(notesField);

    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Submit form/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      intent: 'buy',
      timeline: 'short_term',
    });
  });

  it('pressing Enter in a field advances instead of submitting', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LeadCaptureForm onSubmit={onSubmit} />);

    await fillContactStep(user);
    await user.type(screen.getByLabelText(/Phone Number/i), '{Enter}');

    await waitFor(() => {
      expect(screen.getByLabelText(/What can we help you with/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders no native submit control on any step', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { container } = render(<LeadCaptureForm onSubmit={onSubmit} />);

    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0);

    await fillContactStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));
    await waitFor(() => screen.getByLabelText(/What can we help you with/i));
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0);

    await fillNeedsStep(user);
    await user.click(screen.getByRole('button', { name: /Go to next step/i }));
    await waitFor(notesField);
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0);
  });
});

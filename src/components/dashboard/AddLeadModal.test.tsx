// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddLeadModal } from './AddLeadModal';

/**
 * Tests for the hand-entry form.
 *
 * The assertion that earns its keep is the follow-up checkbox. It is the one
 * place in this feature where a default decides whether somebody who never
 * asked for email gets five of them, and a default is exactly the kind of thing
 * that survives a code read and is wrong when run — a `defaultChecked` left on
 * a copied input, a `!` that crept into the handler. So it is asserted from the
 * rendered DOM and again from the request body.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ leadId: 'lead-1', followUpsCreated: 0 }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Fill the two required fields and submit. */
function fillAndSubmit(): void {
  fireEvent.change(screen.getByLabelText(/^Name/), {
    target: { value: 'Dana Whitfield' },
  });
  fireEvent.change(screen.getByLabelText(/^Email/), {
    target: { value: 'dana@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save lead' }));
}

/** The body of the one request the form made, parsed. */
function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('the follow-up opt-in', () => {
  it('is unticked when the dialog opens', () => {
    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(
      screen.getByRole('checkbox', { name: /five-touch email follow-up/i })
    ).not.toBeChecked();
  });

  it('sends scheduleFollowUps false when it is left alone', async () => {
    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    fillAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody().scheduleFollowUps).toBe(false);
  });

  it('sends true only once it has been ticked', async () => {
    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(
      screen.getByRole('checkbox', { name: /five-touch email follow-up/i })
    );
    fillAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody().scheduleFollowUps).toBe(true);
  });

  it('says what ticking it does, rather than labelling it "follow up"', () => {
    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByText(/queues five emails/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot\s+be unsent/i)).toBeInTheDocument();
  });

  it('starts unticked again on reopen, so a previous tick cannot carry over', () => {
    const { rerender } = render(
      <AddLeadModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: /five-touch email follow-up/i })
    );
    rerender(<AddLeadModal isOpen={false} onClose={vi.fn()} onSaved={vi.fn()} />);
    rerender(<AddLeadModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(
      screen.getByRole('checkbox', { name: /five-touch email follow-up/i })
    ).not.toBeChecked();
  });
});

describe('submission', () => {
  it('posts the fields the form collects', async () => {
    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^Phone/), {
      target: { value: '(770) 555-0100' },
    });
    fireEvent.change(screen.getByLabelText(/^Notes/), {
      target: { value: 'Referral from the Hales' },
    });
    fillAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/dashboard/leads');
    expect(sentBody()).toMatchObject({
      name: 'Dana Whitfield',
      email: 'dana@example.com',
      phone: '(770) 555-0100',
      intent: 'buy',
      status: 'new',
      notes: 'Referral from the Hales',
    });
  });

  it('offers every status the lead_status column accepts', () => {
    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={vi.fn()} />);

    const select = screen.getByLabelText(/^Status/) as HTMLSelectElement;

    // The leading '' is `Select`'s own placeholder option, which every form in
    // the app gets. Picking it is refused by the route with a field error
    // rather than written as an empty status.
    const values = Array.from(select.options)
      .map((option) => option.value)
      .filter((value) => value !== '');

    expect(values).toEqual([
      'new',
      'contacted',
      'qualified',
      'appointment_set',
      'showing_scheduled',
      'offer_made',
      'under_contract',
      'closed',
      'lost',
      'nurture',
    ]);
  });

  it('tells the caller what was created, so the table can reload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ leadId: 'lead-9', followUpsCreated: 5 }),
    });
    const onSaved = vi.fn();

    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={onSaved} />);
    fillAndSubmit();

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ leadId: 'lead-9', followUpsCreated: 5 })
    );
  });

  it('puts a server field error on the field that caused it', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'Some fields need fixing',
        fieldErrors: { email: 'Enter a valid email address' },
      }),
    });
    const onSaved = vi.fn();

    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={onSaved} />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getAllByText('Enter a valid email address').length).toBeGreaterThan(0)
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('says nothing was saved when the request cannot be made', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const onSaved = vi.fn();

    render(<AddLeadModal isOpen onClose={vi.fn()} onSaved={onSaved} />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Nothing was saved/i)
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});

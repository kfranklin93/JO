// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppointmentsPanel } from './AppointmentsPanel';

/**
 * Tests for the dashboard calendar.
 *
 * The assertion that earns its keep is the timezone one. A 19:00Z booking is
 * 3:00 PM in Atlanta, and a panel that reached for `toLocaleString` would show
 * whatever the viewer's laptop is set to — 19:00 on a UTC CI box, 8:00 PM in
 * Berlin, and the correct answer only by accident. Joey reading a different hour
 * than the one the assistant quoted to the client is how somebody misses a call,
 * and nothing in a browser makes it look wrong.
 *
 * The rest covers the states the panel can be in: a booking whose lead row is
 * gone still has to render, because an appointment missing from the calendar is
 * worse than one shown unattributed, and a failed request has to say what went
 * wrong rather than show an empty calendar — "nobody has booked" and "the table
 * does not exist" look identical otherwise.
 */

const fetchMock = vi.fn();

const APPOINTMENTS = [
  {
    id: 'a1',
    leadId: 'lead-7',
    // 19:00Z in March is 3:00 PM Eastern.
    startsAt: '2026-03-12T19:00:00.000Z',
    endsAt: '2026-03-12T19:15:00.000Z',
    status: 'scheduled',
    channel: 'phone',
    createdBy: 'assistant',
    notes: 'Budget around 450',
    lead: {
      id: 'lead-7',
      name: 'Dana Whitfield',
      email: 'dana@example.com',
      phone: '404-555-0100',
    },
  },
  {
    id: 'a2',
    leadId: 'lead-9',
    startsAt: '2026-03-13T14:30:00.000Z',
    endsAt: '2026-03-13T14:45:00.000Z',
    status: 'completed',
    channel: 'video',
    createdBy: 'joey',
    notes: null,
    lead: {
      id: 'lead-9',
      name: 'Marcus Reyes',
      email: 'marcus@example.com',
      phone: null,
    },
  },
];

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  fetchMock.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  respondWith({
    appointments: APPOINTMENTS,
    range: { from: '2026-03-01T00:00:00.000Z', to: null },
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppointmentsPanel', () => {
  it('renders a row per booking with the client, channel and status', async () => {
    render(<AppointmentsPanel />);

    expect(await screen.findByText('Dana Whitfield')).toBeInTheDocument();
    expect(screen.getByText('Marcus Reyes')).toBeInTheDocument();
    expect(screen.getByText('dana@example.com', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Phone call')).toBeInTheDocument();
    expect(screen.getByText('Video call')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders the day and time in Joey’s zone, not the viewer’s', async () => {
    render(<AppointmentsPanel />);

    expect(await screen.findByText('Thu, Mar 12')).toBeInTheDocument();
    expect(screen.getByText('3:00 PM EDT')).toBeInTheDocument();
    // The failure being guarded against: the raw UTC hour, or a browser-local
    // rendering of it.
    expect(screen.queryByText(/7:00 PM/)).not.toBeInTheDocument();
    expect(screen.queryByText(/19:00/)).not.toBeInTheDocument();
  });

  it('says which clock the time belongs to', async () => {
    // A correct hour with no zone on it is still a guess for whoever reads it,
    // and the assistant quoted the client an Eastern one.
    render(<AppointmentsPanel />);

    // Both rows, not just the first: the zone belongs to every time on screen.
    expect(await screen.findAllByText(/\bEDT\b/)).toHaveLength(2);
  });

  it('uses semantic list markup', async () => {
    render(<AppointmentsPanel />);

    await screen.findByText('Dana Whitfield');

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('still renders a booking whose lead row is gone', async () => {
    respondWith({
      appointments: [{ ...APPOINTMENTS[0], lead: null }],
      range: { from: '2026-03-01T00:00:00.000Z', to: null },
    });

    render(<AppointmentsPanel />);

    expect(await screen.findByText('Unknown lead')).toBeInTheDocument();
    expect(screen.getByText('Thu, Mar 12')).toBeInTheDocument();
  });

  it('falls back to the email when the lead has no name', async () => {
    respondWith({
      appointments: [
        { ...APPOINTMENTS[0], lead: { ...APPOINTMENTS[0]!.lead, name: null } },
      ],
      range: { from: '2026-03-01T00:00:00.000Z', to: null },
    });

    render(<AppointmentsPanel />);

    expect(await screen.findAllByText(/dana@example\.com/)).not.toHaveLength(0);
  });

  it('says nothing is booked rather than rendering an empty list', async () => {
    respondWith({
      appointments: [],
      range: { from: '2026-03-01T00:00:00.000Z', to: null },
    });

    render(<AppointmentsPanel />);

    expect(await screen.findByText('Nothing booked yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('surfaces the server’s explanation when the read fails', async () => {
    respondWith(
      {
        error:
          'Could not read the calendar. If the appointments table has not been ' +
          'created yet, apply src/lib/db/appointment-schema.sql.',
      },
      { ok: false, status: 500 },
    );

    render(<AppointmentsPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('appointment-schema.sql');
  });

  it('asks the calendar endpoint once', async () => {
    render(<AppointmentsPanel />);

    await screen.findByText('Dana Whitfield');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/appointments');
  });
});

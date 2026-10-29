// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadHistoryPanel } from './LeadHistoryPanel';

/**
 * Tests for the bookings section of the lead history panel (Requirement 8.4).
 *
 * Scoped to the bookings. The conversation rendering and the assistant switch
 * predate this file and are covered by the route tests behind them; what is new
 * here is that a booking appears at all — the endpoint used to return an
 * explicit empty list and this panel typed it as `unknown[]`.
 *
 * Two things are asserted deliberately. Appointment times render in Joey's zone
 * rather than the viewer's, because a booking is a commitment to a specific wall
 * clock and `toLocaleString` would show a different hour to whoever happens to
 * be reading. And the section disappears when there are no bookings, because an
 * empty "Bookings" heading on every row of a table of hundreds is noise.
 */

const fetchMock = vi.fn();

const HISTORY = [
  {
    id: 'm1',
    channel: 'chat',
    direction: 'inbound',
    content: 'My budget is around 450',
    subject: null,
    aiGenerated: false,
    createdAt: '2026-03-01T12:00:00.000Z',
  },
];

const APPOINTMENT = {
  id: 'appt-1',
  // 19:00Z in March is 3:00 PM Eastern.
  startsAt: '2026-03-12T19:00:00.000Z',
  endsAt: '2026-03-12T19:15:00.000Z',
  status: 'scheduled',
  channel: 'phone',
  createdBy: 'assistant',
  notes: null,
};

function respondWith(appointments: unknown[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      leadId: 'lead-7',
      history: HISTORY,
      assistant: { muted: false, reason: null },
      appointments,
    }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  respondWith([APPOINTMENT]);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LeadHistoryPanel — bookings', () => {
  it('lists the lead’s bookings with day, time, channel and status', async () => {
    render(<LeadHistoryPanel leadId="lead-7" />);

    expect(await screen.findByText('Bookings')).toBeInTheDocument();
    expect(screen.getByText('Thu, Mar 12')).toBeInTheDocument();
    expect(screen.getByText('3:00 PM Eastern Time')).toBeInTheDocument();
    expect(screen.getByText('Phone call')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders the time in Joey’s zone, and names the zone', async () => {
    render(<LeadHistoryPanel leadId="lead-7" />);

    await screen.findByText('Bookings');

    expect(screen.getByText(/Eastern Time/)).toBeInTheDocument();
    expect(screen.queryByText(/7:00 PM/)).not.toBeInTheDocument();
    expect(screen.queryByText(/19:00/)).not.toBeInTheDocument();
  });

  it('hides the section entirely when the lead has no bookings', async () => {
    respondWith([]);

    render(<LeadHistoryPanel leadId="lead-7" />);

    // The conversation still renders, so this is the panel loaded, not empty.
    expect(await screen.findByText('My budget is around 450')).toBeInTheDocument();
    expect(screen.queryByText('Bookings')).not.toBeInTheDocument();
  });
});

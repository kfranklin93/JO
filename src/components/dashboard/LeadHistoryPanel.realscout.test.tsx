// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadHistoryPanel } from './LeadHistoryPanel';

/**
 * The RealScout section of the expanded lead row.
 *
 * Joey's question in front of a lead is "are they actually looking?", and this
 * section is the only place the app can answer it — the browsing happens on
 * RealScout. So the assertions are about the three things he reads: the Scout
 * Score with its movement, what the person did, and a way through to the
 * contact in RealScout.
 *
 * Two of them are safety assertions rather than display ones. A link is only
 * rendered for a URL that was vetted server-side, and a contact RealScout
 * cannot email is called out, because the one thing that must never happen to
 * them is being put on a sending path.
 */

const fetchMock = vi.fn();

const HISTORY = [
  {
    id: 'm1',
    channel: 'chat',
    direction: 'inbound',
    content: 'Still looking in Buckhead',
    subject: null,
    aiGenerated: false,
    createdAt: '2026-06-01T12:00:00.000Z',
  },
];

const CONTACT = {
  id: 'VXNlci0xMjM=',
  url: 'https://www.realscout.com/agent/contacts/VXNlci0xMjM=',
  scoutScore: 62,
  scoutScoreChange7d: 21,
  scoutScoreChange30d: -4,
  summary30d: 'Viewing steadily and opening every alert.',
  emailable: true,
  lastActiveAt: '2026-06-09T02:11:00.000Z',
  leadSource: 'Home Value Widget',
  tags: ['Hot Lead', 'Seller'],
};

const ACTIVITY = [
  {
    id: 'a1',
    action: 'request_showing',
    at: '2026-06-09T02:11:00.000Z',
    rating: null,
    label: '123 Main St',
    detail: '$1,250,000 · 3 bd · 2 ba · San Jose, CA',
    url: 'https://www.realscout.com/agent/ls/123-main-st',
  },
  {
    id: 'a2',
    action: 'rated',
    at: '2026-06-08T02:11:00.000Z',
    rating: 4,
    label: '456 Oak Ave',
    detail: null,
    url: null,
  },
];

function respondWith(realscout: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      leadId: 'lead-7',
      history: HISTORY,
      assistant: { muted: false, reason: null },
      appointments: [],
      realscout,
    }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LeadHistoryPanel — RealScout', () => {
  it('shows the Scout Score with its 7- and 30-day movement', async () => {
    respondWith({
      reason: null,
      missingScope: null,
      contact: CONTACT,
      activity: ACTIVITY,
    });

    render(<LeadHistoryPanel leadId="lead-7" />);

    expect(await screen.findByText('RealScout')).toBeInTheDocument();
    expect(screen.getByText('Scout Score 62')).toBeInTheDocument();
    expect(screen.getByText('7 days +21')).toBeInTheDocument();
    expect(screen.getByText('30 days -4')).toBeInTheDocument();
    expect(
      screen.getByText('Viewing steadily and opening every alert.'),
    ).toBeInTheDocument();
  });

  it('lists what the person did, and what it was about', async () => {
    respondWith({
      reason: null,
      missingScope: null,
      contact: CONTACT,
      activity: ACTIVITY,
    });

    render(<LeadHistoryPanel leadId="lead-7" />);
    await screen.findByText('RealScout');

    expect(screen.getByText('Asked to see')).toBeInTheDocument();
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(
      screen.getByText('$1,250,000 · 3 bd · 2 ba · San Jose, CA'),
    ).toBeInTheDocument();
    expect(screen.getByText('Rated')).toBeInTheDocument();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
  });

  it('links through to the contact in RealScout', async () => {
    respondWith({ reason: null, missingScope: null, contact: CONTACT, activity: [] });

    render(<LeadHistoryPanel leadId="lead-7" />);
    await screen.findByText('RealScout');

    const link = screen.getByRole('link', { name: 'Open in RealScout' });
    expect(link).toHaveAttribute('href', CONTACT.url);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders text rather than a link when the URL did not survive vetting', async () => {
    // The route nulls a URL that is not an https RealScout address, so the
    // panel never has to make that judgement — it just has to honour it.
    respondWith({
      reason: null,
      missingScope: null,
      contact: { ...CONTACT, url: null },
      activity: [ACTIVITY[1]],
    });

    render(<LeadHistoryPanel leadId="lead-7" />);
    await screen.findByText('RealScout');

    expect(
      screen.queryByRole('link', { name: 'Open in RealScout' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '456 Oak Ave' })).not.toBeInTheDocument();
    expect(screen.getByText('456 Oak Ave')).toBeInTheDocument();
  });

  it('warns when RealScout cannot email the contact', async () => {
    respondWith({
      reason: null,
      missingScope: null,
      contact: { ...CONTACT, emailable: false },
      activity: [],
    });

    render(<LeadHistoryPanel leadId="lead-7" />);
    await screen.findByText('RealScout');

    expect(screen.getByText(/RealScout cannot email this contact/)).toBeInTheDocument();
  });

  it('says so plainly when the person is not a RealScout contact', async () => {
    respondWith({ reason: 'not_found', missingScope: null, contact: null, activity: [] });

    render(<LeadHistoryPanel leadId="lead-7" />);
    await screen.findByText('RealScout');

    expect(
      screen.getByText('This person is not a RealScout contact.'),
    ).toBeInTheDocument();
  });

  it('names the missing permission rather than saying "forbidden"', async () => {
    respondWith({
      reason: 'scope',
      missingScope: 'contacts:read',
      contact: null,
      activity: [],
    });

    render(<LeadHistoryPanel leadId="lead-7" />);
    await screen.findByText('RealScout');

    expect(screen.getByText(/contacts:read/)).toBeInTheDocument();
  });

  it('still renders the conversation when RealScout could not be reached', async () => {
    // The transcript is this panel's primary job and works without RealScout.
    respondWith({
      reason: 'unavailable',
      missingScope: null,
      contact: null,
      activity: [],
    });

    render(<LeadHistoryPanel leadId="lead-7" />);
    await screen.findByText('RealScout');

    expect(screen.getByText('Could not reach RealScout just now.')).toBeInTheDocument();
    expect(screen.getByText('Still looking in Buckhead')).toBeInTheDocument();
  });
});

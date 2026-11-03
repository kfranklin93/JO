import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What RealScout knows about one lead, for the expanded dashboard row.
 *
 * This is the most sensitive data the feature touches — which houses a named
 * person has been looking at — so two things are pinned here beyond the
 * display: it never throws (the panel's primary job is the conversation, which
 * works without RealScout), and a URL that did not come from RealScout never
 * reaches the panel as a link.
 *
 * The contact lookup order is asserted because it is load-bearing: the
 * `external_user_key` filter finds a contact this site pushed, and only when
 * that misses is the address used. Reversing them would match a different
 * person's contact whenever two leads share an address — which `leads.email`
 * being non-unique makes an ordinary case, not an edge one.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

/** The row the mocked lead lookup finds, or null for "no such lead". */
let leadRow: { email: string } | null;

vi.mock('@/lib/db', () => ({
  leads: { __name: 'leads', id: 'leads.id', email: 'leads.email' },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(leadRow === null ? [] : [leadRow]),
        }),
      }),
    }),
  },
}));

const { realScoutLeadSnapshot, ACTIVITY_LIMIT } = await import('./realscout-lead');

const LEAD_ID = '11111111-2222-4333-8444-555555555555';
const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const contactsPage = (contacts: unknown[]) =>
  jsonResponse(200, { data: contacts, has_more: false, next_cursor: null });

const CONTACT = {
  id: 'VXNlci0xMjM=',
  email: 'dana@example.com',
  scout_score: 62,
  scout_score_change_7d: 21,
  scout_score_change_30d: 14,
  scout_score_summary_30d: 'Viewing steadily and opening every alert.',
  emailable: true,
  last_active_at: '2026-06-09T02:11:00Z',
  lead_source: 'Home Value Widget',
  tags: ['Hot Lead'],
  realscout_tags: ['Seller', 'Hot Lead'],
  realscout_url: 'https://www.realscout.com/agent/contacts/VXNlci0xMjM=',
};

const PROPERTY_VIEW = {
  id: 'act-1',
  action: 'view',
  created_at: '2026-06-09T02:11:00Z',
  contact: { id: CONTACT.id },
  rating: null,
  view_count: 3,
  actionable: {
    type: 'Property',
    address: '123 Main St',
    city: 'San Jose',
    state: 'CA',
    price: 1250000,
    beds: 3,
    baths: 2,
    realscout_url: 'https://www.realscout.com/agent/ls/123-main-st',
  },
};

/** The URL of the nth fetch call. */
const calledUrl = (index: number): string => String(fetchMock.mock.calls[index]?.[0]);

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.REALSCOUT_API_TOKEN = 'rs_agent_test';
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';

  leadRow = { email: 'dana@example.com' };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('finding the contact', () => {
  it('tries external_user_key first, so a pushed lead matches its own contact', async () => {
    fetchMock
      .mockResolvedValueOnce(contactsPage([CONTACT]))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));

    const snapshot = await realScoutLeadSnapshot(LEAD_ID);

    expect(calledUrl(0)).toContain(`external_user_key=${LEAD_ID}`);
    expect(snapshot.contact?.id).toBe(CONTACT.id);
    // No lookup by address was needed, so none was spent.
    expect(calledUrl(1)).toContain('/activity');
  });

  it('falls back to the address for a contact RealScout created itself', async () => {
    // A contact captured by a widget has no external_user_key — the spec says
    // it can only be set at creation — so the address is the only way in.
    fetchMock
      .mockResolvedValueOnce(contactsPage([]))
      .mockResolvedValueOnce(contactsPage([CONTACT]))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));

    const snapshot = await realScoutLeadSnapshot(LEAD_ID);

    expect(calledUrl(1)).toContain('email=dana%40example.com');
    expect(snapshot.contact?.id).toBe(CONTACT.id);
  });

  it('reports not_found rather than guessing when neither lookup matches', async () => {
    fetchMock.mockImplementation(() => contactsPage([]));

    const snapshot = await realScoutLeadSnapshot(LEAD_ID);

    expect(snapshot).toEqual({
      reason: 'not_found',
      missingScope: null,
      contact: null,
      activity: [],
    });
  });

  it('skips the address lookup entirely when the lead row is gone', async () => {
    leadRow = null;
    fetchMock.mockImplementation(() => contactsPage([]));

    const snapshot = await realScoutLeadSnapshot(LEAD_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.reason).toBe('not_found');
  });

  it('asks for a bounded page of activity', async () => {
    fetchMock
      .mockResolvedValueOnce(contactsPage([CONTACT]))
      .mockResolvedValueOnce(jsonResponse(200, { data: [PROPERTY_VIEW], has_more: true }));

    await realScoutLeadSnapshot(LEAD_ID);

    expect(calledUrl(1)).toContain(`limit=${ACTIVITY_LIMIT}`);
    expect(calledUrl(1)).toContain(`contact_id=${encodeURIComponent(CONTACT.id)}`);
  });
});

describe('what it hands the panel', () => {
  beforeEach(() => {
    fetchMock
      .mockResolvedValueOnce(contactsPage([CONTACT]))
      .mockResolvedValueOnce(jsonResponse(200, { data: [PROPERTY_VIEW], has_more: false }));
  });

  it('carries the Scout Score and both movements', async () => {
    const snapshot = await realScoutLeadSnapshot(LEAD_ID);

    expect(snapshot.contact).toMatchObject({
      scoutScore: 62,
      scoutScoreChange7d: 21,
      scoutScoreChange30d: 14,
      emailable: true,
      leadSource: 'Home Value Widget',
    });
  });

  it('de-duplicates the agent’s tags against RealScout’s own', async () => {
    const snapshot = await realScoutLeadSnapshot(LEAD_ID);

    expect(snapshot.contact?.tags).toEqual(['Hot Lead', 'Seller']);
  });

  it('describes a property with its address, price, beds and baths', async () => {
    const snapshot = await realScoutLeadSnapshot(LEAD_ID);

    expect(snapshot.activity[0]).toMatchObject({
      action: 'view',
      label: '123 Main St',
      detail: '$1,250,000 · 3 bd · 2 ba · San Jose, CA',
      url: 'https://www.realscout.com/agent/ls/123-main-st',
    });
  });
});

describe('describing the other actionable shapes', () => {
  async function snapshotWith(actionable: unknown) {
    fetchMock
      .mockResolvedValueOnce(contactsPage([CONTACT]))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ ...PROPERTY_VIEW, actionable }],
          has_more: false,
        }),
      );
    return realScoutLeadSnapshot(LEAD_ID);
  }

  it('names a home value report by its address', async () => {
    const snapshot = await snapshotWith({
      type: 'HomeReport',
      address: '456 Oak Ave',
      city: 'San Jose',
      state: 'CA',
      valuation: 1100000,
    });

    expect(snapshot.activity[0]?.label).toBe('Home value: 456 Oak Ave');
    expect(snapshot.activity[0]?.detail).toContain('$1,100,000');
  });

  it('names a market report and its price band', async () => {
    const snapshot = await snapshotWith({
      type: 'MarketAlert',
      name: 'Buckhead',
      price_min: 800000,
      price_max: 1500000,
    });

    expect(snapshot.activity[0]?.label).toBe('Market report: Buckhead');
    expect(snapshot.activity[0]?.detail).toBe('$800,000 – $1,500,000');
  });

  it('names a CMA by its title', async () => {
    const snapshot = await snapshotWith({
      type: 'CmaReport',
      title: 'Whitfield — Buckhead comps',
      subject_address: '789 Elm St',
    });

    expect(snapshot.activity[0]?.label).toBe('CMA: Whitfield — Buckhead comps');
  });

  it('renders a shape RealScout adds later rather than an empty row', async () => {
    const snapshot = await snapshotWith({ type: 'SomethingNew' });

    expect(snapshot.activity[0]?.label).toBe('SomethingNew');
  });

  it('drops a URL that is not an https RealScout address', async () => {
    // The hazard: this value lands in an href, and HTML escaping leaves
    // `javascript:` intact and still clickable.
    const snapshot = await snapshotWith({
      type: 'Property',
      address: '1 Evil St',
      realscout_url: 'javascript:alert(1)',
    });

    expect(snapshot.activity[0]?.url).toBeNull();
  });
});

describe('failure handling', () => {
  it('reports unconfigured without touching the database or the network', async () => {
    delete testEnv.REALSCOUT_API_TOKEN;

    const snapshot = await realScoutLeadSnapshot(LEAD_ID);

    expect(snapshot.reason).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a bad token as auth rather than throwing', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(401, { error: { code: 'unauthorized', message: 'nope' } }),
    );

    await expect(realScoutLeadSnapshot(LEAD_ID)).resolves.toMatchObject({
      reason: 'auth',
      contact: null,
    });
  });

  it('names the missing scope so the panel can say which permission is absent', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(403, {
        error: {
          code: 'missing_scope',
          message:
            'This call requires the contacts:read scope, which this credential was not granted.',
        },
      }),
    );

    await expect(realScoutLeadSnapshot(LEAD_ID)).resolves.toMatchObject({
      reason: 'scope',
      missingScope: 'contacts:read',
    });
  });

  it('reports an outage as unavailable rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(realScoutLeadSnapshot(LEAD_ID)).resolves.toMatchObject({
      reason: 'unavailable',
      contact: null,
      activity: [],
    });
  });

  it('never puts the token in a log line', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(() =>
      jsonResponse(401, { error: { code: 'unauthorized', message: 'nope' } }),
    );

    await realScoutLeadSnapshot(LEAD_ID);

    expect(error.mock.calls.flat().join(' ')).not.toContain('rs_agent_test');
  });
});

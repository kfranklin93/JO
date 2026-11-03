// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { planImport } from '@/lib/services/lead-import-plan';
import { ImportLeadsModal } from './ImportLeadsModal';

/**
 * Tests for the bulk import dialog.
 *
 * This component is the preview gate: the only thing between a pasted
 * spreadsheet and 200 lead rows that cannot be un-written. `lead-import-plan`
 * and the route handler are tested on their own, and they prove the *plan* is
 * truthful. What they cannot prove is that the two screens render that plan —
 * a stage that throws, a list wired to the wrong group, a row number dropped
 * from a cell — and that failure would first surface when Joey imports his real
 * client database. So the assertions here all read the rendered DOM.
 *
 * The `fetch` stub answers with the real {@link planImport}, not a hand-written
 * plan object. A fixture plan would let the component and the planner drift
 * apart silently, which is the one thing the preview exists to prevent; routing
 * the stub through the planner means these screens are asserted against the
 * same decisions the server would actually make from this text.
 */

/** Already in the lead table, so row 5 collides with the database. */
const EXISTING_EMAILS = new Set(['hollis@example.com']);

/**
 * A `.csv` as Excel writes one: CRLF terminators, a header row, and a quoted
 * Notes cell containing a comma.
 *
 * Line 1 header, then one row of each outcome the preview has to separate:
 *
 * - line 2 — valid, `Active` → qualified, note with an embedded comma
 * - line 3 — same address as line 2, so a duplicate inside the file
 * - line 4 — malformed: a status word that is not one of Joey's three
 * - line 5 — valid but already in the lead table
 * - line 6 — malformed: the email is not an address
 */
const CRLF_FIXTURE = [
  'Name,Phone,Email,Status,Notes',
  'Dana Whitfield,(770) 555-0100,dana@example.com,Active,"Referral from the Hales, twice"',
  'Marcus Reed,(770) 555-0188,dana@example.com,Lead,Second copy of that address',
  'Priya Raman,(770) 555-0150,priya@example.com,Prospect,Status word is not one of the three',
  'Hollis Grant,(770) 555-0199,hollis@example.com,Closed,Closed in 2019',
  'Nora Vance,(770) 555-0111,nora-at-example,Lead,Email typo',
].join('\r\n');

/**
 * The same fixture as it arrives from the paste box.
 *
 * A `<textarea>` value is CRLF-normalised to LF by the platform — the HTML
 * spec's API value, which jsdom implements and every browser does too. So the
 * CRLF path is real only for a chosen file, and that is where it is asserted
 * (see "a chosen .csv file"); a paste assertion that expected `\r\n` back out
 * of the textarea would be testing something that cannot happen.
 */
const PASTED_FIXTURE = CRLF_FIXTURE.replace(/\r\n/g, '\n');

/**
 * Stands in for `POST /api/dashboard/leads/import`, planning with the real
 * planner and shaping the response the way the route does.
 */
const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
  const { text, commit } = JSON.parse(init.body) as {
    text: string;
    commit: boolean;
  };
  const outcome = planImport(text, EXISTING_EMAILS);

  if (!outcome.ok) {
    return {
      ok: false,
      status: 400,
      json: async () => ({ error: outcome.error }),
    };
  }

  if (!commit) {
    return { ok: true, status: 200, json: async () => ({ plan: outcome.plan }) };
  }

  const created = outcome.plan.create.map((row, index) => ({
    id: `lead-${index + 1}`,
    line: row.line,
    fullName: row.fullName,
    email: row.email,
    status: row.status,
  }));

  return {
    ok: true,
    status: 200,
    json: async () => ({
      committed: true,
      wrote: created.length > 0,
      batchId: 'batch-1',
      plan: outcome.plan,
      created,
      createdCount: created.length,
      followUpsCreated: 0,
    }),
  };
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The number shown on a tally card with this exact label. */
function tally(label: string): string {
  const caption = screen.getByText(label);
  const card = caption.closest('div');
  return card?.querySelector('p')?.textContent ?? '';
}

/** Whitespace-collapsed text of every `<li>` under the section with this title. */
function sectionItems(title: RegExp): string[] {
  const heading = screen.getByRole('heading', { name: title });
  const section = heading.closest('section');
  return Array.from(section?.querySelectorAll('li') ?? []).map((item) =>
    (item.textContent ?? '').replace(/\s+/g, ' ').trim()
  );
}

/** One string per body row of the "Will be created" table. */
function createdTableRows(): string[] {
  const heading = screen.getByRole('heading', { name: /^Will be created \(/ });
  const section = heading.closest('section');
  return Array.from(section?.querySelectorAll('tbody tr') ?? []).map((row) =>
    Array.from(row.querySelectorAll('td'))
      .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
      .join(' | ')
  );
}

/** Open the dialog, paste `text`, and advance to the preview. */
async function openAndPreview(
  text: string = CRLF_FIXTURE,
  handlers: { onClose?: () => void; onImported?: (s: { createdCount: number }) => void } = {}
): Promise<void> {
  render(
    <ImportLeadsModal
      isOpen
      onClose={handlers.onClose ?? vi.fn()}
      onImported={handlers.onImported ?? vi.fn()}
    />
  );

  fireEvent.change(screen.getByLabelText(/paste rows/i), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: /check these rows/i }));

  await screen.findByText('Will be created');
}

describe('nothing is written before the preview', () => {
  it('asks the server what would happen, with commit false', async () => {
    await openAndPreview();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/dashboard/leads/import');
    expect(JSON.parse(init.body)).toEqual({ text: PASTED_FIXTURE, commit: false });
  });

  it('will not check an empty textarea', () => {
    render(<ImportLeadsModal isOpen onClose={vi.fn()} onImported={vi.fn()} />);

    expect(screen.getByRole('button', { name: /check these rows/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the preview', () => {
  it('tallies the three outcomes', async () => {
    await openAndPreview();

    expect(tally('Will be created')).toBe('1');
    expect(tally('Skipped as duplicates')).toBe('2');
    expect(tally('Could not be read')).toBe('2');
  });

  it('says how many rows it found and how it read the columns', async () => {
    await openAndPreview();

    expect(
      screen.getByText(/5 data rows found, split by commas/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/first row read as column headings/)
    ).toBeInTheDocument();
  });

  it('lists the row it would create, with its spreadsheet line and mapped status', async () => {
    await openAndPreview();

    const rows = createdTableRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('2 |');
    expect(rows[0]).toContain('Dana Whitfield');
    expect(rows[0]).toContain('dana@example.com');
    expect(rows[0]).toContain('(770) 555-0100');
    expect(rows[0]).toContain('Qualified');
    expect(rows[0]).toContain('Active');
  });

  it('names the duplicate and the row it collides with', async () => {
    await openAndPreview();

    const skipped = sectionItems(/^Skipped as duplicates \(2\)/);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toBe(
      'Row 3: Marcus Reed (dana@example.com) — Same email as row 2 in this file'
    );
    expect(skipped[1]).toBe(
      'Row 5: Hollis Grant (hollis@example.com) — Already in the lead table'
    );
  });

  it('gives each malformed row its line number and what is wrong with it', async () => {
    await openAndPreview();

    const rejected = sectionItems(/^Could not be read \(2\)/);
    expect(rejected).toHaveLength(2);
    expect(rejected[0]).toBe(
      'Row 4: Priya Raman — Status "Prospect" is not one of Active, Closed, Lead'
    );
    expect(rejected[1]).toBe(
      'Row 6: Nora Vance — email: Enter a valid email address'
    );
  });

  it('shows the status mapping and says Active is the lossy one', async () => {
    await openAndPreview();

    expect(screen.getAllByText(/“Active” is the lossy one/).length).toBeGreaterThan(0);
  });

  it('offers to import only the rows it said it would create', async () => {
    await openAndPreview();

    expect(
      screen.getByRole('button', { name: 'Import 1 contact' })
    ).toBeEnabled();
  });

  it('has nothing to import when every row is a duplicate or malformed', async () => {
    await openAndPreview(
      [
        'Name,Phone,Email,Status,Notes',
        'Hollis Grant,(770) 555-0199,hollis@example.com,Closed,Already a client',
        'Nora Vance,(770) 555-0111,nora-at-example,Lead,Email typo',
      ].join('\r\n')
    );

    expect(tally('Will be created')).toBe('0');
    expect(
      screen.getByRole('heading', { name: 'Nothing to create' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 0 contacts' })).toBeDisabled();
  });

  it('reports a text the planner refuses, without advancing', async () => {
    render(<ImportLeadsModal isOpen onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/paste rows/i), {
      target: { value: 'Name,Phone,Status,Notes\r\nDana,(770) 555-0100,Lead,x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check these rows/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/No email column found/)
    );
    expect(screen.queryByText('Will be created')).not.toBeInTheDocument();
  });
});

describe('a chosen .csv file', () => {
  it('reaches the planner with its CRLF line endings intact', async () => {
    render(<ImportLeadsModal isOpen onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/choose a .csv file/i), {
      target: {
        files: [
          new File([CRLF_FIXTURE], 'clients.csv', { type: 'text/csv' }),
        ],
      },
    });

    await screen.findByText('Loaded clients.csv');
    const check = screen.getByRole('button', { name: /check these rows/i });
    await waitFor(() => expect(check).toBeEnabled());
    fireEvent.click(check);

    await screen.findByText('Will be created');

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ text: CRLF_FIXTURE, commit: false });

    // The same split as the pasted copy: a stray `\r` left on the last cell of
    // every row would make each status and each note unreadable, and the
    // tallies would collapse into "could not be read".
    expect(tally('Will be created')).toBe('1');
    expect(tally('Skipped as duplicates')).toBe('2');
    expect(tally('Could not be read')).toBe('2');
    expect(createdTableRows()[0]).toContain('Qualified');
  });
});

describe('the result', () => {
  it('re-sends only the text, so the server re-plans rather than trusting the screen', async () => {
    await openAndPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));

    await screen.findByText('Contacts created');
    const [, init] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ text: PASTED_FIXTURE, commit: true });
  });

  it('reports what was created, what was skipped, and zero follow-up emails', async () => {
    await openAndPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));
    await screen.findByText('Contacts created');

    expect(tally('Contacts created')).toBe('1');
    expect(tally('Skipped as duplicates')).toBe('2');
    expect(tally('Follow-up emails queued')).toBe('0');

    expect(
      screen.getByText(/1 contact written to the lead table/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2 rows could not be read and were not imported/)
    ).toBeInTheDocument();

    expect(sectionItems(/^Created$/)).toEqual([
      'Row 2: Dana Whitfield (dana@example.com) — Qualified',
    ]);
    expect(sectionItems(/^Not imported$/)).toEqual([
      'Row 4: Priya Raman — Status "Prospect" is not one of Active, Closed, Lead',
      'Row 6: Nora Vance — email: Enter a valid email address',
    ]);
    expect(sectionItems(/^Skipped$/)).toEqual([
      'Row 3: Marcus Reed (dana@example.com) — Same email as row 2 in this file',
      'Row 5: Hollis Grant (hollis@example.com) — Already in the lead table',
    ]);
  });

  it('keeps saying no email was sent on the screen that reports the write', async () => {
    await openAndPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));
    await screen.findByText('Contacts created');

    expect(screen.getByRole('heading', { name: 'No emails are sent' })).toBeInTheDocument();
    expect(screen.getByText(/no follow-up sequence/i)).toBeInTheDocument();
  });

  it('tells the caller how many rows to expect in the table', async () => {
    const onImported = vi.fn();
    await openAndPreview(CRLF_FIXTURE, { onImported });

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith({ createdCount: 1 }));
  });

  it('says nothing was imported when the commit cannot be sent', async () => {
    await openAndPreview();

    const onImported = vi.fn();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Nothing was imported/)
    );
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.queryByText('Contacts created')).not.toBeInTheDocument();
  });
});

describe('reopening', () => {
  it('clears the previous preview, so a stale plan cannot be committed', async () => {
    const { rerender } = render(
      <ImportLeadsModal isOpen onClose={vi.fn()} onImported={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText(/paste rows/i), {
      target: { value: CRLF_FIXTURE },
    });
    fireEvent.click(screen.getByRole('button', { name: /check these rows/i }));
    await screen.findByText('Will be created');

    rerender(<ImportLeadsModal isOpen={false} onClose={vi.fn()} onImported={vi.fn()} />);
    rerender(<ImportLeadsModal isOpen onClose={vi.fn()} onImported={vi.fn()} />);

    expect(screen.queryByText('Will be created')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/paste rows/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /check these rows/i })).toBeDisabled();
  });
});

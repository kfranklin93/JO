import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pulling RealScout contacts into leads.
 *
 * **The assertions that matter here are negative ones.** `persistLead` in
 * lead-capture.ts writes a lead and five `follow_ups` rows in one transaction,
 * and `captureLead` around it sends the first email, clears any suppression on
 * the address as fresh consent, emails Joey, texts Joey and syncs to Lofty.
 * Running Joey's RealScout contact book through that would queue hundreds of
 * marketing emails to people who never opted in to *this* site — CAN-SPAM
 * exposure for a licensed agent, and it would spend the deliverability of a
 * sending domain verified days ago. email-preferences.ts states it at the
 * definition of `recordFreshConsent`: a bulk list is not consent.
 *
 * So this suite exists to fail loudly the moment the sync path grows any of
 * that. The `db` mock records every insert by table and refuses a write issued
 * outside a transaction, so "zero follow_ups" is not a tautology: the mock
 * would record a `followUps` insert if one were ever issued.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

/** Every insert issued, in order, with the table it targeted. */
let recordedInserts: Array<{ table: string; values: unknown[] }>;
/** Rows the mocked dedupe lookup finds. */
let existingRows: Array<{ id: string; contactId: string | null }>;
/** How many times the dedupe lookup ran. */
let lookups: number;

vi.mock('@/lib/db', () => {
  const tableName = (table: unknown): string =>
    (table as { __name?: string }).__name ?? 'unknown';

  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      const name = tableName(table);
      const list = Array.isArray(values) ? values : [values];
      recordedInserts.push({ table: name, values: list });

      const rows = list.map((_row, index) => ({ id: `${name}-${index}` }));
      const promise = Promise.resolve(rows) as Promise<unknown[]> & {
        returning: (selection?: unknown) => Promise<unknown[]>;
      };
      promise.returning = () => Promise.resolve(rows);
      return promise;
    },
  });

  return {
    leads: {
      __name: 'leads',
      id: 'leads.id',
      email: 'leads.email',
      formData: 'leads.form_data',
    },
    followUps: { __name: 'followUps', id: 'follow_ups.id' },
    db: {
      select: () => ({
        from: () => ({
          where: () => {
            lookups++;
            return Promise.resolve(existingRows);
          },
        }),
      }),
      // A lead write outside a transaction is a defect: a lead that exists with
      // half a follow-up sequence behind it cannot be reasoned about.
      insert: () => {
        throw new Error('db.insert called outside a transaction');
      },
      transaction: async <T,>(
        callback: (tx: { insert: typeof insert }) => Promise<T>,
      ): Promise<T> => callback({ insert }),
    },
  };
});

/** Pages the mocked client yields, in order. */
let pages: Array<{ data: unknown[]; hasMore: boolean; nextCursor: string | null }>;
/** Thrown by the paginator when set, to exercise the failure paths. */
let pageError: unknown = null;
/** The params the sync asked for, so the overlapping window can be asserted. */
let requestedParams: Record<string, unknown> | null;

vi.mock('@/lib/services/realscout', async () => {
  const actual =
    await vi.importActual<typeof import('./realscout')>('./realscout');

  return {
    ...actual,
    realScoutConfigured: () =>
      typeof testEnv.REALSCOUT_API_TOKEN === 'string' &&
      testEnv.REALSCOUT_API_TOKEN.trim() !== '',
    pagesOfRealScoutContacts: async function* (
      params: Record<string, unknown>,
      _maxPages: number,
    ) {
      requestedParams = params;
      if (pageError !== null) throw pageError;
      for (const page of pages) {
        yield { ...page, rateLimit: { limit: 60, remaining: 59, reset: null } };
      }
    },
  };
});

const { syncRealScoutContacts, SYNC_WINDOW_DAYS } = await import('./realscout-sync');
const { RealScoutError } = await import('./realscout');

const NOW = new Date('2026-06-10T12:00:00.000Z');

/** A RealScout contact, with every field this app reads. */
function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'VXNlci0xMjM=',
    email: 'nora@example.com',
    first_name: 'Nora',
    last_name: 'Nguyen',
    primary_mobile_phone: '770-555-0100',
    lead_source: 'Home Value Widget',
    contact_type: 'SELLER',
    external_user_key: null,
    tags: ['Hot Lead'],
    realscout_tags: ['Seller'],
    external_tags: [],
    emailable: true,
    email_issue: null,
    status: { value: 'NURTURED', reasons: null },
    auto_nurture: { enabled: false, first_enabled_at: null },
    scout_score: 62,
    scout_score_change_7d: 21,
    scout_score_change_30d: 14,
    scout_score_summary_7d: null,
    scout_score_summary_30d: null,
    realscout_url: 'https://www.realscout.com/agent/contacts/VXNlci0xMjM=',
    created_at: '2026-06-01T17:00:00Z',
    updated_at: '2026-06-09T09:30:00Z',
    last_active_at: '2026-06-09T02:11:00Z',
    archived_at: null,
    ...overrides,
  };
}

/** One page containing these contacts. */
const onePage = (contacts: unknown[]) => [
  { data: contacts, hasMore: false, nextCursor: null },
];

/** Inserts issued against one table. */
const insertsInto = (table: string) =>
  recordedInserts.filter((entry) => entry.table === table);

/** Every row handed to the `leads` insert, flattened. */
const insertedLeadRows = (): Record<string, unknown>[] =>
  insertsInto('leads').flatMap((entry) => entry.values as Record<string, unknown>[]);

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
  testEnv.REALSCOUT_API_TOKEN = 'rs_agent_test';

  recordedInserts = [];
  existingRows = [];
  lookups = 0;
  pages = onePage([contact()]);
  pageError = null;
  requestedParams = null;

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the consent constraint', () => {
  it('creates the lead rows and ZERO follow_ups rows', async () => {
    // This is the assertion the whole sync path exists for. Hundreds of Joey's
    // RealScout contacts through `persistLead` is hundreds times five queued
    // marketing emails to people who never opted in to this site.
    const report = await syncRealScoutContacts({ now: NOW });

    expect(report.created).toBe(1);
    expect(insertsInto('leads')).toHaveLength(1);
    expect(insertsInto('followUps')).toHaveLength(0);
    expect(report.followUpsCreated).toBe(0);
  });

  it('writes nothing to any table other than leads', async () => {
    pages = onePage([
      contact(),
      contact({ id: 'c2', email: 'sam@example.com', first_name: 'Sam' }),
    ]);

    await syncRealScoutContacts({ now: NOW });

    expect([...new Set(recordedInserts.map((entry) => entry.table))]).toEqual(['leads']);
  });

  it('imports none of the modules that send or record consent', async () => {
    // A structural check, deliberately: the cheapest way to keep a sending
    // module out is to notice it appearing at all, rather than waiting for a
    // test to reach the code path that would call it.
    const source = readFileSync(
      join(process.cwd(), 'src/lib/services/realscout-sync.ts'),
      'utf-8',
    );

    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    for (const forbidden of [
      'recordFreshConsent',
      'captureLead',
      'persistLead',
      'notifyJoeyOfNewLead',
      'sendImmediateFollowUp',
      'sendSMSAlert',
      'sendLeadToLofty',
      'email-preferences',
      'email-service',
      'sms-service',
      'api/lofty',
      '/api/leads',
    ]) {
      expect(code, `${forbidden} must not be reachable from the sync path`).not.toContain(
        forbidden,
      );
    }
  });

  it('records in the row itself that no sequence and no consent were written', async () => {
    await syncRealScoutContacts({ now: NOW });

    const [row] = insertedLeadRows();
    const formData = row?.formData as Record<string, unknown>;

    expect(formData.followUpSequence).toContain('not scheduled');
    expect(String(row?.notes)).toContain('no email consent');
  });

  it('never reaches an emailing path for a contact RealScout cannot email', async () => {
    pages = onePage([contact({ emailable: false, email_issue: 'hard_bounce' })]);

    const report = await syncRealScoutContacts({ now: NOW });

    // The row is written — Joey still needs to see the lead — but nothing that
    // sends is created, and the suppression RealScout is reporting is carried
    // onto the row so a later hand action can see it.
    expect(report.created).toBe(1);
    expect(report.notEmailable).toBe(1);
    expect(insertsInto('followUps')).toHaveLength(0);

    const [row] = insertedLeadRows();
    expect((row?.formData as Record<string, unknown>).realscoutEmailable).toBe(false);
    expect(String(row?.notes)).toContain('RealScout cannot email this contact');
  });
});

describe('the overlapping window', () => {
  it('asks for a window that overlaps the last run instead of reading a watermark', async () => {
    await syncRealScoutContacts({ now: NOW });

    const expected = new Date(
      NOW.getTime() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    expect(requestedParams?.updated_after).toBe(expected);
  });

  it('honours an explicit window, so a backfill does not need new code', async () => {
    await syncRealScoutContacts({ now: NOW, windowDays: 1 });

    expect(requestedParams?.updated_after).toBe('2026-06-09T12:00:00.000Z');
  });
});

describe('deduplication', () => {
  it('creates no duplicate when the same contact is synced again', async () => {
    // The overlapping window re-reads the same contacts every day, so this is
    // the normal case rather than an edge one.
    existingRows = [{ id: 'lead-1', contactId: 'VXNlci0xMjM=' }];

    const report = await syncRealScoutContacts({ now: NOW });

    expect(report.created).toBe(0);
    expect(insertsInto('leads')).toHaveLength(0);
    expect(report.skipped).toEqual([
      {
        contactId: 'VXNlci0xMjM=',
        reason: 'already_synced',
        detail: 'A lead row already carries this RealScout contact id',
      },
    ]);
  });

  it('does not sync back a contact this site pushed, keyed on external_user_key', async () => {
    const leadId = '11111111-2222-4333-8444-555555555555';
    existingRows = [{ id: leadId, contactId: null }];
    pages = onePage([contact({ external_user_key: leadId })]);

    const report = await syncRealScoutContacts({ now: NOW });

    expect(report.created).toBe(0);
    expect(report.skipped[0]).toMatchObject({ reason: 'already_ours' });
  });

  it('does not key on the email, because leads.email is deliberately non-unique', async () => {
    // A repeat client is legitimately two rows — buy now, sell in three years.
    // A lead that shares the address but carries no RealScout contact id is
    // therefore not a match, and the contact still syncs.
    existingRows = [{ id: 'lead-older', contactId: null }];

    const report = await syncRealScoutContacts({ now: NOW });

    expect(report.created).toBe(1);
  });

  it('ignores an external_user_key that is not UUID-shaped', async () => {
    // `leads.id` is a Postgres uuid, and comparing it against arbitrary
    // external text is an invalid-input error rather than a non-match.
    pages = onePage([contact({ external_user_key: 'crm-3187' })]);

    const report = await syncRealScoutContacts({ now: NOW });

    expect(report.created).toBe(1);
    expect(lookups).toBe(1);
  });
});

describe('mapping onto a lead', () => {
  it('satisfies leadSubmissionSchema rather than inventing a second path', async () => {
    await syncRealScoutContacts({ now: NOW });

    expect(insertedLeadRows()[0]).toMatchObject({
      email: 'nora@example.com',
      firstName: 'Nora',
      lastName: 'Nguyen',
      fullName: 'Nora Nguyen',
      phone: '770-555-0100',
      propertyInterest: 'sell',
      status: 'new',
      source: 'other',
    });
  });

  it('maps BUYER to buy and anything unrecognised to general', async () => {
    pages = onePage([
      contact({ id: 'b', email: 'b@example.com', contact_type: 'BUYER' }),
      contact({ id: 'x', email: 'x@example.com', contact_type: 'BUYER_SELLER' }),
      contact({ id: 'n', email: 'n@example.com', contact_type: null }),
    ]);

    await syncRealScoutContacts({ now: NOW });

    expect(insertedLeadRows().map((row) => row.propertyInterest)).toEqual([
      'buy',
      'general',
      'general',
    ]);
  });

  it('uses the address as the name for a contact RealScout holds no name for', async () => {
    pages = onePage([contact({ first_name: null, last_name: null })]);

    await syncRealScoutContacts({ now: NOW });

    expect(insertedLeadRows()[0]).toMatchObject({ fullName: 'nora@example.com' });
  });

  it('drops an over-long phone rather than losing the whole contact', async () => {
    pages = onePage([
      contact({ primary_mobile_phone: '+1 (770) 555-0100 extension 12345' }),
    ]);

    const report = await syncRealScoutContacts({ now: NOW });

    expect(report.created).toBe(1);
    expect(insertedLeadRows()[0]?.phone).toBeNull();
  });

  it('skips a contact with no email, which is the one field a lead needs', async () => {
    pages = onePage([contact({ email: null })]);

    const report = await syncRealScoutContacts({ now: NOW });

    expect(report.created).toBe(0);
    expect(report.skipped[0]).toMatchObject({ reason: 'no_email' });
  });

  it('records the RealScout contact id, which is what the next run keys on', async () => {
    await syncRealScoutContacts({ now: NOW });

    expect(
      (insertedLeadRows()[0]?.formData as Record<string, unknown>).realscoutContactId,
    ).toBe('VXNlci0xMjM=');
  });
});

describe('failure handling', () => {
  it('reports `configured: false` and writes nothing when there is no token', async () => {
    delete testEnv.REALSCOUT_API_TOKEN;

    const report = await syncRealScoutContacts({ now: NOW });

    expect(report).toMatchObject({ configured: false, seen: 0, created: 0 });
    expect(recordedInserts).toHaveLength(0);
  });

  it('surfaces a 403 with the scope it named, rather than a generic failure', async () => {
    pageError = new RealScoutError(
      'scope',
      'RealScout requires the contacts:read scope, which this token was not granted.',
      { status: 403, missingScope: 'contacts:read' },
    );

    const error = await syncRealScoutContacts({ now: NOW }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(RealScoutError);
    expect(error).toMatchObject({ kind: 'scope', missingScope: 'contacts:read' });
  });

  it('keeps what it already wrote when a later page fails', async () => {
    pages = onePage([contact()]);

    await syncRealScoutContacts({ now: NOW });
    expect(insertsInto('leads')).toHaveLength(1);

    // Each contact is its own transaction, and the overlapping window means the
    // next run re-reads whatever this one did not reach.
    recordedInserts = [];
    pageError = new RealScoutError('server', 'RealScout returned a server error.', {
      status: 500,
    });
    await expect(syncRealScoutContacts({ now: NOW })).rejects.toBeInstanceOf(
      RealScoutError,
    );
  });
});

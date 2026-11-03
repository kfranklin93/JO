import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The write half of lead entry and bulk import.
 *
 * The assertions that matter most here are negative ones. `persistLead` in
 * lead-capture.ts writes a lead and five `follow_ups` rows in one transaction,
 * and `captureLead` around it sends the first email, clears any suppression on
 * the address as fresh consent, emails Joey, texts Joey and syncs to Lofty.
 * Reusing that for a 200-row spreadsheet queues a thousand marketing emails to
 * people who never opted in and silently undoes every unsubscribe on the list.
 *
 * So this suite exists to fail loudly the moment the import path grows any of
 * that. The `db` mock records every insert by table, refuses a write issued
 * outside a transaction, and has no `update` at all, so a consent write cannot
 * pass unnoticed.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

/** Every insert issued, in order, with the table it targeted. */
let recordedInserts: Array<{ table: string; values: unknown[] }>;
/** Rows the mocked existing-email lookup finds. */
let existingEmailRows: Array<{ email: string }>;
/** How many times a transaction was opened. */
let transactions: number;
/** How many times the existing-email lookup ran. */
let lookups: number;

const CREATED_AT = new Date('2026-05-04T10:00:00.000Z');

vi.mock('@/lib/db', () => {
  const tableName = (table: unknown): string =>
    (table as { __name?: string }).__name ?? 'unknown';

  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      const name = tableName(table);
      const list = Array.isArray(values) ? values : [values];
      recordedInserts.push({ table: name, values: list });

      const rows = list.map((row, index) => ({
        id: `${name}-${index}`,
        email: (row as { email?: string }).email,
        templateType: (row as { templateType?: string }).templateType,
        createdAt: CREATED_AT,
      }));

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
      createdAt: 'leads.created_at',
    },
    followUps: { __name: 'followUps', id: 'follow_ups.id' },
    db: {
      select: () => ({
        from: () => ({
          where: () => {
            lookups++;
            return Promise.resolve(existingEmailRows);
          },
        }),
      }),
      // A lead write outside a transaction is a defect: a lead that exists with
      // half a follow-up sequence behind it cannot be reasoned about.
      insert: () => {
        throw new Error('db.insert called outside a transaction');
      },
      transaction: async <T,>(
        callback: (tx: { insert: typeof insert }) => Promise<T>
      ): Promise<T> => {
        transactions++;
        return callback({ insert });
      },
    },
  };
});

const { createManualLead, previewImport, runImport } = await import('./lead-import');

/** Inserts issued against one table. */
const insertsInto = (table: string) =>
  recordedInserts.filter((entry) => entry.table === table);

/** Every row handed to the `leads` insert, flattened. */
const insertedLeadRows = (): Record<string, unknown>[] =>
  insertsInto('leads').flatMap((entry) => entry.values as Record<string, unknown>[]);

const CSV =
  'Name,Phone,Email,Status,Notes\r\n' +
  '"Whitfield, Dana",(770) 555-0100,dana@example.com,Active,"Referral, 2023"\r\n' +
  'Sam Reyes,(770) 555-0200,sam@example.com,Lead,\r\n' +
  'Dana Again,(770) 555-0300,DANA@example.com,Closed,dup\r\n' +
  'Broken Row,(770) 555-0400,not-an-email,Lead,\r\n';

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

  recordedInserts = [];
  existingEmailRows = [];
  transactions = 0;
  lookups = 0;

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the consent constraint', () => {
  it('creates the lead rows and zero follow_ups rows', async () => {
    // This is the assertion the whole import path exists for. 200 contacts
    // through `persistLead` is 1,000 queued marketing emails.
    const outcome = await runImport(CSV);

    expect(outcome.ok).toBe(true);
    expect(insertsInto('leads')).toHaveLength(1);
    expect(insertedLeadRows()).toHaveLength(2);
    expect(insertsInto('followUps')).toHaveLength(0);
    expect(outcome.ok && outcome.result.followUpsCreated).toBe(0);
  });

  it('writes nothing to any table other than leads', async () => {
    await runImport(CSV);

    expect([...new Set(recordedInserts.map((entry) => entry.table))]).toEqual([
      'leads',
    ]);
  });

  it('imports none of the modules that send or record consent', async () => {
    // A structural check, deliberately. Every one of these is correct for a
    // visitor who typed their own address into the website form and wrong for a
    // spreadsheet, and the cheapest way to keep them out is to notice the
    // import appearing at all — before it is wired to a code path a test has to
    // reach to observe.
    const source = readFileSync(
      join(process.cwd(), 'src/lib/services/lead-import.ts'),
      'utf-8'
    );

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
      // Allowed in prose, never as code. Anything outside a comment is a call.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${forbidden} must not be reachable from the import path`)
        .not.toContain(forbidden);
    }
  });

  it('records in the row itself that no sequence and no consent were written', async () => {
    await runImport(CSV);

    const [first] = insertedLeadRows();

    expect(first?.notes).toContain('No follow-up sequence was created');
    expect(first?.notes).toContain('no email consent was recorded');
  });
});

describe('what the import writes', () => {
  it('writes the mapped status, not Joey’s word', async () => {
    await runImport(CSV);

    expect(insertedLeadRows().map((row) => row.status)).toEqual([
      'qualified',
      'new',
    ]);
  });

  it('keeps the spreadsheet word in form_data so the lossy mapping is recoverable', async () => {
    await runImport(CSV);

    const [first] = insertedLeadRows();

    expect(first?.formData).toMatchObject({ spreadsheetStatus: 'Active' });
  });

  it('writes name, email and phone, and splits the name as the form does', async () => {
    await runImport(
      'Dana Mary Whitfield,(770) 555-0100,dana@example.com,Active,note'
    );

    expect(insertedLeadRows()[0]).toMatchObject({
      fullName: 'Dana Mary Whitfield',
      firstName: 'Dana',
      lastName: 'Mary Whitfield',
      email: 'dana@example.com',
      phone: '(770) 555-0100',
    });
  });

  it('records no intent it was not told, and marks the source as other', async () => {
    await runImport('Dana,(770) 555-0100,dana@example.com,Active,note');

    expect(insertedLeadRows()[0]).toMatchObject({
      propertyInterest: 'general',
      source: 'other',
    });
  });

  it('issues one insert inside one transaction, so the write is all or nothing', async () => {
    await runImport(CSV);

    expect(transactions).toBe(1);
    expect(recordedInserts).toHaveLength(1);
  });

  it('writes nothing when every row is a duplicate or a reject', async () => {
    existingEmailRows = [{ email: 'dana@example.com' }, { email: 'sam@example.com' }];

    const outcome = await runImport(CSV);

    expect(recordedInserts).toHaveLength(0);
    expect(transactions).toBe(0);
    expect(outcome.ok && outcome.result.wrote).toBe(false);
    expect(outcome.ok && outcome.result.created).toEqual([]);
  });

  it('reports the created rows against the file rows they came from', async () => {
    const outcome = await runImport(CSV);

    expect(outcome.ok && outcome.result.created).toEqual([
      {
        id: 'leads-0',
        line: 2,
        fullName: 'Whitfield, Dana',
        email: 'dana@example.com',
        status: 'qualified',
      },
      {
        id: 'leads-1',
        line: 3,
        fullName: 'Sam Reyes',
        email: 'sam@example.com',
        status: 'new',
      },
    ]);
  });

  it('reports the skipped and rejected rows alongside what it wrote', async () => {
    existingEmailRows = [{ email: 'sam@example.com' }];

    const outcome = await runImport(CSV);
    if (!outcome.ok) throw new Error(outcome.error);

    expect(outcome.result.plan.skipped.map((row) => [row.line, row.reason])).toEqual(
      [
        [3, 'already_in_database'],
        [4, 'duplicate_in_file'],
      ]
    );
    expect(outcome.result.plan.rejected.map((row) => row.line)).toEqual([5]);
  });
});

describe('previewImport', () => {
  it('writes nothing', async () => {
    await previewImport(CSV);

    expect(recordedInserts).toHaveLength(0);
    expect(transactions).toBe(0);
  });

  it('checks the planned addresses against the lead table', async () => {
    existingEmailRows = [{ email: 'DANA@Example.com' }];

    const outcome = await previewImport(CSV);
    if (!outcome.ok) throw new Error(outcome.error);

    expect(lookups).toBe(1);
    expect(outcome.plan.create.map((row) => row.email)).toEqual([
      'sam@example.com',
    ]);
    expect(outcome.plan.skipped[0]).toMatchObject({
      line: 2,
      reason: 'already_in_database',
    });
  });

  it('surfaces a refusal without touching the database', async () => {
    const outcome = await previewImport('   ');

    expect(outcome.ok).toBe(false);
    expect(lookups).toBe(0);
  });

  it('throws before any write when DATABASE_URL is missing', async () => {
    delete testEnv.DATABASE_URL;

    await expect(previewImport(CSV)).rejects.toThrow();
    expect(recordedInserts).toHaveLength(0);
  });
});

describe('createManualLead', () => {
  const submission = {
    fullName: 'Dana Whitfield',
    firstName: 'Dana',
    lastName: 'Whitfield',
    email: 'dana@example.com',
    phone: '(770) 555-0100',
    intent: 'buy' as const,
    additionalNotes: 'Referral from the Hales',
  };

  it('queues no follow-ups when the box is left unticked', async () => {
    // The default, and the one that cannot send an email to somebody who never
    // asked for one.
    const result = await createManualLead(submission, {
      status: 'new',
      scheduleFollowUps: false,
    });

    expect(insertsInto('followUps')).toHaveLength(0);
    expect(result.followUpsCreated).toBe(0);
  });

  it('queues the five-touch sequence when the box is ticked', async () => {
    const result = await createManualLead(submission, {
      status: 'contacted',
      scheduleFollowUps: true,
    });

    const written = insertsInto('followUps')[0]?.values as Array<{
      templateType: string;
      status: string;
    }>;

    expect(result.followUpsCreated).toBe(5);
    expect(written.map((row) => row.templateType)).toEqual([
      'immediate',
      'day3',
      'day7',
      'day14',
      'day30',
    ]);
  });

  it('queues the immediate touch as scheduled, never as sending', async () => {
    // `sending` on the website path means "this request is sending it inline".
    // Nothing sends inline here, so a `sending` row would sit claimed by nobody
    // until the queue's staleness reclaim picked it up.
    await createManualLead(submission, { status: 'new', scheduleFollowUps: true });

    const written = insertsInto('followUps')[0]?.values as Array<{
      status: string;
      scheduledFor: Date;
    }>;

    expect(written.every((row) => row.status === 'scheduled')).toBe(true);
    expect(written[0]?.scheduledFor).toEqual(CREATED_AT);
  });

  it('writes the lead and its sequence in one transaction', async () => {
    await createManualLead(submission, { status: 'new', scheduleFollowUps: true });

    expect(transactions).toBe(1);
    expect(recordedInserts.map((entry) => entry.table)).toEqual([
      'leads',
      'followUps',
    ]);
  });

  it('writes the status Joey chose', async () => {
    await createManualLead(submission, {
      status: 'under_contract',
      scheduleFollowUps: false,
    });

    expect(insertedLeadRows()[0]).toMatchObject({
      status: 'under_contract',
      propertyInterest: 'buy',
      source: 'other',
    });
  });

  it('keeps Joey’s note and records how the lead was entered', async () => {
    await createManualLead(submission, { status: 'new', scheduleFollowUps: false });

    const notes = insertedLeadRows()[0]?.notes as string;

    expect(notes.startsWith('Referral from the Hales')).toBe(true);
    expect(notes).toContain('entered by hand in the dashboard');
    expect(notes).toContain('not scheduled');
  });

  it('throws before any write when DATABASE_URL is missing', async () => {
    delete testEnv.DATABASE_URL;

    await expect(
      createManualLead(submission, { status: 'new', scheduleFollowUps: false })
    ).rejects.toThrow();
    expect(recordedInserts).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  importedNotes,
  mapSpreadsheetStatus,
  MAX_IMPORT_ROWS,
  planImport,
  SPREADSHEET_STATUS_MAP,
  type ImportPlan,
} from './lead-import-plan';

/**
 * The import planner: what happens to every row, decided before anything is
 * written.
 *
 * This is the half of the import worth testing hardest, because the preview
 * Joey approves and the write that follows are both produced here. A rule that
 * is wrong in this file is wrong identically on both screens, which is exactly
 * the failure that makes a bad import invisible until the emails go out.
 */

/** Plan against an empty table unless a test says otherwise. */
function plan(text: string, existing: string[] = []): ImportPlan {
  const outcome = planImport(text, new Set(existing));
  if (!outcome.ok) throw new Error(`expected a plan, got: ${outcome.error}`);
  return outcome.plan;
}

function refusal(text: string, existing: string[] = []): string {
  const outcome = planImport(text, new Set(existing));
  if (outcome.ok) throw new Error('expected a refusal, got a plan');
  return outcome.error;
}

describe('status mapping', () => {
  it('converts each of Joey’s three words', () => {
    expect(mapSpreadsheetStatus('Lead')).toEqual({
      ok: true,
      status: 'new',
      word: 'Lead',
    });
    expect(mapSpreadsheetStatus('Active')).toEqual({
      ok: true,
      status: 'qualified',
      word: 'Active',
    });
    expect(mapSpreadsheetStatus('Closed')).toEqual({
      ok: true,
      status: 'closed',
      word: 'Closed',
    });
  });

  it('maps all three to members of the database enum and nothing else', () => {
    // The mapping is the only place Joey's vocabulary meets `lead_status`, and
    // schema.ts may not be edited. A value here that the column rejects would
    // surface as a Postgres enum error partway through a 200-row import.
    expect(Object.values(SPREADSHEET_STATUS_MAP).sort()).toEqual([
      'closed',
      'new',
      'qualified',
    ]);
  });

  it('is case- and whitespace-insensitive, as a spreadsheet cell will be', () => {
    expect(mapSpreadsheetStatus('  active ')).toMatchObject({ status: 'qualified' });
    expect(mapSpreadsheetStatus('CLOSED')).toMatchObject({ status: 'closed' });
  });

  it('treats a blank status as new, matching the column default', () => {
    expect(mapSpreadsheetStatus(null)).toEqual({
      ok: true,
      status: 'new',
      word: null,
    });
  });

  it('rejects an unrecognised word rather than defaulting it to new', () => {
    // Defaulting is how a closed client silently returns to the top of the
    // pipeline. The row number and the offending word are a spreadsheet fix.
    const outcome = mapSpreadsheetStatus('Warm');

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toContain('"Warm"');
    expect(outcome.ok === false && outcome.error).toContain('Active, Closed, Lead');
  });

  it('reports an unrecognised status against the row it came from', () => {
    const result = plan(
      'Name,Phone,Email,Status,Notes\nDana,555-0100,dana@example.com,Warm,note'
    );

    expect(result.create).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.line).toBe(2);
    expect(result.rejected[0]?.detail).toContain('"Warm"');
  });

  it('carries the spreadsheet word onto the planned row', () => {
    const result = plan('Dana,555-0100,dana@example.com,Active,note');

    expect(result.create[0]).toMatchObject({
      status: 'qualified',
      spreadsheetStatus: 'Active',
    });
  });
});

describe('column detection', () => {
  it('reads a header row and maps by name, not by position', () => {
    const result = plan('Email,Full Name,Status\ndana@example.com,Dana Whitfield,Lead');

    expect(result.headerDetected).toBe(true);
    expect(result.create[0]).toMatchObject({
      fullName: 'Dana Whitfield',
      email: 'dana@example.com',
      status: 'new',
    });
  });

  it('accepts the header spellings a real export uses', () => {
    const result = plan(
      'Client Name\tCell\tE-Mail\tStage\tComments\nDana\t555-0100\tdana@example.com\tActive\thi'
    );

    expect(result.headerDetected).toBe(true);
    expect(result.create[0]).toMatchObject({
      fullName: 'Dana',
      phone: '555-0100',
      email: 'dana@example.com',
      status: 'qualified',
      notes: 'hi',
    });
  });

  it('falls back to Joey’s column order when there is no header', () => {
    const result = plan('Dana Whitfield,555-0100,dana@example.com,Closed,past client');

    expect(result.headerDetected).toBe(false);
    expect(result.totalRows).toBe(1);
    expect(result.create[0]).toMatchObject({
      fullName: 'Dana Whitfield',
      phone: '555-0100',
      email: 'dana@example.com',
      status: 'closed',
      notes: 'past client',
    });
  });

  it('does not eat a contact row as a header on one accidental match', () => {
    // A single recognised word is too easy to hit by chance, and consuming a
    // real row as a header loses that person silently.
    const result = plan('Contact,555-0100,dana@example.com,Lead,note');

    expect(result.headerDetected).toBe(false);
    expect(result.create).toHaveLength(1);
    expect(result.create[0]?.fullName).toBe('Contact');
  });

  it('refuses text with no email column at all', () => {
    expect(refusal('Name\nDana\nSam')).toContain('No email column');
  });

  it('names the missing email column rather than rejecting every row for a bad address', () => {
    // Without this, the positional fallback reads the Status column as the
    // email column and reports 200 invalid addresses for one missing heading.
    const error = refusal('Name,Phone,Status\nDana,555-0100,Active');

    expect(error).toContain('No email column');
  });

  it('refuses a header row with nothing under it', () => {
    expect(refusal('Name,Phone,Email,Status,Notes')).toContain('no contacts under it');
  });

  it('refuses empty text', () => {
    expect(refusal('   ')).toContain('Paste some rows');
  });
});

describe('deduplication', () => {
  it('skips a second row with the same email and names the row it collided with', () => {
    const result = plan(
      'Name,Phone,Email,Status,Notes\n' +
        'Dana Whitfield,555-0100,dana@example.com,Active,first\n' +
        'Sam Reyes,555-0200,sam@example.com,Lead,second\n' +
        'Dana W,555-0300,DANA@example.com,Closed,duplicate\n'
    );

    expect(result.create.map((row) => row.email)).toEqual([
      'dana@example.com',
      'sam@example.com',
    ]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      line: 4,
      reason: 'duplicate_in_file',
      email: 'dana@example.com',
    });
    expect(result.skipped[0]?.detail).toContain('row 2');
  });

  it('skips a row whose email is already in the lead table', () => {
    const result = plan('Dana,555-0100,dana@example.com,Active,note', [
      'dana@example.com',
    ]);

    expect(result.create).toHaveLength(0);
    expect(result.skipped[0]).toMatchObject({
      line: 1,
      reason: 'already_in_database',
    });
    expect(result.skipped[0]?.detail).toContain('Already in the lead table');
  });

  it('matches an existing address regardless of case', () => {
    const result = plan('Dana,555-0100,Dana@Example.COM,Active,note', [
      'dana@example.com',
    ]);

    expect(result.create).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe('already_in_database');
  });

  it('does not deduplicate on phone, because a household shares one', () => {
    // Two spouses with their own addresses are two contacts. Keying on phone
    // would import one and silently drop the other.
    const result = plan(
      'Dana Whitfield,555-0100,dana@example.com,Active,one\n' +
        'Mo Whitfield,555-0100,mo@example.com,Active,two\n'
    );

    expect(result.create).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it('keeps the first occurrence rather than the last', () => {
    const result = plan(
      'Dana First,555-0100,dana@example.com,Active,keep\n' +
        'Dana Second,555-0200,dana@example.com,Closed,drop\n'
    );

    expect(result.create[0]?.fullName).toBe('Dana First');
    expect(result.create[0]?.status).toBe('qualified');
  });

  it('does not let an invalid row claim an address, so a later valid one lands', () => {
    const result = plan(
      'not-an-email-row,555-0100,nope,Active,bad\n' +
        'Dana,555-0200,dana@example.com,Active,good\n'
    );

    expect(result.rejected).toHaveLength(1);
    expect(result.create).toHaveLength(1);
    expect(result.create[0]?.email).toBe('dana@example.com');
  });
});

describe('rejection reporting', () => {
  it('names the row and the field for a malformed email', () => {
    const result = plan(
      'Name,Phone,Email,Status,Notes\n' +
        'Dana,555-0100,dana@example.com,Active,ok\n' +
        'Sam,555-0200,sam-at-example,Lead,broken\n' +
        'Mo,555-0300,mo@example.com,Closed,ok\n'
    );

    expect(result.create).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.line).toBe(3);
    expect(result.rejected[0]?.errors['email']).toBe('Enter a valid email address');
    expect(result.rejected[0]?.label).toBe('Sam');
  });

  it('reports a row number that survives a quoted note containing a newline', () => {
    const result = plan(
      'Name,Phone,Email,Status,Notes\n' +
        'Dana,555-0100,dana@example.com,Active,"two\nlines"\n' +
        'Sam,555-0200,broken,Lead,bad\n'
    );

    // The quoted note pushes the bad row onto line 4, and that is the number
    // the user has to be given.
    expect(result.rejected[0]?.line).toBe(4);
  });

  it('rejects a row with no email rather than importing it unkeyed', () => {
    // An unkeyed row is a row that imports again on the next attempt.
    const result = plan('Name,Phone,Email,Status\nDana,555-0100,,Active');

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.errors['email']).toBeTruthy();
  });

  it('rejects a row with no name', () => {
    const result = plan('Name,Phone,Email,Status\n,555-0100,dana@example.com,Active');

    expect(result.rejected[0]?.errors['name']).toBe('Name is required');
    expect(result.rejected[0]?.label).toBe('dana@example.com');
  });

  it('rejects a phone number too long for the column instead of truncating it', () => {
    const result = plan(
      `Dana,${'9'.repeat(40)},dana@example.com,Active,note`
    );

    expect(result.rejected[0]?.errors['phone']).toBeTruthy();
  });
});

describe('the whole thing on realistic input', () => {
  it('reads a Windows CSV with a quoted comma, a duplicate, and a bad row', () => {
    const csv =
      'Name,Phone,Email,Status,Notes\r\n' +
      '"Whitfield, Dana",(770) 555-0100,dana@example.com,Active,"Referral, 2023"\r\n' +
      'Sam Reyes,,sam@example.com,Lead,\r\n' +
      'Dana Again,(770) 555-0100,dana@example.com,Closed,dup\r\n' +
      'Broken Row,555,not-an-email,Lead,\r\n' +
      'Mo Patel,(770) 555-0400,mo@example.com,Nope,\r\n';

    const result = plan(csv, ['sam@example.com']);

    expect(result.delimiter).toBe(',');
    expect(result.headerDetected).toBe(true);
    expect(result.totalRows).toBe(5);

    expect(result.create).toHaveLength(1);
    expect(result.create[0]).toMatchObject({
      line: 2,
      fullName: 'Whitfield, Dana',
      email: 'dana@example.com',
      phone: '(770) 555-0100',
      status: 'qualified',
      notes: 'Referral, 2023',
    });

    expect(result.skipped.map((row) => [row.line, row.reason])).toEqual([
      [3, 'already_in_database'],
      [4, 'duplicate_in_file'],
    ]);

    expect(result.rejected.map((row) => row.line)).toEqual([5, 6]);

    // Every data row is accounted for exactly once. A row that falls through
    // all three lists is a contact nobody is told about.
    expect(
      result.create.length + result.skipped.length + result.rejected.length
    ).toBe(result.totalRows);
  });

  it('reads a tab-separated paste with no header', () => {
    const result = plan(
      'Dana Whitfield\t(770) 555-0100\tdana@example.com\tActive\tnote\n' +
        'Sam Reyes\t(770) 555-0200\tsam@example.com\tLead\t'
    );

    expect(result.delimiter).toBe('\t');
    expect(result.headerDetected).toBe(false);
    expect(result.create).toHaveLength(2);
    expect(result.create[1]?.notes).toBeNull();
  });

  it('refuses an import above the row cap instead of timing out on it', () => {
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_, i) => `Person ${i},555,p${i}@example.com,Lead,`
    ).join('\n');

    expect(refusal(rows)).toContain(`limit for one import is ${MAX_IMPORT_ROWS}`);
  });
});

describe('provenance note', () => {
  const at = new Date('2026-05-04T10:00:00.000Z');

  it('records the spreadsheet word, so the lossy Active mapping stays recoverable', () => {
    const note = importedNotes(
      {
        line: 2,
        fullName: 'Dana',
        email: 'dana@example.com',
        phone: null,
        status: 'qualified',
        spreadsheetStatus: 'Active',
        notes: null,
      },
      at
    );

    expect(note).toContain('"Active"');
    expect(note).toContain('"qualified"');
    expect(note).toContain('2026-05-04T10:00:00.000Z');
  });

  it('says in the row itself that no follow-up and no consent were recorded', () => {
    const note = importedNotes(
      {
        line: 2,
        fullName: 'Dana',
        email: 'dana@example.com',
        phone: null,
        status: 'closed',
        spreadsheetStatus: 'Closed',
        notes: null,
      },
      at
    );

    expect(note).toContain('No follow-up sequence was created');
    expect(note).toContain('no email consent was recorded');
  });

  it('keeps Joey’s own note above the provenance line', () => {
    const note = importedNotes(
      {
        line: 2,
        fullName: 'Dana',
        email: 'dana@example.com',
        phone: null,
        status: 'new',
        spreadsheetStatus: null,
        notes: 'Met at the Hales’ open house',
      },
      at
    );

    expect(note.startsWith('Met at the Hales’ open house')).toBe(true);
    expect(note).toContain('no status in the sheet');
  });
});

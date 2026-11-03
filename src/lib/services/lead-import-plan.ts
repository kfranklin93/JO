/**
 * Turning a block of spreadsheet text into a decision about every row.
 *
 * Pure on purpose: no database, no `fetch`, no clock beyond what is handed in.
 * {@link planImport} takes the pasted text and the set of email addresses the
 * lead table already holds, and returns what *would* happen. The database half
 * lives in src/lib/services/lead-import.ts, which loads that set and — only
 * when asked a second time — writes the plan.
 *
 * The split is the point. The preview Joey approves and the import that runs
 * are produced by the same function, so the preview cannot describe one outcome
 * while the write performs another. An import that silently does something
 * different to 200 contacts than the screen said is the failure this shape
 * exists to make impossible.
 */

import {
  formatFieldErrors,
  leadSubmissionSchema,
  type LeadSubmission,
} from '@/lib/validation/lead';
import type { LeadStatusValue } from '@/lib/validation/lead-status';
import {
  parseDelimited,
  type Delimiter,
  type DelimitedRecord,
} from '@/lib/utils/delimited';

/**
 * How many rows one import may carry.
 *
 * Not a storage limit. The planner holds every row in memory, the existing-email
 * lookup becomes one `IN (...)` with one parameter per row, and the whole write
 * is a single transaction — all of which are fine at a thousand rows and none of
 * which are fine at a hundred thousand. Joey's client database is in the low
 * hundreds, so the cap is far enough above the real input to never be met, and
 * low enough that a pasted mistake is refused with a sentence instead of
 * timing out the function.
 */
export const MAX_IMPORT_ROWS = 1000;

/**
 * The intent recorded for every imported contact.
 *
 * Joey's spreadsheet has five columns — Name, Phone, Email, Status, Notes — and
 * none of them says whether the person is buying or selling. `general` is the
 * `LEAD_INTENTS` member that means exactly that: a contact with no stated
 * intent. Guessing one from the status, or leaving the column null, would both
 * put a claim on the row that the source data does not support.
 */
export const IMPORT_INTENT = 'general' as const;

/**
 * Joey's three spreadsheet statuses, mapped onto the ten-member `lead_status`
 * enum in src/lib/db/schema.ts.
 *
 * **This mapping is lossy, and the loss is all on `Active`.** The enum
 * describes a pipeline — contacted, qualified, appointment set, showing
 * scheduled, offer made, under contract — and Joey's sheet collapses that whole
 * middle into one word. There is no value in the enum that means "somewhere in
 * the middle, unspecified", so `qualified` is chosen as the most neutral
 * member: it asserts a real, engaged relationship without claiming a stage the
 * spreadsheet never recorded. An imported `Active` contact who is in fact under
 * contract will read as `qualified` until Joey moves them on.
 *
 * `Closed` carries a second, quieter ambiguity. In the enum, `closed` means a
 * deal that completed and `lost` means a relationship that ended without one.
 * A spreadsheet cell reading `Closed` could be either, and nothing else in the
 * row distinguishes them. It maps to `closed` because that is the reading of
 * the word a working agent means by it; if some of those rows are really dead
 * leads, they will import as closed deals and have to be corrected by hand.
 *
 * `Lead` → `new` is the one clean correspondence: an unworked contact, which is
 * also the column default, so nothing is being asserted that was not already
 * the case.
 *
 * The honest fix for `Active` is an enum addition, which means editing
 * src/lib/db/schema.ts, which this change is not authorised to do. Reported
 * rather than hidden: every imported row carries a note recording the
 * spreadsheet word it came from, so the original value is recoverable from the
 * database even after the status is edited.
 */
export const SPREADSHEET_STATUS_MAP: Record<string, LeadStatusValue> = {
  lead: 'new',
  active: 'qualified',
  closed: 'closed',
};

/** The spreadsheet words, spelled as Joey spells them, for error messages. */
export const SPREADSHEET_STATUS_WORDS = ['Active', 'Closed', 'Lead'] as const;

/** The columns the import reads. Anything else in the file is ignored. */
export type ImportColumn = 'name' | 'phone' | 'email' | 'status' | 'notes';

/**
 * Header spellings accepted for each column.
 *
 * Generous, because the alternative to recognising `Full Name` is a silent
 * positional misread that files every name into the phone column. Matching is
 * case-insensitive and ignores spaces, underscores and hyphens, so `e-mail`,
 * `E Mail` and `email` are one entry.
 */
const HEADER_ALIASES: Record<ImportColumn, readonly string[]> = {
  name: ['name', 'fullname', 'clientname', 'contactname', 'client', 'contact'],
  phone: ['phone', 'phonenumber', 'mobile', 'cell', 'cellphone', 'telephone', 'tel'],
  email: ['email', 'emailaddress'],
  status: ['status', 'stage'],
  notes: ['notes', 'note', 'comments', 'comment'],
};

/** The order assumed when the text has no header row: Joey's column order. */
const POSITIONAL_ORDER: readonly ImportColumn[] = [
  'name',
  'phone',
  'email',
  'status',
  'notes',
];

const normalizeHeader = (cell: string): string =>
  cell.trim().toLowerCase().replace(/[\s_-]+/g, '');

const NO_EMAIL_COLUMN =
  'No email column found. The import needs an email address for every ' +
  'contact — it is what tells an existing client from a new one.';

/** A row that will be created, with the values it will be created from. */
export interface PlannedLead {
  line: number;
  fullName: string;
  email: string;
  phone: string | null;
  /** The enum value that will be written. */
  status: LeadStatusValue;
  /** The spreadsheet word it came from, or null when the cell was blank. */
  spreadsheetStatus: string | null;
  notes: string | null;
}

/** Why a row will not be created even though it parsed and validated. */
export type SkipReason = 'duplicate_in_file' | 'already_in_database';

export interface SkippedRow {
  line: number;
  label: string;
  email: string;
  reason: SkipReason;
  /** A sentence for the preview, naming the other row where there is one. */
  detail: string;
}

/** A row that could not be read as a contact at all. */
export interface RejectedRow {
  line: number;
  label: string;
  /** One message per offending field, as `leadSubmissionSchema` reports them. */
  errors: Record<string, string>;
  detail: string;
}

export interface ImportPlan {
  delimiter: Delimiter;
  /** Whether the first record was consumed as column headings. */
  headerDetected: boolean;
  /** Which column each field was read from, for the preview to display. */
  columns: Partial<Record<ImportColumn, number>>;
  /** Data rows found, excluding the header and blank lines. */
  totalRows: number;
  create: PlannedLead[];
  skipped: SkippedRow[];
  rejected: RejectedRow[];
}

/** Why no plan could be made. Distinct from a plan in which every row failed. */
export type ImportPlanOutcome =
  | { ok: true; plan: ImportPlan }
  | { ok: false; error: string };

/**
 * Decide whether the first record is a header, and where each column sits.
 *
 * A header is recognised by content rather than by a checkbox, because the two
 * ways this input arrives disagree: a `.csv` export almost always has one, and
 * a block of cells copied out of a spreadsheet almost always does not. Asking
 * the user would mean the common case is a question they get wrong once and
 * then import 200 contacts named "Name".
 *
 * Two recognised headings are required, not one. A single match is too easy to
 * hit by accident — a contact genuinely called `Lead` in a nameless one-column
 * paste — and consuming a real contact as a header silently loses that person.
 */
function resolveColumns(first: DelimitedRecord): {
  headerDetected: boolean;
  columns: Partial<Record<ImportColumn, number>>;
  /** The first record is headings, but none of them is an email column. */
  headerLacksEmail: boolean;
} {
  const matched: Partial<Record<ImportColumn, number>> = {};

  first.cells.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    for (const column of Object.keys(HEADER_ALIASES) as ImportColumn[]) {
      if (matched[column] === undefined && HEADER_ALIASES[column].includes(key)) {
        matched[column] = index;
        return;
      }
    }
  });

  // A header row does not contain an email address; a contact row does. This is
  // the signal that stops a real person being consumed as headings — `Contact,
  // 555-0100, dana@example.com, Lead, note` matches two alias lists by accident
  // (`Contact` as a name, `note` as notes) and the match count alone would have
  // eaten it.
  const carriesAnAddress = first.cells.some((cell) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell.trim())
  );
  const headerish = !carriesAnAddress && Object.keys(matched).length >= 2;

  if (headerish) {
    return {
      headerDetected: matched.email !== undefined,
      columns: matched,
      headerLacksEmail: matched.email === undefined,
    };
  }

  const positional: Partial<Record<ImportColumn, number>> = {};
  POSITIONAL_ORDER.forEach((column, index) => {
    if (index < first.cells.length) positional[column] = index;
  });

  return { headerDetected: false, columns: positional, headerLacksEmail: false };
}

/** Read one cell, trimmed, or null when the column is absent or blank. */
function cellValue(
  record: DelimitedRecord,
  columns: Partial<Record<ImportColumn, number>>,
  column: ImportColumn
): string | null {
  const index = columns[column];
  if (index === undefined) return null;
  const raw = record.cells[index];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Translate a spreadsheet status cell.
 *
 * A blank cell is `new`, matching the column default — the sheet simply did not
 * say, and `new` is what the database already means by that. A cell with a word
 * in it that is not one of Joey's three is a **rejection**, not a default: an
 * unrecognised status quietly filed as `new` is how a closed client ends up
 * back at the top of the pipeline, and the row number plus the offending word
 * is a thirty-second fix in the spreadsheet.
 */
export function mapSpreadsheetStatus(
  cell: string | null
): { ok: true; status: LeadStatusValue; word: string | null } | { ok: false; error: string } {
  if (cell === null) return { ok: true, status: 'new', word: null };

  const mapped = SPREADSHEET_STATUS_MAP[cell.trim().toLowerCase()];
  if (mapped === undefined) {
    return {
      ok: false,
      error: `Status "${cell}" is not one of ${SPREADSHEET_STATUS_WORDS.join(', ')}`,
    };
  }

  return { ok: true, status: mapped, word: cell.trim() };
}

/** What a row calls itself in the preview, when it has no usable name. */
function rowLabel(name: string | null, email: string | null): string {
  return name ?? email ?? 'unnamed row';
}

/**
 * Normalise an address for comparison.
 *
 * `leadSubmissionSchema` already lowercases and trims, so this is belt and
 * braces for the existing-rows set, which comes out of the database as it was
 * written and may predate that normalisation.
 */
export const dedupeKey = (email: string): string => email.trim().toLowerCase();

/**
 * Plan an import.
 *
 * ## The deduplication rule: one row per email address, for this path only
 *
 * A contact is a duplicate if its email address, lowercased and trimmed,
 * matches a row already in the lead table or an earlier row in the same file.
 * The first occurrence in the file wins; everything after it is skipped and
 * named in the result.
 *
 * `leads.email` is deliberately **not** unique, and that is not an oversight to
 * be worked around — the index comment in src/lib/db/schema.ts says why: one
 * person can legitimately hold two rows, a buy enquiry now and a sell enquiry
 * in three years, and a unique constraint would turn the second into a 500.
 * The same reasoning produced the fix in `1b66b6f`, where chat captures are
 * deduplicated on the conversation session rather than the address, so that two
 * genuine enquiries from one person stay two rows.
 *
 * Email is nonetheless the right key *here*, and the difference is what the two
 * paths know. A website form or a chat turn carries an intent, so a second row
 * for the same address records a second, distinguishable relationship. This
 * import carries no intent at all — see {@link IMPORT_INTENT} — so a second row
 * for an address already present would be a copy of the first with strictly
 * less provenance behind it: same person, same `general` intent, same `other`
 * source, no new information. There is nothing for the database to tell the two
 * apart by, and nothing for Joey to read differently in the dashboard. For an
 * import of contacts he already has, "this address is already in the table" is
 * exactly the condition for not adding another one.
 *
 * The constraint stays off the column, so this rule binds the import path and
 * nothing else. The form and the assistant keep their ability to create a
 * second row for a repeat client.
 *
 * **Phone is not part of the key.** A household shares a number: two spouses
 * with their own email addresses are two contacts, and deduplicating on phone
 * would import one of them and silently drop the other. Phone is imported, not
 * matched on.
 *
 * A row with no email, or an unparseable one, cannot be keyed at all. Those are
 * rejected with their line number rather than imported unkeyed, because an
 * unkeyed row is a row that will be imported again on the next attempt.
 *
 * @param text raw CSV or clipboard text
 * @param existingEmails every address already in the lead table, lowercased
 */
export function planImport(
  text: string,
  existingEmails: ReadonlySet<string>
): ImportPlanOutcome {
  if (text.trim() === '') {
    return { ok: false, error: 'Paste some rows or choose a .csv file first.' };
  }

  const { delimiter, records } = parseDelimited(text);

  const first = records[0];
  if (first === undefined) {
    return { ok: false, error: 'No rows found in that text.' };
  }

  const { headerDetected, columns, headerLacksEmail } = resolveColumns(first);

  // Caught here rather than letting the positional fallback read the Status
  // column as an address and reject all 200 rows for a bad email. The real
  // problem is one missing column, and that is what the message has to say.
  if (headerLacksEmail) {
    return { ok: false, error: NO_EMAIL_COLUMN };
  }

  const dataRecords = headerDetected ? records.slice(1) : records;

  if (dataRecords.length === 0) {
    return {
      ok: false,
      error: 'That text has a header row and no contacts under it.',
    };
  }

  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error:
        `That is ${dataRecords.length} rows and the limit for one import is ` +
        `${MAX_IMPORT_ROWS}. Split the file and import it in parts.`,
    };
  }

  if (columns.email === undefined) {
    return { ok: false, error: NO_EMAIL_COLUMN };
  }

  const create: PlannedLead[] = [];
  const skipped: SkippedRow[] = [];
  const rejected: RejectedRow[] = [];

  /** Addresses accepted so far in this file, and the line that claimed them. */
  const claimed = new Map<string, number>();

  for (const record of dataRecords) {
    const name = cellValue(record, columns, 'name');
    const email = cellValue(record, columns, 'email');
    const phone = cellValue(record, columns, 'phone');
    const notes = cellValue(record, columns, 'notes');
    const label = rowLabel(name, email);

    const status = mapSpreadsheetStatus(cellValue(record, columns, 'status'));
    if (!status.ok) {
      rejected.push({
        line: record.line,
        label,
        errors: { status: status.error },
        detail: status.error,
      });
      continue;
    }

    // The same schema a website submission has to satisfy. Reusing it rather
    // than writing import-specific rules is what keeps an imported row the
    // same shape as a captured one — and it is where the email check, the name
    // split and every column-width cap come from.
    // Absent keys, not nulls. `leadSubmissionSchema` reports "Name is
    // required" for a missing key and "Expected string, received null" for an
    // explicit null — and the second is a sentence Joey cannot act on.
    const parsed = leadSubmissionSchema.safeParse({
      ...(name === null ? {} : { name }),
      ...(email === null ? {} : { email }),
      ...(phone === null ? {} : { phone }),
      intent: IMPORT_INTENT,
      ...(notes === null ? {} : { additionalNotes: notes }),
    });

    if (!parsed.success) {
      const errors = formatFieldErrors(parsed.error);
      rejected.push({
        line: record.line,
        label,
        errors,
        detail: Object.entries(errors)
          .map(([field, message]) => `${field}: ${message}`)
          .join('; '),
      });
      continue;
    }

    const submission: LeadSubmission = parsed.data;
    const key = dedupeKey(submission.email);

    const claimedBy = claimed.get(key);
    if (claimedBy !== undefined) {
      skipped.push({
        line: record.line,
        label,
        email: submission.email,
        reason: 'duplicate_in_file',
        detail: `Same email as row ${claimedBy} in this file`,
      });
      continue;
    }

    if (existingEmails.has(key)) {
      skipped.push({
        line: record.line,
        label,
        email: submission.email,
        reason: 'already_in_database',
        detail: 'Already in the lead table',
      });
      continue;
    }

    claimed.set(key, record.line);
    create.push({
      line: record.line,
      fullName: submission.fullName,
      email: submission.email,
      phone: submission.phone ?? null,
      status: status.status,
      spreadsheetStatus: status.word,
      notes: submission.additionalNotes ?? null,
    });
  }

  return {
    ok: true,
    plan: {
      delimiter,
      headerDetected,
      columns,
      totalRows: dataRecords.length,
      create,
      skipped,
      rejected,
    },
  };
}

/**
 * The provenance line written into every imported row's `notes`.
 *
 * It exists because the status mapping is lossy and the row would otherwise
 * carry no trace of what the spreadsheet actually said. With this, `Active`
 * stored as `qualified` is still recoverable from the database, and anyone
 * reading the row later can see that it arrived by import — which also means it
 * never consented to email, and that is worth having written down next to the
 * address rather than inferred from a `source` column.
 *
 * `notes` is used as an append-only audit log elsewhere in this codebase
 * (`updateCapturedLead` writes its conflict record the same way), so this
 * follows the established convention rather than inventing a column.
 */
export function importProvenanceNote(
  spreadsheetStatus: string | null,
  status: LeadStatusValue,
  at: Date
): string {
  const from =
    spreadsheetStatus === null
      ? 'no status in the sheet'
      : `spreadsheet status "${spreadsheetStatus}"`;
  return (
    `[import ${at.toISOString()}] bulk import from Joey's client database — ` +
    `${from} recorded as "${status}". No follow-up sequence was created and no ` +
    `email consent was recorded for this contact.`
  );
}

/** Joey's note and the provenance line, or just the provenance line. */
export function importedNotes(row: PlannedLead, at: Date): string {
  const provenance = importProvenanceNote(row.spreadsheetStatus, row.status, at);
  return row.notes === null ? provenance : `${row.notes}\n\n${provenance}`;
}

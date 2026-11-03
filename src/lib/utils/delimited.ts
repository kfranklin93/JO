/**
 * A delimited-text reader for the dashboard's bulk client import.
 *
 * ## Why this is hand-written rather than a dependency
 *
 * The import accepts two things from one textarea: the contents of a `.csv`
 * file, and whatever lands on the clipboard when Joey selects a block of cells
 * in Excel or Google Sheets and presses copy. The second is tab-separated, not
 * comma-separated, and no CSV library guesses between them for you — you have
 * to sniff the delimiter and hand it in, which is the part this file is
 * actually for. What remains after that is RFC 4180 field parsing, which is one
 * character loop.
 *
 * So the dependency would buy the loop and not the sniffing, at the cost of a
 * package in the bundle of a route that already imports the database driver.
 * It is not a close call at this size. If the import ever needs streaming, a
 * character set other than UTF-8, or multi-sheet workbooks, that is the point
 * to reach for `papaparse` instead.
 *
 * ## What it handles, because real spreadsheet exports contain all of it
 *
 * - **Quoted fields.** `"Smith, John"` is one cell, not two. `""` inside a
 *   quoted field is a literal `"`.
 * - **CRLF.** A `.csv` saved on Windows, or exported by Excel on any platform,
 *   ends every line with `\r\n`. Splitting on `\n` alone leaves a trailing
 *   `\r` on the last cell of every row, which turns an email address into an
 *   invalid one and a status of `Active` into `Active\r` — a row that fails
 *   validation for a reason the user cannot see.
 * - **Newlines inside quoted fields.** A Notes cell with a line break in it is
 *   a single record spanning several physical lines. That is why a record
 *   carries the line number it *starts* on rather than its index in the list:
 *   the number has to match what the user sees in the left-hand gutter of their
 *   spreadsheet, or "row 47 failed" sends them to the wrong row.
 * - **A UTF-8 BOM**, which Excel writes at the start of the file and which
 *   would otherwise become part of the first header cell.
 *
 * ## What it does not do
 *
 * It does not trim cells and it does not interpret them. Trimming is a decision
 * about data, so it belongs to the layer that knows what a cell means; leaving
 * it here would make `"  "` and `""` indistinguishable to a caller that cares.
 */

/** The two delimiters this reader supports. */
export type Delimiter = ',' | '\t';

/** One parsed record, with the physical line its first character sits on. */
export interface DelimitedRecord {
  /** 1-based line number in the source text. Matches a spreadsheet's gutter. */
  line: number;
  cells: string[];
}

/** A parsed table: the delimiter that was used, and the non-blank records. */
export interface DelimitedTable {
  delimiter: Delimiter;
  records: DelimitedRecord[];
}

/** Excel writes this at the head of a UTF-8 CSV; it is not data. */
const BOM = '\ufeff';

/**
 * Guess the delimiter from the first record.
 *
 * Counts separators outside quotes up to the first record terminator and
 * prefers tabs, because a tab is essentially never a decorative character in
 * exported data whereas a comma appears inside names and addresses constantly.
 * A single-column paste has neither, and falls through to a comma — which
 * parses identically either way, since there is nothing to split.
 */
export function detectDelimiter(text: string): Delimiter {
  let inQuotes = false;
  let commas = 0;
  let tabs = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          i++;
          continue;
        }
        inQuotes = false;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    // Only the first record votes. Later rows can disagree — a Notes column
    // full of commas in a tab-separated paste would outvote the tabs.
    if (ch === '\n' || ch === '\r') break;
    if (ch === ',') commas++;
    else if (ch === '\t') tabs++;
  }

  return tabs > commas ? '\t' : ',';
}

/**
 * Parse delimited text into records.
 *
 * Entirely blank records are dropped rather than returned, because a trailing
 * newline at the end of a file and a blank line between blocks of a paste are
 * both artefacts of how the text was produced, not rows the user believes they
 * are importing. Counting them would make the preview's row total disagree with
 * what the spreadsheet shows.
 *
 * @param text raw file contents or clipboard text
 * @param delimiter overrides the sniffed delimiter, for callers that know
 */
export function parseDelimited(
  text: string,
  delimiter: Delimiter = detectDelimiter(text)
): DelimitedTable {
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text;

  const records: DelimitedRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = (): void => {
    cells.push(cell);
    cell = '';
    if (cells.some((value) => value.trim() !== '')) {
      records.push({ line: recordLine, cells });
    }
    cells = [];
  };

  let i = 0;
  while (i < body.length) {
    const ch = body[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      // A line break inside a quoted field stays in the value, normalised to
      // `\n` so a Windows export and a Unix one produce the same note text.
      if (ch === '\r') {
        if (body[i + 1] === '\n') i++;
        cell += '\n';
        line++;
        i++;
        continue;
      }
      if (ch === '\n') line++;
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === delimiter) {
      cells.push(cell);
      cell = '';
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      // CRLF is one terminator, not two. Treating it as two would emit a blank
      // record between every pair of real ones.
      if (ch === '\r' && body[i + 1] === '\n') i++;
      i++;
      line++;
      endRecord();
      recordLine = line;
      continue;
    }

    cell += ch;
    i++;
  }

  // The last record usually has no terminator after it.
  if (cell !== '' || cells.length > 0) endRecord();

  return { delimiter, records };
}

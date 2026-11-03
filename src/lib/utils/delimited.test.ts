import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseDelimited } from './delimited';

/**
 * Parser tests for the bulk-import reader.
 *
 * Written from the two things that actually reach it: a `.csv` saved by Excel,
 * and the clipboard contents of a block of spreadsheet cells. Every case below
 * is a property of one of those two, not a hypothetical.
 */

describe('detectDelimiter', () => {
  it('reads a spreadsheet paste as tab-separated', () => {
    // This is the whole reason the reader sniffs rather than assuming CSV: a
    // copy out of Excel or Sheets is tab-separated and would otherwise parse as
    // one enormous single-column row per line.
    expect(detectDelimiter('Name\tPhone\tEmail\nDana\t555\td@e.com')).toBe('\t');
  });

  it('reads a csv export as comma-separated', () => {
    expect(detectDelimiter('Name,Phone,Email\nDana,555,d@e.com')).toBe(',');
  });

  it('ignores commas inside a quoted field when voting', () => {
    expect(detectDelimiter('"Smith, John"\t555\td@e.com')).toBe('\t');
  });

  it('only counts the first record, so a comma-heavy note cannot outvote tabs', () => {
    const text = 'Name\tNotes\nDana\t"a, b, c, d, e, f"';

    expect(detectDelimiter(text)).toBe('\t');
  });

  it('falls back to a comma for a single column, where it makes no difference', () => {
    expect(detectDelimiter('dana@example.com\nsam@example.com')).toBe(',');
  });
});

describe('parseDelimited', () => {
  it('keeps a quoted field containing a comma as one cell', () => {
    const { records } = parseDelimited('"Smith, John",555,j@e.com');

    expect(records[0]?.cells).toEqual(['Smith, John', '555', 'j@e.com']);
  });

  it('reads a doubled quote as a literal quote', () => {
    const { records } = parseDelimited('"Dana ""Dee"" Whitfield",555');

    expect(records[0]?.cells[0]).toBe('Dana "Dee" Whitfield');
  });

  it('strips CRLF rather than leaving it on the last cell', () => {
    // A trailing `\r` is the bug this case exists for: it turns `Active` into
    // `Active\r`, which fails the status map for a reason invisible on screen.
    const { records } = parseDelimited(
      'Name,Email,Status\r\nDana,d@e.com,Active\r\nSam,s@e.com,Closed\r\n'
    );

    expect(records).toHaveLength(3);
    expect(records[1]?.cells).toEqual(['Dana', 'd@e.com', 'Active']);
    expect(records[2]?.cells[2]).toBe('Closed');
  });

  it('does not emit a blank record between CRLF-separated rows', () => {
    const { records } = parseDelimited('a,b\r\nc,d');

    expect(records).toHaveLength(2);
  });

  it('drops blank lines instead of counting them as rows', () => {
    const { records } = parseDelimited('a,b\n\n\nc,d\n');

    expect(records).toHaveLength(2);
  });

  it('strips the BOM Excel writes, so it never joins the first header cell', () => {
    const { records } = parseDelimited('\ufeffName,Email\nDana,d@e.com');

    expect(records[0]?.cells[0]).toBe('Name');
  });

  it('keeps a newline inside a quoted note and keeps the line numbers honest', () => {
    // The record spans lines 2 and 3, so the row after it is on line 4. A line
    // number that drifts here sends "row 47 failed" to the wrong row.
    const { records } = parseDelimited(
      'Name,Email,Notes\nDana,d@e.com,"line one\nline two"\nSam,s@e.com,plain'
    );

    expect(records).toHaveLength(3);
    expect(records[1]?.cells[2]).toBe('line one\nline two');
    expect(records[2]?.line).toBe(4);
    expect(records[2]?.cells[0]).toBe('Sam');
  });

  it('normalises a CRLF inside a quoted note to a single newline', () => {
    const { records } = parseDelimited('Dana,"one\r\ntwo"');

    expect(records[0]?.cells[1]).toBe('one\ntwo');
  });

  it('reports the line each record starts on, 1-based like a spreadsheet gutter', () => {
    const { records } = parseDelimited('h1,h2\na,b\nc,d');

    expect(records.map((r) => r.line)).toEqual([1, 2, 3]);
  });

  it('keeps an empty trailing cell', () => {
    const { records } = parseDelimited('Dana,d@e.com,');

    expect(records[0]?.cells).toEqual(['Dana', 'd@e.com', '']);
  });

  it('does not trim cells, leaving that to the layer that knows what they mean', () => {
    const { records } = parseDelimited('  Dana  ,d@e.com');

    expect(records[0]?.cells[0]).toBe('  Dana  ');
  });

  it('returns no records for empty text', () => {
    expect(parseDelimited('').records).toEqual([]);
    expect(parseDelimited('\n\n').records).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Regression guard for Requirement 2.5.
 *
 * `bg-[black]` and `text-[white]` were workarounds for a palette that
 * generated no CSS. The palette works now, so an arbitrary black/white
 * escape reappearing means someone reached past the tokens again — and that
 * is how the black-on-black navigation dropdown happened the first time.
 *
 * This asserts on source, not on compiled output, because the point is to
 * keep the escapes out of the component tree rather than out of one build.
 */

const SRC = join(process.cwd(), 'src');
const EXTENSIONS = ['.ts', '.tsx', '.css'];

/** Matches `bg-[black]`, `text-[white]/80`, `hover:border-[black]`, etc. */
const ESCAPE = /-\[(black|white)\]/;

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return collectSourceFiles(full);
    }
    return EXTENSIONS.some((ext) => entry.endsWith(ext)) ? [full] : [];
  });
}

describe('arbitrary colour escapes', () => {
  it('finds source files to scan', () => {
    // Guards against the scan silently passing because it walked nothing.
    expect(collectSourceFiles(SRC).length).toBeGreaterThan(50);
  });

  it('has no [black] or [white] escape anywhere under src/', () => {
    const offenders = collectSourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf-8')
        .split('\n')
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => ESCAPE.test(line))
        .map(({ number, line }) => `${relative(SRC, file)}:${number}: ${line.trim()}`)
    );

    expect(offenders).toEqual([]);
  });
});

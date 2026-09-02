import { describe, it, expect } from 'vitest';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Build assertion test for design tokens.
 *
 * Verifies that the @theme block in globals.css generates working utilities by
 * compiling the real stylesheet and asserting the output CSS contains the
 * expected declarations. This is the check that would have caught the original
 * bug, where tailwind.config.ts was inert and custom utilities produced no CSS.
 *
 * Two deliberate choices about how this compiles:
 *
 * 1. It goes through `@tailwindcss/node`, the same package `@tailwindcss/postcss`
 *    uses, at the exact version in node_modules. An earlier version of this test
 *    shelled out to `npx @tailwindcss/cli`, which is not a dependency of this
 *    project — npx fetched a *different* Tailwind version from the network, so
 *    the test was not measuring the compiler the build actually uses.
 *
 * 2. Candidates come from a fixture directory registered as an explicit source
 *    here in the test, not from Tailwind's automatic detection. `globals.css`
 *    scopes automatic detection to `src/` (see the comment at the top of that
 *    file), and `tests/__fixtures__` sits outside `src/`. Registering the
 *    fixture source in the test keeps the fixture scannable without widening
 *    the production scope back over the repository's markdown.
 */

const REPO = process.cwd();
const ENTRY = resolve(REPO, 'src/app/globals.css');
const FIXTURES = resolve(REPO, 'tests/__fixtures__');

/** Compiles the real globals.css and returns CSS for the given candidates. */
async function compileFor(candidates: string[]): Promise<string> {
  const { build } = await compile(readFileSync(ENTRY, 'utf-8'), {
    base: resolve(REPO, 'src/app'),
    from: ENTRY,
    onDependency: () => {},
  });
  return build(candidates);
}

/** Scans a fixture file for class candidates, as the build does for src/. */
function candidatesFrom(file: string): string[] {
  const scanner = new Scanner({
    sources: [{ base: FIXTURES, pattern: file, negated: false }],
  });
  const found = scanner.scan();
  // Guards against an assertion suite that passes because it scanned nothing.
  expect(found.length).toBeGreaterThan(0);
  return found;
}

describe('Design token CSS generation', () => {
  it('scopes automatic source detection to src/', async () => {
    const { root, sources } = await compile(readFileSync(ENTRY, 'utf-8'), {
      base: resolve(REPO, 'src/app'),
      from: ENTRY,
      onDependency: () => {},
    });

    // `root: null` means automatic detection is running from the git root,
    // which makes every markdown file that *mentions* a class generate a real
    // rule. A bare `@source` does not change this — it only adds to detection.
    // Only `source(...)` on the import relocates the base.
    expect(root).not.toBeNull();
    expect(root).not.toBe('none');
    expect(root).toMatchObject({ pattern: '../../src' });

    // Nothing outside src/ may be registered as a production source.
    expect(sources).toEqual([]);
  });

  it('should generate utilities for custom color tokens', async () => {
    const css = await compileFor(candidatesFrom('token-colors.html'));

    expect(css).toContain('.bg-navy');
    expect(css).toContain('background-color: var(--color-navy');

    expect(css).toContain('.text-cerulean');
    expect(css).toContain('color: var(--color-cerulean');

    expect(css).toContain('.bg-champagne');
    expect(css).toContain('background-color: var(--color-champagne');

    expect(css).toContain('.bg-mocha');
    expect(css).toContain('background-color: var(--color-mocha');

    expect(css).toContain('.bg-linen');
    expect(css).toContain('background-color: var(--color-linen');

    expect(css).toContain('.bg-accent-hover');
    expect(css).toContain('background-color: var(--color-accent-hover');

    // Verify the CSS variables are defined in the output
    expect(css).toContain('--color-navy: #1C2A39');
    expect(css).toContain('--color-cerulean: #0A7EA4');
    expect(css).toContain('--color-champagne: #C5A059');
  });

  it('should generate utilities for non-color tokens', async () => {
    const css = await compileFor(candidatesFrom('token-non-colors.html'));

    // Tailwind inlines the shadow value rather than referencing
    // `var(--shadow-soft)`, so assert the resolved value from @theme. This is
    // a stronger check than looking for the variable name: it fails if the
    // token's value drifts, not just if the name disappears.
    expect(css).toContain('.shadow-soft');
    expect(css).toContain('0 10px 30px');
    expect(css).toContain('rgba(15, 23, 42, 0.08)');

    expect(css).toContain('.max-w-content');
    expect(css).toContain('--container-content: 80rem');
    expect(css).toContain('max-width: var(--container-content)');

    // Assert rounded-xl is overridden to 1rem
    expect(css).toContain('.rounded-xl');
    expect(css).toContain('--radius-xl: 1rem');

    expect(css).toContain('.font-serif');
    expect(css).toContain('.font-sans');
    expect(css).toContain('.font-mono');
  });

  it('should generate neutral color ramp utilities', async () => {
    const css = await compileFor(candidatesFrom('token-neutral-ramp.html'));

    expect(css).toContain('--color-neutral-50');
    expect(css).toContain('--color-neutral-100');
    expect(css).toContain('--color-neutral-500');
    expect(css).toContain('--color-neutral-900');
    expect(css).toContain('--color-neutral-950');

    expect(css).toContain('.bg-neutral-50');
    expect(css).toContain('.bg-neutral-950');
  });

  it('generates every utility the shipped components rely on', async () => {
    // Over-scoping detection is the hazard this guards. If `source(...)` is
    // ever narrowed past the component tree, these stop resolving.
    const used = [
      'bg-navy',
      'bg-cerulean',
      'bg-champagne',
      'bg-onyx',
      'bg-linen',
      'bg-surface',
      'bg-stone',
      'text-navy',
      'text-linen',
      'text-champagne',
      'text-stone',
      'text-cerulean',
      'border-navy',
      'shadow-soft',
      'max-w-content',
      'rounded-xl',
    ];

    const css = await compileFor(used);

    for (const candidate of used) {
      expect(css, `missing utility: ${candidate}`).toContain(`.${candidate}`);
    }
  });
});

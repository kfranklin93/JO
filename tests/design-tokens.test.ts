import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Build assertion test for design tokens.
 *
 * Verifies that the @theme block in globals.css generates working utilities
 * by compiling a test fixture and asserting the output CSS contains the
 * expected declarations.
 *
 * This test would have caught the original bug where tailwind.config.ts
 * was inert and custom utilities produced no CSS.
 */
describe('Design token CSS generation', () => {
  it(
    'should generate utilities for custom color tokens',
    async () => {
      // Create a test fixture using custom utilities
      const fixtureHTML = `
      <div class="bg-navy text-cerulean bg-linen text-navy">
        <div class="bg-champagne text-stone bg-onyx text-silver"></div>
        <div class="bg-mocha bg-surface text-foreground bg-primary"></div>
        <div class="bg-accent text-accent-foreground hover:bg-accent-hover"></div>
        <div class="bg-secondary text-secondary-foreground"></div>
        <div class="bg-muted text-muted-foreground"></div>
        <div class="border-border bg-bronze"></div>
      </div>
    `;

      const fixturePath = join(
        process.cwd(),
        'tests',
        '__fixtures__',
        'token-test.html'
      );
      const outputPath = join(
        process.cwd(),
        'tests',
        '__fixtures__',
        'token-test.css'
      );

      try {
        // Ensure fixtures directory exists
        mkdirSync(join(process.cwd(), 'tests', '__fixtures__'), {
          recursive: true,
        });

        // Write fixture HTML
        writeFileSync(fixturePath, fixtureHTML);

        // Compile with Tailwind using the real globals.css
        const command = `npx @tailwindcss/cli --input src/app/globals.css --output "${outputPath}" --content "${fixturePath}"`;
        await execAsync(command);

        // Read the compiled CSS
        const css = readFileSync(outputPath, 'utf-8');

        // Assert that custom color utilities are present
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
      } finally {
        // Cleanup
        try {
          unlinkSync(fixturePath);
          unlinkSync(outputPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    },
    15000
  );

  it(
    'should generate utilities for non-color tokens',
    async () => {
      const fixtureHTML = `
      <div class="shadow-soft max-w-content rounded-xl">
        <div class="font-serif font-sans font-mono"></div>
      </div>
    `;

      const fixturePath = join(
        process.cwd(),
        'tests',
        '__fixtures__',
        'token-test-2.html'
      );
      const outputPath = join(
        process.cwd(),
        'tests',
        '__fixtures__',
        'token-test-2.css'
      );

      try {
        writeFileSync(fixturePath, fixtureHTML);

        const command = `npx @tailwindcss/cli --input src/app/globals.css --output "${outputPath}" --content "${fixturePath}"`;
        await execAsync(command);

        const css = readFileSync(outputPath, 'utf-8');

        // Assert shadow-soft utility is present
        expect(css).toContain('.shadow-soft');
        expect(css).toContain('--shadow-soft');

        // Assert max-w-content utility is present
        expect(css).toContain('.max-w-content');
        expect(css).toContain('--container-content');

        // Assert rounded-xl is overridden to 1rem
        expect(css).toContain('.rounded-xl');
        expect(css).toContain('--radius-xl: 1rem');

        // Assert font families generate utilities
        expect(css).toContain('.font-serif');
        expect(css).toContain('.font-sans');
        expect(css).toContain('.font-mono');
      } finally {
        try {
          unlinkSync(fixturePath);
          unlinkSync(outputPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    },
    15000
  );

  it(
    'should generate neutral color ramp utilities',
    async () => {
      const fixtureHTML = `
      <div class="bg-neutral-50 bg-neutral-100 bg-neutral-200 bg-neutral-500 bg-neutral-900 bg-neutral-950">
      </div>
    `;

      const fixturePath = join(
        process.cwd(),
        'tests',
        '__fixtures__',
        'token-test-3.html'
      );
      const outputPath = join(
        process.cwd(),
        'tests',
        '__fixtures__',
        'token-test-3.css'
      );

      try {
        writeFileSync(fixturePath, fixtureHTML);

        const command = `npx @tailwindcss/cli --input src/app/globals.css --output "${outputPath}" --content "${fixturePath}"`;
        await execAsync(command);

        const css = readFileSync(outputPath, 'utf-8');

        // Assert neutral ramp utilities are present
        expect(css).toContain('--color-neutral-50');
        expect(css).toContain('--color-neutral-100');
        expect(css).toContain('--color-neutral-500');
        expect(css).toContain('--color-neutral-900');
        expect(css).toContain('--color-neutral-950');

        expect(css).toContain('.bg-neutral-50');
        expect(css).toContain('.bg-neutral-950');
      } finally {
        try {
          unlinkSync(fixturePath);
          unlinkSync(outputPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    },
    15000
  );
});

import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils/cn';

/**
 * Proves the test harness itself works: Vitest runs, TypeScript compiles under
 * the project's strict settings, and the `@/` path alias resolves to src.
 *
 * `cn` is imported because it is the smallest real module in the codebase with
 * no side effects and no environment dependencies.
 */
describe('test harness', () => {
  it('runs tests', () => {
    expect(true).toBe(true);
  });

  it('resolves the @/ path alias to src', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('resolves conditional classes through the aliased import', () => {
    expect(cn('base', false && 'skipped', 'kept')).toBe('base kept');
  });
});

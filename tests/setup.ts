/// <reference types="@testing-library/jest-dom" />

/**
 * Global test setup.
 *
 * Runs before every test file. jsdom-only concerns are guarded so that node
 * environment tests (schemas, services, route handlers) are not slowed down by
 * DOM matcher registration they never use.
 */
import { afterEach, beforeAll } from 'vitest';

const isDomEnvironment = typeof window !== 'undefined';

beforeAll(async () => {
  if (isDomEnvironment) {
    await import('@testing-library/jest-dom/vitest');
  }
});

afterEach(async () => {
  if (isDomEnvironment) {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});

import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Test harness configuration.
 *
 * The default environment is `node`, which suits schema, service, and route
 * handler tests. Component tests opt into jsdom per file with a docblock:
 *
 *   // @vitest-environment jsdom
 *
 * The `@/` alias mirrors the `paths` entry in tsconfig.json so imports resolve
 * identically in tests and in the app.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});

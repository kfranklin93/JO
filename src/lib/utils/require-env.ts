import { NextResponse } from 'next/server';
import { env } from '@/config/env';

/**
 * Request-time assertions for optional configuration.
 *
 * The Zod schema in `src/config/env.ts` deliberately keeps every deployment
 * variable optional, because it parses at module import and route modules
 * import it transitively — making a variable required there would move the
 * failure into `next build` and break the deploy instead of the request.
 *
 * So the check happens here, per request, inside the handler. A half-configured
 * deploy then answers 503 naming the variable it is missing rather than
 * returning a generic 500 or, worse, a 2xx with the work silently skipped.
 */

type Env = typeof env;

/**
 * Every variable that can legitimately be absent at runtime.
 *
 * Derived from the schema rather than hand-listed, so a variable that gains a
 * default (and therefore can never be missing) stops being nameable here, and a
 * newly-added optional variable becomes nameable without further edits.
 */
export type RequiredEnvName = {
  [K in keyof Env]-?: undefined extends Env[K] ? K : never;
}[keyof Env];

/** Thrown when a handler needs configuration the deployment does not have. */
export class MissingEnvError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(
      `Missing required environment variable${variables.length === 1 ? '' : 's'}: ${variables.join(', ')}`
    );
    this.name = 'MissingEnvError';
    this.variables = variables;
  }
}

/**
 * A blank value counts as missing.
 *
 * Netlify's UI stores a cleared variable as an empty string rather than
 * removing it, and `z.string().optional()` accepts that, so an empty or
 * whitespace-only value would otherwise pass as configured and fail downstream.
 */
function isConfigured(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

/**
 * Assert that every named variable is set, throwing `MissingEnvError` if not.
 *
 * All missing names are collected into one error rather than failing on the
 * first, so an operator fixing a fresh deploy learns everything at once.
 *
 * Call this inside the handler's `try` block, never at module scope.
 */
export function requireEnv(...names: RequiredEnvName[]): void {
  const values = env as Record<string, unknown>;
  const missing = names.filter((name) => !isConfigured(values[name]));

  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }
}

/**
 * Map a caught error to a 503 naming the missing variables, or null if the
 * error is something else.
 *
 * Returning null rather than throwing lets a `catch` block stay linear:
 *
 *   const configError = envErrorResponse(error);
 *   if (configError) return configError;
 *
 * 503 rather than 500 because the condition is a deployment gap that a retry
 * will not clear until configuration changes.
 */
export function envErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof MissingEnvError)) return null;

  console.error(`Configuration error: ${error.message}`);

  return NextResponse.json(
    {
      error: 'Service not configured',
      message: error.message,
      missing: error.variables,
    },
    { status: 503 }
  );
}

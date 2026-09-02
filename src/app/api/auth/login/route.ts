import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import {
  RATE_LIMIT_WINDOW_SECONDS,
  checkRateLimit,
  clearFailures,
  rateLimitKey,
  recordFailure,
} from '@/lib/auth/rate-limit';
import {
  SESSION_COOKIE_NAME,
  createSession,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { MissingEnvError, envErrorResponse, requireEnv } from '@/lib/utils/require-env';

/**
 * POST /api/auth/login — exchange the admin password for a signed session.
 *
 * What this replaces: a `!==` comparison against `ADMIN_PASSWORD` with no rate
 * limiting, which then set a fixed plaintext cookie value that was committed to
 * this repository. Reading the source was enough to forge a session.
 *
 * The order of operations is the substance of this handler:
 *
 *   1. Rate limit — before the comparison, so it caps guesses rather than
 *      spacing them out
 *   2. Configuration — both variables asserted together, before any credential
 *      is looked at
 *   3. Comparison — constant-time, over SHA-256 digests
 *   4. Issuance — a signed session, only past all three
 *
 * Runs in the Node.js runtime (the default for route handlers) because
 * `node:crypto` and the session module's `createHmac` need it.
 */

/** SHA-256 of a UTF-8 string, always 32 bytes. */
function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Compare a submitted password against the configured one in constant time.
 *
 * `timingSafeEqual` throws unless both buffers are the same length, and the
 * obvious fix — comparing lengths first — would leak the configured password's
 * length through the response. Hashing both sides first removes the problem
 * rather than working around it: digests are a fixed 32 bytes, so the
 * comparison always runs to completion and the only length involved is the
 * digest's.
 *
 * The hashing itself takes time proportional to each input, which reveals the
 * length of the password the caller just sent — something the caller already
 * knows.
 */
function passwordMatches(submitted: string, configured: string): boolean {
  return timingSafeEqual(sha256(submitted), sha256(configured));
}

/**
 * Pull the submitted password out of the request body.
 *
 * @returns The password, or `null` when the body is not JSON or carries no
 *   password string. An empty string is a password: it is something the caller
 *   submitted, so it goes to the comparison and counts as a failed attempt.
 */
async function readPassword(request: NextRequest): Promise<string | null> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (typeof body !== 'object' || body === null) return null;

  const { password } = body as { password?: unknown };

  return typeof password === 'string' ? password : null;
}

export async function POST(request: NextRequest) {
  const key = rateLimitKey(request.headers);

  try {
    // First, before the password is read or compared. Checking afterwards would
    // make this a delay rather than a limit — every request would still buy the
    // caller one guess.
    const limit = checkRateLimit(key);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts' },
        {
          status: 429,
          headers: {
            'Retry-After': String(limit.retryAfterSeconds ?? RATE_LIMIT_WINDOW_SECONDS),
          },
        },
      );
    }

    // Both are asserted together, and before the comparison, so that the 503 is
    // a statement about the deployment rather than something that depends on
    // whether the submitted password happened to be right. Asserting them in one
    // call also means an operator fixing a fresh deploy learns both names at
    // once.
    //
    // SESSION_SECRET belongs here even though only issuance needs it: a deploy
    // that cannot sign a session cannot log anyone in, and finding that out
    // after accepting the password would be a worse answer.
    requireEnv('ADMIN_PASSWORD', 'SESSION_SECRET');

    // Redundant at runtime — `requireEnv` has already thrown if it is missing —
    // and present only because TypeScript cannot see that.
    const adminPassword = env.ADMIN_PASSWORD;
    if (adminPassword === undefined) throw new MissingEnvError(['ADMIN_PASSWORD']);

    const submitted = await readPassword(request);
    if (submitted === null) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (!passwordMatches(submitted, adminPassword)) {
      recordFailure(key);
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // An operator who mistyped on the way in should not be left sitting near the
    // threshold for the rest of the window.
    clearFailures(key);

    // Set on the response rather than through `cookies()`: this is the value the
    // client actually receives, and it keeps the handler independent of the
    // request-scoped cookie store.
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, createSession(), sessionCookieOptions());

    return response;
  } catch (error) {
    const configError = envErrorResponse(error);
    if (configError) return configError;

    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

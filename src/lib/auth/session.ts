import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';
import { MissingEnvError, requireEnv } from '@/lib/utils/require-env';

/**
 * Signed dashboard session tokens.
 *
 * The token this replaces was a fixed plaintext string committed to the repo,
 * which meant reading the source was enough to forge a session. Here the cookie
 * value carries its own expiry and a keyed signature over it, so a value is only
 * accepted if it was issued by a process holding SESSION_SECRET.
 *
 * Token format:
 *
 *   base64url(payload) "." base64url(hmacSha256(SESSION_SECRET, payload))
 *
 * where payload is the JSON document `{"exp": <unix seconds>}`.
 *
 * Node `crypto` rather than Web Crypto: both verification sites (the dashboard
 * layout and the dashboard data route) run in the Node runtime, so `createHmac`
 * and `timingSafeEqual` are available synchronously. Web Crypto would force an
 * async API across every caller for no benefit.
 */

/** Cookie the signed session is stored under. */
export const SESSION_COOKIE_NAME = 'dashboard_auth';

/** Session lifetime — seven days, matching the cookie `maxAge`. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Separator between the payload and signature segments. */
const SEGMENT_SEPARATOR = '.';

/** Cookie attributes for the session cookie. */
export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: '/';
}

/**
 * Read the signing secret, throwing `MissingEnvError` when it is not usable.
 *
 * `requireEnv` does the real check, including treating an empty or
 * whitespace-only value as missing. That case matters here more than elsewhere:
 * Netlify stores a cleared variable as an empty string, `z.string().optional()`
 * accepts it, and an empty HMAC key would happily produce signatures that
 * verify — a signed session whose key everyone knows. Better to fail loudly.
 *
 * The narrowing below is redundant at runtime and exists only because
 * TypeScript cannot see that `requireEnv` throws.
 */
function sessionSecret(): string {
  requireEnv('SESSION_SECRET');

  const secret = env.SESSION_SECRET;
  if (secret === undefined) throw new MissingEnvError(['SESSION_SECRET']);

  return secret;
}

/** HMAC-SHA256 of the payload JSON under the given secret. */
function signPayload(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload, 'utf8').digest();
}

/** Current time in whole unix seconds, the unit `exp` is expressed in. */
function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Issue a signed session token valid for `SESSION_MAX_AGE_SECONDS`.
 *
 * Throws `MissingEnvError` when SESSION_SECRET is absent rather than falling
 * back to an unsigned value — the login route maps that to a 503. A deploy
 * missing its secret should refuse to log anyone in, not hand out tokens that
 * cannot be trusted.
 *
 * @param now - Issue time, defaulting to the present. Backdating it produces an
 *   already-expired token, which is how the expiry path is tested.
 * @returns The cookie value to store.
 *
 * @example
 * const value = createSession();
 * // 'eyJleHAiOjE3NjQ1MDAwMDB9.qFh...'
 */
export function createSession(now: Date = new Date()): string {
  const secret = sessionSecret();

  const payload = JSON.stringify({ exp: unixSeconds(now) + SESSION_MAX_AGE_SECONDS });
  const payloadSegment = Buffer.from(payload, 'utf8').toString('base64url');
  const signatureSegment = signPayload(payload, secret).toString('base64url');

  return `${payloadSegment}${SEGMENT_SEPARATOR}${signatureSegment}`;
}

/**
 * The verification proper, which is allowed to throw. `verifySession` wraps it.
 */
function verifyOrThrow(cookieValue: string): boolean {
  const secret = sessionSecret();

  // Exactly two segments. Splitting without a limit and rejecting extras means a
  // value with a smuggled third segment fails rather than being silently
  // truncated to something that verifies.
  const segments = cookieValue.split(SEGMENT_SEPARATOR);
  if (segments.length !== 2) return false;

  const [payloadSegment, signatureSegment] = segments;
  if (!payloadSegment || !signatureSegment) return false;

  // `Buffer.from(..., 'base64url')` silently drops characters outside the
  // alphabet rather than throwing, so garbage decodes to *something*. Requiring
  // the canonical re-encoding to match rejects both malformed input and two
  // spellings of the same bytes, instead of leaning on the signature check to
  // catch a structural problem.
  const decoded = Buffer.from(payloadSegment, 'base64url');
  if (decoded.toString('base64url') !== payloadSegment) return false;

  const payload = decoded.toString('utf8');

  // Signature before parse: the payload stays untrusted bytes until the HMAC
  // says it came from us.
  const expected = signPayload(payload, secret);
  const actual = Buffer.from(signatureSegment, 'base64url');

  // `timingSafeEqual` throws on length mismatch, so lengths are compared first.
  // That leaks only the length of a digest that is a fixed 32 bytes anyway.
  if (actual.length !== expected.length) return false;
  if (!timingSafeEqual(actual, expected)) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }

  if (typeof parsed !== 'object' || parsed === null) return false;

  const { exp } = parsed as { exp?: unknown };
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return false;

  // Expiry lives inside the signed payload, not only in the cookie `maxAge`.
  // `maxAge` is a hint the client is free to ignore; `exp` cannot be moved
  // without invalidating the signature.
  return exp > unixSeconds(new Date());
}

/**
 * Verify a session cookie value: signature first, then expiry.
 *
 * Never throws. Every failure mode — absent cookie, wrong shape, malformed
 * base64, non-JSON payload, missing `exp`, bad signature, expired token, and an
 * unconfigured secret — returns `false`. A predicate guarding client data should
 * not be able to surface as a 500 that a caller might mistake for a transient
 * fault, and a misconfigured deploy should deny access rather than grant it.
 *
 * @param cookieValue - Raw cookie value, or `undefined` when the cookie is absent.
 * @returns `true` only for an unexpired token signed with the current secret.
 *
 * @example
 * verifySession(createSession()); // => true
 * verifySession('joey_dashboard_authenticated'); // => false
 */
export function verifySession(cookieValue: string | undefined): boolean {
  if (typeof cookieValue !== 'string' || cookieValue.length === 0) return false;

  try {
    return verifyOrThrow(cookieValue);
  } catch {
    // Blanket catch on purpose: the checks above are explicit, and this is the
    // guarantee that no future edit inside verifyOrThrow can turn a bad cookie
    // into a thrown error.
    return false;
  }
}

/**
 * Cookie attributes for the session cookie.
 *
 * `secure` is conditional so the cookie still works over plain HTTP in local
 * development while always being TLS-only in production.
 */
export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  };
}

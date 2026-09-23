import { createHmac, timingSafeEqual } from 'node:crypto';
import { deriveSigningKey } from '@/lib/auth/signing-key';

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
 *   base64url(payload) "." base64url(hmacSha256(dashboardKey, payload))
 *
 * where payload is the JSON document `{"typ":"dashboard","exp":<unix seconds>}`
 * and `dashboardKey` is derived from SESSION_SECRET for this purpose alone.
 *
 * Two things stop a token minted elsewhere from passing as a dashboard session,
 * because the same secret will soon sign chat sessions issued to anonymous
 * visitors and a separate cookie name stops nothing — the value is copyable:
 *
 *  1. The signing key is purpose-derived, so a chat token cannot verify here at
 *     all. See `signing-key.ts` for why derivation is the real boundary.
 *  2. The payload names its own type, so even a token signed with *this* key is
 *     rejected unless it was minted as a dashboard session.
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

/**
 * Purpose label this module's signing key is derived under.
 *
 * Changing it invalidates every session in flight, which means one extra login.
 * The `v1` suffix is there so that is a deliberate act rather than a surprise.
 */
const DASHBOARD_SESSION_PURPOSE = 'joeyo:dashboard-session:v1';

/**
 * Value of the `typ` claim in a dashboard payload.
 *
 * Checked on verification, so a payload carrying another type — or none — is
 * refused even if it somehow arrived signed with the dashboard key.
 */
const DASHBOARD_TOKEN_TYPE = 'dashboard';

/** Cookie attributes for the session cookie. */
export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: '/';
}

/**
 * The dashboard signing key, or `MissingEnvError` when SESSION_SECRET is unusable.
 *
 * Derived per call rather than cached at module scope so that rotating the
 * secret takes effect on the next request, and so importing this module never
 * requires configuration — the dashboard layout imports it at build time.
 */
function dashboardKey(): Buffer {
  return deriveSigningKey(DASHBOARD_SESSION_PURPOSE);
}

/** HMAC-SHA256 of the payload JSON under the given key. */
function signPayload(payload: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(payload, 'utf8').digest();
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
 * // 'eyJ0eXAiOiJkYXNoYm9hcmQiLCJleHAiOjE3NjQ1MDAwMDB9.qFh...'
 */
export function createSession(now: Date = new Date()): string {
  const key = dashboardKey();

  const payload = JSON.stringify({
    typ: DASHBOARD_TOKEN_TYPE,
    exp: unixSeconds(now) + SESSION_MAX_AGE_SECONDS,
  });
  const payloadSegment = Buffer.from(payload, 'utf8').toString('base64url');
  const signatureSegment = signPayload(payload, key).toString('base64url');

  return `${payloadSegment}${SEGMENT_SEPARATOR}${signatureSegment}`;
}

/**
 * The verification proper, which is allowed to throw. `verifySession` wraps it.
 */
function verifyOrThrow(cookieValue: string): boolean {
  const key = dashboardKey();

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
  const expected = signPayload(payload, key);
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

  const { typ, exp } = parsed as { typ?: unknown; exp?: unknown };

  // The token has to say what it is for. Belt to the purpose-derived key's
  // braces: if a later change ever signs another kind of token with this key,
  // that token still fails here instead of becoming a dashboard session.
  if (typ !== DASHBOARD_TOKEN_TYPE) return false;

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
 * base64, non-JSON payload, a payload minted for another purpose, missing `exp`,
 * bad signature, expired token, and an unconfigured secret — returns `false`.
 * A predicate guarding client data should
 * not be able to surface as a 500 that a caller might mistake for a transient
 * fault, and a misconfigured deploy should deny access rather than grant it.
 *
 * @param cookieValue - Raw cookie value, or `undefined` when the cookie is absent.
 * @returns `true` only for an unexpired dashboard-typed token signed with the
 *   current secret's dashboard key.
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

/**
 * Signed unsubscribe tokens.
 *
 * The link in an email footer has to work with no login — the recipient is not
 * a user of anything — while not becoming a way to unsubscribe somebody else.
 * So the address travels in the token and is signed: the endpoint learns who to
 * suppress from the token itself, and a tampered address fails verification.
 *
 * ## Its own signing purpose
 *
 * The key comes from `deriveSigningKey` under a label of its own, so an
 * unsubscribe token is cryptographically incapable of verifying as a dashboard
 * session or a chat session. That is the whole point of that module: these
 * tokens are handed to strangers in bulk, which makes them exactly the kind of
 * token that must not be interchangeable with Joey's login.
 *
 * ## No expiry, deliberately
 *
 * A link in a six-month-old email still has to work. CAN-SPAM requires an
 * opt-out mechanism to keep functioning for at least 30 days after a message is
 * sent, and recipients routinely act on much older mail. An expiring
 * unsubscribe link is a broken unsubscribe link, which is worse than useless —
 * it converts someone who wanted to opt out into someone who reports spam.
 *
 * The token therefore carries no timestamp and cannot be revoked. That is
 * acceptable because of what it authorises: removing an address from a mailing
 * list. The worst case for a leaked token is that someone stops receiving mail
 * they could ask for again.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { deriveSigningKey } from '@/lib/auth/signing-key';

/**
 * Signing purpose for unsubscribe links.
 *
 * Versioned so the key can be rotated — bumping this invalidates every link in
 * every email already sent, so it should only change if a key is believed
 * compromised.
 */
const UNSUBSCRIBE_PURPOSE = 'joeyo:unsubscribe:v1';

/** Type claim in the signed payload, as a second guard beyond the key label. */
const TOKEN_TYPE = 'unsub';

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(payload: string): string {
  return base64url(
    createHmac('sha256', deriveSigningKey(UNSUBSCRIBE_PURPOSE))
      .update(payload, 'utf8')
      .digest(),
  );
}

/**
 * Mint an unsubscribe token for an address.
 *
 * @param email - The address to encode. Normalise it before calling, so the
 *   token and the suppression row agree on casing.
 * @throws {MissingEnvError} When `SESSION_SECRET` is absent or blank.
 */
export function createUnsubscribeToken(email: string): string {
  const payload = base64url(JSON.stringify({ typ: TOKEN_TYPE, email }));
  return `${payload}.${sign(payload)}`;
}

/**
 * Recover the address from a token, or undefined if it does not verify.
 *
 * Returns undefined rather than throwing for every malformed, tampered or
 * foreign-signed token, so the endpoint has one branch for "no" and cannot leak
 * which part failed. A missing `SESSION_SECRET` is the exception and propagates:
 * that is a broken deployment, not a bad link, and it must not look like one.
 */
export function readUnsubscribeToken(token: string | undefined): string | undefined {
  if (!token) return undefined;

  const parts = token.split('.');
  if (parts.length !== 2) return undefined;

  const [payload, signature] = parts as [string, string];
  if (!payload || !signature) return undefined;

  const expected = sign(payload);

  // Length check first: timingSafeEqual throws on a length mismatch, and the
  // length of an HMAC is not a secret.
  const given = Buffer.from(signature, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (given.length !== want.length) return undefined;
  if (!timingSafeEqual(given, want)) return undefined;

  let claims: unknown;
  try {
    claims = JSON.parse(fromBase64url(payload).toString('utf8'));
  } catch {
    return undefined;
  }

  if (!claims || typeof claims !== 'object') return undefined;

  const { typ, email } = claims as { typ?: unknown; email?: unknown };

  // The type claim is redundant with the purpose-derived key and kept anyway,
  // for the reason signing-key.ts states: either control alone closes the hole,
  // and both mean a mistake in one does not reopen it.
  if (typ !== TOKEN_TYPE) return undefined;
  if (typeof email !== 'string' || email.length === 0) return undefined;

  return email;
}

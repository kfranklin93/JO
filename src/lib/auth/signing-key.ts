import { createHmac } from 'node:crypto';
import { env } from '@/config/env';
import { MissingEnvError, requireEnv } from '@/lib/utils/require-env';

/**
 * Purpose-separated signing keys derived from `SESSION_SECRET`.
 *
 * The deployment holds one secret, but more than one kind of token needs
 * signing: the dashboard session Joey logs in with, and — once the chat widget
 * exists — a chat session handed to any anonymous visitor. Signing both with
 * `SESSION_SECRET` directly would make them interchangeable at the crypto
 * layer. A different cookie *name* is not a boundary; an attacker simply copies
 * a chat cookie's value into `dashboard_auth`. The chat widget's entire job is
 * minting signed tokens for strangers, so that would be a dashboard credential
 * generator.
 *
 * So no token is signed with the secret. Each is signed with a key derived from
 * it for one stated purpose:
 *
 *   key = hmacSha256(SESSION_SECRET, purposeLabel)
 *
 * HMAC is a pseudorandom function keyed by the secret, so distinct labels give
 * keys that cannot be computed from one another without the secret. A token
 * minted under the chat label is then cryptographically incapable of verifying
 * under the dashboard label, whatever its payload says.
 *
 * Each consumer declares its own label next to the tokens it issues, so adding
 * one needs no edit here and no edit to another module's verification. Labels
 * must be unique, and are versioned so a future rotation can retire a key
 * without changing `SESSION_SECRET`. Uniqueness is a convention rather than
 * something this module can enforce, which is why token payloads also carry an
 * explicit type claim — see `session.ts`. Either control alone closes the hole;
 * both mean a mistake in one does not reopen it.
 */

/**
 * Read the signing secret, throwing `MissingEnvError` when it is not usable.
 *
 * `requireEnv` does the real check, including treating an empty or
 * whitespace-only value as missing. That case matters here more than elsewhere:
 * Netlify stores a cleared variable as an empty string, `z.string().optional()`
 * accepts it, and an empty HMAC key would happily produce signatures that
 * verify — a signed token whose key everyone knows. Better to fail loudly.
 *
 * The narrowing below is redundant at runtime and exists only because
 * TypeScript cannot see that `requireEnv` throws.
 */
function signingSecret(): string {
  requireEnv('SESSION_SECRET');

  const secret = env.SESSION_SECRET;
  if (secret === undefined) throw new MissingEnvError(['SESSION_SECRET']);

  return secret;
}

/**
 * Derive the 32-byte signing key for one purpose.
 *
 * @param purpose - Stable label naming what the key signs, e.g.
 *   `'joeyo:dashboard-session:v1'`. Callers should hold this in a constant
 *   rather than passing a literal at each use, because changing the label
 *   invalidates every token signed under the old one.
 * @returns The derived key, for use as the HMAC key over a token payload.
 * @throws {MissingEnvError} When `SESSION_SECRET` is absent or blank.
 * @throws {Error} When `purpose` is blank — a missing label would silently
 *   collapse every purpose onto the same key, which is the failure this module
 *   exists to prevent.
 *
 * @example
 * const key = deriveSigningKey('joeyo:dashboard-session:v1');
 * createHmac('sha256', key).update(payload, 'utf8').digest();
 */
export function deriveSigningKey(purpose: string): Buffer {
  if (purpose.trim().length === 0) {
    throw new Error('deriveSigningKey requires a non-empty purpose label');
  }

  return createHmac('sha256', signingSecret()).update(purpose, 'utf8').digest();
}

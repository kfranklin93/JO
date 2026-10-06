import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for unsubscribe link signing.
 *
 * The property that matters: the token names an address and cannot be edited to
 * name a different one. These links go out in bulk to strangers, so if the
 * address were forgeable, anyone could unsubscribe anyone — including
 * unsubscribing a competitor's clients, or quietly suppressing every address
 * Joey mails.
 *
 * The second property is isolation. `signing-key.ts` exists because tokens
 * handed to strangers must not be interchangeable with Joey's dashboard login.
 * That is asserted here directly rather than assumed.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const { createUnsubscribeToken, readUnsubscribeToken } = await import(
  './unsubscribe-token'
);
const { deriveSigningKey } = await import('./signing-key');

const SECRET = 'test-secret-for-unsubscribe-tokens';

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
});

describe('unsubscribe tokens — round trip', () => {
  it('recovers the address it was minted for', () => {
    const token = createUnsubscribeToken('dana@gowithjoeyo-test.invalid');

    expect(readUnsubscribeToken(token)).toBe('dana@gowithjoeyo-test.invalid');
  });

  it('survives characters that need URL and base64 escaping', () => {
    const email = "o'brien+market-updates@gowithjoeyo-test.invalid";

    expect(readUnsubscribeToken(createUnsubscribeToken(email))).toBe(email);
  });

  it('produces a token safe to put in a query string unencoded', () => {
    // base64url, so no +, / or = to be mangled by a mail client rewriting links.
    expect(createUnsubscribeToken('dana@x.invalid')).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});

describe('unsubscribe tokens — what must not verify', () => {
  it('rejects a token whose address was swapped', () => {
    // The attack this exists to stop: take your own valid link, change the
    // address, unsubscribe someone else.
    const token = createUnsubscribeToken('dana@gowithjoeyo-test.invalid');
    const [, signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ typ: 'unsub', email: 'joey@gowithjoeyo.com' }),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(readUnsubscribeToken(`${forgedPayload}.${signature}`)).toBeUndefined();
  });

  it('rejects a tampered signature', () => {
    const token = createUnsubscribeToken('dana@x.invalid');
    const flipped = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');

    expect(readUnsubscribeToken(flipped)).toBeUndefined();
  });

  it('rejects a token signed with a different secret', () => {
    testEnv.SESSION_SECRET = 'someone-elses-secret';
    const foreign = createUnsubscribeToken('dana@x.invalid');
    testEnv.SESSION_SECRET = SECRET;

    expect(readUnsubscribeToken(foreign)).toBeUndefined();
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['no separator', 'abcdef'],
    ['too many parts', 'a.b.c'],
    ['empty payload', '.c2ln'],
    ['payload that is not JSON', 'bm90anNvbg.c2ln'],
  ])('rejects a %s token', (_label, token) => {
    expect(readUnsubscribeToken(token as string | undefined)).toBeUndefined();
  });

  it('rejects a correctly signed token carrying the wrong type claim', () => {
    // Signed under this module's own purpose, so only the type claim is wrong.
    // Belt and braces: signing-key.ts notes that either control alone closes
    // the hole, and both mean a mistake in one does not reopen it.
    const b64 = (s: string | Buffer) =>
      Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const payload = b64(JSON.stringify({ typ: 'dashboard', email: 'dana@x.invalid' }));
    const signature = b64(
      createHmac('sha256', deriveSigningKey('joeyo:unsubscribe:v1'))
        .update(payload, 'utf8')
        .digest(),
    );

    expect(readUnsubscribeToken(`${payload}.${signature}`)).toBeUndefined();
  });
});

describe('unsubscribe tokens — isolation from other tokens', () => {
  it('is not signed with a key any other purpose could reproduce', () => {
    // If these matched, a link mailed to a stranger would be a credential for
    // whatever else shares the key.
    expect(deriveSigningKey('joeyo:unsubscribe:v1')).not.toEqual(
      deriveSigningKey('joeyo:dashboard-session:v1'),
    );
  });

  it('propagates a missing secret rather than silently failing open', () => {
    // A blank HMAC key would still produce verifying signatures — tokens whose
    // key everyone knows. That has to be loud.
    delete testEnv.SESSION_SECRET;

    expect(() => createUnsubscribeToken('dana@x.invalid')).toThrow(/SESSION_SECRET/);
  });
});

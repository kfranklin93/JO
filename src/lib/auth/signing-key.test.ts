import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for purpose-separated key derivation.
 *
 * The property that matters is separation: two purposes must never produce the
 * same key, and no purpose may produce the secret itself. Everything else here
 * is about failing loudly when the secret or the label is missing, since both
 * failures would silently collapse every purpose onto one key.
 *
 * `@/config/env` is mocked with a mutable object because the real module parses
 * `process.env` once at import — rotating or removing the secret mid-test is
 * otherwise impossible.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

const { deriveSigningKey } = await import('./signing-key');

const SECRET = 'test-session-secret-do-not-use-in-production';
const OTHER_SECRET = 'a-different-secret-an-attacker-might-hold';

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
});

describe('deriveSigningKey', () => {
  it('returns a 32-byte key', () => {
    expect(deriveSigningKey('purpose-a')).toHaveLength(32);
  });

  it('is deterministic for one purpose and secret', () => {
    expect(deriveSigningKey('purpose-a').equals(deriveSigningKey('purpose-a'))).toBe(true);
  });

  it('derives unrelated keys for different purposes', () => {
    expect(deriveSigningKey('purpose-a').equals(deriveSigningKey('purpose-b'))).toBe(false);
  });

  it('separates purposes that differ only in their version suffix', () => {
    expect(deriveSigningKey('joeyo:thing:v1').equals(deriveSigningKey('joeyo:thing:v2'))).toBe(
      false
    );
  });

  it('never returns the secret itself', () => {
    // The point of derivation: a token signed with the raw secret cannot verify
    // against any derived key.
    expect(deriveSigningKey('purpose-a').toString('utf8')).not.toBe(SECRET);
  });

  it('changes with the secret', () => {
    const before = deriveSigningKey('purpose-a');
    testEnv.SESSION_SECRET = OTHER_SECRET;

    expect(deriveSigningKey('purpose-a').equals(before)).toBe(false);
  });

  it('matches an independently computed HMAC of the purpose under the secret', () => {
    expect(
      deriveSigningKey('purpose-a').equals(
        createHmac('sha256', SECRET).update('purpose-a', 'utf8').digest()
      )
    ).toBe(true);
  });
});

describe('deriveSigningKey — refusals', () => {
  const blankPurposes: Array<[string, string]> = [
    ['an empty label', ''],
    ['a whitespace-only label', '   '],
  ];

  for (const [label, purpose] of blankPurposes) {
    it(`throws on ${label}`, () => {
      expect(() => deriveSigningKey(purpose)).toThrow(/purpose/i);
    });
  }

  it('throws when SESSION_SECRET is absent', () => {
    delete testEnv.SESSION_SECRET;

    expect(() => deriveSigningKey('purpose-a')).toThrow(/SESSION_SECRET/);
  });

  it('throws when SESSION_SECRET is an empty string', () => {
    // Netlify stores a cleared variable as an empty string, and an empty HMAC key
    // would still produce signatures that verify.
    testEnv.SESSION_SECRET = '';

    expect(() => deriveSigningKey('purpose-a')).toThrow(/SESSION_SECRET/);
  });

  it('throws when SESSION_SECRET is whitespace only', () => {
    testEnv.SESSION_SECRET = '   ';

    expect(() => deriveSigningKey('purpose-a')).toThrow(/SESSION_SECRET/);
  });
});

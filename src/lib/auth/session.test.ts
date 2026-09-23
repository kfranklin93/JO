import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for signed dashboard sessions.
 *
 * These encode the security properties of the spec, so they are written as
 * attacks rather than as coverage: forge a signature, move the expiry, mangle the
 * encoding, strip the secret. Every one of them must produce `false`.
 *
 * `@/config/env` is mocked with a mutable object because the real module parses
 * `process.env` once at import — rotating or removing the secret mid-test is
 * otherwise impossible.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

const {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSession,
  sessionCookieOptions,
  verifySession,
} = await import('./session');

const SECRET = 'test-session-secret-do-not-use-in-production';
const OTHER_SECRET = 'a-different-secret-an-attacker-might-hold';

/**
 * Purpose labels, restated here rather than imported.
 *
 * The implementation keeps them private, and a test that imported them could not
 * catch a label changing. Restating means a rename shows up as a failing test,
 * which is right: changing a label invalidates every token signed under it.
 */
const DASHBOARD_PURPOSE = 'joeyo:dashboard-session:v1';
const CHAT_PURPOSE = 'joeyo:chat-session:v1';

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.SESSION_SECRET = SECRET;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Split a token without tripping `noUncheckedIndexedAccess`. */
function splitToken(token: string): { payloadSegment: string; signatureSegment: string } {
  const [payloadSegment = '', signatureSegment = ''] = token.split('.');
  return { payloadSegment, signatureSegment };
}

/** Decode a token's payload back to its JSON text. */
function decodePayload(token: string): string {
  return Buffer.from(splitToken(token).payloadSegment, 'base64url').toString('utf8');
}

/**
 * Derive a purpose key the way the implementation does, computed independently.
 */
function keyFor(purpose: string, secret: string = SECRET): Buffer {
  return createHmac('sha256', secret).update(purpose, 'utf8').digest();
}

/**
 * Build a token the way an attacker holding a given key would.
 *
 * Deliberately independent of the implementation: a forged token has to be
 * constructed from the outside for the test to mean anything. The key is passed
 * in so a test can sign with the raw secret, with the dashboard key, or with
 * some other purpose's key, and say which it meant.
 */
function forgeToken(payload: string, key: string | Buffer): string {
  const payloadSegment = Buffer.from(payload, 'utf8').toString('base64url');
  const signatureSegment = createHmac('sha256', key).update(payload, 'utf8').digest('base64url');

  return `${payloadSegment}.${signatureSegment}`;
}

/** A token carrying an arbitrary payload under a correct dashboard signature. */
function signedWithPayload(payload: string): string {
  return forgeToken(payload, keyFor(DASHBOARD_PURPOSE));
}

/** An expiry far enough ahead that the expiry check cannot be what rejects a token. */
function futureExp(): number {
  return Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
}

/** A `Date` the given number of seconds in the past. */
function secondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

describe('constants', () => {
  it('names the cookie dashboard_auth', () => {
    expect(SESSION_COOKIE_NAME).toBe('dashboard_auth');
  });

  it('expires sessions after seven days', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(604800);
  });
});

describe('createSession', () => {
  it('produces a two-segment token', () => {
    expect(createSession().split('.')).toHaveLength(2);
  });

  it('embeds an expiry one max-age from the issue time', () => {
    const issuedAt = new Date('2026-01-01T00:00:00Z');

    const payload = JSON.parse(decodePayload(createSession(issuedAt)));

    expect(payload.exp).toBe(Math.floor(issuedAt.getTime() / 1000) + SESSION_MAX_AGE_SECONDS);
  });

  it('stamps the payload with the dashboard type claim', () => {
    expect(JSON.parse(decodePayload(createSession())).typ).toBe('dashboard');
  });

  it('signs with a key derived from SESSION_SECRET, not with the secret itself', () => {
    const token = createSession();
    const { payloadSegment, signatureSegment } = splitToken(token);
    const payload = Buffer.from(payloadSegment, 'base64url').toString('utf8');

    expect(signatureSegment).toBe(
      createHmac('sha256', keyFor(DASHBOARD_PURPOSE)).update(payload, 'utf8').digest('base64url')
    );
    expect(signatureSegment).not.toBe(
      createHmac('sha256', SECRET).update(payload, 'utf8').digest('base64url')
    );
  });

  it('issues a distinct token for a distinct issue time', () => {
    // Not a uniqueness guarantee — just confirmation that the payload is
    // time-derived rather than the fixed string this replaces.
    expect(createSession(secondsAgo(60))).not.toBe(createSession());
  });

  it('throws when SESSION_SECRET is absent rather than issuing an unsigned token', () => {
    delete testEnv.SESSION_SECRET;

    expect(() => createSession()).toThrow(/SESSION_SECRET/);
  });

  it('throws when SESSION_SECRET is an empty string', () => {
    // Netlify stores a cleared variable as an empty string, and an empty HMAC key
    // would still produce signatures that verify.
    testEnv.SESSION_SECRET = '';

    expect(() => createSession()).toThrow(/SESSION_SECRET/);
  });

  it('throws when SESSION_SECRET is whitespace only', () => {
    testEnv.SESSION_SECRET = '   ';

    expect(() => createSession()).toThrow(/SESSION_SECRET/);
  });
});

describe('verifySession — valid sessions', () => {
  it('accepts a freshly issued token', () => {
    expect(verifySession(createSession())).toBe(true);
  });

  it('accepts a token issued in the past but not yet expired', () => {
    expect(verifySession(createSession(secondsAgo(SESSION_MAX_AGE_SECONDS - 60)))).toBe(true);
  });
});

describe('verifySession — forged and tampered tokens', () => {
  it('rejects the hardcoded token this spec replaces', () => {
    // Regression test for the actual vulnerability: this literal was committed to
    // the repo and worked as a credential.
    expect(verifySession('joey_dashboard_authenticated')).toBe(false);
  });

  it('rejects a payload edited to extend the expiry', () => {
    const token = createSession();
    const { signatureSegment } = splitToken(token);
    const payload = JSON.parse(decodePayload(token));

    payload.exp += SESSION_MAX_AGE_SECONDS * 52;
    const forgedSegment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    expect(verifySession(`${forgedSegment}.${signatureSegment}`)).toBe(false);
  });

  it('rejects a payload with a single byte changed', () => {
    const token = createSession();
    const { payloadSegment, signatureSegment } = splitToken(token);

    // Flip the final payload character to something else in the alphabet.
    const lastChar = payloadSegment.slice(-1);
    const mutated = payloadSegment.slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');

    expect(verifySession(`${mutated}.${signatureSegment}`)).toBe(false);
  });

  it('rejects a valid payload signed with a different secret', () => {
    const payload = JSON.stringify({ typ: 'dashboard', exp: futureExp() });

    // Same payload, same purpose label, wrong secret underneath the derivation.
    expect(verifySession(forgeToken(payload, keyFor(DASHBOARD_PURPOSE, OTHER_SECRET)))).toBe(false);
  });

  it('rejects a token whose signature belongs to a different payload', () => {
    const { signatureSegment } = splitToken(createSession());
    const { payloadSegment } = splitToken(createSession(secondsAgo(120)));

    expect(verifySession(`${payloadSegment}.${signatureSegment}`)).toBe(false);
  });

  it('rejects a token issued under the previous secret after rotation', () => {
    const token = createSession();

    testEnv.SESSION_SECRET = OTHER_SECRET;

    expect(verifySession(token)).toBe(false);
  });

  it('rejects a smuggled third segment rather than truncating to the first two', () => {
    expect(verifySession(`${createSession()}.extra`)).toBe(false);
  });
});

/**
 * Cross-purpose forgery.
 *
 * The chat widget does not exist yet, and these tests are the reason it can be
 * built safely. Its job is minting signed tokens for anonymous visitors, and the
 * spec originally had it sign `{ leadId, exp }` with `SESSION_SECRET` under a
 * different cookie name. A cookie name is not a boundary — the value can be
 * copied into `dashboard_auth` — so such a token would have satisfied every
 * condition this module used to test, handing each visitor a dashboard
 * credential and every lead's PII with it.
 *
 * Two independent controls stop that, and each is tested on its own so a later
 * change cannot quietly remove one and still look green.
 */
describe('verifySession — cross-purpose tokens', () => {
  it('rejects a chat session token pasted into the dashboard_auth cookie', () => {
    // The named regression: a chat token exactly as the spec described it,
    // signed with the raw secret, carrying a leadId instead of a type.
    const chatToken = forgeToken(
      JSON.stringify({ leadId: 'lead-00000000-0000-4000-8000-000000000000', exp: futureExp() }),
      SECRET
    );

    expect(verifySession(chatToken)).toBe(false);
  });

  it('rejects a chat token signed under its own purpose key', () => {
    // And the same attack once chat derives a key properly: valid chat token,
    // still worthless as a dashboard session.
    const chatToken = forgeToken(
      JSON.stringify({ typ: 'chat', leadId: 'lead-1', exp: futureExp() }),
      keyFor(CHAT_PURPOSE)
    );

    expect(verifySession(chatToken)).toBe(false);
  });

  it('rejects an otherwise perfect token signed with the raw SESSION_SECRET', () => {
    // Layer one on its own: correct payload, correct secret, no derivation.
    const payload = JSON.stringify({ typ: 'dashboard', exp: futureExp() });

    expect(verifySession(forgeToken(payload, SECRET))).toBe(false);
  });

  it('rejects a dashboard payload signed under a different purpose label', () => {
    const payload = JSON.stringify({ typ: 'dashboard', exp: futureExp() });

    expect(verifySession(forgeToken(payload, keyFor(CHAT_PURPOSE)))).toBe(false);
  });

  it('rejects a token carrying a different type claim', () => {
    // Layer two on its own: signed with the dashboard key, so only the claim
    // stands between it and acceptance.
    const payload = JSON.stringify({ typ: 'chat', exp: futureExp() });

    expect(verifySession(signedWithPayload(payload))).toBe(false);
  });

  it('rejects a token with no type claim', () => {
    const payload = JSON.stringify({ exp: futureExp() });

    expect(verifySession(signedWithPayload(payload))).toBe(false);
  });

  const wrongTypes: Array<[string, string]> = [
    ['null', 'null'],
    ['a number', '1'],
    ['a boolean', 'true'],
    ['an object', '{"name":"dashboard"}'],
    ['the wrong case', '"Dashboard"'],
    ['padded', '" dashboard "'],
  ];

  for (const [label, typ] of wrongTypes) {
    it(`rejects a type claim that is ${label}`, () => {
      const payload = `{"typ":${typ},"exp":${futureExp()}}`;

      expect(verifySession(signedWithPayload(payload))).toBe(false);
    });
  }
});

describe('verifySession — expiry', () => {
  it('rejects a token whose expiry has passed', () => {
    expect(verifySession(createSession(secondsAgo(SESSION_MAX_AGE_SECONDS + 60)))).toBe(false);
  });

  it('rejects a token expiring exactly now', () => {
    expect(verifySession(createSession(secondsAgo(SESSION_MAX_AGE_SECONDS)))).toBe(false);
  });

  it('rejects an expired token even though its signature is valid', () => {
    // The point of putting exp inside the signed payload: cookie maxAge is a
    // client-side hint, and a crafted request simply omits it.
    const expired = createSession(secondsAgo(SESSION_MAX_AGE_SECONDS * 2));
    const payload = JSON.parse(decodePayload(expired));

    expect(payload.exp).toBeLessThan(Math.floor(Date.now() / 1000));
    expect(verifySession(expired)).toBe(false);
  });
});

describe('verifySession — malformed input', () => {
  const malformed: Array<[string, string | undefined]> = [
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['no separator', 'eyJleHAiOjF9'],
    ['a bare separator', '.'],
    ['an empty payload segment', '.c2lnbmF0dXJl'],
    ['an empty signature segment', 'eyJleHAiOjF9.'],
    ['a non-base64 payload', '!!! not base64 !!!.c2lnbmF0dXJl'],
    ['a non-base64 signature', 'eyJleHAiOjF9.!!! not base64 !!!'],
    ['padded, non-canonical base64', `${Buffer.from('{"exp":1}').toString('base64')}==.x`],
    ['a JSON array of segments', '["a","b"]'],
  ];

  for (const [label, value] of malformed) {
    it(`rejects ${label}`, () => {
      expect(verifySession(value)).toBe(false);
    });

    it(`does not throw on ${label}`, () => {
      expect(() => verifySession(value)).not.toThrow();
    });
  }

  it('rejects a truncated token without throwing', () => {
    const truncated = createSession().slice(0, 12);

    expect(() => verifySession(truncated)).not.toThrow();
    expect(verifySession(truncated)).toBe(false);
  });

  // These carry a correct signature — and, where the payload is an object, the
  // correct type claim — so each one reaches the specific payload check it names
  // rather than being stopped earlier.
  const signedButInvalid: Array<[string, string]> = [
    ['a payload that is not JSON', 'definitely not json'],
    ['a payload that is JSON null', 'null'],
    ['a payload that is a JSON number', '42'],
    ['a payload that is a JSON string', '"session"'],
    ['a payload that is a JSON array', '[]'],
    ['a payload with no exp claim', '{"typ":"dashboard"}'],
    ['a payload whose exp is a string', '{"typ":"dashboard","exp":"9999999999"}'],
    ['a payload whose exp is null', '{"typ":"dashboard","exp":null}'],
    ['a payload whose exp is a boolean', '{"typ":"dashboard","exp":true}'],
    ['a payload whose exp is not finite', '{"typ":"dashboard","exp":1e999}'],
  ];

  for (const [label, payload] of signedButInvalid) {
    it(`rejects a correctly signed token with ${label}`, () => {
      expect(verifySession(signedWithPayload(payload))).toBe(false);
    });

    it(`does not throw on a correctly signed token with ${label}`, () => {
      expect(() => verifySession(signedWithPayload(payload))).not.toThrow();
    });
  }
});

describe('verifySession — unconfigured secret', () => {
  it('returns false instead of throwing when SESSION_SECRET is absent', () => {
    const token = createSession();
    delete testEnv.SESSION_SECRET;

    expect(() => verifySession(token)).not.toThrow();
    expect(verifySession(token)).toBe(false);
  });

  it('returns false when SESSION_SECRET is blank', () => {
    const token = createSession();
    testEnv.SESSION_SECRET = '';

    expect(verifySession(token)).toBe(false);
  });
});

describe('sessionCookieOptions', () => {
  it('keeps the cookie inaccessible to JavaScript, lax, and site-wide', () => {
    const options = sessionCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
  });

  it('expires the cookie in step with the signed expiry', () => {
    expect(sessionCookieOptions().maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it('marks the cookie secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(sessionCookieOptions().secure).toBe(true);
  });

  it('leaves the cookie usable over plain HTTP outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(sessionCookieOptions().secure).toBe(false);
  });
});

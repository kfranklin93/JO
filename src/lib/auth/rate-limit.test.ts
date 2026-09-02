import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FAILED_ATTEMPTS,
  RATE_LIMIT_WINDOW_SECONDS,
  SHARED_FALLBACK_KEY,
  checkRateLimit,
  clearFailures,
  rateLimitKey,
  recordFailure,
} from './rate-limit';

/**
 * Unit tests for the login rate limiter.
 *
 * Time is mocked rather than waited on — the window is fifteen minutes, so a
 * sleeping test would be unrunnable. `vi.advanceTimersByTime` moves the same
 * clock `Date.now()` reads, so the window-reset paths are exercised for real
 * rather than through an injected seam that production never uses.
 */

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

let keyCounter = 0;

/**
 * A key no other test has touched.
 *
 * The limiter's state is module-scoped and survives between tests, which is
 * precisely how it behaves in a warm function instance. Rather than add a
 * test-only reset export, each test works on its own key.
 */
function freshKey(): string {
  keyCounter += 1;
  return `198.51.100.${keyCounter}`;
}

/** Move the mocked clock forward. */
function advanceSeconds(seconds: number): void {
  vi.advanceTimersByTime(seconds * 1000);
}

/** Record several failures at the current mocked time. */
function recordFailures(key: string, count: number): void {
  for (let attempt = 0; attempt < count; attempt += 1) recordFailure(key);
}

/** A key already at the threshold. */
function blockedKey(): string {
  const key = freshKey();
  recordFailures(key, MAX_FAILED_ATTEMPTS);
  return key;
}

describe('constants', () => {
  it('allows five failed attempts per window', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
  });

  it('slides over a fifteen-minute window', () => {
    expect(RATE_LIMIT_WINDOW_SECONDS).toBe(900);
  });
});

describe('checkRateLimit — under the threshold', () => {
  it('allows a key it has never seen', () => {
    expect(checkRateLimit(freshKey()).allowed).toBe(true);
  });

  it('allows every attempt short of the threshold', () => {
    const key = freshKey();

    for (let failures = 0; failures < MAX_FAILED_ATTEMPTS - 1; failures += 1) {
      recordFailure(key);
      expect(checkRateLimit(key).allowed).toBe(true);
    }
  });

  it('reports no retry wait while attempts are allowed', () => {
    const key = freshKey();
    recordFailures(key, MAX_FAILED_ATTEMPTS - 1);

    expect(checkRateLimit(key)).toEqual({ allowed: true });
  });
});

describe('checkRateLimit — threshold breach', () => {
  it('refuses once the threshold is reached', () => {
    expect(checkRateLimit(blockedKey()).allowed).toBe(false);
  });

  it('reports a retry wait covering the rest of the window', () => {
    expect(checkRateLimit(blockedKey()).retryAfterSeconds).toBe(
      RATE_LIMIT_WINDOW_SECONDS,
    );
  });

  it('counts down the retry wait as the window advances', () => {
    const key = blockedKey();

    advanceSeconds(300);

    expect(checkRateLimit(key).retryAfterSeconds).toBe(
      RATE_LIMIT_WINDOW_SECONDS - 300,
    );
  });

  it('pivots the retry wait on the oldest failure, not the newest', () => {
    // One failure, a gap, then the rest. The block lifts when the first one ages
    // out, which is what makes the window sliding rather than fixed.
    const key = freshKey();
    recordFailure(key);
    advanceSeconds(300);
    recordFailures(key, MAX_FAILED_ATTEMPTS - 1);

    const result = checkRateLimit(key);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(RATE_LIMIT_WINDOW_SECONDS - 300);
  });

  it('keeps refusing while further attempts pile up', () => {
    const key = blockedKey();

    recordFailures(key, 3);

    expect(checkRateLimit(key).allowed).toBe(false);
  });

  it('does not refuse a key that only ever succeeded', () => {
    const observer = freshKey();
    blockedKey();

    expect(checkRateLimit(observer).allowed).toBe(true);
  });
});

describe('checkRateLimit — window reset', () => {
  it('permits attempts again once the window has elapsed', () => {
    const key = blockedKey();

    advanceSeconds(RATE_LIMIT_WINDOW_SECONDS);

    expect(checkRateLimit(key).allowed).toBe(true);
  });

  it('still refuses one second before the window elapses', () => {
    const key = blockedKey();

    advanceSeconds(RATE_LIMIT_WINDOW_SECONDS - 1);

    expect(checkRateLimit(key).allowed).toBe(false);
  });

  it('honours the retry wait it reported', () => {
    const key = blockedKey();
    const { retryAfterSeconds } = checkRateLimit(key);

    expect(retryAfterSeconds).toBeDefined();
    advanceSeconds(retryAfterSeconds ?? 0);

    expect(checkRateLimit(key).allowed).toBe(true);
  });

  it('frees exactly one attempt when only the oldest failure has aged out', () => {
    const key = freshKey();
    recordFailure(key);
    advanceSeconds(60);
    recordFailures(key, MAX_FAILED_ATTEMPTS - 1);
    expect(checkRateLimit(key).allowed).toBe(false);

    // The first failure leaves the window; the later ones have not.
    advanceSeconds(RATE_LIMIT_WINDOW_SECONDS - 60);
    expect(checkRateLimit(key).allowed).toBe(true);

    recordFailure(key);
    expect(checkRateLimit(key).allowed).toBe(false);
  });

  it('starts clean after a full window of quiet', () => {
    const key = blockedKey();
    advanceSeconds(RATE_LIMIT_WINDOW_SECONDS * 2);

    recordFailures(key, MAX_FAILED_ATTEMPTS - 1);

    expect(checkRateLimit(key).allowed).toBe(true);
  });
});

describe('clearFailures', () => {
  it('lifts a refusal for the key given', () => {
    const key = blockedKey();

    clearFailures(key);

    expect(checkRateLimit(key).allowed).toBe(true);
  });

  it('leaves other keys refused', () => {
    const cleared = blockedKey();
    const other = blockedKey();

    clearFailures(cleared);

    expect(checkRateLimit(other).allowed).toBe(false);
  });

  it('is a no-op for a key with no recorded failures', () => {
    const key = freshKey();

    expect(() => clearFailures(key)).not.toThrow();
    expect(checkRateLimit(key).allowed).toBe(true);
  });
});

describe('rateLimitKey', () => {
  it('prefers the platform header over forwarded ones', () => {
    const headers = new Headers({
      'x-nf-client-connection-ip': '203.0.113.7',
      'x-real-ip': '203.0.113.8',
      'x-forwarded-for': '203.0.113.9',
    });

    expect(rateLimitKey(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.8' });

    expect(rateLimitKey(headers)).toBe('203.0.113.8');
  });

  it('takes the leading entry of a comma-joined x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2',
    });

    expect(rateLimitKey(headers)).toBe('203.0.113.9');
  });

  it('treats a blank header as absent', () => {
    const headers = new Headers({
      'x-nf-client-connection-ip': '   ',
      'x-real-ip': '203.0.113.8',
    });

    expect(rateLimitKey(headers)).toBe('203.0.113.8');
  });

  it('returns the shared fallback when no IP header is present', () => {
    expect(rateLimitKey(new Headers())).toBe(SHARED_FALLBACK_KEY);
  });

  it('puts every header-less request in one bucket, so stripping headers is no bypass', () => {
    clearFailures(SHARED_FALLBACK_KEY);
    const first = rateLimitKey(new Headers());
    const second = rateLimitKey(new Headers({ 'user-agent': 'curl/8.0' }));

    recordFailures(first, MAX_FAILED_ATTEMPTS);

    expect(second).toBe(first);
    expect(checkRateLimit(second).allowed).toBe(false);
    clearFailures(SHARED_FALLBACK_KEY);
  });
});

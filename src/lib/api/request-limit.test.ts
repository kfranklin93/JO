import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IP_WINDOW_SECONDS,
  KEY_PREFIX,
  MAX_REQUESTS_PER_IP,
  MAX_REQUESTS_PER_SESSION,
  SESSION_WINDOW_SECONDS,
  checkAndCount,
  checkAndCountSession,
  rateLimitKey,
} from './request-limit';
import {
  MAX_FAILED_ATTEMPTS,
  SHARED_FALLBACK_KEY,
  checkRateLimit,
  clearFailures,
  recordFailure,
} from '@/lib/auth/rate-limit';

/**
 * Unit tests for the assistant request limiter.
 *
 * Time is mocked rather than waited on, following the login limiter's own tests:
 * `vi.setSystemTime` plus `vi.advanceTimersByTime` move the same clock
 * `Date.now()` reads, so the window-reset paths run against the production code
 * path instead of an injected seam nothing else uses. A test that slept through
 * a one-hour session window would be unrunnable.
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
 * The store is module-scoped and survives between tests, which is exactly how it
 * behaves in a warm function instance. Rather than add a test-only reset export,
 * each test works on its own key — the same approach rate-limit.test.ts takes.
 */
function freshKey(): string {
  keyCounter += 1;
  return `198.51.100.${keyCounter}`;
}

/** Move the mocked clock forward. */
function advanceSeconds(seconds: number): void {
  vi.advanceTimersByTime(seconds * 1000);
}

/** Send `count` requests through the per-IP limit and return each outcome. */
function sendIp(key: string, count: number): boolean[] {
  const outcomes: boolean[] = [];
  for (let sent = 0; sent < count; sent += 1) {
    outcomes.push(checkAndCount(key).allowed);
  }
  return outcomes;
}

/** Send `count` requests through the per-session limit and return each outcome. */
function sendSession(key: string, count: number): boolean[] {
  const outcomes: boolean[] = [];
  for (let sent = 0; sent < count; sent += 1) {
    outcomes.push(checkAndCountSession(key).allowed);
  }
  return outcomes;
}

/** A per-IP key already at its ceiling. */
function exhaustedIpKey(): string {
  const key = freshKey();
  sendIp(key, MAX_REQUESTS_PER_IP);
  return key;
}

describe('constants', () => {
  it('allows ten requests per minute per IP', () => {
    expect(MAX_REQUESTS_PER_IP).toBe(10);
    expect(IP_WINDOW_SECONDS).toBe(60);
  });

  it('allows forty requests per hour per session', () => {
    expect(MAX_REQUESTS_PER_SESSION).toBe(40);
    expect(SESSION_WINDOW_SECONDS).toBe(3600);
  });

  it('namespaces its keyspace under an assistant-specific prefix', () => {
    expect(KEY_PREFIX).toBe('assistant:rl:');
  });
});

describe('checkAndCount — counting successes', () => {
  /**
   * The gap in the failure-based limiter, stated as a test.
   *
   * `rate-limit.ts` only ever records a failure, so a caller whose requests all
   * succeed is never limited by it. This module has no separate record step at
   * all — the check *is* the count — which is what closes that gap.
   */
  it('limits a caller whose requests all succeed, which recordFailure-based limiting never would', () => {
    const key = freshKey();

    // Every one of these is a well-formed, successful request. Nothing failed,
    // and nothing called anything resembling `recordFailure`.
    const allowed = sendIp(key, MAX_REQUESTS_PER_IP);
    expect(allowed.every(Boolean)).toBe(true);

    expect(checkAndCount(key).allowed).toBe(false);
  });

  it('counts on the check itself, so there is no record step to omit', () => {
    const key = freshKey();

    for (let sent = 0; sent < MAX_REQUESTS_PER_IP; sent += 1) checkAndCount(key);

    expect(checkAndCount(key).allowed).toBe(false);
  });

  it('allows a key it has never seen', () => {
    expect(checkAndCount(freshKey()).allowed).toBe(true);
  });

  it('allows exactly the configured number of requests before refusing', () => {
    const key = freshKey();

    const allowed = sendIp(key, MAX_REQUESTS_PER_IP + 3);

    expect(allowed.filter(Boolean)).toHaveLength(MAX_REQUESTS_PER_IP);
  });

  it('reports no retry wait while requests are permitted', () => {
    const key = freshKey();
    sendIp(key, MAX_REQUESTS_PER_IP - 1);

    expect(checkAndCount(key)).toEqual({ allowed: true });
  });

  it('limits one key without touching another', () => {
    const noisy = exhaustedIpKey();
    const quiet = freshKey();

    expect(checkAndCount(noisy).allowed).toBe(false);
    expect(checkAndCount(quiet).allowed).toBe(true);
  });
});

describe('checkAndCount — Retry-After on refusal', () => {
  it('reports a retry wait when it refuses', () => {
    const result = checkAndCount(exhaustedIpKey());

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(IP_WINDOW_SECONDS);
  });

  it('never reports a zero wait, which would invite an immediate retry', () => {
    const key = exhaustedIpKey();
    advanceSeconds(IP_WINDOW_SECONDS - 1);

    const result = checkAndCount(key);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('counts the retry wait down as the window advances', () => {
    const key = exhaustedIpKey();

    advanceSeconds(20);

    expect(checkAndCount(key).retryAfterSeconds).toBe(IP_WINDOW_SECONDS - 20);
  });

  it('pivots the wait on the oldest counted request, not the newest', () => {
    // One request, a gap, then the rest. The refusal lifts when the first ages
    // out, which is what makes the window sliding rather than fixed.
    const key = freshKey();
    checkAndCount(key);
    advanceSeconds(20);
    sendIp(key, MAX_REQUESTS_PER_IP - 1);

    const result = checkAndCount(key);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(IP_WINDOW_SECONDS - 20);
  });

  it('honours the wait it reported', () => {
    const key = exhaustedIpKey();
    const { retryAfterSeconds } = checkAndCount(key);

    expect(retryAfterSeconds).toBeDefined();
    advanceSeconds(retryAfterSeconds ?? 0);

    expect(checkAndCount(key).allowed).toBe(true);
  });

  it('keeps its promise even when the caller hammers through the refusal', () => {
    // Refused requests are not counted, so continued polling cannot push the
    // caller's own retry time outward indefinitely.
    const key = exhaustedIpKey();
    const { retryAfterSeconds } = checkAndCount(key);

    for (let attempt = 0; attempt < 50; attempt += 1) checkAndCount(key);
    advanceSeconds(retryAfterSeconds ?? 0);

    expect(checkAndCount(key).allowed).toBe(true);
  });
});

describe('checkAndCount — window reset', () => {
  it('permits requests again once the window has elapsed', () => {
    const key = exhaustedIpKey();

    advanceSeconds(IP_WINDOW_SECONDS);

    expect(checkAndCount(key).allowed).toBe(true);
  });

  it('still refuses one second before the window elapses', () => {
    const key = exhaustedIpKey();

    advanceSeconds(IP_WINDOW_SECONDS - 1);

    expect(checkAndCount(key).allowed).toBe(false);
  });

  it('frees exactly one request when only the oldest has aged out', () => {
    const key = freshKey();
    checkAndCount(key);
    advanceSeconds(10);
    sendIp(key, MAX_REQUESTS_PER_IP - 1);
    expect(checkAndCount(key).allowed).toBe(false);

    // The first request leaves the window; the later ones have not.
    advanceSeconds(IP_WINDOW_SECONDS - 10);
    expect(checkAndCount(key).allowed).toBe(true);
    expect(checkAndCount(key).allowed).toBe(false);
  });

  it('starts clean after a full window of quiet', () => {
    const key = exhaustedIpKey();
    advanceSeconds(IP_WINDOW_SECONDS * 2);

    const allowed = sendIp(key, MAX_REQUESTS_PER_IP);

    expect(allowed.every(Boolean)).toBe(true);
  });
});

describe('checkAndCountSession', () => {
  it('limits a session after the hourly allowance, all of them successes', () => {
    const session = 'session-a';

    const allowed = sendSession(session, MAX_REQUESTS_PER_SESSION);
    expect(allowed.every(Boolean)).toBe(true);

    expect(checkAndCountSession(session).allowed).toBe(false);
  });

  it('reports an hourly retry wait on refusal', () => {
    const session = 'session-b';
    sendSession(session, MAX_REQUESTS_PER_SESSION);

    const result = checkAndCountSession(session);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(SESSION_WINDOW_SECONDS);
  });

  it('resets after its own, longer window rather than the per-IP one', () => {
    const session = 'session-c';
    sendSession(session, MAX_REQUESTS_PER_SESSION);

    advanceSeconds(IP_WINDOW_SECONDS * 2);
    expect(checkAndCountSession(session).allowed).toBe(false);

    advanceSeconds(SESSION_WINDOW_SECONDS);
    expect(checkAndCountSession(session).allowed).toBe(true);
  });

  it('limits one session without touching another', () => {
    sendSession('session-d', MAX_REQUESTS_PER_SESSION);

    expect(checkAndCountSession('session-d').allowed).toBe(false);
    expect(checkAndCountSession('session-e').allowed).toBe(true);
  });

  it('keeps session counters clear of the per-IP counters', () => {
    // A session identifier that looks exactly like an address must not spend the
    // allowance of the address it resembles.
    const shared = freshKey();

    sendSession(shared, MAX_REQUESTS_PER_SESSION);

    expect(checkAndCountSession(shared).allowed).toBe(false);
    expect(checkAndCount(shared).allowed).toBe(true);
  });
});

describe('keyspace separation from the login limiter', () => {
  /**
   * The reason this module exists as a second limiter rather than a change to
   * rate-limit.ts. Both key on client IP, so a shared store would let chat
   * traffic from an address consume the login allowance for that same address
   * and lock the operator out of his own dashboard.
   */
  it('does not affect checkRateLimit for the same IP, even when fully exhausted', () => {
    const ip = freshKey();

    sendIp(ip, MAX_REQUESTS_PER_IP + 5);

    expect(checkAndCount(ip).allowed).toBe(false);
    expect(checkRateLimit(ip)).toEqual({ allowed: true });
  });

  it('is not affected by login failures recorded against the same IP', () => {
    const ip = freshKey();

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      recordFailure(ip);
    }

    expect(checkRateLimit(ip).allowed).toBe(false);
    expect(checkAndCount(ip).allowed).toBe(true);

    clearFailures(ip);
  });

  it('is not cleared by clearFailures for the same IP', () => {
    const ip = exhaustedIpKey();

    clearFailures(ip);

    expect(checkAndCount(ip).allowed).toBe(false);
  });
});

describe('rateLimitKey reuse', () => {
  it('re-exports the login limiter key derivation rather than reimplementing it', () => {
    const headers = new Headers({
      'x-nf-client-connection-ip': '203.0.113.7',
      'x-forwarded-for': '203.0.113.9',
    });

    expect(rateLimitKey(headers)).toBe('203.0.113.7');
  });

  it('puts every header-less request in one shared bucket, so stripping headers is no bypass', () => {
    const anonymous = rateLimitKey(new Headers());
    const alsoAnonymous = rateLimitKey(new Headers({ 'user-agent': 'curl/8.0' }));

    expect(anonymous).toBe(SHARED_FALLBACK_KEY);
    expect(alsoAnonymous).toBe(anonymous);

    // One caller spends the allowance; the next header-less caller inherits the
    // refusal instead of getting a private bucket.
    sendIp(anonymous, MAX_REQUESTS_PER_IP);

    expect(checkAndCount(alsoAnonymous).allowed).toBe(false);

    // Leave the shared bucket drained for any later test that reaches for it.
    advanceSeconds(IP_WINDOW_SECONDS);
  });
});

describe('memory growth', () => {
  it('does not retain a bucket per address indefinitely', () => {
    // More distinct keys than the sweep threshold, then a full window of quiet
    // and one more request to trigger the sweep. Buckets are private, so this
    // asserts the observable consequence: nothing carried over.
    for (let index = 0; index < 1100; index += 1) {
      checkAndCount(`192.0.2.${index}`);
    }

    advanceSeconds(SESSION_WINDOW_SECONDS + 1);
    checkAndCount(freshKey());

    const allowed = sendIp('192.0.2.0', MAX_REQUESTS_PER_IP);
    expect(allowed.every(Boolean)).toBe(true);
  });
});

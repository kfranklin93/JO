import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_REQUESTS_PER_IP,
  MAX_REQUESTS_PER_SESSION,
} from '@/lib/api/request-limit';
import { checkRateLimit } from '@/lib/auth/rate-limit';

/**
 * Route handler tests for POST /api/assistant, covering the request limit.
 *
 * The limiter itself is *not* mocked — the point of these tests is that the real
 * module is wired in at the right place in the handler, which a mock could not
 * show. What is mocked is the agent, so no model call and no API key is involved,
 * and so "was the model reached?" becomes directly observable.
 *
 * `@/config/env` is mocked with a mutable object because the real module parses
 * `process.env` once at import, which a test cannot satisfy for a paid provider.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

const runAssistantTurn = vi.fn();

vi.mock('@/lib/assistant/agent', () => ({ runAssistantTurn }));

const { POST } = await import('./route');

/** A reply shaped like the agent's, enough for the handler to serialise. */
const AGENT_REPLY = {
  reply: 'Happy to help — what area are you looking in?',
  toolCalls: [],
  mode: 'mock' as const,
};

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.CALENDLY_LINK = 'https://calendly.com/example/intro';

  // `clearAllMocks` would clear calls but leave a previously set resolved value
  // in place, so the implementation is reset and re-established explicitly.
  runAssistantTurn.mockReset();
  runAssistantTurn.mockResolvedValue(AGENT_REPLY);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

let ipCounter = 0;

/**
 * An address no other test has used.
 *
 * The limiter's store is module-scoped and survives between tests, exactly as it
 * does in a warm function instance. Rather than reach for a test-only reset, each
 * test gets its own client.
 */
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

let sessionCounter = 0;

/** A session identifier no other test has used. */
function freshSessionId(): string {
  sessionCounter += 1;
  return `assistant-test-session-${sessionCounter}`;
}

interface RequestOptions {
  ip?: string;
  sessionId?: string;
  message?: string;
  /** Body sent verbatim, for malformed-request cases. */
  raw?: string;
}

/** A well-formed request the handler would happily serve. */
function assistantRequest(options: RequestOptions = {}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.set('x-nf-client-connection-ip', options.ip ?? freshIp());

  return new NextRequest('https://gowithjoeyo.com/api/assistant', {
    method: 'POST',
    headers,
    body:
      options.raw ??
      JSON.stringify({
        sessionId: options.sessionId ?? freshSessionId(),
        message: options.message ?? 'Looking for a three-bed near the lake.',
      }),
  });
}

describe('POST /api/assistant — per-IP request limit', () => {
  /**
   * The verification the spec asks for, stated as a test.
   *
   * Every request in this loop is valid and every one of them succeeds. A
   * failure-counting limiter would let all of them through forever, because
   * nothing ever fails. This asserts the opposite: the allowance runs out.
   */
  it('limits a loop of valid, successful requests once the per-IP allowance is spent', async () => {
    const ip = freshIp();

    for (let sent = 0; sent < MAX_REQUESTS_PER_IP; sent += 1) {
      const response = await POST(
        assistantRequest({ ip, sessionId: freshSessionId() }),
      );
      expect(response.status).toBe(200);
    }

    const refused = await POST(
      assistantRequest({ ip, sessionId: freshSessionId() }),
    );

    expect(refused.status).toBe(429);
  });

  it('carries a Retry-After header on refusal', async () => {
    const ip = freshIp();
    for (let sent = 0; sent < MAX_REQUESTS_PER_IP; sent += 1) {
      await POST(assistantRequest({ ip, sessionId: freshSessionId() }));
    }

    const refused = await POST(
      assistantRequest({ ip, sessionId: freshSessionId() }),
    );
    const retryAfter = refused.headers.get('Retry-After');

    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('makes no model call for a refused request', async () => {
    const ip = freshIp();
    for (let sent = 0; sent < MAX_REQUESTS_PER_IP; sent += 1) {
      await POST(assistantRequest({ ip, sessionId: freshSessionId() }));
    }
    expect(runAssistantTurn).toHaveBeenCalledTimes(MAX_REQUESTS_PER_IP);

    await POST(assistantRequest({ ip, sessionId: freshSessionId() }));

    expect(runAssistantTurn).toHaveBeenCalledTimes(MAX_REQUESTS_PER_IP);
  });

  it('refuses before parsing the body, so a malformed request costs nothing either', async () => {
    const ip = freshIp();
    for (let sent = 0; sent < MAX_REQUESTS_PER_IP; sent += 1) {
      await POST(assistantRequest({ ip, sessionId: freshSessionId() }));
    }

    // Body parsing would answer this with 400. Reaching 429 instead is what
    // proves the limit is checked first.
    const refused = await POST(assistantRequest({ ip, raw: 'not json at all' }));

    expect(refused.status).toBe(429);
  });

  it('does not say which limit was hit', async () => {
    const ip = freshIp();
    for (let sent = 0; sent < MAX_REQUESTS_PER_IP; sent += 1) {
      await POST(assistantRequest({ ip, sessionId: freshSessionId() }));
    }

    const refused = await POST(assistantRequest({ ip }));

    expect(await refused.json()).toEqual({ error: 'Too many requests' });
  });

  it('leaves other clients unaffected', async () => {
    const noisy = freshIp();
    for (let sent = 0; sent < MAX_REQUESTS_PER_IP + 1; sent += 1) {
      await POST(assistantRequest({ ip: noisy, sessionId: freshSessionId() }));
    }

    const other = await POST(assistantRequest());

    expect(other.status).toBe(200);
  });

  it('does not lock the dashboard login limiter for the same address', async () => {
    // The whole reason the assistant limiter has its own keyspace: chat traffic
    // must never cost Joey his own login from the same machine.
    const ip = freshIp();
    for (let sent = 0; sent < MAX_REQUESTS_PER_IP + 1; sent += 1) {
      await POST(assistantRequest({ ip, sessionId: freshSessionId() }));
    }

    expect(checkRateLimit(ip)).toEqual({ allowed: true });
  });
});

describe('POST /api/assistant — per-session request limit', () => {
  it('limits one conversation spread across many addresses', async () => {
    // A fresh address every time, so the per-IP limit never fires and only the
    // session ceiling can be what refuses.
    const sessionId = freshSessionId();

    for (let sent = 0; sent < MAX_REQUESTS_PER_SESSION; sent += 1) {
      const response = await POST(assistantRequest({ sessionId }));
      expect(response.status).toBe(200);
    }

    const refused = await POST(assistantRequest({ sessionId }));

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('makes no model call once the session ceiling is reached', async () => {
    const sessionId = freshSessionId();
    for (let sent = 0; sent < MAX_REQUESTS_PER_SESSION; sent += 1) {
      await POST(assistantRequest({ sessionId }));
    }
    const callsBefore = runAssistantTurn.mock.calls.length;

    await POST(assistantRequest({ sessionId }));

    expect(runAssistantTurn).toHaveBeenCalledTimes(callsBefore);
  });

  it('leaves other conversations unaffected', async () => {
    const exhausted = freshSessionId();
    for (let sent = 0; sent < MAX_REQUESTS_PER_SESSION + 1; sent += 1) {
      await POST(assistantRequest({ sessionId: exhausted }));
    }

    const other = await POST(assistantRequest({ sessionId: freshSessionId() }));

    expect(other.status).toBe(200);
  });
});

describe('POST /api/assistant — permitted requests still work', () => {
  it('serves a valid request normally', async () => {
    const response = await POST(assistantRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: AGENT_REPLY.reply,
      mode: 'mock',
      bookingUrl: 'https://calendly.com/example/intro',
    });
  });

  it('still rejects a malformed body when the limit permits the request', async () => {
    const response = await POST(assistantRequest({ raw: '{' }));

    expect(response.status).toBe(400);
    expect(runAssistantTurn).not.toHaveBeenCalled();
  });

  it('still rejects a missing sessionId before the session limit is consulted', async () => {
    const response = await POST(
      assistantRequest({ raw: JSON.stringify({ message: 'hello' }) }),
    );

    expect(response.status).toBe(400);
    expect(runAssistantTurn).not.toHaveBeenCalled();
  });
});

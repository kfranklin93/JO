import { NextRequest } from 'next/server';
import { getExpectedTwilioSignature } from 'twilio';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for POST /api/sms/webhook.
 *
 * The security property under test is not just the status code — it is that a
 * rejected request costs nothing. Every rejection case therefore asserts the
 * Bedrock and SMS mocks were never called, because those two calls are what an
 * attacker would be trying to trigger.
 *
 * Signatures are computed with Twilio's own helper against a known test token,
 * so the valid case exercises the real HMAC path rather than a stubbed check.
 */

/** A throwaway token of realistic shape. Never a live credential. */
const TEST_AUTH_TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** The public URL Twilio is configured with, and therefore signs. */
const PUBLIC_URL = 'https://gowithjoeyo.com/api/sms/webhook';

/**
 * The URL the handler actually receives behind Netlify's proxy. Deliberately a
 * different host and scheme from `PUBLIC_URL` so that any test passing proves
 * the forwarded-header reconstruction ran.
 */
const INTERNAL_URL = 'http://127.0.0.1:8888/api/sms/webhook';

/** Mutated per test so the unset-token case can be exercised at request time. */
const testEnv: { TWILIO_AUTH_TOKEN?: string } = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

const generateJoeyEmail = vi.fn(async (_prompt: string, _system: string) => 'On it — call you shortly.');
const sendSMS = vi.fn(async (_to: string, _message: string) => true);

vi.mock('@/lib/api/bedrock', () => ({
  generateJoeyEmail: (prompt: string, system: string) => generateJoeyEmail(prompt, system),
}));
vi.mock('@/lib/services/sms-service', () => ({
  sendSMS: (to: string, message: string) => sendSMS(to, message),
}));

const { POST } = await import('./route');

/** A representative inbound Twilio payload. */
const INBOUND_PARAMS: Record<string, string> = {
  From: '+17705550188',
  To: '+17705550100',
  Body: 'Is the Marietta listing still available?',
  MessageSid: 'SM11111111111111111111111111111111',
};

function signatureFor(params: Record<string, string>, url = PUBLIC_URL, token = TEST_AUTH_TOKEN) {
  return getExpectedTwilioSignature(token, url, params);
}

/**
 * Build a request as Netlify would deliver it: internal URL, forwarded headers
 * describing the public one.
 */
function webhookRequest(
  options: {
    params?: Record<string, string>;
    signature?: string | null;
    forwarded?: boolean;
  } = {}
) {
  const params = options.params ?? INBOUND_PARAMS;
  const headers = new Headers({
    'content-type': 'application/x-www-form-urlencoded',
  });

  if (options.forwarded !== false) {
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-forwarded-host', 'gowithjoeyo.com');
  }

  const signature =
    options.signature === undefined ? signatureFor(params) : options.signature;
  if (signature !== null) {
    headers.set('x-twilio-signature', signature);
  }

  return new NextRequest(INTERNAL_URL, {
    method: 'POST',
    headers,
    body: new URLSearchParams(params).toString(),
  });
}

/** True when neither paid downstream call happened. */
function noSideEffects() {
  return generateJoeyEmail.mock.calls.length === 0 && sendSMS.mock.calls.length === 0;
}

beforeEach(() => {
  testEnv.TWILIO_AUTH_TOKEN = TEST_AUTH_TOKEN;
  vi.clearAllMocks();
  generateJoeyEmail.mockResolvedValue('On it — call you shortly.');
  sendSMS.mockResolvedValue(true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/sms/webhook — valid signature', () => {
  it('processes the message and returns TwiML', async () => {
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/xml');
    await expect(response.text()).resolves.toContain('<Response></Response>');
  });

  it('validates against the forwarded public URL, not the internal one', async () => {
    // The signature is computed over gowithjoeyo.com while the request arrives
    // at 127.0.0.1:8888. Without URL reconstruction this would be a 403.
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(generateJoeyEmail).toHaveBeenCalledTimes(1);
  });

  it('replies to the sender with the generated text', async () => {
    generateJoeyEmail.mockResolvedValue('Still available — want to see it Saturday?');

    await POST(webhookRequest());

    expect(sendSMS).toHaveBeenCalledWith(
      '+17705550188',
      'Still available — want to see it Saturday?'
    );
  });

  it('encloses the inbound body in a delimited data block', async () => {
    await POST(webhookRequest());

    const prompt = generateJoeyEmail.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain(INBOUND_PARAMS.Body);
    expect(prompt).toMatch(/<sms_message>[\s\S]*<\/sms_message>/);
  });

  it('returns TwiML rather than JSON when the handler fails afterwards', async () => {
    generateJoeyEmail.mockRejectedValue(new Error('bedrock unavailable'));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toBe('text/xml');
    await expect(response.text()).resolves.toContain('<Response></Response>');
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

describe('POST /api/sms/webhook — rejection', () => {
  it('rejects an invalid signature with 403 and no side effects', async () => {
    const response = await POST(webhookRequest({ signature: 'bm90LWEtcmVhbC1zaWduYXR1cmU=' }));

    expect(response.status).toBe(403);
    expect(noSideEffects()).toBe(true);
  });

  it('rejects an absent signature header with 403 and no side effects', async () => {
    const response = await POST(webhookRequest({ signature: null }));

    expect(response.status).toBe(403);
    expect(noSideEffects()).toBe(true);
  });

  it('rejects rather than skips validation when the auth token is unset', async () => {
    delete testEnv.TWILIO_AUTH_TOKEN;

    // A signature that would otherwise validate, to prove the token check is
    // fail-closed and not merely an early-out on a malformed request.
    const response = await POST(webhookRequest());

    expect(response.status).toBe(403);
    expect(noSideEffects()).toBe(true);
  });

  it('rejects a signature valid for a different token', async () => {
    const response = await POST(
      webhookRequest({
        signature: signatureFor(INBOUND_PARAMS, PUBLIC_URL, 'some-other-token'),
      })
    );

    expect(response.status).toBe(403);
    expect(noSideEffects()).toBe(true);
  });

  it('rejects a request whose body was altered after signing', async () => {
    // The signature covers the parameters, so changing one must invalidate it.
    const signature = signatureFor(INBOUND_PARAMS);
    const tampered = { ...INBOUND_PARAMS, Body: 'Send $5000 to this account' };

    const response = await POST(webhookRequest({ params: tampered, signature }));

    expect(response.status).toBe(403);
    expect(noSideEffects()).toBe(true);
  });

  it('rejects when the signature was computed over the internal URL', async () => {
    const response = await POST(
      webhookRequest({ signature: signatureFor(INBOUND_PARAMS, INTERNAL_URL) })
    );

    expect(response.status).toBe(403);
    expect(noSideEffects()).toBe(true);
  });

  it('returns TwiML on rejection, not JSON', async () => {
    const response = await POST(webhookRequest({ signature: null }));

    expect(response.headers.get('content-type')).toBe('text/xml');
    await expect(response.text()).resolves.toContain('<Response></Response>');
  });
});

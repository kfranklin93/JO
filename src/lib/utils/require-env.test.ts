import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the request-time configuration assertion.
 *
 * `@/config/env` is mocked with a mutable object so a variable can be removed
 * mid-test — the real module parses `process.env` once at import and cannot be
 * changed afterwards, which is exactly why the check has to run per request.
 */

const testEnv: Record<string, unknown> = {};

vi.mock('@/config/env', () => ({ env: testEnv }));

const { MissingEnvError, envErrorResponse, requireEnv } = await import('./require-env');

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.RESEND_API_KEY = 're_test_key';
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('requireEnv', () => {
  it('passes silently when every named variable is set', () => {
    expect(() => requireEnv('RESEND_API_KEY', 'DATABASE_URL')).not.toThrow();
  });

  it('throws MissingEnvError when a variable is absent', () => {
    delete testEnv.RESEND_API_KEY;

    expect(() => requireEnv('RESEND_API_KEY')).toThrow(MissingEnvError);
  });

  it('names the missing variable in the message', () => {
    delete testEnv.RESEND_API_KEY;

    expect(() => requireEnv('RESEND_API_KEY')).toThrow(/RESEND_API_KEY/);
  });

  it('treats an empty string as missing', () => {
    // Netlify stores a cleared variable as an empty string rather than removing
    // it, and the Zod schema accepts that.
    testEnv.RESEND_API_KEY = '';

    expect(() => requireEnv('RESEND_API_KEY')).toThrow(MissingEnvError);
  });

  it('treats a whitespace-only value as missing', () => {
    testEnv.RESEND_API_KEY = '   ';

    expect(() => requireEnv('RESEND_API_KEY')).toThrow(MissingEnvError);
  });

  it('reports every missing variable in one error', () => {
    delete testEnv.RESEND_API_KEY;
    delete testEnv.DATABASE_URL;

    try {
      requireEnv('DATABASE_URL', 'RESEND_API_KEY');
      expect.unreachable('requireEnv should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingEnvError);
      expect((error as InstanceType<typeof MissingEnvError>).variables).toEqual([
        'DATABASE_URL',
        'RESEND_API_KEY',
      ]);
    }
  });

  it('reports only the variables that are actually missing', () => {
    delete testEnv.DATABASE_URL;

    try {
      requireEnv('DATABASE_URL', 'RESEND_API_KEY');
      expect.unreachable('requireEnv should have thrown');
    } catch (error) {
      expect((error as InstanceType<typeof MissingEnvError>).variables).toEqual([
        'DATABASE_URL',
      ]);
    }
  });

  it('does not throw when asked about nothing', () => {
    expect(() => requireEnv()).not.toThrow();
  });
});

describe('envErrorResponse', () => {
  it('maps MissingEnvError to a 503', async () => {
    const response = envErrorResponse(new MissingEnvError(['RESEND_API_KEY']));

    expect(response?.status).toBe(503);
  });

  it('names the missing variable in the body', async () => {
    const response = envErrorResponse(new MissingEnvError(['RESEND_API_KEY']));
    const body = await response?.json();

    expect(body.missing).toEqual(['RESEND_API_KEY']);
    expect(body.message).toContain('RESEND_API_KEY');
  });

  it('returns null for an unrelated error, so the caller falls through to 500', () => {
    expect(envErrorResponse(new Error('connection terminated'))).toBeNull();
  });

  it('returns null for a non-error value', () => {
    expect(envErrorResponse('RESEND_API_KEY')).toBeNull();
    expect(envErrorResponse(undefined)).toBeNull();
  });
});

describe('MissingEnvError', () => {
  it('pluralises the message according to the number of variables', () => {
    expect(new MissingEnvError(['A']).message).toContain('variable:');
    expect(new MissingEnvError(['A', 'B']).message).toContain('variables:');
  });

  it('is an Error with a recognisable name', () => {
    const error = new MissingEnvError(['A']);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MissingEnvError');
  });
});

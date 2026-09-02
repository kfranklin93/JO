/**
 * Tests for the client-side lead submission helper.
 *
 * Verifies the helper correctly interprets the 201/422/500 contract from
 * `POST /api/leads` and returns the appropriate discriminated union result.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { submitLead } from './submit-lead';
import type { LeadSubmissionInput } from '@/lib/validation/lead';

const mockInput: LeadSubmissionInput = {
  name: 'Jane Doe',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '555-0123',
  intent: 'buy',
  timeline: 'short_term',
};

describe('submitLead', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns ok: true with leadId on 201 success', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ leadId: 'lead_123', success: true }),
    } as Response);

    const result = await submitLead(mockInput);

    expect(result).toEqual({ ok: true, leadId: 'lead_123' });
    expect(mockFetch).toHaveBeenCalledWith('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockInput),
    });
  });

  it('returns fieldErrors on 422 validation failure', async () => {
    const fieldErrors = {
      email: 'Enter a valid email address',
      intent: 'Select what you need help with',
    };

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Validation failed', fieldErrors }),
    } as Response);

    const result = await submitLead(mockInput);

    expect(result).toEqual({ ok: false, fieldErrors });
  });

  it('handles 422 with missing fieldErrors gracefully', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Validation failed' }),
    } as Response);

    const result = await submitLead(mockInput);

    expect(result).toEqual({ ok: false, fieldErrors: {} });
  });

  it('returns message on 500 server error', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Database connection failed' }),
    } as Response);

    const result = await submitLead(mockInput);

    expect(result).toEqual({ ok: false, message: 'Database connection failed' });
  });

  it('returns message on 400 bad request', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Malformed JSON' }),
    } as Response);

    const result = await submitLead(mockInput);

    expect(result).toEqual({ ok: false, message: 'Malformed JSON' });
  });

  it('handles unparseable error response body', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    } as unknown as Response);

    const result = await submitLead(mockInput);

    expect(result).toEqual({ ok: false, message: 'An error occurred' });
  });

  it('returns network error message on fetch failure', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await submitLead(mockInput);

    expect(result).toEqual({
      ok: false,
      message: 'Network error. Please check your connection and try again.',
    });
  });

  it('returns network error message on CORS failure', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await submitLead(mockInput);

    expect(result).toEqual({
      ok: false,
      message: 'Network error. Please check your connection and try again.',
    });
  });
});

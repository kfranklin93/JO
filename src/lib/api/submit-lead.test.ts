import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fromLeadCaptureInput,
  fromServicesInquiry,
  submitLead,
  type LeadRequestPayload,
} from './submit-lead';

const validPayload: LeadRequestPayload = {
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  intent: 'buy',
};

/**
 * Stubs global fetch with a JSON response.
 *
 * Parameters are declared so `mock.calls[n][1]` is typed; a bare `vi.fn(async
 * () => ...)` infers an empty argument tuple and indexing it fails to compile.
 */
function mockJsonResponse(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockJsonResponse(201, { leadId: 'lead-1' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('submitLead — transport', () => {
  it('posts JSON to the leads endpoint', async () => {
    const fetchMock = mockJsonResponse(201, { leadId: 'lead-1' });
    vi.stubGlobal('fetch', fetchMock);

    await submitLead(validPayload);

    expect(fetchMock).toHaveBeenCalledWith('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
  });

  it('omits undefined fields from the request body', async () => {
    const fetchMock = mockJsonResponse(201, { leadId: 'lead-1' });
    vi.stubGlobal('fetch', fetchMock);

    await submitLead({ ...validPayload, phone: undefined });

    const body = fetchMock.mock.calls[0]?.[1] as { body: string } | undefined;
    expect(body?.body).not.toContain('phone');
  });

  it('returns the lead id on success', async () => {
    await expect(submitLead(validPayload)).resolves.toEqual({
      ok: true,
      leadId: 'lead-1',
    });
  });
});

describe('submitLead — validation failures', () => {
  it('surfaces field errors from a 422', async () => {
    vi.stubGlobal(
      'fetch',
      mockJsonResponse(422, {
        error: 'Validation failed',
        fieldErrors: { email: 'Enter a valid email address' },
      })
    );

    await expect(submitLead(validPayload)).resolves.toEqual({
      ok: false,
      kind: 'validation',
      fieldErrors: { email: 'Enter a valid email address' },
    });
  });

  it('falls back to a general error when a 422 carries no usable field errors', async () => {
    vi.stubGlobal('fetch', mockJsonResponse(422, { error: 'Validation failed' }));

    const result = await submitLead(validPayload);

    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });

  it('ignores non-string field error values', async () => {
    vi.stubGlobal(
      'fetch',
      mockJsonResponse(422, { fieldErrors: { email: 'bad', phone: { nested: 1 } } })
    );

    const result = await submitLead(validPayload);

    expect(result).toEqual({
      ok: false,
      kind: 'validation',
      fieldErrors: { email: 'bad' },
    });
  });
});

describe('submitLead — general failures', () => {
  it('reports a network failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const result = await submitLead(validPayload);

    expect(result).toMatchObject({ ok: false, kind: 'error' });
    if (!result.ok && result.kind === 'error') {
      expect(result.message).toContain('connection');
    }
  });

  it('uses the server error message on a 500', async () => {
    vi.stubGlobal('fetch', mockJsonResponse(500, { error: 'Failed to submit lead' }));

    const result = await submitLead(validPayload);

    expect(result).toEqual({
      ok: false,
      kind: 'error',
      message: 'Failed to submit lead',
    });
  });

  it('survives a non-JSON error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    );

    const result = await submitLead(validPayload);

    expect(result).toMatchObject({ ok: false, kind: 'error' });
  });

  it('treats a 2xx without a lead id as a failure rather than a false success', async () => {
    vi.stubGlobal('fetch', mockJsonResponse(201, { success: true }));

    const result = await submitLead(validPayload);

    expect(result.ok).toBe(false);
  });
});

describe('fromServicesInquiry', () => {
  const fields = {
    name: 'Marcus Bell',
    email: 'marcus@example.com',
    phone: '(770) 555-0188',
    timeline: '3 months',
    budget: '$450k',
    message: 'Looking in East Cobb.',
  };

  it('maps buying to the canonical buy intent', () => {
    expect(fromServicesInquiry('buying', fields).intent).toBe('buy');
  });

  it('maps selling to the canonical sell intent', () => {
    expect(fromServicesInquiry('selling', fields).intent).toBe('sell');
  });

  it('maps general to the canonical general intent', () => {
    expect(fromServicesInquiry('general', fields).intent).toBe('general');
  });

  it('records "both" as a buyer and preserves the detail in the notes', () => {
    // There is no canonical "both" intent, so the information has to survive
    // somewhere rather than being silently dropped.
    const payload = fromServicesInquiry('both', fields);

    expect(payload.intent).toBe('buy');
    expect(payload.additionalNotes).toContain('both buying and selling');
    expect(payload.additionalNotes).toContain('Looking in East Cobb.');
  });

  it('does not leave a dangling separator when "both" has no message', () => {
    const payload = fromServicesInquiry('both', { ...fields, message: '' });

    expect(payload.additionalNotes).toBe(
      'Interested in both buying and selling.'
    );
  });

  it('carries the contact and preference fields through', () => {
    expect(fromServicesInquiry('buying', fields)).toMatchObject({
      name: 'Marcus Bell',
      email: 'marcus@example.com',
      phone: '(770) 555-0188',
      timeline: '3 months',
      budget: '$450k',
    });
  });

  it('maps the message field onto additionalNotes', () => {
    // The modal calls this field `message`; the API calls it `additionalNotes`.
    expect(fromServicesInquiry('buying', fields).additionalNotes).toBe(
      'Looking in East Cobb.'
    );
  });
});

describe('fromLeadCaptureInput', () => {
  it('passes the separate name parts through rather than concatenating', () => {
    const payload = fromLeadCaptureInput({
      firstName: 'Dana',
      lastName: 'Whitfield',
      email: 'dana@example.com',
      intent: 'buy',
    });

    expect(payload.firstName).toBe('Dana');
    expect(payload.lastName).toBe('Whitfield');
    expect(payload.name).toBeUndefined();
  });

  it('flattens the nested propertyRequest fields', () => {
    const payload = fromLeadCaptureInput({
      firstName: 'Dana',
      email: 'dana@example.com',
      intent: 'buy',
      propertyRequest: {
        propertyType: 'single_family',
        preferredLocations: 'East Cobb',
        additionalNotes: 'Needs a yard.',
        bedrooms: '4',
      },
    });

    expect(payload).toMatchObject({
      propertyType: 'single_family',
      location: 'East Cobb',
      additionalNotes: 'Needs a yard.',
      bedrooms: '4',
    });
  });

  it('combines the two price inputs into a budget range', () => {
    const payload = fromLeadCaptureInput({
      email: 'dana@example.com',
      intent: 'buy',
      propertyRequest: { priceRangeMin: '$200,000', priceRangeMax: '$500,000' },
    });

    expect(payload.budget).toBe('$200,000 - $500,000');
  });

  it('handles a minimum-only budget', () => {
    const payload = fromLeadCaptureInput({
      email: 'dana@example.com',
      intent: 'buy',
      propertyRequest: { priceRangeMin: '$200,000' },
    });

    expect(payload.budget).toBe('$200,000+');
  });

  it('handles a maximum-only budget', () => {
    const payload = fromLeadCaptureInput({
      email: 'dana@example.com',
      intent: 'buy',
      propertyRequest: { priceRangeMax: '$500,000' },
    });

    expect(payload.budget).toBe('Up to $500,000');
  });

  it('produces a budget within the 50 character column limit', () => {
    const payload = fromLeadCaptureInput({
      email: 'dana@example.com',
      intent: 'buy',
      propertyRequest: { priceRangeMin: '$200,000', priceRangeMax: '$500,000' },
    });

    expect((payload.budget ?? '').length).toBeLessThanOrEqual(50);
  });

  it('accepts array values for the fields declared as arrays', () => {
    // PropertyRequest types these as string[], even though the form binds them
    // to single text inputs.
    const payload = fromLeadCaptureInput({
      email: 'dana@example.com',
      intent: 'buy',
      propertyRequest: {
        preferredLocations: ['Marietta', 'Kennesaw'],
        propertyType: ['condo'],
      },
    });

    expect(payload.location).toEqual(['Marietta', 'Kennesaw']);
    expect(payload.propertyType).toEqual(['condo']);
  });

  it('treats blank strings as absent', () => {
    const payload = fromLeadCaptureInput({
      firstName: 'Dana',
      lastName: '   ',
      email: 'dana@example.com',
      intent: 'buy',
      phone: '',
      propertyRequest: { additionalNotes: '' },
    });

    expect(payload.lastName).toBeUndefined();
    expect(payload.phone).toBeUndefined();
    expect(payload.additionalNotes).toBeUndefined();
  });

  it('coerces numeric counts to strings for the server to parse', () => {
    const payload = fromLeadCaptureInput({
      email: 'dana@example.com',
      intent: 'buy',
      propertyRequest: { bedrooms: 4, bathrooms: 2.5 },
    });

    expect(payload.bedrooms).toBe('4');
    expect(payload.bathrooms).toBe('2.5');
  });

  it('tolerates a missing propertyRequest entirely', () => {
    expect(() =>
      fromLeadCaptureInput({ email: 'dana@example.com', intent: 'buy' })
    ).not.toThrow();
  });
});

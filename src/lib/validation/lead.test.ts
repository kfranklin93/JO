import { describe, expect, it } from 'vitest';

import {
  LEAD_FIELD_LIMITS,
  LEAD_INTENTS,
  formatFieldErrors,
  leadSubmissionSchema,
} from './lead';

/** Minimal payload that must always pass. */
const validPayload = {
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  intent: 'buy',
} as const;

/** Parses and returns field errors, failing the test if parsing succeeded. */
function expectRejection(payload: unknown): Record<string, string> {
  const result = leadSubmissionSchema.safeParse(payload);
  if (result.success) {
    throw new Error(
      `Expected rejection but parsing succeeded: ${JSON.stringify(result.data)}`
    );
  }
  return formatFieldErrors(result.error);
}

/** Parses and returns the normalised output, failing the test on rejection. */
function expectAcceptance(payload: unknown) {
  const result = leadSubmissionSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Expected acceptance but parsing failed: ${JSON.stringify(
        formatFieldErrors(result.error)
      )}`
    );
  }
  return result.data;
}

describe('leadSubmissionSchema — acceptance', () => {
  it('accepts a minimal valid payload', () => {
    const data = expectAcceptance(validPayload);

    expect(data.email).toBe('dana@example.com');
    expect(data.intent).toBe('buy');
    expect(data.fullName).toBe('Dana Whitfield');
  });

  it('accepts a realistic full payload', () => {
    const data = expectAcceptance({
      name: 'Marcus Bell',
      email: 'Marcus.Bell@Example.COM',
      phone: '(770) 555-0188',
      intent: 'sell',
      timeline: 'short_term',
      budget: '$450,000 - $600,000',
      location: 'East Cobb',
      propertyType: 'single_family',
      bedrooms: '4',
      bathrooms: '2.5',
      additionalNotes: 'Relocating for work in the spring.',
    });

    expect(data).toMatchObject({
      fullName: 'Marcus Bell',
      firstName: 'Marcus',
      lastName: 'Bell',
      email: 'marcus.bell@example.com',
      phone: '(770) 555-0188',
      intent: 'sell',
      timeline: 'short_term',
      budget: '$450,000 - $600,000',
      location: 'East Cobb',
      propertyType: 'single_family',
      bedrooms: 4,
      bathrooms: 2.5,
      additionalNotes: 'Relocating for work in the spring.',
    });
  });

  it.each(LEAD_INTENTS)('accepts the canonical intent %s', (intent) => {
    expect(expectAcceptance({ ...validPayload, intent }).intent).toBe(intent);
  });
});

describe('leadSubmissionSchema — email', () => {
  it('rejects a malformed email', () => {
    expect(expectRejection({ ...validPayload, email: 'not-an-email' })).toEqual({
      email: 'Enter a valid email address',
    });
  });

  it('rejects an email missing a domain', () => {
    expect(expectRejection({ ...validPayload, email: 'dana@' })).toHaveProperty(
      'email'
    );
  });

  it('rejects a missing email', () => {
    expect(expectRejection({ name: 'Dana', intent: 'buy' })).toHaveProperty(
      'email'
    );
  });

  it('rejects a blank email', () => {
    expect(expectRejection({ ...validPayload, email: '   ' })).toHaveProperty(
      'email'
    );
  });

  it('lowercases and trims a valid email', () => {
    expect(
      expectAcceptance({ ...validPayload, email: '  DANA@Example.com  ' }).email
    ).toBe('dana@example.com');
  });
});

describe('leadSubmissionSchema — intent', () => {
  it('rejects a missing intent', () => {
    expect(
      expectRejection({ name: 'Dana', email: 'dana@example.com' })
    ).toHaveProperty('intent');
  });

  it('rejects an intent outside the canonical set', () => {
    expect(
      expectRejection({ ...validPayload, intent: 'refinance' })
    ).toHaveProperty('intent');
  });

  it('rejects the legacy form vocabulary rather than silently accepting it', () => {
    // ServicesInquiryForm emits 'buying' / 'selling' / 'both'. Those must be
    // translated by the form, not absorbed here, or the canonical set would
    // drift back into three vocabularies.
    for (const legacy of ['buying', 'selling', 'both']) {
      expect(expectRejection({ ...validPayload, intent: legacy })).toHaveProperty(
        'intent'
      );
    }
  });
});

describe('leadSubmissionSchema — name', () => {
  it('rejects a payload with no name at all', () => {
    expect(
      expectRejection({ email: 'dana@example.com', intent: 'buy' })
    ).toEqual({ name: 'Name is required' });
  });

  it('rejects a whitespace-only name', () => {
    expect(expectRejection({ ...validPayload, name: '   ' })).toEqual({
      name: 'Name is required',
    });
  });

  it('accepts separate first and last names with no full name', () => {
    const data = expectAcceptance({
      firstName: 'Dana',
      lastName: 'Whitfield',
      email: 'dana@example.com',
      intent: 'buy',
    });

    expect(data.fullName).toBe('Dana Whitfield');
    expect(data.firstName).toBe('Dana');
    expect(data.lastName).toBe('Whitfield');
  });

  it('accepts a first name alone', () => {
    const data = expectAcceptance({
      firstName: 'Dana',
      email: 'dana@example.com',
      intent: 'buy',
    });

    expect(data.fullName).toBe('Dana');
    expect(data.firstName).toBe('Dana');
    expect(data.lastName).toBeUndefined();
  });

  it('derives first and last names from a single full name', () => {
    const data = expectAcceptance({ ...validPayload, name: 'Dana Whitfield' });

    expect(data.firstName).toBe('Dana');
    expect(data.lastName).toBe('Whitfield');
  });

  it('keeps multi-part surnames intact when splitting a full name', () => {
    const data = expectAcceptance({
      ...validPayload,
      name: 'Mary Anne van der Berg',
    });

    expect(data.firstName).toBe('Mary');
    expect(data.lastName).toBe('Anne van der Berg');
    expect(data.fullName).toBe('Mary Anne van der Berg');
  });

  it('handles a mononym without inventing a last name', () => {
    const data = expectAcceptance({ ...validPayload, name: 'Prince' });

    expect(data.firstName).toBe('Prince');
    expect(data.lastName).toBeUndefined();
    expect(data.fullName).toBe('Prince');
  });

  it('prefers explicit first and last names over splitting the full name', () => {
    const data = expectAcceptance({
      name: 'Dana Whitfield',
      firstName: 'Dana',
      lastName: 'Whitfield-Okafor',
      email: 'dana@example.com',
      intent: 'buy',
    });

    expect(data.lastName).toBe('Whitfield-Okafor');
  });
});

describe('leadSubmissionSchema — length boundaries', () => {
  const atLimit = (length: number) => 'a'.repeat(length);

  it('accepts an email at the column limit', () => {
    // 255 total: local part padded so the whole address is exactly at the cap.
    const domain = '@example.com';
    const email = `${atLimit(LEAD_FIELD_LIMITS.email - domain.length)}${domain}`;

    expect(email).toHaveLength(LEAD_FIELD_LIMITS.email);
    expect(expectAcceptance({ ...validPayload, email }).email).toBe(email);
  });

  it('rejects an email one character over the column limit', () => {
    const domain = '@example.com';
    const email = `${atLimit(LEAD_FIELD_LIMITS.email - domain.length + 1)}${domain}`;

    expect(expectRejection({ ...validPayload, email })).toHaveProperty('email');
  });

  it.each([
    ['phone', LEAD_FIELD_LIMITS.phone],
    ['timeline', LEAD_FIELD_LIMITS.timeline],
    ['budget', LEAD_FIELD_LIMITS.budget],
    ['location', LEAD_FIELD_LIMITS.location],
    ['propertyType', LEAD_FIELD_LIMITS.propertyType],
    ['additionalNotes', LEAD_FIELD_LIMITS.additionalNotes],
  ])('accepts %s at its limit and rejects one over', (field, limit) => {
    expect(
      expectAcceptance({ ...validPayload, [field]: atLimit(limit) })
    ).toHaveProperty(field, atLimit(limit));

    expect(
      expectRejection({ ...validPayload, [field]: atLimit(limit + 1) })
    ).toHaveProperty(field);
  });

  it('accepts a name at the full-name limit and rejects one over', () => {
    expect(
      expectAcceptance({
        ...validPayload,
        name: atLimit(LEAD_FIELD_LIMITS.fullName),
      }).fullName
    ).toHaveLength(LEAD_FIELD_LIMITS.fullName);

    expect(
      expectRejection({
        ...validPayload,
        name: atLimit(LEAD_FIELD_LIMITS.fullName + 1),
      })
    ).toHaveProperty('name');
  });

  it('rejects an oversized phone before Postgres would truncate it', () => {
    // The column is varchar(20). Without this the insert raises 22001 and
    // surfaces as an opaque 500 with no indication of which field was at fault.
    const errors = expectRejection({
      ...validPayload,
      phone: '+1 (770) 555-0188 extension 4471',
    });

    expect(errors).toHaveProperty('phone');
  });
});

describe('leadSubmissionSchema — optional field normalisation', () => {
  it('treats blank optional strings as absent', () => {
    const data = expectAcceptance({
      ...validPayload,
      phone: '',
      timeline: '   ',
      budget: '',
      additionalNotes: '',
    });

    expect(data.phone).toBeUndefined();
    expect(data.timeline).toBeUndefined();
    expect(data.budget).toBeUndefined();
    expect(data.additionalNotes).toBeUndefined();
  });

  it('omits absent optional keys entirely rather than setting undefined', () => {
    // exactOptionalPropertyTypes is enabled, so downstream code distinguishes
    // an absent key from an explicit undefined. The transform must omit.
    const data = expectAcceptance(validPayload);

    expect(Object.keys(data)).not.toContain('phone');
    expect(Object.keys(data)).not.toContain('additionalNotes');
  });

  it('trims surrounding whitespace from optional text', () => {
    expect(
      expectAcceptance({ ...validPayload, location: '  East Cobb  ' }).location
    ).toBe('East Cobb');
  });

  it('joins a list of locations into a single value', () => {
    // PropertyRequest declares preferredLocations as string[], while the form
    // binds it to a single text input. Both shapes have to work.
    expect(
      expectAcceptance({
        ...validPayload,
        location: ['Marietta', 'Kennesaw', 'East Cobb'],
      }).location
    ).toBe('Marietta, Kennesaw, East Cobb');
  });

  it('drops blank entries when joining a list', () => {
    expect(
      expectAcceptance({ ...validPayload, location: ['Marietta', '', '  '] })
        .location
    ).toBe('Marietta');
  });

  it('treats an empty list as absent', () => {
    expect(
      expectAcceptance({ ...validPayload, location: [] }).location
    ).toBeUndefined();
  });

  it('joins a list of property types', () => {
    expect(
      expectAcceptance({
        ...validPayload,
        propertyType: ['single_family', 'townhouse'],
      }).propertyType
    ).toBe('single_family, townhouse');
  });

  it('rejects a joined list that exceeds the column limit', () => {
    expect(
      expectRejection({
        ...validPayload,
        location: ['a'.repeat(60), 'b'.repeat(60)],
      })
    ).toHaveProperty('location');
  });
});

describe('leadSubmissionSchema — numeric coercion', () => {
  it('coerces numeric strings from form inputs', () => {
    const data = expectAcceptance({
      ...validPayload,
      bedrooms: '3',
      bathrooms: '1.5',
    });

    expect(data.bedrooms).toBe(3);
    expect(data.bathrooms).toBe(1.5);
  });

  it('rejects a non-numeric count', () => {
    expect(
      expectRejection({ ...validPayload, bedrooms: 'four' })
    ).toHaveProperty('bedrooms');
  });

  it('rejects a negative count', () => {
    expect(expectRejection({ ...validPayload, bedrooms: -1 })).toHaveProperty(
      'bedrooms'
    );
  });

  it('rejects an implausibly large count', () => {
    expect(
      expectRejection({ ...validPayload, bedrooms: 7705550188 })
    ).toHaveProperty('bedrooms');
  });

  it('treats a blank count as absent', () => {
    expect(
      expectAcceptance({ ...validPayload, bedrooms: '' }).bedrooms
    ).toBeUndefined();
  });
});

describe('formatFieldErrors', () => {
  it('reports one message per failing field', () => {
    const errors = expectRejection({
      email: 'nope',
      intent: 'refinance',
    });

    expect(Object.keys(errors).sort()).toEqual(['email', 'intent', 'name']);
  });

  it('reports every problem in a single pass', () => {
    // Regression guard. The name rule was originally a cross-field
    // `superRefine`, which Zod skips when the base object already has errors —
    // so a submission with a bad email and no name reported only the email, and
    // the visitor discovered the missing name on a second submit. The rule is
    // now a plain required field fed by a preprocess step, so all three surface
    // together.
    const errors = expectRejection({ email: 'nope', intent: 'refinance' });

    expect(errors.name).toBe('Name is required');
    expect(errors.email).toBeDefined();
    expect(errors.intent).toBeDefined();
  });

  it('keeps only the first message for a field with multiple failures', () => {
    const errors = expectRejection({ ...validPayload, email: 'x'.repeat(300) });

    expect(typeof errors.email).toBe('string');
    expect(errors.email).not.toContain('\n');
  });

  it('collects object-level issues under _form rather than dropping them', () => {
    const withPathlessIssue = leadSubmissionSchema.safeParse('not-an-object');

    expect(withPathlessIssue.success).toBe(false);
    if (!withPathlessIssue.success) {
      expect(formatFieldErrors(withPathlessIssue.error)).toHaveProperty('_form');
    }
  });
});

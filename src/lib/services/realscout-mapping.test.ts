import { describe, expect, it, vi } from 'vitest';

/**
 * The pure translation between a RealScout contact and a lead.
 *
 * The sync's behaviour is covered in realscout-sync.test.ts; this file pins the
 * rules that are easiest to break by accident — the length caps that stop an
 * external field from rejecting a whole contact, and the URL vetting that stops
 * an external field from becoming a live link to somewhere else.
 */

vi.mock('@/config/env', () => ({ env: {} }));

const {
  contactToLeadInput,
  realScoutIntent,
  safeRealScoutUrl,
  syncFormData,
  syncProvenanceNote,
} = await import('./realscout-mapping');

const AT = new Date('2026-06-10T12:00:00.000Z');

/** A minimal contact; only `email` is required by RealScout on create. */
const contact = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'VXNlci0x', email: 'nora@example.com', ...overrides }) as never;

describe('realScoutIntent', () => {
  it('translates only the two unambiguous designations', () => {
    expect(realScoutIntent('BUYER')).toBe('buy');
    expect(realScoutIntent('SELLER')).toBe('sell');
    expect(realScoutIntent('buyer')).toBe('buy');
  });

  it('falls back to general rather than guessing', () => {
    // A combined designation, a value RealScout adds later, or none at all. A
    // wrong intent on a seller lead is worse than an unspecified one.
    expect(realScoutIntent('BUYER_SELLER')).toBe('general');
    expect(realScoutIntent('RENTER')).toBe('general');
    expect(realScoutIntent(null)).toBe('general');
    expect(realScoutIntent(undefined)).toBe('general');
    expect(realScoutIntent(42)).toBe('general');
  });
});

describe('contactToLeadInput', () => {
  it('rejects a contact with no usable address', () => {
    expect(contactToLeadInput(contact({ email: null }))).toEqual({
      ok: false,
      reason: 'no_email',
    });
    expect(contactToLeadInput(contact({ email: '   ' }))).toEqual({
      ok: false,
      reason: 'no_email',
    });
  });

  it('rejects an address longer than the column, naming why', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(contactToLeadInput(contact({ email: long }))).toEqual({
      ok: false,
      reason: 'email_too_long',
    });
  });

  it('truncates an over-long name rather than losing the contact', () => {
    const result = contactToLeadInput(
      contact({ first_name: 'B'.repeat(200), last_name: 'C'.repeat(200) }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a mapping');
    expect(String(result.input.name).length).toBeLessThanOrEqual(200);
    expect(String(result.input.firstName).length).toBeLessThanOrEqual(100);
  });

  it('drops an over-long phone instead of truncating it into a wrong number', () => {
    const result = contactToLeadInput(
      contact({ primary_mobile_phone: '+1 (770) 555-0100 ext 123456789' }),
    );

    if (!result.ok) throw new Error('expected a mapping');
    expect(result.input.phone).toBeUndefined();
  });

  it('keeps a phone that fits', () => {
    const result = contactToLeadInput(contact({ primary_mobile_phone: '770-555-0100' }));

    if (!result.ok) throw new Error('expected a mapping');
    expect(result.input.phone).toBe('770-555-0100');
  });

  it('omits an absent optional field rather than sending undefined', () => {
    // exactOptionalPropertyTypes is on, and `leadSubmissionSchema` treats an
    // absent key and an explicit undefined differently.
    const result = contactToLeadInput(contact());

    if (!result.ok) throw new Error('expected a mapping');
    expect('phone' in result.input).toBe(false);
    expect('lastName' in result.input).toBe(false);
  });
});

describe('provenance', () => {
  it('records that no sequence was scheduled and no consent was taken', () => {
    const note = syncProvenanceNote(contact({ lead_source: 'Home Value Widget' }), AT);

    expect(note).toContain('synced from RealScout contact VXNlci0x');
    expect(note).toContain('Home Value Widget');
    expect(note).toContain('no email consent');
  });

  it('says so in the row when RealScout cannot email the contact', () => {
    const note = syncProvenanceNote(contact({ emailable: false }), AT);
    expect(note).toContain('RealScout cannot email this contact');
  });

  it('carries the contact id the next run keys on', () => {
    expect(syncFormData(contact(), AT)).toMatchObject({
      realscoutContactId: 'VXNlci0x',
      followUpSequence: 'not scheduled — synced from RealScout, no email consent',
    });
  });

  it('distinguishes "RealScout says not emailable" from "RealScout did not say"', () => {
    expect(syncFormData(contact({ emailable: false }), AT).realscoutEmailable).toBe(false);
    expect(syncFormData(contact(), AT).realscoutEmailable).toBeNull();
  });
});

describe('safeRealScoutUrl', () => {
  it('accepts an https RealScout URL', () => {
    expect(safeRealScoutUrl('https://www.realscout.com/agent/contacts/VXNlci0x')).toBe(
      'https://www.realscout.com/agent/contacts/VXNlci0x',
    );
    expect(safeRealScoutUrl('https://joeyo.realscout.com/homesearch/listings/x')).toBe(
      'https://joeyo.realscout.com/homesearch/listings/x',
    );
  });

  it('refuses a javascript: URL, which HTML escaping would not stop', () => {
    // This is the hazard: the value is written into an href, and escaping the
    // string leaves `javascript:` intact and still clickable.
    expect(safeRealScoutUrl('javascript:alert(1)')).toBeNull();
    expect(safeRealScoutUrl('JavaScript:alert(1)')).toBeNull();
    expect(safeRealScoutUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('refuses http and any host that is not RealScout', () => {
    expect(safeRealScoutUrl('http://www.realscout.com/agent')).toBeNull();
    expect(safeRealScoutUrl('https://realscout.com.evil.test/agent')).toBeNull();
    expect(safeRealScoutUrl('https://evil.test/agent')).toBeNull();
  });

  it('refuses anything that is not a URL at all', () => {
    expect(safeRealScoutUrl('')).toBeNull();
    expect(safeRealScoutUrl('   ')).toBeNull();
    expect(safeRealScoutUrl(null)).toBeNull();
    expect(safeRealScoutUrl(42)).toBeNull();
    expect(safeRealScoutUrl('/agent/contacts/1')).toBeNull();
  });
});

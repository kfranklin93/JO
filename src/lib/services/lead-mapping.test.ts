import { describe, expect, it } from 'vitest';
import { leadStatusEnum } from '@/lib/db/schema';
import { LEAD_INTENTS } from '@/lib/validation/lead';
import { makeDbLead } from '@/lib/db/__fixtures__/fake-follow-up-db';
import {
  toLeadIntent,
  toSchedulerLead,
  toSchedulerStatus,
} from '@/lib/services/lead-mapping';

/**
 * Tests for the database-row to scheduler-lead mapping.
 *
 * The cron route used to bridge these two shapes with type assertions, which
 * silence the compiler without changing the data. Two of them were false: it
 * asserted `'general'` into an intent union that did not contain it, and squeezed
 * a ten-value database status enum into a six-value TypeScript union.
 *
 * These tests are written against the vocabularies themselves rather than a
 * hand-copied list, so adding a database status without deciding how it maps
 * fails here instead of surfacing later as a status nothing downstream handles.
 */

/** The scheduler's status union, spelled out so a drift is a test failure. */
const SCHEDULER_STATUSES = [
  'new',
  'contacted',
  'engaged',
  'qualified',
  'closed',
  'inactive',
] as const;

describe('toSchedulerStatus', () => {
  it('maps every database lead status to a status the scheduler knows', () => {
    for (const status of leadStatusEnum.enumValues) {
      expect(SCHEDULER_STATUSES).toContain(toSchedulerStatus(status));
    }
  });

  it('passes through the statuses the two vocabularies share', () => {
    expect(toSchedulerStatus('new')).toBe('new');
    expect(toSchedulerStatus('contacted')).toBe('contacted');
    expect(toSchedulerStatus('qualified')).toBe('qualified');
    expect(toSchedulerStatus('closed')).toBe('closed');
  });

  it('collapses pipeline states the scheduler does not model', () => {
    // The database tracks pipeline position; the scheduler only cares about
    // engagement level, which is precisely why this cannot be a cast.
    expect(toSchedulerStatus('appointment_set')).toBe('engaged');
    expect(toSchedulerStatus('showing_scheduled')).toBe('engaged');
    expect(toSchedulerStatus('offer_made')).toBe('qualified');
    expect(toSchedulerStatus('under_contract')).toBe('qualified');
    expect(toSchedulerStatus('lost')).toBe('inactive');
    expect(toSchedulerStatus('nurture')).toBe('inactive');
  });

  it('falls back to new for an unrecognised or absent status', () => {
    // Least presumptuous: keeps the lead in the sequence rather than silently
    // dropping someone because a value arrived that predates this mapping.
    expect(toSchedulerStatus('reactivated')).toBe('new');
    expect(toSchedulerStatus(null)).toBe('new');
    expect(toSchedulerStatus(undefined)).toBe('new');
    expect(toSchedulerStatus('   ')).toBe('new');
  });
});

describe('toLeadIntent', () => {
  it('always returns a canonical intent', () => {
    const inputs = ['buy', 'BUYING', 'both', '', null, undefined, 'refinance', '  sell '];

    for (const input of inputs) {
      expect(LEAD_INTENTS).toContain(toLeadIntent(input));
    }
  });

  it('passes canonical values through unchanged', () => {
    for (const intent of LEAD_INTENTS) {
      expect(toLeadIntent(intent)).toBe(intent);
    }
  });

  it('keeps general, which is a real option the old cast lied about', () => {
    // `'general'` has always been offered by the form. The route asserted it into
    // a union that did not list it, so the value survived by accident.
    expect(toLeadIntent('general')).toBe('general');
  });

  it('normalises the legacy spellings still sitting in older rows', () => {
    expect(toLeadIntent('buying')).toBe('buy');
    expect(toLeadIntent('selling')).toBe('sell');
    expect(toLeadIntent('investing')).toBe('invest');
    expect(toLeadIntent('investment')).toBe('invest');
    // The old UI's single "both" option: someone selling in order to buy is
    // running a purchase, and there is no combined template.
    expect(toLeadIntent('both')).toBe('buy');
  });

  it('ignores case and surrounding whitespace', () => {
    // `property_interest` is free-text varchar, so it holds whatever was sent.
    expect(toLeadIntent('  Selling  ')).toBe('sell');
    expect(toLeadIntent('BUY')).toBe('buy');
  });

  it('defaults to general for anything unrecognised or empty', () => {
    expect(toLeadIntent('refinance')).toBe('general');
    expect(toLeadIntent('')).toBe('general');
    expect(toLeadIntent('   ')).toBe('general');
    expect(toLeadIntent(null)).toBe('general');
    expect(toLeadIntent(undefined)).toBe('general');
  });
});

describe('toSchedulerLead', () => {
  it('carries the identifying fields across', () => {
    const row = makeDbLead({
      email: 'dana@gowithjoeyo-test.invalid',
      fullName: 'Dana Whitfield',
      propertyInterest: 'buying',
      status: 'appointment_set',
    });

    expect(toSchedulerLead(row)).toMatchObject({
      id: row.id,
      name: 'Dana Whitfield',
      email: 'dana@gowithjoeyo-test.invalid',
      intent: 'buy',
      status: 'engaged',
      createdAt: row.createdAt,
    });
  });

  it('prefers the full name, then the name parts', () => {
    expect(
      toSchedulerLead(
        makeDbLead({ fullName: 'Dana Whitfield', firstName: 'Dana', lastName: 'W' })
      ).name
    ).toBe('Dana Whitfield');

    expect(
      toSchedulerLead(makeDbLead({ firstName: 'Marcus', lastName: 'Bell' })).name
    ).toBe('Marcus Bell');

    expect(toSchedulerLead(makeDbLead({ firstName: 'Prince' })).name).toBe('Prince');
  });

  it('yields no placeholder name when the row has none', () => {
    const lead = toSchedulerLead(makeDbLead());

    // The route used to substitute the literal 'there'. It reads fine in "Hey
    // there!" but the same value landed mid-sentence, producing subject lines
    // like "Quick check-in, there". An empty name lets the greeting logic decide.
    expect(lead.name).toBe('');
    expect(lead.name).not.toBe('there');
  });

  it('treats whitespace-only names as absent', () => {
    expect(toSchedulerLead(makeDbLead({ fullName: '   ', firstName: '  ' })).name).toBe(
      ''
    );
  });

  it('lifts the details the form stores in form_data', () => {
    const row = makeDbLead({
      formData: {
        budget: '$450k-$600k',
        location: 'Decatur',
        propertyType: 'single_family',
        additionalNotes: 'Wants a yard',
        bedrooms: 3,
        bathrooms: 2,
      },
    });

    expect(toSchedulerLead(row)).toMatchObject({
      budget: '$450k-$600k',
      location: 'Decatur',
      propertyType: 'single_family',
      additionalNotes: 'Wants a yard',
      bedrooms: 3,
      bathrooms: 2,
    });
  });

  it('omits absent optional keys rather than setting them undefined', () => {
    // `exactOptionalPropertyTypes` is on, and a present-but-undefined key also
    // reads as supplied to anything doing a `in`-style check.
    const lead = toSchedulerLead(makeDbLead());

    expect(Object.keys(lead)).not.toContain('phone');
    expect(Object.keys(lead)).not.toContain('budget');
    expect(Object.keys(lead)).not.toContain('bedrooms');
    expect(Object.keys(lead)).not.toContain('lastContactedAt');
  });

  it('survives a form_data blob that is not an object', () => {
    // jsonb accepts any JSON, and rows written by earlier versions are not
    // guaranteed to hold an object.
    const lead = toSchedulerLead(makeDbLead({ formData: 'legacy string' }));

    expect(Object.keys(lead)).not.toContain('budget');
  });
});

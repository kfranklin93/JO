import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { toFollowUp } from './follow-up-mapping';
import { followUps } from '@/lib/db/schema';

/**
 * Tests for the raw-row mapper.
 *
 * ## The defect these exist for
 *
 * `db.execute(sql`... RETURNING *`)` returns the driver's rows, keyed by database
 * column name. The queue used to assert those rows were `FollowUp` — Drizzle's
 * camelCase `$inferSelect` type — which compiled and was false. The cron route
 * read `followUp.leadId`, got `undefined` on every row, looked up leads by
 * `undefined`, found none, and stamped the whole batch `'Lead not found'`.
 *
 * So the central assertion here is unglamorous: the mapped row's `leadId` and
 * `templateType` are usable values, not `undefined`.
 */

/**
 * A raw row exactly as Postgres returns it.
 *
 * The column list is the one `RETURNING *` produced against the live database,
 * in the order it produced it, rather than derived from the schema or from the
 * test fake. Deriving it would let this test and the code drift together, which
 * is the mistake that let the bug ship: the fake modelled what the queue wanted
 * rather than what the driver sends.
 */
function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    lead_id: '11111111-2222-4333-8444-555555555555',
    scheduled_for: new Date('2026-03-01T12:00:00.000Z'),
    template_type: 'day3',
    status: 'sending',
    sent_at: null,
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    replied_at: null,
    failed_at: null,
    failure_reason: null,
    conversation_id: null,
    ab_test_id: null,
    variant: null,
    created_at: new Date('2026-02-28T09:00:00.000Z'),
    updated_at: new Date('2026-03-01T12:00:00.000Z'),
    attempts: 0,
    ...overrides,
  };
}

describe('toFollowUp', () => {
  it('gives the route a usable leadId and templateType', () => {
    const mapped = toFollowUp(rawRow());

    // The two fields the cron route reads to decide who to mail and what to
    // send. Both were `undefined` in production, which is the whole outage.
    expect(mapped.leadId).toBe('11111111-2222-4333-8444-555555555555');
    expect(mapped.templateType).toBe('day3');
    expect(mapped.leadId).not.toBeUndefined();
    expect(mapped.templateType).not.toBeUndefined();
  });

  it('maps every column the schema declares, leaving nothing undefined', () => {
    const mapped = toFollowUp(rawRow());

    // A column the mapper forgot would be `undefined` rather than absent, and
    // `undefined` is precisely the value that read as "no lead" and destroyed
    // the batch. Checked against the schema so a new column joins this test
    // automatically instead of being silently dropped.
    const missing = Object.keys(getTableColumns(followUps)).filter(
      (key) => !(key in mapped) || mapped[key as keyof typeof mapped] === undefined
    );

    expect(missing).toEqual([]);
  });

  it('maps the whole row, snake_case to camelCase', () => {
    const mapped = toFollowUp(
      rawRow({
        status: 'failed',
        sent_at: new Date('2026-03-01T12:00:05.000Z'),
        failed_at: new Date('2026-03-01T12:00:06.000Z'),
        failure_reason: 'email: connection reset',
        attempts: 2,
        conversation_id: '22222222-3333-4444-8555-666666666666',
        ab_test_id: '33333333-4444-4555-8666-777777777777',
        variant: 'B',
      })
    );

    expect(mapped).toEqual({
      id: '00000000-0000-4000-8000-000000000000',
      leadId: '11111111-2222-4333-8444-555555555555',
      scheduledFor: new Date('2026-03-01T12:00:00.000Z'),
      templateType: 'day3',
      status: 'failed',
      sentAt: new Date('2026-03-01T12:00:05.000Z'),
      deliveredAt: null,
      openedAt: null,
      clickedAt: null,
      repliedAt: null,
      failedAt: new Date('2026-03-01T12:00:06.000Z'),
      failureReason: 'email: connection reset',
      attempts: 2,
      conversationId: '22222222-3333-4444-8555-666666666666',
      abTestId: '33333333-4444-4555-8666-777777777777',
      variant: 'B',
      createdAt: new Date('2026-02-28T09:00:00.000Z'),
      updatedAt: new Date('2026-03-01T12:00:00.000Z'),
    });
  });

  it('keeps an unset optional column as null rather than undefined', () => {
    const mapped = toFollowUp(rawRow());

    // `exactOptionalPropertyTypes` is on and these are nullable columns, not
    // optional properties, so null is the only correct absent value.
    expect(mapped.sentAt).toBeNull();
    expect(mapped.failureReason).toBeNull();
    expect(mapped.variant).toBeNull();
  });

  /**
   * The inverse of the bug. An ORM-shaped row reaching this mapper means
   * something is feeding it rows that were already mapped, or a fake is
   * modelling the wrong layer — which is how this shipped.
   */
  it('rejects an ORM-shaped camelCase row instead of silently producing undefined', () => {
    const ormShaped = {
      id: '00000000-0000-4000-8000-000000000000',
      leadId: '11111111-2222-4333-8444-555555555555',
      templateType: 'day3',
      status: 'sending',
      attempts: 0,
    };

    expect(() => toFollowUp(ormShaped)).toThrow(/lead_id/);
  });

  it('names the missing column and lists what it did receive', () => {
    const row = rawRow();
    delete row.template_type;

    // The diagnostic matters: the production symptom was 25 rows failed with
    // 'Lead not found', which pointed at the data rather than at the read.
    expect(() => toFollowUp(row)).toThrow(/template_type/);
    expect(() => toFollowUp(row)).toThrow(/row keys:/);
  });

  it('rejects a row whose required column is null', () => {
    expect(() => toFollowUp(rawRow({ lead_id: null }))).toThrow(/lead_id/);
    expect(() => toFollowUp(rawRow({ scheduled_for: null }))).toThrow(/scheduled_for/);
  });

  it('accepts a timestamp that arrives as an ISO string', () => {
    // A `::text` cast or a driver swap sends strings. Left unparsed, a string
    // would compare by lexical order wherever a Date is expected.
    const mapped = toFollowUp(rawRow({ scheduled_for: '2026-03-01T12:00:00.000Z' }));

    expect(mapped.scheduledFor).toBeInstanceOf(Date);
    expect(mapped.scheduledFor.toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('rejects a timestamp that is not one', () => {
    expect(() => toFollowUp(rawRow({ created_at: 'not a date' }))).toThrow(/created_at/);
  });

  it('reads attempts as a number even when the driver sends a string', () => {
    // `integer` arrives as a number, but a widened column would arrive as a
    // string and `attempts + 1` would start concatenating.
    const mapped = toFollowUp(rawRow({ attempts: '2' }));

    expect(mapped.attempts).toBe(2);
    expect(typeof mapped.attempts).toBe('number');
  });

  it('rejects a status outside the schema enum', () => {
    expect(() => toFollowUp(rawRow({ status: 'in_flight' }))).toThrow(/status/);
  });

  it('rejects anything that is not a row', () => {
    expect(() => toFollowUp(null)).toThrow();
    expect(() => toFollowUp([rawRow()])).toThrow();
  });
});

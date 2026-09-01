import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { analyticsEvents, conversations, followUps, leads } from './schema';

/**
 * Index coverage guard.
 *
 * The schema shipped with zero indexes, including on the only column pair the
 * cron job queries. These assertions read the declared schema rather than a live
 * database, so they run in CI without a Neon connection and fail loudly if an
 * index is dropped during a future refactor.
 */

/** Index names declared on a table, for readable assertions. */
function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table)
    .indexes.map((entry) => entry.config.name)
    .filter((name): name is string => name !== undefined);
}

/** Column names covered by a named index, in declaration order. */
function indexColumns(
  table: Parameters<typeof getTableConfig>[0],
  indexName: string
): string[] {
  const match = getTableConfig(table).indexes.find(
    (entry) => entry.config.name === indexName
  );

  return (match?.config.columns ?? []).map((column) =>
    'name' in column ? String(column.name) : String(column)
  );
}

describe('follow_ups indexes', () => {
  it('indexes the status and schedule pair the cron job queries', () => {
    // api/cron/follow-ups/route.ts filters on status = 'scheduled' AND
    // scheduled_for <= now. Unindexed, that scans the whole follow-up history
    // on every daily run.
    expect(indexNames(followUps)).toContain(
      'follow_ups_status_scheduled_for_idx'
    );
  });

  it('orders the composite index with the equality column first', () => {
    // Equality predicate before range predicate, or the index cannot be used
    // efficiently for the scheduled_for comparison.
    expect(
      indexColumns(followUps, 'follow_ups_status_scheduled_for_idx')
    ).toEqual(['status', 'scheduled_for']);
  });

  it('indexes the lead foreign key', () => {
    expect(indexNames(followUps)).toContain('follow_ups_lead_id_idx');
  });
});

describe('leads indexes', () => {
  it('indexes email for lookup', () => {
    expect(indexNames(leads)).toContain('leads_email_idx');
  });

  it('leaves the email index non-unique', () => {
    // A repeat client legitimately submits twice — buy now, sell later. A unique
    // constraint would turn the second inquiry into a 500. The duplicate-on-
    // retry problem this might seem to solve is handled by the transaction in
    // api/leads/route.ts instead.
    const emailIndex = getTableConfig(leads).indexes.find(
      (entry) => entry.config.name === 'leads_email_idx'
    );

    expect(emailIndex).toBeDefined();
    expect(emailIndex?.config.unique).toBe(false);
  });

  it('declares no unique indexes at all', () => {
    const uniqueIndexes = getTableConfig(leads).indexes.filter(
      (entry) => entry.config.unique
    );

    expect(uniqueIndexes).toEqual([]);
  });

  it('indexes created_at for dashboard ordering', () => {
    expect(indexNames(leads)).toContain('leads_created_at_idx');
  });
});

describe('foreign key child indexes', () => {
  // Postgres indexes the referenced primary key, never the referencing child
  // column. Every ON DELETE CASCADE from leads therefore scans these tables
  // unless the child column is indexed explicitly.
  it.each([
    ['conversations', conversations, 'conversations_lead_id_idx'],
    ['analytics_events', analyticsEvents, 'analytics_events_lead_id_idx'],
    ['follow_ups', followUps, 'follow_ups_lead_id_idx'],
  ])('indexes %s.lead_id', (_label, table, expectedName) => {
    expect(indexNames(table)).toContain(expectedName);
    expect(indexColumns(table, expectedName)).toEqual(['lead_id']);
  });
});

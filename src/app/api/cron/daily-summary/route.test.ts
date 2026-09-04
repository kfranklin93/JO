import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Lead as DbLead } from '@/lib/db/schema';

/**
 * Tests for the daily-summary cron endpoint.
 *
 * Two concerns.
 *
 * **Authorisation.** Same fail-open defect as the follow-up route: with
 * `CRON_SECRET` unset, any caller could make the deployment email Joey on demand.
 *
 * **The digest itself.** The lead list used to be a hardcoded `[]` behind a
 * `// TODO`, so every morning's mail reported zero leads. The window is the part
 * most likely to be quietly wrong, so it is asserted on both edges and across the
 * Eastern/UTC boundary that made evening leads appear a day late.
 *
 * The database fake below renders the predicate the route actually builds and
 * applies it, rather than returning a fixed row list. So a closed interval, a
 * swapped bound, or a dropped `ORDER BY` fails these tests instead of passing
 * them.
 */

const dialect = new PgDialect();

/** Rows in the simulated `leads` table, in the order they were seeded. */
let seededLeads: DbLead[] = [];
/** How many selects the route issued, so the digest cannot fan out per lead. */
let selectCount = 0;

/** Read the timestamp bound belonging to a specific comparison. */
function boundFor(
  text: string,
  params: unknown[],
  clause: RegExp,
  what: string
): Date {
  const match = text.match(clause);
  if (!match?.[1]) {
    throw new Error(`fake db: the digest query needs ${what}, got:\n${text}`);
  }

  const value = params[Number(match[1]) - 1];
  // The dialect serialises Date values to ISO strings before they reach the
  // driver, so parse rather than assume a Date arrives.
  const bound = new Date(value as string);
  if (Number.isNaN(bound.getTime())) {
    throw new Error(`fake db: ${String(value)} is not a timestamp in:\n${text}`);
  }
  return bound;
}

function applyWindow(predicate: unknown): DbLead[] {
  const { sql: raw, params } = dialect.sqlToQuery(predicate as SQL);
  const text = raw.replace(/\s+/g, ' ').trim();

  // Half-open, and in that exact form. `>=` and `<` are what stop a lead created
  // at midnight from landing in two consecutive digests, so the fake insists on
  // them: `<=` renders as `<= $n` and fails the second lookup.
  const start = boundFor(
    text,
    params,
    /created_at" >= \$(\d+)/i,
    'an inclusive lower bound on created_at'
  );
  const end = boundFor(
    text,
    params,
    /created_at" < \$(\d+)/i,
    'an exclusive upper bound on created_at'
  );

  return seededLeads.filter(
    (lead) => lead.createdAt >= start && lead.createdAt < end
  );
}

function applyOrdering(rows: DbLead[], fields: unknown[]): DbLead[] {
  const ordering = fields
    .map((field) => dialect.sqlToQuery(field as SQL).sql)
    .join(', ');

  if (!/created_at" asc/i.test(ordering)) {
    throw new Error(
      `fake db: the digest must be ordered by created_at ascending, got: ${ordering}`
    );
  }

  return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

const fakeDbClient = {
  select: () => ({
    from: (table: unknown) => {
      const name = getTableName(table as Parameters<typeof getTableName>[0]);
      if (name !== 'leads') {
        throw new Error(`db.select from ${name} — the digest only reads leads`);
      }
      selectCount++;

      return {
        where: (predicate: unknown) => {
          const filtered = applyWindow(predicate);
          // Drizzle's builder is a thenable that can still be refined, so the
          // fake is too. Awaiting without `orderBy` yields seeded order, which is
          // what makes the chronological test meaningful.
          return Object.assign(Promise.resolve(filtered), {
            orderBy: (...fields: unknown[]) =>
              Promise.resolve(applyOrdering(filtered, fields)),
          });
        },
      };
    },
  }),
  insert: () => {
    throw new Error('db.insert called — the digest writes no rows');
  },
  update: () => {
    throw new Error('db.update called — the digest writes no rows');
  },
};

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

// Spread the real schema so `leads.createdAt` is the genuine column and the
// predicate the route builds is the one Postgres would receive.
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema');
  return { ...schema, db: fakeDbClient };
});

interface DigestLead {
  name: string;
  email: string;
  phone?: string;
  intent: string;
  budget?: string;
  timeline?: string;
  location?: string;
  createdAt: Date;
}

const sendDailyLeadSummary = vi.fn(async (_leads: DigestLead[]) => true);
vi.mock('@/lib/services/email-service', () => ({
  sendDailyLeadSummary: (leads: DigestLead[]) => sendDailyLeadSummary(leads),
}));

const { makeDbLead } = await import('@/lib/db/__fixtures__/fake-follow-up-db');
const { GET, POST } = await import('./route');

// Deliberately fake. Never put a real secret here: Netlify's secret scanner
// fails the build, and a public repo would publish it.
const SECRET = 'test-cron-secret-do-not-use-in-any-environment';

/**
 * A Tuesday morning run: 11:30 UTC is 07:30 EDT, so the digest covers Monday
 * 15 June Eastern — the window [2026-06-15T04:00Z, 2026-06-16T04:00Z).
 */
const RUN_AT = new Date('2026-06-16T11:30:00.000Z');
const WINDOW_START = new Date('2026-06-15T04:00:00.000Z');
const WINDOW_END = new Date('2026-06-16T04:00:00.000Z');

let leadCounter = 0;

/** A seeded lead created at a given instant. Ids stay unique per test. */
function leadAt(createdAt: string, overrides: Partial<DbLead> = {}): DbLead {
  leadCounter++;
  return makeDbLead({
    id: `00000000-0000-4000-8000-0000000000${String(leadCounter).padStart(2, '0')}`,
    createdAt: new Date(createdAt),
    ...overrides,
  });
}

function seed(...rows: DbLead[]): void {
  seededLeads.push(...rows);
}

function cronRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest(
    'https://gowithjoeyo.netlify.app/api/cron/daily-summary',
    { headers }
  );
}

const authorised = () => cronRequest(`Bearer ${SECRET}`);

/** The digest rows handed to the email service by the most recent run. */
function digest(): DigestLead[] {
  const call = sendDailyLeadSummary.mock.calls.at(-1);
  if (!call) throw new Error('no digest was sent');
  return call[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  sendDailyLeadSummary.mockResolvedValue(true);
  seededLeads = [];
  selectCount = 0;
  leadCounter = 0;
  testEnv.CRON_SECRET = SECRET;
  testEnv.RESEND_API_KEY = 're_test_key';
  testEnv.DATABASE_URL = 'postgres://user:pass@localhost:5432/joeyo_test';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(RUN_AT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/cron/daily-summary — authorisation', () => {
  it('sends the digest when the secret is correct', async () => {
    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(sendDailyLeadSummary).toHaveBeenCalledTimes(1);
  });

  it('rejects an absent Authorization header and sends nothing', async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret and sends nothing', async () => {
    const response = await GET(cronRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });

  it('rejects every caller when CRON_SECRET is unset, and sends nothing', async () => {
    delete testEnv.CRON_SECRET;

    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(401);
    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });

  it('checks authorisation before asserting configuration', async () => {
    delete testEnv.CRON_SECRET;
    delete testEnv.RESEND_API_KEY;

    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain(
      'RESEND_API_KEY'
    );
  });

  it('reads no leads when the request is rejected', async () => {
    await GET(cronRequest('Bearer wrong-secret'));

    expect(selectCount).toBe(0);
  });
});

describe('POST /api/cron/daily-summary — authorisation', () => {
  it('applies the same check as GET', async () => {
    expect((await POST(cronRequest())).status).toBe(401);
    expect((await POST(cronRequest('Bearer wrong'))).status).toBe(401);

    delete testEnv.CRON_SECRET;
    expect((await POST(cronRequest(`Bearer ${SECRET}`))).status).toBe(401);

    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });

  it('sends the digest when authorised', async () => {
    const response = await POST(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(sendDailyLeadSummary).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/cron/daily-summary — the digest', () => {
  it("lists the previous day's leads", async () => {
    seed(
      leadAt('2026-06-15T14:00:00.000Z', {
        fullName: 'Dana Reyes',
        email: 'dana.reyes@gowithjoeyo-test.invalid',
        phone: '+15551230001',
        propertyInterest: 'buy',
        timeline: '3_months',
      }),
      leadAt('2026-06-15T18:30:00.000Z', {
        firstName: 'Sam',
        lastName: 'Okafor',
        email: 'sam.okafor@gowithjoeyo-test.invalid',
        propertyInterest: 'sell',
      })
    );

    const response = await GET(authorised());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.leadCount).toBe(2);
    expect(digest()).toEqual([
      {
        name: 'Dana Reyes',
        email: 'dana.reyes@gowithjoeyo-test.invalid',
        phone: '+15551230001',
        intent: 'buy',
        timeline: '3_months',
        createdAt: new Date('2026-06-15T14:00:00.000Z'),
      },
      {
        name: 'Sam Okafor',
        email: 'sam.okafor@gowithjoeyo-test.invalid',
        intent: 'sell',
        createdAt: new Date('2026-06-15T18:30:00.000Z'),
      },
    ]);
    // One query for the whole day, not one per lead.
    expect(selectCount).toBe(1);
  });

  it('reports a genuinely empty day accurately', async () => {
    // Nothing seeded. The old placeholder produced this same call on every run,
    // which is why "no leads" has to be distinguishable from "never implemented":
    // the response now carries the window it actually queried.
    const response = await GET(authorised());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.leadCount).toBe(0);
    expect(digest()).toEqual([]);
    expect(selectCount).toBe(1);
    expect(body.windowStart).toBe(WINDOW_START.toISOString());
    expect(body.windowEnd).toBe(WINDOW_END.toISOString());
  });

  it('excludes leads on both edges of the window', async () => {
    seed(
      leadAt(new Date(WINDOW_START.getTime() - 1).toISOString(), {
        email: 'just.before@gowithjoeyo-test.invalid',
      }),
      leadAt(WINDOW_START.toISOString(), {
        email: 'first.instant@gowithjoeyo-test.invalid',
      }),
      leadAt(new Date(WINDOW_END.getTime() - 1).toISOString(), {
        email: 'last.instant@gowithjoeyo-test.invalid',
      }),
      leadAt(WINDOW_END.toISOString(), {
        email: 'just.after@gowithjoeyo-test.invalid',
      })
    );

    const response = await GET(authorised());

    expect((await response.json()).leadCount).toBe(2);
    expect(digest().map((lead) => lead.email)).toEqual([
      'first.instant@gowithjoeyo-test.invalid',
      'last.instant@gowithjoeyo-test.invalid',
    ]);
  });

  it('orders the digest chronologically', async () => {
    seed(
      leadAt('2026-06-15T22:15:00.000Z', {
        email: 'evening@gowithjoeyo-test.invalid',
      }),
      leadAt('2026-06-15T11:05:00.000Z', {
        email: 'morning@gowithjoeyo-test.invalid',
      }),
      leadAt('2026-06-15T16:40:00.000Z', {
        email: 'afternoon@gowithjoeyo-test.invalid',
      })
    );

    await GET(authorised());

    expect(digest().map((lead) => lead.email)).toEqual([
      'morning@gowithjoeyo-test.invalid',
      'afternoon@gowithjoeyo-test.invalid',
      'evening@gowithjoeyo-test.invalid',
    ]);
  });

  it('files evening leads under the Eastern day they were sent, not the UTC one', async () => {
    // 9 PM EDT Monday is 01:00 UTC Tuesday. A server-local (UTC) boundary puts it
    // in Tuesday's bucket, so Joey sees it on Wednesday and Tuesday's digest looks
    // like it lost a lead. The 9 PM Sunday row is the mirror image: within the
    // previous UTC day, but not within the Eastern Monday being reported.
    seed(
      leadAt('2026-06-15T01:00:00.000Z', {
        email: 'sunday.evening@gowithjoeyo-test.invalid',
      }),
      leadAt('2026-06-16T01:00:00.000Z', {
        email: 'monday.evening@gowithjoeyo-test.invalid',
      })
    );

    const response = await GET(authorised());
    const body = await response.json();

    expect(digest().map((lead) => lead.email)).toEqual([
      'monday.evening@gowithjoeyo-test.invalid',
    ]);
    expect(body.date).toBe('2026-06-15');
    expect(body.timeZone).toBe('America/New_York');
  });

  it('keeps a nameless lead in the digest with a readable label', async () => {
    seed(
      leadAt('2026-06-15T09:00:00.000Z', {
        email: 'anonymous@gowithjoeyo-test.invalid',
      })
    );

    await GET(authorised());

    // The row is still actionable: an empty cell would read as a broken template.
    expect(digest()[0]?.name).toBe('Name not provided');
    expect(digest()[0]?.email).toBe('anonymous@gowithjoeyo-test.invalid');
  });

  it('normalises a legacy property interest and reads budget from form data', async () => {
    seed(
      leadAt('2026-06-15T09:00:00.000Z', {
        fullName: 'Lee Nakamura',
        propertyInterest: 'buying',
        formData: { budget: '$400k-$500k', location: 'Riverside' },
      })
    );

    await GET(authorised());

    // Canonicalised so the email's group-by-intent counts do not split a legacy
    // 'buying' row away from a current 'buy' one.
    expect(digest()[0]?.intent).toBe('buy');
    expect(digest()[0]?.budget).toBe('$400k-$500k');
    expect(digest()[0]?.location).toBe('Riverside');
  });

  it('reports failure when the email cannot be sent', async () => {
    sendDailyLeadSummary.mockResolvedValue(false);
    seed(leadAt('2026-06-15T09:00:00.000Z'));

    const response = await GET(authorised());
    const body = await response.json();

    // Still 200 — the run completed and the caller is a cron scheduler — but the
    // payload does not claim success.
    expect(body.success).toBe(false);
    expect(body.leadCount).toBe(1);
  });

  it('answers 503 naming DATABASE_URL when the database is not configured', async () => {
    delete testEnv.DATABASE_URL;

    const response = await GET(authorised());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.missing).toContain('DATABASE_URL');
    expect(sendDailyLeadSummary).not.toHaveBeenCalled();
  });
});

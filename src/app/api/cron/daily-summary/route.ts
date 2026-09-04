import { NextRequest, NextResponse } from 'next/server';
import { and, asc, gte, lt } from 'drizzle-orm';
import { db, leads } from '@/lib/db';
import type { Lead as DbLead } from '@/lib/db/schema';
import {
  readLeadFormData,
  resolveLeadName,
  toLeadIntent,
} from '@/lib/services/lead-mapping';
import { sendDailyLeadSummary } from '@/lib/services/email-service';
import { previousDayWindow, REPORT_TIME_ZONE } from '@/lib/utils/report-day';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import { requireCronAuth } from '@/lib/api/cron-auth';

/**
 * Daily Lead Summary Cron Job
 *
 * Sends Joey a digest of the previous day's leads.
 *
 * Triggered externally by cron-job.org:
 *   GET https://gowithjoeyo.netlify.app/api/cron/daily-summary
 *   Authorization: Bearer <CRON_SECRET>
 *   Schedule: 30 11 * * * (UTC) — offset half an hour from the follow-up run
 *
 * Netlify ignores `vercel.json`, so the crons previously declared there
 * scheduled nothing at all.
 *
 * The digest used to be hardcoded to an empty array behind a `// TODO`, so Joey
 * received a mail every morning reporting zero leads no matter what had come in.
 * "No leads yesterday" and "this endpoint was never finished" produced the same
 * email, which is the worst possible failure mode for a report: it looks healthy.
 */

/** What {@link sendDailyLeadSummary} needs for one row of the digest. */
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

/**
 * Shown when a lead row carries none of the three name columns.
 *
 * The form does not require a name, and an empty cell in the table would read as
 * a rendering fault rather than as missing data. Joey still has the email address
 * in the adjacent column, so the row remains actionable.
 */
const UNNAMED_LEAD = 'Name not provided';

/**
 * Project a database row onto the digest shape.
 *
 * Optional keys are omitted rather than set to `undefined`, which
 * `exactOptionalPropertyTypes` requires and which also keeps the email template's
 * `lead.phone ? ... : '-'` checks meaningful.
 */
function toDigestLead(row: DbLead): DigestLead {
  const form = readLeadFormData(row);

  const lead: DigestLead = {
    name: resolveLeadName(row) ?? UNNAMED_LEAD,
    email: row.email,
    // Canonicalised through the same mapping the drip uses. `property_interest`
    // is free-text, and the digest groups by intent to produce its counts — left
    // raw, a legacy 'buying' row and a current 'buy' row would be tallied as two
    // separate categories in the same summary.
    intent: toLeadIntent(row.propertyInterest),
    createdAt: row.createdAt,
  };

  if (row.phone) lead.phone = row.phone;
  if (row.timeline) lead.timeline = row.timeline;
  // The form writes budget into `form_data`; `price_range` is a column no current
  // code path populates. Read both so older rows still show a figure.
  const budget = form.budget ?? row.priceRange;
  if (budget) lead.budget = budget;
  if (form.location) lead.location = form.location;

  return lead;
}

export async function GET(request: NextRequest) {
  try {
    // Fails closed, including when CRON_SECRET is unset. See cron-auth.ts.
    const denied = requireCronAuth(request);
    if (denied) return denied;

    // Asserted after auth so an unauthenticated caller cannot probe which
    // variables a deployment is missing.
    requireEnv('DATABASE_URL', 'RESEND_API_KEY');

    console.log('Starting daily lead summary...');

    // Anchored to Eastern, not to the server clock. See report-day.ts: a UTC
    // window would report every evening lead a day late.
    const window = previousDayWindow(new Date());

    // Unbounded on purpose. A cap would be the wrong safety rail here — the email
    // states a total and lists the rows behind it, so truncating the list would
    // make the report disagree with its own headline count. One row per form
    // submission puts a normal day in single digits; if submission volume ever
    // makes this query expensive, the fix is to rate-limit `POST /api/leads`,
    // which has no limiter today, rather than to under-report the day.
    const rows = await db
      .select()
      .from(leads)
      .where(
        and(
          gte(leads.createdAt, window.start),
          lt(leads.createdAt, window.end)
        )
      )
      // Chronological, so the digest reads the way the day happened.
      .orderBy(asc(leads.createdAt));

    const yesterdayLeads = rows.map(toDigestLead);

    // An empty result is a real answer, not an error: `sendDailyLeadSummary` has
    // a distinct no-leads path, so Joey gets a mail that says so explicitly.
    const sent = await sendDailyLeadSummary(yesterdayLeads);

    if (sent) {
      console.log(
        `Daily summary sent for ${window.date} (${REPORT_TIME_ZONE}): ` +
          `${yesterdayLeads.length} leads`
      );
    } else {
      console.error('Failed to send daily summary');
    }

    return NextResponse.json({
      success: sent,
      leadCount: yesterdayLeads.length,
      date: window.date,
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      timeZone: REPORT_TIME_ZONE,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const configError = envErrorResponse(error);
    if (configError) return configError;

    console.error('Daily summary cron error:', error);
    return NextResponse.json(
      { error: 'Failed to send daily summary' },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}

import { NextRequest, NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { db, leads } from '@/lib/db';
import { sendFollowUp } from '@/lib/services/follow-up-scheduler';
import { toSchedulerLead } from '@/lib/services/lead-mapping';
import {
  claimDueFollowUps,
  countRemainingDue,
  markSent,
  recordFailure,
  DEFAULT_CLAIM_LIMIT,
} from '@/lib/db/follow-up-queue';
import type { FollowUpType } from '@/lib/services/follow-up-content';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import { requireCronAuth } from '@/lib/api/cron-auth';

/**
 * Cron job endpoint for processing automated follow-ups.
 *
 * Triggered externally by cron-job.org:
 *   GET https://gowithjoeyo.netlify.app/api/cron/follow-ups
 *   Authorization: Bearer <CRON_SECRET>
 *   Schedule: 0 11 * * * (UTC) — roughly 7 AM Eastern
 *
 * Netlify scheduled functions cannot drive this: they only target functions in
 * the Netlify functions directory and cannot be invoked by URL. `vercel.json` is
 * ignored by Netlify entirely, so an entry there schedules nothing.
 *
 * Rows are claimed in one atomic statement before any send I/O, so two
 * overlapping runs cannot both send the same follow-up. See follow-up-queue.ts.
 */
export async function GET(request: NextRequest) {
  try {
    // Fails closed, including when CRON_SECRET is unset. See cron-auth.ts.
    const denied = requireCronAuth(request);
    if (denied) return denied;

    // Asserted after auth so an unauthenticated caller cannot probe which
    // variables a deployment is missing.
    requireEnv('DATABASE_URL', 'RESEND_API_KEY');

    const now = new Date();

    // Claim first. Every row returned here has already left 'scheduled', so no
    // concurrent run will pick it up while this one is sending.
    const claimed = await claimDueFollowUps(DEFAULT_CLAIM_LIMIT, now);

    if (claimed.length === 0) {
      return NextResponse.json({
        success: true,
        claimed: 0,
        sent: 0,
        failed: 0,
        requeued: 0,
        remaining: 0,
        timestamp: now.toISOString(),
      });
    }

    // One query for every lead referenced by the batch, rather than per row.
    const leadIds = [...new Set(claimed.map((row) => row.leadId))];
    const leadRows = await db
      .select()
      .from(leads)
      .where(inArray(leads.id, leadIds));

    const leadsById = new Map(leadRows.map((row) => [row.id, row]));

    let sent = 0;
    let failed = 0;
    let requeued = 0;

    for (const followUp of claimed) {
      const leadRow = leadsById.get(followUp.leadId);

      if (!leadRow) {
        // The row references a lead that no longer exists. Retrying cannot help,
        // so the attempt budget is spent immediately rather than requeuing.
        await recordFailure(
          followUp.id,
          'Lead not found',
          Number.MAX_SAFE_INTEGER - 1,
          now
        );
        failed++;
        continue;
      }

      // Explicit mapping rather than a cast. See lead-mapping.ts.
      const lead = toSchedulerLead(leadRow);
      const result = await sendFollowUp(lead, followUp.templateType as FollowUpType);

      if (result.ok) {
        await markSent(followUp.id, now);
        sent++;
        continue;
      }

      const outcome = await recordFailure(
        followUp.id,
        result.reason,
        followUp.attempts,
        now
      );

      if (outcome.requeued) {
        requeued++;
      } else {
        failed++;
      }
    }

    // Reported so an operator can tell a cleared queue from a hit batch limit.
    const remaining = await countRemainingDue(now);

    console.log(
      `Follow-ups: ${sent} sent, ${requeued} requeued, ${failed} failed, ${remaining} still due`
    );

    return NextResponse.json({
      success: true,
      claimed: claimed.length,
      sent,
      failed,
      requeued,
      remaining,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    const configError = envErrorResponse(error);
    if (configError) return configError;

    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Failed to process follow-ups' }, { status: 500 });
  }
}

// Support POST for manual triggering from the dashboard. Inherits the auth check.
export async function POST(request: NextRequest) {
  return GET(request);
}

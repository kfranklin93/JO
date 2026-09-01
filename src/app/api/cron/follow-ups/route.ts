import { NextRequest, NextResponse } from 'next/server';
import { eq, lte, and, inArray } from 'drizzle-orm';
import { db, leads, followUps } from '@/lib/db';
import { sendFollowUp } from '@/lib/services/follow-up-scheduler';
import type { Lead } from '@/lib/services/follow-up-scheduler';

/**
 * Cron job endpoint for processing automated follow-ups.
 *
 * Runs every morning at 7 AM. Trigger via external cron (cron-job.org,
 * EasyCron, etc.) with:
 *   GET https://gowithjoeyo.netlify.app/api/cron/follow-ups
 *   Authorization: Bearer <CRON_SECRET>
 *
 * For Netlify scheduled functions add to netlify.toml:
 *   [functions."api/cron/follow-ups"]
 *     schedule = "0 7 * * *"
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting follow-up processing...');

    const now = new Date();

    // Fetch all scheduled follow-ups that are due and not yet sent
    const pendingFollowUps = await db
      .select()
      .from(followUps)
      .where(
        and(
          eq(followUps.status, 'scheduled'),
          lte(followUps.scheduledFor, now)
        )
      );

    if (pendingFollowUps.length === 0) {
      console.log('No pending follow-ups.');
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        timestamp: now.toISOString(),
      });
    }

    // Fetch all leads referenced by pending follow-ups (deduplicated)
    const leadIds = [...new Set(pendingFollowUps.map((fu) => fu.leadId))];
    const leadRows = await db
      .select()
      .from(leads)
      .where(inArray(leads.id, leadIds));

    // Build lookup map by lead id
    const leadsById = new Map(leadRows.map((l) => [l.id, l]));

    let sent = 0;
    let failed = 0;

    for (const fu of pendingFollowUps) {
      const leadRow = leadsById.get(fu.leadId);

      if (!leadRow) {
        console.error(`Lead not found for follow-up ${fu.id}`);
        failed++;
        await db
          .update(followUps)
          .set({
            status: 'failed',
            failedAt: now,
            failureReason: 'Lead not found',
            updatedAt: now,
          })
          .where(eq(followUps.id, fu.id));
        continue;
      }

      // Map DB lead row → scheduler Lead shape
      const rawName = (
        leadRow.fullName ??
        `${leadRow.firstName ?? ''} ${leadRow.lastName ?? ''}`.trim()
      ) || 'there';

      const lead: Lead = {
        id: leadRow.id,
        name: rawName,
        email: leadRow.email,
        ...(leadRow.phone ? { phone: leadRow.phone } : {}),
        intent: (leadRow.propertyInterest ?? 'general') as Lead['intent'],
        ...(leadRow.timeline ? { timeline: leadRow.timeline } : {}),
        createdAt: leadRow.createdAt,
        ...(leadRow.lastContactedAt ? { lastContactedAt: leadRow.lastContactedAt } : {}),
        status: leadRow.status as Lead['status'],
      };

      const templateType = fu.templateType as Parameters<typeof sendFollowUp>[1];
      const success = await sendFollowUp(lead, templateType);

      if (success) {
        sent++;
        await db
          .update(followUps)
          .set({ status: 'sent', sentAt: now, updatedAt: now })
          .where(eq(followUps.id, fu.id));
      } else {
        failed++;
        await db
          .update(followUps)
          .set({
            status: 'failed',
            failedAt: now,
            failureReason: 'Send failed',
            updatedAt: now,
          })
          .where(eq(followUps.id, fu.id));
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`Follow-up processing complete: ${sent} sent, ${failed} failed`);

    return NextResponse.json({
      success: true,
      sent,
      failed,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Failed to process follow-ups' }, { status: 500 });
  }
}

// Support POST for manual triggering from dashboard
export async function POST(request: NextRequest) {
  return GET(request);
}

// Made with Bob

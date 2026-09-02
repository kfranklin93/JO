import { NextRequest, NextResponse } from 'next/server';
import { sendDailyLeadSummary } from '@/lib/services/email-service';
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
 */
export async function GET(request: NextRequest) {
  try {
    // Fails closed, including when CRON_SECRET is unset. See cron-auth.ts.
    const denied = requireCronAuth(request);
    if (denied) return denied;

    // Asserted after auth so an unauthenticated caller cannot probe which
    // variables a deployment is missing.
    requireEnv('RESEND_API_KEY');

    console.log('Starting daily lead summary...');

    // Calculate yesterday's date range
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // TODO: Fetch leads from database where createdAt is between yesterday and today
    // For now, this is a placeholder showing the structure
    const yesterdayLeads: Array<{
      name: string;
      email: string;
      phone?: string;
      intent: string;
      budget?: string;
      timeline?: string;
      location?: string;
      createdAt: Date;
    }> = [];

    // In production, you would query your database like this:
    // const yesterdayLeads = await db.leads.findMany({
    //   where: {
    //     createdAt: {
    //       gte: yesterday,
    //       lt: today,
    //     },
    //   },
    //   orderBy: {
    //     createdAt: 'asc',
    //   },
    // });

    // Send the daily summary email
    const sent = await sendDailyLeadSummary(yesterdayLeads);

    if (sent) {
      console.log(`Daily summary sent: ${yesterdayLeads.length} leads`);
    } else {
      console.error('Failed to send daily summary');
    }

    return NextResponse.json({
      success: sent,
      leadCount: yesterdayLeads.length,
      date: yesterday.toISOString().split('T')[0],
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


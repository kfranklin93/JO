import { NextRequest, NextResponse } from 'next/server';
import { sendDailyLeadSummary } from '@/lib/services/email-service';
import { env } from '@/config/env';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';

/**
 * Daily Lead Summary Cron Job
 * 
 * Runs every morning at 7 AM to send Joey a summary of all leads
 * from the previous day.
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/daily-summary",
 *     "schedule": "0 7 * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access. Read from the
    // validated schema rather than process.env.
    const authHeader = request.headers.get('authorization');
    const cronSecret = env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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


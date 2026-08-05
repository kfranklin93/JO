import { NextRequest, NextResponse } from 'next/server';
import { processPendingFollowUps } from '@/lib/services/follow-up-scheduler';
import type { Lead, FollowUpSchedule } from '@/lib/services/follow-up-scheduler';

/**
 * Cron job endpoint for processing automated follow-ups
 *
 * Runs every morning at 7 AM to send scheduled follow-up emails
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/follow-ups",
 *     "schedule": "0 7 * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Starting follow-up processing...');

    // TODO: Fetch leads and schedules from database
    // For now, this is a placeholder that shows the structure
    const leads: Lead[] = [];
    const schedules: FollowUpSchedule[] = [];

    // Process pending follow-ups
    const result = await processPendingFollowUps(leads, schedules);

    console.log(`Follow-up processing complete: ${result.sent} sent, ${result.failed} failed`);

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Failed to process follow-ups' },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}

// Made with Bob

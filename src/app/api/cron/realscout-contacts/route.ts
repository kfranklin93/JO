import { NextRequest, NextResponse } from 'next/server';
import { syncRealScoutContacts } from '@/lib/services/realscout-sync';
import { RealScoutError } from '@/lib/services/realscout';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import { requireCronAuth } from '@/lib/api/cron-auth';

/**
 * Cron job endpoint for pulling RealScout contacts into leads.
 *
 * Triggered externally by cron-job.org, the same way the follow-up queue is:
 *   GET https://gowithjoeyo.com/api/cron/realscout-contacts
 *   Authorization: Bearer <CRON_SECRET>
 *   Schedule: 25 11 * * * (UTC) — shortly after the follow-up run
 *
 * Follows api/cron/follow-ups/route.ts exactly on the two things that matter:
 * the same `CRON_SECRET` check via `requireCronAuth`, which **fails closed**
 * including when the secret is unset, and configuration asserted only *after*
 * auth so an unauthenticated caller cannot probe which variables a deployment
 * is missing.
 *
 * Unlike the follow-up queue, this needs no claim statement. Two overlapping
 * runs cannot double-write, because the sync is keyed on the RealScout contact
 * id already recorded on the lead row — see `alreadySynced` in
 * realscout-sync.ts. The cost of an overlap is a repeated read, not a duplicate
 * lead.
 *
 * What a run writes is deliberately narrow: `leads` rows and nothing else. No
 * follow-up touchpoints, no email, no SMS. Arriving in Joey's RealScout contact
 * book is not consent to this site's marketing sequence, and the report below
 * states `followUpsCreated: 0` rather than leaving it implied.
 */
export async function GET(request: NextRequest) {
  try {
    // Fails closed, including when CRON_SECRET is unset. See cron-auth.ts.
    const denied = requireCronAuth(request);
    if (denied) return denied;

    // Asserted after auth. REALSCOUT_API_TOKEN is deliberately not asserted
    // here: a deployment without it has nothing to sync, and the report says
    // `configured: false` rather than failing a scheduled run every day for a
    // condition that is not a fault.
    requireEnv('DATABASE_URL');

    const report = await syncRealScoutContacts();

    return NextResponse.json({
      success: true,
      ...report,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const configError = envErrorResponse(error);
    if (configError) return configError;

    // A RealScout failure is reported with its kind and, for a 403, the scope
    // it named. 502 rather than 500 because the fault is upstream — except for
    // a spent rate limit, which is a 429 so an operator can tell "try later"
    // from "something is broken".
    if (error instanceof RealScoutError) {
      console.error(
        `[realscout:cron] sync failed (${error.kind}` +
          `${error.missingScope === null ? '' : `, missing ${error.missingScope}`}): ` +
          error.message,
      );
      return NextResponse.json(
        {
          error: 'RealScout sync failed',
          reason: error.kind,
          missingScope: error.missingScope,
          requestId: error.requestId,
          ...(error.retryAfterSeconds === null
            ? {}
            : { retryAfterSeconds: error.retryAfterSeconds }),
        },
        { status: error.kind === 'rate_limited' ? 429 : 502 },
      );
    }

    console.error('[realscout:cron] sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync RealScout contacts' },
      { status: 500 },
    );
  }
}

// Support POST for manual triggering from the dashboard. Inherits the auth check.
export async function POST(request: NextRequest) {
  return GET(request);
}

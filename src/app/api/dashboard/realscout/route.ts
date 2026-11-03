import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { probeRealScout } from '@/lib/services/realscout';

/**
 * GET /api/dashboard/realscout — does the RealScout credential actually work?
 *
 * This endpoint is the first thing built in this feature and the first thing
 * that should be run against a deployment, because everything else assumes the
 * token works and nothing local can establish that:
 * `REALSCOUT_API_TOKEN` is secret-scoped in Netlify, so its value is not
 * readable from the CLI or a developer's shell. The only place the credential
 * can be exercised is server-side, which is what this is.
 *
 * It probes `GET /me`, then `GET /contacts?limit=1` and `GET /activity?limit=1`,
 * and reports for each whether it was reachable and — when it was not — whether
 * the cause was authentication, a missing scope (**naming which one**), or rate
 * limiting. `/me` also returns the scopes the credential carries, so
 * `canWriteContacts` answers up front whether the push direction can work at
 * all rather than letting it fail obscurely on every lead.
 *
 * Three calls, one row each, against budgets of 300 single reads and 60 list
 * calls a minute. Cheap enough to run whenever something looks wrong.
 *
 * ## What it never does
 *
 * It never logs, returns, or embeds the token — not in a success body, not in
 * an error message, not in a `detail` string. `probeRealScout` builds its own
 * wording for a transport failure rather than passing a thrown message through,
 * because a thrown fetch error can carry the request URL and a URL can carry a
 * contact's email.
 *
 * ## Authorization
 *
 * The same cookie check as `/api/dashboard/data` and
 * `/api/dashboard/leads/[id]/history`, verified here independently: `/api/*`
 * sits outside the request interceptor's matcher, so this handler cannot assume
 * anything upstream looked. It runs before anything else, so an unauthenticated
 * caller learns nothing — not even whether this deployment has a token.
 */
export async function GET() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await probeRealScout();

    // 200 even when a probe failed. The report *is* the answer — "the token is
    // valid but has no contacts:read" is a successful diagnosis, and returning
    // it as an error status would make the dashboard show a fetch failure
    // instead of the finding.
    return NextResponse.json(report);
  } catch (error) {
    // `probeRealScout` catches per probe, so reaching here means a bug rather
    // than a RealScout problem. The caught value is deliberately not echoed.
    console.error('[realscout:diagnostics] probe threw:', error);
    return NextResponse.json(
      { error: 'Could not run the RealScout connectivity check.' },
      { status: 500 },
    );
  }
}

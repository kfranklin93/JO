import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import { between, upcoming, withLeads } from '@/lib/services/booking';

/**
 * GET /api/dashboard/appointments — Joey's calendar.
 *
 * Returns bookings with the client attached: who is being met, how to reach
 * them, and when. That makes it the same class of data as
 * `/api/dashboard/data`, so it gets the same boundary — the session cookie is
 * verified here, independently, because `/api/*` sits outside the request
 * interceptor's matcher and this handler cannot assume anything upstream
 * looked.
 *
 * Ordering of the checks matches the chats route deliberately: authorize first,
 * assert configuration second, so an unauthenticated caller cannot probe which
 * environment variables a deployment is missing.
 *
 * ## Query
 *
 * No parameters returns the next `limit` scheduled bookings from now. `from`
 * alone moves that starting point. `from` *and* `to` switch to a window, which
 * is what a month view asks for, and includes completed and no-show bookings
 * because a calendar looking backwards should show what happened rather than
 * only what is still pending. `limit` caps both shapes — a window is not a way
 * to ask for everything.
 */

/** Matches `upcoming`'s own default, so the two cannot drift. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** A query date, or null if it was absent, or the string 'invalid'. */
function parseDate(raw: string | null): Date | null | 'invalid' {
  if (raw === null) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? 'invalid' : parsed;
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  const from = parseDate(params.get('from'));
  if (from === 'invalid') return badRequest('from is not a valid date');

  const to = parseDate(params.get('to'));
  if (to === 'invalid') return badRequest('to is not a valid date');

  if (to !== null && from === null) {
    return badRequest('to requires from');
  }

  if (from !== null && to !== null && to.getTime() <= from.getTime()) {
    return badRequest('to must be after from');
  }

  const rawLimit = params.get('limit');
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return badRequest(`limit must be a whole number between 1 and ${MAX_LIMIT}`);
    }
  }

  try {
    requireEnv('DATABASE_URL');

    // `limit` applies to both paths. A window is the one that needs it most:
    // every row carries a name, an email and a phone number once the leads are
    // attached, so `?from=1970-01-01&to=2100-01-01` would otherwise return the
    // entire client list in a single payload.
    const bookings =
      from !== null && to !== null
        ? await between(from, to, limit)
        : await upcoming(from ?? new Date(), limit);

    const appointments = await withLeads(bookings);

    return NextResponse.json({
      appointments,
      range: {
        from: (from ?? new Date()).toISOString(),
        to: to === null ? null : to.toISOString(),
      },
    });
  } catch (error) {
    const envError = envErrorResponse(error);
    if (envError) return envError;

    // By far the most likely cause: src/lib/db/appointment-schema.sql has not
    // been applied yet. An empty calendar would read as "nobody has booked",
    // which is the wrong thing for Joey to believe, so the table is named.
    console.error('[dashboard:appointments] query failed:', error);
    return NextResponse.json(
      {
        error:
          'Could not read the calendar. If the appointments table has not been ' +
          'created yet, apply src/lib/db/appointment-schema.sql.',
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import { leadHistory } from '@/lib/services/lead-history';
import { assistantMuteState } from '@/lib/services/assistant-mute';
import { forLead, withLeads, type BookingWithLead } from '@/lib/services/booking';

/**
 * GET /api/dashboard/leads/[id]/history — one lead's full conversation.
 *
 * Requirement 8.6 asks for this to be scoped to a single lead rather than
 * widening the existing dashboard payload, and the reason is worth stating:
 * `/api/dashboard/data` already fetches every lead and every follow-up
 * unbounded on each load. Adding message bodies to it would multiply a payload
 * that is already too eager, and would ship every client's words to the browser
 * to render one.
 *
 * Returns the merged history across chat, SMS and email, plus whether the
 * assistant is currently muted for this lead — the dashboard needs both to
 * render the row, and two round trips for one panel is wasteful.
 *
 * Authorization is the same cookie check as `/api/dashboard/data`, verified
 * here independently (8.7). `/api/*` sits outside the request interceptor's
 * matcher, so this handler cannot assume anything upstream looked.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Before anything else, and before any configuration is asserted, so an
  // unauthenticated caller learns nothing — including whether an id exists.
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Lead id is required' }, { status: 400 });
  }

  try {
    requireEnv('DATABASE_URL');

    const [history, mute] = await Promise.all([
      leadHistory(id),
      assistantMuteState(id),
    ]);

    // Requirement 8.4: bookings alongside the conversation. Resolved outside the
    // Promise.all above and with its own catch, deliberately.
    // src/lib/db/appointment-schema.sql has not been applied yet, so a missing
    // `appointments` relation is the likely case — and inside that Promise.all it
    // would 500 the whole route, taking down the conversation view, which is
    // this panel's primary job and works today. An empty list costs Joey a
    // section; a 500 costs him the transcript.
    const appointments: BookingWithLead[] = await forLead(id)
      .then(withLeads)
      .catch((error: unknown) => {
        console.error(
          `[dashboard:history] appointments unavailable for lead ${id}:`,
          error,
        );
        return [];
      });

    return NextResponse.json({
      leadId: id,
      history,
      assistant: {
        muted: mute.muted,
        reason: mute.reason,
      },
      appointments,
    });
  } catch (error) {
    const envError = envErrorResponse(error);
    if (envError) return envError;

    console.error(`[dashboard:history] query failed for lead ${id}:`, error);
    return NextResponse.json(
      {
        error:
          'Could not read this lead\'s history. If the chat or mute tables have not ' +
          'been created yet, apply src/lib/db/chat-schema.sql and ' +
          'src/lib/db/assistant-mute-schema.sql.',
      },
      { status: 500 },
    );
  }
}

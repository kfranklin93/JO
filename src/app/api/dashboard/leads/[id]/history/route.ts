import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import { leadHistory } from '@/lib/services/lead-history';
import { assistantMuteState } from '@/lib/services/assistant-mute';

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

    return NextResponse.json({
      leadId: id,
      history,
      assistant: {
        muted: mute.muted,
        reason: mute.reason,
      },
      // Requirement 8.4 wants bookings shown alongside the history. There is no
      // appointments table yet, because the assistant cannot book — that is the
      // Calendly work still outstanding. Reported as an explicit empty rather
      // than omitted, so the dashboard can render the section and the gap is
      // visible instead of looking finished.
      appointments: [],
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

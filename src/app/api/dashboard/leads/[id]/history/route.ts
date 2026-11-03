import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import { leadHistory } from '@/lib/services/lead-history';
import { assistantMuteState } from '@/lib/services/assistant-mute';
import { forLead, withLeads, type BookingWithLead } from '@/lib/services/booking';
import { realScoutLeadSnapshot } from '@/lib/services/realscout-lead';

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
 * render the row, and two round trips for one panel is wasteful. It also
 * returns what RealScout knows about the person: their Scout Score and the
 * properties they have been viewing, saving and asking to see.
 *
 * Authorization is the same cookie check as `/api/dashboard/data`, verified
 * here independently (8.7). `/api/*` sits outside the request interceptor's
 * matcher, so this handler cannot assume anything upstream looked. That check
 * is load-bearing for more than the transcript now: the RealScout block is a
 * named person's browsing history, and this route is the only thing that reads
 * it.
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

    // What RealScout knows about this person: their Scout Score and what they
    // have been browsing. Resolved outside the Promise.all above and after the
    // conversation, for the same reason the appointments are — it reaches a
    // third-party API, and a RealScout outage must cost Joey a section rather
    // than the transcript.
    //
    // `realScoutLeadSnapshot` already turns every failure into a reason it can
    // render, so this `catch` is only for the unexpected.
    //
    // This is client browsing behaviour, and the session check at the top of
    // this handler is the only thing between it and the internet. It must not
    // be moved into a route that does not make that check.
    const realscout = await realScoutLeadSnapshot(id).catch((error: unknown) => {
      console.error(
        `[dashboard:history] RealScout snapshot failed for lead ${id}:`,
        error,
      );
      return {
        reason: 'unavailable' as const,
        missingScope: null,
        contact: null,
        activity: [],
      };
    });

    return NextResponse.json({
      leadId: id,
      history,
      assistant: {
        muted: mute.muted,
        reason: mute.reason,
      },
      appointments,
      realscout,
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

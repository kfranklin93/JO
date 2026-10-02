import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import {
  countAnonymousChats,
  listRecentChats,
  MAX_TRANSCRIPTS,
} from '@/lib/services/chat-store';

/**
 * GET /api/dashboard/chats — stored web-chat transcripts, newest first.
 *
 * This returns what visitors typed into the chat panel: budgets, timelines,
 * addresses, and whatever else they volunteered. It is the same class of data as
 * `/api/dashboard/data` and it gets the same boundary — the session cookie is
 * verified here, independently, because `/api/*` sits outside the request
 * interceptor's matcher and this handler cannot assume anything upstream looked.
 *
 * Ordering of the checks matches that route deliberately: authorize first, assert
 * configuration second, so an unauthenticated caller cannot probe which
 * environment variables a deployment is missing.
 */
export async function GET() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    requireEnv('DATABASE_URL');

    const [transcripts, anonymousCount] = await Promise.all([
      listRecentChats(MAX_TRANSCRIPTS),
      countAnonymousChats(),
    ]);

    return NextResponse.json({
      transcripts,
      stats: {
        sessions: transcripts.length,
        anonymous: anonymousCount,
        converted: transcripts.filter((t) => t.session.leadId !== null).length,
      },
    });
  } catch (error) {
    const envError = envErrorResponse(error);
    if (envError) return envError;

    // The most likely cause by far is that src/lib/db/chat-schema.sql has not
    // been applied yet, which makes an empty dashboard the wrong thing to show —
    // it reads as "no one has used the chat" rather than "the table is missing".
    console.error('[dashboard:chats] query failed:', error);
    return NextResponse.json(
      {
        error:
          'Could not read chat transcripts. If the chat tables have not been created yet, apply src/lib/db/chat-schema.sql.',
      },
      { status: 500 },
    );
  }
}

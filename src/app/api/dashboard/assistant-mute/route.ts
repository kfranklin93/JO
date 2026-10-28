import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';
import {
  GLOBAL_SCOPE,
  globalScope,
  leadScope,
  listMutes,
  mute,
  unmute,
} from '@/lib/services/assistant-mute';

/**
 * The assistant's off switches.
 *
 *   GET  — every active mute, for rendering the dashboard controls
 *   POST — `{ scope: 'global' | <leadId>, muted: boolean, note?: string }`
 *
 * One route for both scopes because they are one decision from Joey's side:
 * "stop replying", either to this person or to everyone. Splitting them would
 * mean two routes with identical auth, identical validation and identical
 * failure handling.
 *
 * ## Why POST and not PATCH
 *
 * The body carries the desired state rather than a diff, and the operation is
 * idempotent — posting `muted: true` twice leaves one mute. That is a PUT-ish
 * shape, but the collection is not addressed by URL, so POST is the honest
 * verb and the simplest for a form or a fetch from the dashboard.
 *
 * Authorization is the same cookie check as every other dashboard route,
 * verified here independently because `/api/*` is outside the interceptor's
 * matcher. This one matters more than the read-only routes: it changes
 * behaviour for real visitors.
 */

/** Resolve a request's scope string, or explain why it is not valid. */
function resolveScope(raw: unknown): { scope: string } | { error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { error: 'scope is required' };
  }

  const value = raw.trim();
  if (value === GLOBAL_SCOPE) return { scope: globalScope() };

  try {
    // Throws for anything that is not a uuid, which is what keeps arbitrary
    // strings out of a primary key the database also constrains.
    return { scope: leadScope(value) };
  } catch {
    return { error: "scope must be 'global' or a lead id" };
  }
}

export async function GET() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    requireEnv('DATABASE_URL');

    const mutes = await listMutes();

    return NextResponse.json({
      global: mutes.some((row) => row.scope === GLOBAL_SCOPE),
      mutes,
    });
  } catch (error) {
    const envError = envErrorResponse(error);
    if (envError) return envError;

    console.error('[dashboard:assistant-mute] read failed:', error);
    return NextResponse.json(
      {
        error:
          'Could not read the assistant mute switches. If the table does not ' +
          'exist yet, apply src/lib/db/assistant-mute-schema.sql.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const resolved = resolveScope(body.scope);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  if (typeof body.muted !== 'boolean') {
    return NextResponse.json(
      { error: 'muted must be true or false' },
      { status: 400 },
    );
  }

  const note = typeof body.note === 'string' && body.note.trim()
    ? body.note.trim().slice(0, 500)
    : undefined;

  try {
    requireEnv('DATABASE_URL');

    if (body.muted) {
      await mute(resolved.scope, note);
    } else {
      await unmute(resolved.scope);
    }

    console.log(
      `[dashboard:assistant-mute] ${resolved.scope} ${body.muted ? 'muted' : 'unmuted'}`,
    );

    return NextResponse.json({ scope: resolved.scope, muted: body.muted });
  } catch (error) {
    const envError = envErrorResponse(error);
    if (envError) return envError;

    // Reported honestly rather than optimistically. A switch that reports
    // success without flipping would leave Joey believing the assistant is
    // silent while it keeps replying — the one outcome this feature exists to
    // prevent.
    console.error('[dashboard:assistant-mute] write failed:', error);
    return NextResponse.json(
      { error: 'Could not change the assistant mute switch' },
      { status: 500 },
    );
  }
}

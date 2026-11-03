import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { envErrorResponse } from '@/lib/utils/require-env';
import { previewImport, runImport } from '@/lib/services/lead-import';

/**
 * POST /api/dashboard/leads/import — bulk client-database import.
 *
 * Body: `{ text: string, commit?: boolean }`
 *
 *   - `commit` absent or false → the plan only. Nothing is written.
 *   - `commit: true`           → the plan is recomputed and then written.
 *
 * One route for both, because the preview is only trustworthy if it is produced
 * by the code that performs the write. Two endpoints would be two
 * implementations of "which rows count as duplicates", and the first time they
 * disagreed the screen would describe an import that did not happen.
 *
 * ## Why the commit does not accept the plan it previewed
 *
 * The browser sends the same text back and the server re-plans it. Accepting a
 * client-supplied list of rows to insert would make this endpoint a general
 * "write these rows to the lead table" primitive, which is a much larger thing
 * to have sitting behind one cookie. Re-planning also catches the table
 * changing between the preview and the confirmation — a web form that arrived
 * in that gap makes an address that was new a minute ago an existing one, and
 * the result report says so.
 *
 * Authorization is the same cookie check as every sibling route, verified here
 * independently because `/api/*` is outside the interceptor's matcher. No other
 * auth mechanism is introduced.
 */

/**
 * Upper bound on the pasted text.
 *
 * `MAX_IMPORT_ROWS` is 1,000 and a generous contact row is a few hundred
 * characters, so this is several times the largest legitimate input. It exists
 * so a mis-paste is refused by a sentence rather than by a function timeout
 * halfway through parsing.
 */
const MAX_TEXT_LENGTH = 1_000_000;

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

  if (typeof body.text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  if (body.text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: 'That text is too large to import in one go. Split the file.' },
      { status: 413 }
    );
  }

  if (body.commit !== undefined && typeof body.commit !== 'boolean') {
    return NextResponse.json(
      { error: 'commit must be true or false' },
      { status: 400 }
    );
  }

  const commit = body.commit === true;

  try {
    if (!commit) {
      const preview = await previewImport(body.text);
      if (!preview.ok) {
        return NextResponse.json({ error: preview.error }, { status: 422 });
      }
      return NextResponse.json({ committed: false, plan: preview.plan });
    }

    const outcome = await runImport(body.text);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: 422 });
    }

    const { plan, created, followUpsCreated, wrote, batchId } = outcome.result;

    return NextResponse.json({
      committed: true,
      wrote,
      batchId,
      plan,
      created,
      createdCount: created.length,
      // Stated rather than implied. The whole point of this path is that it
      // queues no marketing email to a contact who never opted in, and the
      // result report is where Joey can see that it did not.
      followUpsCreated,
    });
  } catch (error) {
    const envError = envErrorResponse(error);
    if (envError) return envError;

    // The write is a single transaction, so a fault here means nothing landed.
    // Saying so explicitly matters more than usual: the alternative reading —
    // "some unknown subset of 200 contacts was imported" — is the one state
    // nobody can clean up.
    console.error('[dashboard:import] failed:', error);
    return NextResponse.json(
      {
        error: commit
          ? 'The import failed and nothing was written. No contacts were imported.'
          : 'Could not read those rows.',
      },
      { status: 500 }
    );
  }
}

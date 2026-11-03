import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';
import { envErrorResponse } from '@/lib/utils/require-env';
import { formatFieldErrors, leadSubmissionSchema } from '@/lib/validation/lead';
import { leadStatusSchema } from '@/lib/validation/lead-status';
import { createManualLead } from '@/lib/services/lead-import';

/**
 * POST /api/dashboard/leads — Joey enters an off-platform lead by hand.
 *
 * Body:
 *
 *   {
 *     name, email, phone?, intent, status, notes?,
 *     scheduleFollowUps?: boolean   // defaults to false
 *   }
 *
 * This is the first write path under `/api/dashboard/` other than the assistant
 * mute switch, so it is held to the same boundary as the read-only routes next
 * to it: the session cookie is verified here, independently and first, because
 * `/api/*` is outside the request interceptor's matcher and this handler cannot
 * assume anything upstream looked. Configuration is asserted after that, inside
 * the service, so an unauthenticated caller cannot probe which variables a
 * deployment is missing. No second auth mechanism is introduced.
 *
 * ## Validation is the public form's validation
 *
 * The body goes through `leadSubmissionSchema`, which is what `POST /api/leads`
 * and the client-side submit helper use. A lead Joey types in therefore has to
 * satisfy exactly what a visitor's submission satisfies — same email check,
 * same name splitting, same column-width caps — so the dashboard cannot write a
 * row shape the rest of the app does not expect. `status` is the one field the
 * public schema has no opinion about, because a website submission is always
 * `new`; it is validated separately against the database enum.
 *
 * ## `scheduleFollowUps` defaults to false
 *
 * Omitting it means no drip. Only an explicit `true` queues the five-touch
 * sequence — see `createManualLead` for why the default sits that way round.
 */

/** 1000 chars is the `additionalNotes` cap in `leadSubmissionSchema`'s limits. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
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

  // `notes` on the wire, `additionalNotes` in the schema. The form's label is
  // "Notes"; renaming the field in the schema would touch the public form.
  const notes = readString(body.notes);

  const parsed = leadSubmissionSchema.safeParse({
    name: body.name,
    email: body.email,
    ...(readString(body.phone) === undefined ? {} : { phone: body.phone }),
    intent: body.intent,
    ...(notes === undefined ? {} : { additionalNotes: notes }),
  });

  const status = leadStatusSchema.safeParse(body.status);

  // Both halves are reported together. Returning the lead errors first and the
  // status error on the next attempt would walk Joey through two round trips to
  // discover two problems with one form.
  if (!parsed.success || !status.success) {
    return NextResponse.json(
      {
        error: 'Some fields need fixing',
        fieldErrors: {
          ...(parsed.success ? {} : formatFieldErrors(parsed.error)),
          ...(status.success ? {} : { status: 'Select a status' }),
        },
      },
      { status: 422 }
    );
  }

  if (body.scheduleFollowUps !== undefined && typeof body.scheduleFollowUps !== 'boolean') {
    return NextResponse.json(
      { error: 'scheduleFollowUps must be true or false' },
      { status: 400 }
    );
  }

  try {
    const result = await createManualLead(parsed.data, {
      status: status.data,
      scheduleFollowUps: body.scheduleFollowUps === true,
    });

    console.log(
      `[dashboard:leads] created ${result.leadId} status=${result.status} ` +
        `followUps=${result.followUpsCreated}`
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const envError = envErrorResponse(error);
    if (envError) return envError;

    // Reported as a failure rather than optimistically. A form that says
    // "saved" without writing is how a referral gets lost — Joey has no other
    // copy of a name he took down on a phone call.
    console.error('[dashboard:leads] write failed:', error);
    return NextResponse.json({ error: 'Could not save that lead' }, { status: 500 });
  }
}

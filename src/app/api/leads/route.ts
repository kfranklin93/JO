import { NextRequest, NextResponse } from 'next/server';
import { sendImmediateFollowUp } from '@/lib/services/follow-up-scheduler';
import { sendLeadToLofty } from '@/lib/api/lofty';
import { notifyJoeyOfNewLead } from '@/lib/services/email-service';
import { sendSMSAlert } from '@/lib/services/sms-service';
import type { Lead } from '@/lib/services/follow-up-scheduler';
import { db, leads, followUps } from '@/lib/db';
import { markSent, recordFailure } from '@/lib/db/follow-up-queue';
import { formatFieldErrors, leadSubmissionSchema } from '@/lib/validation/lead';
import { envErrorResponse, requireEnv } from '@/lib/utils/require-env';

/** The touchpoint this request sends itself, rather than leaving to the cron. */
const IMMEDIATE_TEMPLATE_TYPE = 'immediate';

/**
 * Every follow-up touchpoint created alongside a new lead.
 *
 * The immediate one is included even though this request sends it inline. It was
 * previously sent with no row at all, which cost the dashboard a touchpoint per
 * lead and — worse — left a failed immediate send with nothing to retry from.
 *
 * It is inserted as `sending`, not `scheduled`. The transaction commits before
 * the inline send finishes, so for that window the row exists but the email does
 * not. A cron run landing in that window would find a `scheduled` row that is
 * already due and claim it, and the lead would get the same email twice.
 * `sending` means the row arrives already claimed by this request, so the cron's
 * claim predicate passes over it. The cost is that a request killed between the
 * commit and the outcome update leaves the row in `sending` — which is exactly
 * the stranded-row case the claim's STALE_CLAIM_MS reclaim exists for, so it
 * self-heals on a later run instead of being lost.
 */
const FOLLOW_UP_SCHEDULE = [
  { templateType: IMMEDIATE_TEMPLATE_TYPE, offsetDays: 0, status: 'sending' },
  { templateType: 'day3', offsetDays: 3, status: 'scheduled' },
  { templateType: 'day7', offsetDays: 7, status: 'scheduled' },
  { templateType: 'day14', offsetDays: 14, status: 'scheduled' },
  { templateType: 'day30', offsetDays: 30, status: 'scheduled' },
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Move the immediate follow-up's row out of `sending` to match what happened.
 *
 * Delegates to the queue rather than issuing its own UPDATE so the retry policy
 * stays in one place: `recordFailure` is what decides that a first failure is
 * worth another attempt, and it returns the row to `scheduled` so the next cron
 * run picks it up (Requirement 6.3).
 *
 * `currentAttempts` is 0 because the row was created by this request and the
 * inline send was its first delivery attempt.
 *
 * A failure to write the outcome is logged and swallowed. The lead is already
 * committed and the email has already been sent or not; turning that into a 500
 * would tell the visitor to submit again and duplicate the lead. The row stays
 * in `sending` and is reclaimed after the queue's staleness threshold.
 */
async function recordImmediateOutcome(
  followUpId: string,
  failureReason: string | null
): Promise<void> {
  try {
    if (failureReason === null) {
      await markSent(followUpId);
    } else {
      await recordFailure(followUpId, failureReason, 0);
    }
  } catch (error) {
    console.error('❌ Failed to record the immediate follow-up outcome:', error);
  }
}

export async function POST(request: NextRequest) {
  // Malformed JSON is a client framing error, distinct from a payload that
  // parses but fails validation, so it gets its own status.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const parsed = leadSubmissionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        fieldErrors: formatFieldErrors(parsed.error),
      },
      { status: 422 }
    );
  }

  // Everything downstream reads from the validated result. The raw body is not
  // touched again, so no unvalidated value can reach the database or an email.
  const submission = parsed.data;

  try {
    // Checked before the write, not after. A 503 here means nothing was stored
    // and nothing was sent, so the visitor's retry after configuration is fixed
    // does not produce a duplicate lead with a second drip sequence.
    requireEnv('DATABASE_URL', 'RESEND_API_KEY');

    // The lead and its follow-up schedule are written together. A partial write
    // previously left an orphaned lead behind while returning 500, so the
    // visitor retried and produced a duplicate with a second drip sequence.
    //
    // The WebSocket driver in src/lib/db/index.ts supports transactions; the
    // neon-http driver would not.
    const created = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(leads)
        .values({
          email: submission.email,
          phone: submission.phone ?? null,
          firstName: submission.firstName,
          lastName: submission.lastName ?? null,
          fullName: submission.fullName,
          propertyInterest: submission.intent,
          timeline: submission.timeline ?? null,
          formData: {
            budget: submission.budget ?? null,
            location: submission.location ?? null,
            bedrooms: submission.bedrooms ?? null,
            bathrooms: submission.bathrooms ?? null,
            propertyType: submission.propertyType ?? null,
            additionalNotes: submission.additionalNotes ?? null,
          },
          status: 'new',
          // The DB `lead_source` enum and the `LeadSource` type enum in
          // src/types/lead.ts use different vocabularies. Both forms are website
          // forms, so this is set directly rather than translated.
          source: 'website_form',
        })
        .returning();

      const inserted = rows[0];
      if (!inserted) {
        // Throwing rather than returning keeps the rollback path uniform.
        throw new Error('Lead insert returned no row');
      }

      const followUpRows = await tx
        .insert(followUps)
        .values(
          FOLLOW_UP_SCHEDULE.map(({ templateType, offsetDays, status }) => ({
            leadId: inserted.id,
            templateType,
            scheduledFor: new Date(
              inserted.createdAt.getTime() + offsetDays * MS_PER_DAY
            ),
            status,
          }))
        )
        .returning({ id: followUps.id, templateType: followUps.templateType });

      const immediate = followUpRows.find(
        (row) => row.templateType === IMMEDIATE_TEMPLATE_TYPE
      );
      if (!immediate) {
        // Without this id the row cannot be moved out of `sending`, so it would
        // sit there until the staleness reclaim and then be sent a second time.
        // Rolling back and reporting failure lets the visitor retry into a clean
        // record instead, matching how a missing lead row is handled above.
        throw new Error('Immediate follow-up insert returned no row');
      }

      return { lead: inserted, immediateFollowUpId: immediate.id };
    });

    const { lead: savedLead, immediateFollowUpId } = created;

    console.log('New lead saved to database:', savedLead.id);

    // Optional keys are absent rather than undefined on `submission`, so
    // spreading the remainder satisfies exactOptionalPropertyTypes without a
    // conditional per field.
    const { fullName, firstName, lastName, email, intent, ...optionalDetails } =
      submission;

    const lead: Lead = {
      id: savedLead.id,
      name: fullName,
      email,
      intent,
      createdAt: savedLead.createdAt,
      status: 'new',
      ...optionalDetails,
    };

    const succeeded = (result: PromiseSettledResult<boolean>): boolean =>
      result.status === 'fulfilled' && result.value;

    // Integrations run outside the persistence path. A Resend or Twilio outage
    // must not discard a lead that is already stored.
    //
    // The immediate follow-up is awaited first, on its own, because Joey's
    // notification states whether the lead has actually heard from us. Running
    // it alongside the notification meant that claim could not be based on the
    // real outcome, so it was hardcoded and became a lie whenever the send
    // failed.
    const [followUpResult] = await Promise.allSettled([
      sendImmediateFollowUp(lead),
    ]);

    const immediateFollowUpSent =
      followUpResult!.status === 'fulfilled' && followUpResult!.value.ok;

    // Null on success. Otherwise the real reason — a thrown error stringified, or
    // the reason the send result carried — so `failure_reason` on the row says
    // what actually went wrong rather than a generic 'Send failed'.
    const immediateFailureReason: string | null = immediateFollowUpSent
      ? null
      : followUpResult!.status === 'rejected'
        ? String(followUpResult!.reason)
        : followUpResult!.value.ok
          ? null
          : followUpResult!.value.reason;

    if (immediateFailureReason !== null) {
      console.error('❌ Immediate follow-up failed:', immediateFailureReason);
    }

    // Before the notifications, because the row is the durable record of what
    // happened. The notifications are advisory; this is what the dashboard reads
    // and what the cron retries from.
    await recordImmediateOutcome(immediateFollowUpId, immediateFailureReason);

    const [loftyResult, emailResult, smsResult] = await Promise.allSettled([
      sendLeadToLofty(lead),
      notifyJoeyOfNewLead(lead, { immediateFollowUpSent }),
      sendSMSAlert(
        `🔥 New ${lead.intent.toUpperCase()} Lead`,
        `${lead.name}\n${lead.email}\n${lead.phone ?? 'No phone'}\n${lead.location ?? ''} | ${lead.budget ?? ''}`
      ),
    ]);

    if (immediateFollowUpSent) {
      console.log('✅ Immediate follow-up sent to:', lead.email);
    }

    if (succeeded(loftyResult)) {
      console.log('✅ Lead synced to Lofty CRM');
    } else {
      console.warn('⚠️  Lofty CRM sync skipped or failed');
    }

    if (succeeded(emailResult)) {
      console.log('✅ Joey notified via email');
    } else {
      console.error('❌ Failed to send email notification');
    }

    if (succeeded(smsResult)) {
      console.log('✅ Joey notified via SMS');
    } else {
      console.warn('⚠️  SMS notification skipped or failed');
    }

    return NextResponse.json(
      {
        success: true,
        leadId: savedLead.id,
        message: 'Lead submitted successfully',
        integrations: {
          followUp: immediateFollowUpSent,
          loftyCRM: succeeded(loftyResult),
          emailNotification: succeeded(emailResult),
          smsAlert: succeeded(smsResult),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // Missing configuration is a deployment gap, not a request failure, so it
    // gets a 503 naming the variable instead of an opaque 500.
    const configError = envErrorResponse(error);
    if (configError) return configError;

    console.error('Lead submission error:', error);
    return NextResponse.json({ error: 'Failed to submit lead' }, { status: 500 });
  }
}

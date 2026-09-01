import { NextRequest, NextResponse } from 'next/server';
import { sendImmediateFollowUp } from '@/lib/services/follow-up-scheduler';
import { sendLeadToLofty } from '@/lib/api/lofty';
import { notifyJoeyOfNewLead } from '@/lib/services/email-service';
import { sendSMSAlert } from '@/lib/services/sms-service';
import type { Lead } from '@/lib/services/follow-up-scheduler';
import { db, leads, followUps } from '@/lib/db';
import { formatFieldErrors, leadSubmissionSchema } from '@/lib/validation/lead';

/**
 * Scheduled follow-up touchpoints created alongside every new lead.
 *
 * The immediate touchpoint is sent inline below and is not represented here;
 * recording it as a row is handled by the follow-up-automation spec.
 */
const FOLLOW_UP_SCHEDULE = [
  { templateType: 'day3', offsetDays: 3 },
  { templateType: 'day7', offsetDays: 7 },
  { templateType: 'day14', offsetDays: 14 },
  { templateType: 'day30', offsetDays: 30 },
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
    // The lead and its follow-up schedule are written together. A partial write
    // previously left an orphaned lead behind while returning 500, so the
    // visitor retried and produced a duplicate with a second drip sequence.
    //
    // The WebSocket driver in src/lib/db/index.ts supports transactions; the
    // neon-http driver would not.
    const savedLead = await db.transaction(async (tx) => {
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

      await tx.insert(followUps).values(
        FOLLOW_UP_SCHEDULE.map(({ templateType, offsetDays }) => ({
          leadId: inserted.id,
          templateType,
          scheduledFor: new Date(
            inserted.createdAt.getTime() + offsetDays * MS_PER_DAY
          ),
          status: 'scheduled' as const,
        }))
      );

      return inserted;
    });

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

    // Integrations run outside the persistence path. A Resend or Twilio outage
    // must not discard a lead that is already stored.
    const [followUpResult, loftyResult, emailResult, smsResult] =
      await Promise.allSettled([
        sendImmediateFollowUp(lead),
        sendLeadToLofty(lead),
        notifyJoeyOfNewLead(lead),
        sendSMSAlert(
          `🔥 New ${lead.intent.toUpperCase()} Lead`,
          `${lead.name}\n${lead.email}\n${lead.phone ?? 'No phone'}\n${lead.location ?? ''} | ${lead.budget ?? ''}`
        ),
      ]);

    const succeeded = (result: PromiseSettledResult<boolean>): boolean =>
      result.status === 'fulfilled' && result.value;

    if (succeeded(followUpResult)) {
      console.log('✅ Immediate follow-up sent to:', lead.email);
    } else {
      console.error('❌ Failed to send immediate follow-up');
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
          followUp: succeeded(followUpResult),
          loftyCRM: succeeded(loftyResult),
          emailNotification: succeeded(emailResult),
          smsAlert: succeeded(smsResult),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Lead submission error:', error);
    return NextResponse.json({ error: 'Failed to submit lead' }, { status: 500 });
  }
}

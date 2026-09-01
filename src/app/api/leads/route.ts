import { NextRequest, NextResponse } from 'next/server';
import { sendImmediateFollowUp } from '@/lib/services/follow-up-scheduler';
import { sendLeadToLofty } from '@/lib/api/lofty';
import { notifyJoeyOfNewLead } from '@/lib/services/email-service';
import { sendSMSAlert } from '@/lib/services/sms-service';
import type { Lead } from '@/lib/services/follow-up-scheduler';
import { db, leads, followUps } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.email || !body.intent) {
      return NextResponse.json(
        { error: 'Name, email, and intent are required' },
        { status: 400 }
      );
    }

    // Persist to database first
    const nameParts = (body.name as string).trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || null;

    const rows = await db
      .insert(leads)
      .values({
        email: body.email,
        phone: body.phone ?? null,
        firstName,
        lastName,
        fullName: body.name,
        propertyInterest: body.intent,
        timeline: body.timeline ?? null,
        formData: {
          budget: body.budget ?? null,
          location: body.location ?? null,
          bedrooms: body.bedrooms ?? null,
          bathrooms: body.bathrooms ?? null,
          propertyType: body.propertyType ?? null,
          additionalNotes: body.additionalNotes ?? null,
        },
        status: 'new',
        source: 'website_form',
      })
      .returning();

    const savedLead = rows[0];
    if (!savedLead) {
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 });
    }

    // Create lead object for downstream integrations
    const lead: Lead = {
      id: savedLead.id,
      name: body.name,
      email: body.email,
      phone: body.phone,
      intent: body.intent,
      budget: body.budget,
      timeline: body.timeline,
      location: body.location,
      bedrooms: body.bedrooms,
      bathrooms: body.bathrooms,
      propertyType: body.propertyType,
      additionalNotes: body.additionalNotes,
      createdAt: savedLead.createdAt,
      status: 'new',
    };

    // Schedule future follow-ups in the DB so the cron job can process them
    const createdAt = savedLead.createdAt;
    const day = 24 * 60 * 60 * 1000;
    await db.insert(followUps).values([
      {
        leadId: savedLead.id,
        templateType: 'day3',
        scheduledFor: new Date(createdAt.getTime() + 3 * day),
        status: 'scheduled',
      },
      {
        leadId: savedLead.id,
        templateType: 'day7',
        scheduledFor: new Date(createdAt.getTime() + 7 * day),
        status: 'scheduled',
      },
      {
        leadId: savedLead.id,
        templateType: 'day14',
        scheduledFor: new Date(createdAt.getTime() + 14 * day),
        status: 'scheduled',
      },
      {
        leadId: savedLead.id,
        templateType: 'day30',
        scheduledFor: new Date(createdAt.getTime() + 30 * day),
        status: 'scheduled',
      },
    ]);

    console.log('New lead saved to database:', savedLead.id);

    // Run all integrations in parallel (don't block on failures)
    const [followUpResult, loftyResult, emailResult, smsResult] = await Promise.allSettled([
      // 1. Send immediate follow-up to lead
      sendImmediateFollowUp(lead),
      
      // 2. Sync to Lofty CRM
      sendLeadToLofty(lead),
      
      // 3. Notify Joey via email
      notifyJoeyOfNewLead(lead),
      
      // 4. Send SMS alert to Joey
      sendSMSAlert(
        `🔥 New ${lead.intent.toUpperCase()} Lead`,
        `${lead.name}\n${lead.email}\n${lead.phone || 'No phone'}\n${lead.location || ''} | ${lead.budget || ''}`
      ),
    ]);

    // Log results
    if (followUpResult.status === 'fulfilled' && followUpResult.value) {
      console.log('✅ Immediate follow-up sent to:', lead.email);
    } else {
      console.error('❌ Failed to send immediate follow-up');
    }

    if (loftyResult.status === 'fulfilled' && loftyResult.value) {
      console.log('✅ Lead synced to Lofty CRM');
    } else {
      console.warn('⚠️  Lofty CRM sync skipped or failed');
    }

    if (emailResult.status === 'fulfilled' && emailResult.value) {
      console.log('✅ Joey notified via email');
    } else {
      console.error('❌ Failed to send email notification');
    }

    if (smsResult.status === 'fulfilled' && smsResult.value) {
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
          followUp: followUpResult.status === 'fulfilled' && followUpResult.value,
          loftyCRM: loftyResult.status === 'fulfilled' && loftyResult.value,
          emailNotification: emailResult.status === 'fulfilled' && emailResult.value,
          smsAlert: smsResult.status === 'fulfilled' && smsResult.value,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Lead submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit lead' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { sendImmediateFollowUp } from '@/lib/services/follow-up-scheduler';
import { sendLeadToLofty } from '@/lib/api/lofty';
import { notifyJoeyOfNewLead } from '@/lib/services/email-service';
import { sendSMSAlert } from '@/lib/services/sms-service';
import type { Lead } from '@/lib/services/follow-up-scheduler';

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

    // Create lead object
    const lead: Lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
      createdAt: new Date(),
      status: 'new',
    };

    console.log('New lead created:', lead.id);

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
        leadId: lead.id,
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

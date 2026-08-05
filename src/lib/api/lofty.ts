import { env } from '@/config/env';
import type { Lead } from '@/lib/services/follow-up-scheduler';

export interface LoftyContact {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source: string;
  status: string;
  tags?: string[];
  customFields?: Record<string, any>;
}

/**
 * Send a lead to Lofty CRM
 */
export async function sendLeadToLofty(lead: Lead): Promise<boolean> {
  if (!env.LOFTY_API_BASE_URL || !env.LOFTY_API_KEY) {
    console.warn('Lofty CRM not configured, skipping sync');
    return false;
  }

  try {
    // Split name into first and last
    const nameParts = lead.name.trim().split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Map lead intent to Lofty tags
    const tags = [
      lead.intent,
      lead.location ? `location:${lead.location}` : null,
      lead.budget ? 'budget-provided' : null,
    ].filter(Boolean) as string[];

    // Prepare Lofty contact data
    const loftyContact: LoftyContact = {
      firstName,
      lastName,
      email: lead.email,
      ...(lead.phone && { phone: lead.phone }),
      source: 'Website Lead Form',
      status: 'New Lead',
      tags,
      customFields: {
        intent: lead.intent,
        budget: lead.budget,
        timeline: lead.timeline,
        location: lead.location,
        bedrooms: lead.bedrooms,
        bathrooms: lead.bathrooms,
        propertyType: lead.propertyType,
        additionalNotes: lead.additionalNotes,
        submittedAt: lead.createdAt.toISOString(),
      },
    };

    // Send to Lofty CRM
    const response = await fetch(`${env.LOFTY_API_BASE_URL}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.LOFTY_API_KEY}`,
      },
      body: JSON.stringify(loftyContact),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Lofty CRM error:', error);
      return false;
    }

    const result = await response.json();
    console.log('Lead synced to Lofty CRM:', result.id || result);
    return true;
  } catch (error) {
    console.error('Failed to sync lead to Lofty CRM:', error);
    return false;
  }
}

/**
 * Update a lead in Lofty CRM
 */
export async function updateLoftyContact(
  contactId: string,
  updates: Partial<LoftyContact>
): Promise<boolean> {
  if (!env.LOFTY_API_BASE_URL || !env.LOFTY_API_KEY) {
    console.warn('Lofty CRM not configured');
    return false;
  }

  try {
    const response = await fetch(
      `${env.LOFTY_API_BASE_URL}/contacts/${contactId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.LOFTY_API_KEY}`,
        },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Lofty CRM update error:', error);
      return false;
    }

    console.log('Lofty contact updated:', contactId);
    return true;
  } catch (error) {
    console.error('Failed to update Lofty contact:', error);
    return false;
  }
}

/**
 * Add a note to a Lofty contact
 */
export async function addLoftyNote(
  contactId: string,
  note: string
): Promise<boolean> {
  if (!env.LOFTY_API_BASE_URL || !env.LOFTY_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(
      `${env.LOFTY_API_BASE_URL}/contacts/${contactId}/notes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.LOFTY_API_KEY}`,
        },
        body: JSON.stringify({ note }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Failed to add Lofty note:', error);
    return false;
  }
}

// Made with Bob

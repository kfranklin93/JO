/**
 * Client-side lead submission helper.
 *
 * Shared by both `/get-started` and the homepage inquiry modal so the two forms
 * issue identical requests and interpret the 201/422/500 contract identically.
 * Returning a discriminated union rather than throwing keeps the calling
 * components straightforward: a 422 becomes `fieldErrors`, anything else becomes
 * a single `message`.
 */

import type { LeadSubmissionInput } from '@/lib/validation/lead';

export type SubmitLeadResult =
  | { ok: true; leadId: string }
  | { ok: false; fieldErrors: Record<string, string>; message?: never }
  | { ok: false; message: string; fieldErrors?: never };

/**
 * Submit a lead to `POST /api/leads`.
 *
 * @param input - The lead data to submit (validated by the server)
 * @returns A discriminated union: success with leadId, field errors on 422, or
 *          a general message for any other failure
 */
export async function submitLead(
  input: LeadSubmissionInput
): Promise<SubmitLeadResult> {
  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (response.ok) {
      const data = await response.json();
      return { ok: true, leadId: data.leadId };
    }

    if (response.status === 422) {
      const data = await response.json();
      return {
        ok: false,
        fieldErrors: data.fieldErrors ?? {},
      };
    }

    // Any other error status (400, 500, etc.)
    const data = await response.json().catch(() => ({ error: 'An error occurred' }));
    return {
      ok: false,
      message: data.error ?? 'Failed to submit. Please try again.',
    };
  } catch (error) {
    // Network failure, CORS, or other fetch-level error
    return {
      ok: false,
      message: 'Network error. Please check your connection and try again.',
    };
  }
}

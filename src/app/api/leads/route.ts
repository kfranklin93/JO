import { NextRequest, NextResponse } from 'next/server';
import { captureLead } from '@/lib/services/lead-capture';
import { envErrorResponse } from '@/lib/utils/require-env';

/**
 * POST /api/leads
 *
 * HTTP only. Parsing the body, choosing a status code and shaping the JSON are
 * this file's whole job; what happens to a lead lives in
 * src/lib/services/lead-capture.ts so a non-HTTP caller (the AI assistant's
 * `capture_lead` tool) reaches the same pipeline without going through a
 * request.
 */
export async function POST(request: NextRequest) {
  // Malformed JSON is a client framing error, distinct from a payload that
  // parses but fails validation, so it gets its own status. It is also the one
  // failure the service cannot report, because it happens before there is any
  // input to hand over.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  try {
    const outcome = await captureLead(rawBody);

    if (!outcome.ok) {
      return NextResponse.json(
        { error: 'Validation failed', fieldErrors: outcome.fieldErrors },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        leadId: outcome.leadId,
        message: 'Lead submitted successfully',
        integrations: outcome.integrations,
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

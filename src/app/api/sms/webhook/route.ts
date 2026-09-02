import { NextRequest } from 'next/server';
import { validateRequest } from 'twilio';
import { env } from '@/config/env';
import { generateJoeyEmail } from '@/lib/api/bedrock';
import { JOEY_PERSONALITY, buildSmsReplyPrompt } from '@/lib/prompts/joey-voice';
import { sendSMS } from '@/lib/services/sms-service';

/**
 * Inbound SMS webhook.
 *
 * The request itself is untrusted, not just its contents: this endpoint spends
 * money on every invocation (a Bedrock completion plus an outbound SMS), so the
 * Twilio signature is validated before anything else runs.
 */

/** An empty TwiML document. Twilio expects XML on every response, including errors. */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Build a TwiML response. Used for success, rejection, and handler errors alike. */
function twimlResponse(status = 200): Response {
  return new Response(EMPTY_TWIML, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

/**
 * Take the first entry of a potentially comma-joined proxy header.
 *
 * Proxies append rather than replace, so `x-forwarded-host` can arrive as
 * `public.example.com, internal.netlify` — the original client-facing value is
 * the first one.
 */
function firstHeaderValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const first = value.split(',')[0]?.trim();
  return first ? first : undefined;
}

/**
 * Reconstruct the public URL Twilio signed.
 *
 * Twilio computes the signature over the URL configured in its console. Behind
 * Netlify's proxy, `request.url` can carry an internal host and `http`, which
 * would make every signature fail. The forwarded headers carry the values the
 * client actually saw, so they take precedence, with `request.url` as the
 * last-resort fallback for local and direct requests.
 */
export function reconstructPublicUrl(request: NextRequest): string {
  const requestUrl = new URL(request.url);

  const protocol =
    firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
    requestUrl.protocol.replace(/:$/, '');

  const host =
    firstHeaderValue(request.headers.get('x-forwarded-host')) ??
    firstHeaderValue(request.headers.get('host')) ??
    requestUrl.host;

  // The query string is preserved because Twilio signs the configured URL
  // verbatim, and it POSTs to exactly that URL. If the configured URL has no
  // query string, there is nothing here to drop.
  return `${protocol}://${host}${requestUrl.pathname}${requestUrl.search}`;
}

/**
 * Flatten form fields into the shape `validateRequest` expects.
 *
 * Twilio only ever posts scalar fields; any file part would not be part of the
 * signed payload, so it is skipped rather than coerced.
 */
function toSignedParams(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      params[key] = value;
    }
  }
  return params;
}

export async function POST(request: NextRequest) {
  const authToken = env.TWILIO_AUTH_TOKEN;

  // Fail closed. An unset token means validation is impossible, not optional —
  // skipping the check here would leave the endpoint open on any deploy that
  // forgot the variable.
  if (!authToken) {
    console.error(
      'SMS webhook rejected: TWILIO_AUTH_TOKEN is not configured, so the signature cannot be validated'
    );
    return twimlResponse(403);
  }

  const signature = request.headers.get('x-twilio-signature');
  if (!signature) {
    console.warn('SMS webhook rejected: x-twilio-signature header absent');
    return twimlResponse(403);
  }

  // The body is read only because the signature covers it. Nothing derived from
  // it is used before validation succeeds.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    console.warn('SMS webhook rejected: body could not be parsed as form data');
    return twimlResponse(403);
  }

  const url = reconstructPublicUrl(request);
  if (!validateRequest(authToken, signature, url, toSignedParams(formData))) {
    console.warn(`SMS webhook rejected: signature did not validate for ${url}`);
    return twimlResponse(403);
  }

  try {
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;

    console.log(`SMS received from ${from}: ${body}`);

    // TODO: Fetch conversation history from database
    const conversationHistory: string[] = [];

    // Build context for AI. The inbound body is untrusted, so it is enclosed
    // in a delimited data block rather than interpolated into the instruction.
    const prompt = buildSmsReplyPrompt(body, conversationHistory);

    // Generate AI response
    const aiResponse = await generateJoeyEmail(prompt, JOEY_PERSONALITY);

    // Send SMS response
    await sendSMS(from, aiResponse);

    // TODO: Save conversation to database
    // await saveConversation({ from, body, response: aiResponse, messageId });

    return twimlResponse(200);
  } catch (error) {
    console.error('SMS webhook error:', error);
    return twimlResponse(500);
  }
}

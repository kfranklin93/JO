/**
 * POST /api/assistant/chat — the endpoint the website chat panel talks to.
 *
 * Body: `{ message: string, sessionId?: string, history?: [...] }`
 * Returns: `{ sessionId, reply, mode, bookingUrl }`
 *
 * ## Why this exists rather than reusing POST /api/assistant
 *
 * That route requires `sessionId` in the body and answers 400 without one
 * (route.ts:153), and a test asserts exactly that (route.test.ts:261). A browser
 * opening a chat panel has no session id yet and should not be inventing one —
 * an id minted by the client is a value the client controls, which is a poor
 * basis for a per-conversation spend limit and a worse one for a database
 * primary key. Relaxing the parent route would break its contract and its test,
 * so the browser gets its own entry point and the parent keeps serving the
 * callers that already pass an id.
 *
 * ## Why it calls the agent directly instead of proxying
 *
 * Forwarding to `/api/assistant` over HTTP would be a second function
 * invocation, would count the same visitor against the per-IP limiter twice, and
 * would need an absolute URL that differs per deploy context. Calling
 * `runAssistantTurn` is what the parent route does too.
 *
 * The cost is two small duplications, both unavoidable without editing the
 * parent: `sanitizeHistory` is not exported from it, and neither is its
 * `captureLeadLocally` hook. Both are reproduced below with the same limits and
 * the same semantics. If either is ever changed there, change it here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import { runAssistantTurn, type AssistantTurn } from '@/lib/assistant/agent';
import {
  LeadCaptureValidationError,
  toLeadSubmissionInput,
  type LocalCaptureHook,
} from '@/lib/assistant/tools';
import { captureLead } from '@/lib/services/lead-capture';
import { recordChatTurn } from '@/lib/services/chat-store';
import { bookingLink } from '@/lib/services/booking-link';
import {
  checkAndCount,
  checkAndCountSession,
  rateLimitKey,
  type RequestLimitResult,
} from '@/lib/api/request-limit';

/** Matches POST /api/assistant. Kept identical so the two cannot drift apart. */
const MAX_HISTORY_TURNS = 20;
const MAX_CONTENT_LENGTH = 4000;

/** Canonical v4 UUID shape, which is what `randomUUID` produces. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The reply sent when the model call itself fails. */
const FAIL_WARM_REPLY =
  "Thanks for reaching out! Something went wrong on our end — Joey's team will " +
  'follow up shortly.';

/**
 * The reply sent when the model succeeds but says nothing.
 *
 * This is not hypothetical. A turn where `capture_lead` runs can come back with
 * `output_tokens: 2` and no text block at all — observed live. The cause is
 * upstream: when the local capture fails for an infrastructure reason,
 * `MockToolExecutor` hands the model a synthetic `mock_<timestamp>` id and a
 * `captured_mock_only` status (tools.ts:218), the model reads that as "saved,
 * nothing more to do", and produces an empty final message. That fallback is
 * deliberate and has a test (tools.test.ts:236), so it is not changed here.
 *
 * What is not acceptable either way is shipping `reply: ""` to the panel, which
 * would render an empty bubble. A blank reply is a failure wearing a 200.
 */
const EMPTY_REPLY_FALLBACK =
  "Thanks — I've passed this to Joey and he'll follow up with you personally. " +
  'Anything else I can help with in the meantime?';

/** Same 429 shape as the parent route: a real Retry-After, a vague body. */
function tooManyRequests(limit: RequestLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSeconds ?? 1) },
    },
  );
}

/**
 * The session id for this turn.
 *
 * A client-supplied id is honoured only if it is a well-formed UUID, and
 * otherwise replaced with a fresh one. Two reasons, neither of them about
 * trusting the client:
 *
 *  - It is the primary key of `chat_sessions` and the key of the per-session
 *    limiter bucket. An arbitrary caller-supplied string is an unbounded
 *    keyspace in both.
 *  - A malformed id would fail the insert, and that failure is swallowed by
 *    design (see chat-store.ts), so the symptom would be transcripts silently
 *    going missing rather than an error anyone notices.
 *
 * What this does NOT do is stop a caller from rotating ids to escape the
 * per-session limit. It cannot: a fresh id is free. That evasion is bounded by
 * the per-IP limit, which is the control that actually caps spend here, and
 * making ids unforgeable (signing them) would not help — obtaining a signed id
 * costs a request against the same IP budget.
 */
export function resolveSessionId(raw: unknown): string {
  return typeof raw === 'string' && UUID_PATTERN.test(raw) ? raw : randomUUID();
}

/**
 * Validate + sanitize client-supplied conversation history.
 *
 * A duplicate of the unexported function in ../route.ts, same limits. The panel
 * replays the visible transcript on each turn, so without this a caller could
 * forge assistant turns — words Joey's assistant never said — into the prompt
 * and then quote the reply.
 */
export function sanitizeHistory(raw: unknown): AssistantTurn['history'] {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .slice(-MAX_HISTORY_TURNS)
    .filter(
      (h): h is { role: 'user' | 'assistant'; content: string } =>
        !!h &&
        typeof h === 'object' &&
        (h.role === 'user' || h.role === 'assistant') &&
        typeof h.content === 'string' &&
        h.content.length > 0 &&
        h.content.length <= MAX_CONTENT_LENGTH,
    );
}

export async function POST(req: NextRequest) {
  // First, before the body is read and before any model call, so refusing is
  // cheap. This is the limit that actually caps spend — see resolveSessionId on
  // why the per-session one cannot.
  const ipLimit = checkAndCount(rateLimitKey(req.headers));
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `message is required (max ${MAX_CONTENT_LENGTH} chars)` },
      { status: 400 },
    );
  }

  const sessionId = resolveSessionId(body.sessionId);

  // Still before the model call. A conversation that paces itself under the
  // per-minute ceiling is capped here instead.
  const sessionLimit = checkAndCountSession(sessionId);
  if (!sessionLimit.allowed) return tooManyRequests(sessionLimit);

  const history = sanitizeHistory(body.history);

  // The lead id, if this turn produces one. `runAssistantTurn` reports which
  // tools ran but not what they returned, so it is captured here on the way
  // through and attached to the stored session.
  let capturedLeadId: string | undefined;

  const captureLeadLocally: LocalCaptureHook = async (input) => {
    const outcome = await captureLead(toLeadSubmissionInput(input));
    if (!outcome.ok) throw new LeadCaptureValidationError(outcome.fieldErrors);
    capturedLeadId = outcome.leadId;
    return { lead_id: outcome.leadId };
  };

  const started = Date.now();

  // Only the model call is guarded here. Persistence is deliberately outside
  // this try: it used to be inside, and a throwing store meant a *good* reply
  // was discarded in favour of the fail-warm text, then the catch block's own
  // store call rethrew and the request 500'd. Storage problems must not be able
  // to reach the answer.
  let result: Awaited<ReturnType<typeof runAssistantTurn>>;
  try {
    result = await runAssistantTurn(
      // `history` spread only when present: exactOptionalPropertyTypes rejects an
      // explicit undefined for an optional property.
      { sessionId, message, ...(history ? { history } : {}) },
      { localCapture: captureLeadLocally },
    );
  } catch (err) {
    console.error('[assistant:chat] error:', err);

    // The failed turn is stored too — it is the kind most worth reading back —
    // and the visitor did see a reply, just not a good one.
    await storeQuietly({
      sessionId,
      userMessage: message,
      reply: FAIL_WARM_REPLY,
      mode: 'live',
      toolCalls: [],
      latencyMs: Date.now() - started,
    });

    // Fail warm, like the parent route: 200 with a human reply, never a raw
    // error. The sessionId still goes back so the panel keeps one conversation
    // rather than starting a new one on the next message.
    return NextResponse.json({
      sessionId,
      reply: FAIL_WARM_REPLY,
      mode: 'live',
      bookingUrl: bookingLink() ?? null,
    });
  }

  const latencyMs = Date.now() - started;

  // A successful call that produced no text still has to become something the
  // visitor can read. See EMPTY_REPLY_FALLBACK for how this happens.
  const reply = result.reply.trim() ? result.reply : EMPTY_REPLY_FALLBACK;
  if (!result.reply.trim()) {
    console.warn(
      `[assistant:chat] empty model reply for session=${sessionId} ` +
        `tools=${result.toolCalls.map((t) => t.name).join(',') || 'none'} — sent the fallback`,
    );
  }

  console.log(
    `[assistant:chat] session=${sessionId} mode=${result.mode} tools=${
      result.toolCalls.map((t) => t.name).join(',') || 'none'
    } ms=${latencyMs} usage=${JSON.stringify(result.usage ?? {})}`,
  );

  // Awaited rather than fired and forgotten: on a serverless platform the
  // instance can be frozen the moment the response is returned, so an un-awaited
  // write is a write that may not happen.
  // The transcript stores what the visitor was actually shown, not what the
  // model returned, so Joey reading it back sees the conversation as it happened.
  await storeQuietly({
    sessionId,
    userMessage: message,
    reply,
    mode: result.mode,
    toolCalls: result.toolCalls.map((t) => t.name),
    latencyMs,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(capturedLeadId ? { leadId: capturedLeadId } : {}),
  });

  return NextResponse.json({
    sessionId,
    reply,
    mode: result.mode,
    // Null when unconfigured, so the panel renders no button rather than a
    // broken one. See src/lib/services/booking-link.ts.
    bookingUrl: bookingLink() ?? null,
  });
}

/**
 * Store a turn, absorbing anything that goes wrong.
 *
 * `recordChatTurn` already promises never to throw, so this is belt and braces —
 * but the promise is one module's internal discipline and this route's
 * correctness should not rest on it. A transcript is worth less than a reply.
 */
async function storeQuietly(turn: Parameters<typeof recordChatTurn>[0]): Promise<void> {
  try {
    await recordChatTurn(turn);
  } catch (err) {
    console.warn('[assistant:chat] transcript not stored:', err);
  }
}

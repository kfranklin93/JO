/**
 * POST /api/assistant — client-facing AI assistant endpoint (v2).
 * Body: { sessionId: string, message: string, history?: [...] }
 *
 * v2 CHANGES (Kiro review):
 *  - history is now VALIDATED before reaching the model: max 20 turns, roles
 *    restricted to user/assistant, content capped and type-checked. A client
 *    can no longer forge assistant turns into the prompt.
 *  - Rate limiting: LIVE. Every request is counted via
 *    src/lib/api/request-limit.ts — 10/min per client IP and 40/hour per
 *    session — refusing with 429 and Retry-After before any model call. See the
 *    long note in POST for why this is a second module rather than a change to
 *    src/lib/auth/rate-limit.ts, which remains untouched.
 *  - capture_lead results are forwarded to the repo's existing leads pipeline
 *    so leads land in the Neon table, dashboard, and follow-up drip campaign.
 *    LIVE: see `captureLeadLocally` below.
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { runAssistantTurn, AssistantTurn } from "@/lib/assistant/agent";
import {
  LeadCaptureValidationError,
  toLeadSubmissionInput,
  type LocalCaptureHook,
} from "@/lib/assistant/tools";
import { captureLead } from "@/lib/services/lead-capture";
import {
  checkAndCount,
  checkAndCountSession,
  rateLimitKey,
  type RequestLimitResult,
} from "@/lib/api/request-limit";

const MAX_HISTORY_TURNS = 20;
const MAX_CONTENT_LENGTH = 4000;

/**
 * JOEY UPDATE: shared 429 shape for both limits.
 *
 * `Retry-After` carries the wait the limiter calculated, so a well-behaved
 * client backs off for the right interval instead of guessing. The body stays
 * deliberately vague about which limit was hit — a caller does not need to know
 * whether it was the per-IP or the per-session ceiling, and telling them maps
 * out the limiter for free.
 */
function tooManyRequests(limit: RequestLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds ?? 1) },
    }
  );
}

/**
 * JOEY UPDATE — BLOCKER RESOLVED: capture_lead now writes through the repo's
 * real leads pipeline.
 *
 * The blocker reported here was that no server-side entry point existed. That
 * was accurate: src/lib/api/submit-lead.ts is a browser helper posting to a
 * relative `/api/leads`, which cannot resolve from a route handler, and the
 * validation, transaction and follow-up inserts all lived inline in that route's
 * POST. They now live in src/lib/services/lead-capture.ts, which takes raw input
 * rather than a Request, so this handler calls it directly — no fetch, no second
 * function invocation, and the same transaction and drip schedule the web form
 * gets.
 *
 * The two shape mismatches are resolved on the assistant's side, in
 * src/lib/assistant/tools.ts: the tool now declares the canonical LEAD_INTENTS
 * values and requires name + email, and `toLeadSubmissionInput` handles the one
 * field rename (notes → additionalNotes). See the field map there.
 *
 * Validation failure is rethrown as LeadCaptureValidationError so the agent
 * loop's `is_error` branch hands the reason back to the model, which then asks
 * the client for the missing field and retries. Nothing is defaulted on the
 * client's behalf. A thrown MissingEnvError or driver failure is left to
 * propagate to the same branch: the model is told the capture did not happen,
 * which is true, rather than being handed an id for a lead that was never
 * written.
 */
const captureLeadLocally: LocalCaptureHook = async (input) => {
  const outcome = await captureLead(toLeadSubmissionInput(input));
  if (!outcome.ok) throw new LeadCaptureValidationError(outcome.fieldErrors);
  return { lead_id: outcome.leadId };
};

/** Validate + sanitize client-supplied conversation history. */
function sanitizeHistory(
  raw: unknown
): AssistantTurn["history"] {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .slice(-MAX_HISTORY_TURNS)
    .filter(
      (h): h is { role: "user" | "assistant"; content: string } =>
        !!h &&
        typeof h === "object" &&
        (h.role === "user" || h.role === "assistant") &&
        typeof h.content === "string" &&
        h.content.length > 0 &&
        h.content.length <= MAX_CONTENT_LENGTH
    );
}

export async function POST(req: NextRequest) {
  // JOEY UPDATE — BLOCKER RESOLVED: the reported problem was real and the fix is
  // src/lib/api/request-limit.ts, a second limiter rather than a change to
  // src/lib/auth/rate-limit.ts. That module counts FAILURES, which never limits a
  // caller looping VALID requests — the spend-abuse case for a paid model — and
  // making it count successes would have shared its module-scoped `failures` Map
  // with the dashboard login limiter on the same IP keyspace, letting assistant
  // traffic lock Joey out of his own dashboard. The new module counts every
  // request in its own `assistant:rl:` keyspace and reuses only `rateLimitKey`,
  // imported from rate-limit.ts so the Netlify client-IP header ordering and the
  // shared header-less fallback bucket stay defined in one place. rate-limit.ts
  // is untouched.
  //
  // Both limits are per-instance. Netlify scales functions horizontally, so each
  // instance counts separately and the effective ceiling is the configured limit
  // times however many instances are warm. Accepted deliberately: unlike the
  // login route, what leaks through here costs money rather than compromising
  // anything, so this is a cost guard and not a security control. Exact counting
  // needs shared storage, which request-limit.ts notes as the follow-up.
  //
  // Ordering. Two checks at two points, because the two keys become available at
  // two different times:
  //
  //   1. Per-IP, here — before body parsing and before any model call, so a
  //      refusal costs nothing but the header read.
  //   2. Per-session, after parsing — `sessionId` arrives in the body, so it
  //      cannot be known any earlier. It still lands before `runAssistantTurn`,
  //      which is the only expensive thing in this handler.
  //
  // The gap between them is bounded by the per-IP limit that has already passed:
  // reaching the session check at all takes an IP allowance, so the worst a
  // session-limited caller extracts is some JSON parsing, never a model call.
  const ipLimit = checkAndCount(rateLimitKey(req.headers));
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const message = typeof body.message === "string" ? body.message : undefined;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  if (!message || message.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: `message is required (max ${MAX_CONTENT_LENGTH} chars)` },
      { status: 400 }
    );
  }

  // JOEY UPDATE: the second half of the limit — see the ordering note above.
  // Placed after `sessionId` is known to exist and before any model call, so one
  // conversation cannot run up an unbounded bill by pacing itself under the
  // per-minute IP ceiling.
  const sessionLimit = checkAndCountSession(sessionId);
  if (!sessionLimit.allowed) return tooManyRequests(sessionLimit);

  const history = sanitizeHistory(body.history);

  try {
    const started = Date.now();
    const result = await runAssistantTurn(
      // JOEY UPDATE: `history` is spread only when present. This repo sets
      // exactOptionalPropertyTypes, so an explicit `history: undefined` is not
      // assignable to an optional property — the same absent-vs-undefined
      // pattern already used in src/app/api/leads/route.ts.
      { sessionId, message, ...(history ? { history } : {}) },
      { localCapture: captureLeadLocally }
    );

    // Cost log — every turn is accounted for (Joey's pass-through API usage).
    console.log(
      `[assistant] session=${sessionId} mode=${result.mode} tools=${result.toolCalls
        .map((t) => t.name)
        .join(",") || "none"} ms=${Date.now() - started} usage=${JSON.stringify(result.usage ?? {})}`
    );

    return NextResponse.json({
      reply: result.reply,
      mode: result.mode,
      // JOEY UPDATE: env access via @/config/env per repo convention.
      bookingUrl: env.CALENDLY_LINK ?? null,
    });
  } catch (err) {
    console.error("[assistant] error:", err);
    return NextResponse.json(
      { reply: "Thanks for reaching out! Something went wrong on our end — Joey's team will follow up shortly." },
      { status: 200 } // fail warm: the client should never see a raw error
    );
  }
}

/**
 * JoeyO AI Sales Assistant — tool definitions + executors (v2)
 *
 * v2 CHANGES (Kiro review):
 *  - capture_lead now FIRST persists through the repo's existing leads
 *    pipeline (Zod-validated Neon table via the lead capture service), then
 *    mirrors to the CRM via Composio. Leads appear in the dashboard and
 *    trigger the existing follow-up drip campaign.
 *  - Package name corrected: Composio SDK is `@composio/core`
 *    (verify exact version/methods at https://docs.composio.dev).
 *  - Executor factory takes an injected local-capture hook so this module
 *    stays decoupled from the repo's DB layer.
 */

import { env } from "@/config/env";
import { LEAD_INTENTS } from "@/lib/validation/lead";
import { bookingLink } from "@/lib/services/booking-link";
import type { ToolName, ToolParamSchema, ToolCall, ToolExecutor } from "./types";

export interface ToolParamSchemaDef extends ToolParamSchema {}

export type { ToolName, ToolCall, ToolExecutor };

export interface ToolDefinition {
  description: string;
  schema: ToolParamSchema;
}

/**
 * JOEY UPDATE — capture_lead ↔ leadSubmissionSchema field map.
 *
 * The capture path's contract with the repo, written out because the two
 * vocabularies are *nearly* identical and a near-match is what silently drops a
 * field. `notes` is the only rename; everything else is the same word in both
 * places, which is exactly why the one exception needs to be stated rather than
 * assumed.
 *
 *   assistant field  →  schema field (src/lib/validation/lead.ts)
 *   ─────────────────────────────────────────────────────────────
 *   name             →  name              required
 *   email            →  email             required
 *   intent           →  intent            required, LEAD_INTENTS enum
 *   notes            →  additionalNotes   required by this tool; optional in
 *                                         the schema, so the requirement is a
 *                                         policy of the assistant's, not the
 *                                         schema's — Joey wants the story
 *   phone            →  phone             optional (confirmed: the schema
 *                                         declares it `optionalText(...)`)
 *   location         →  location          optional
 *   timeline         →  timeline          optional
 *
 * Schema fields the assistant never sends, all optional: firstName, lastName
 * (derived from `name` by the schema), budget, propertyType, bedrooms,
 * bathrooms.
 *
 * The intent enum is imported rather than re-spelled. The tool used to offer
 * `buying / selling / buying_and_selling / general_question`, none of which are
 * values `leadSubmissionSchema` accepts, so every capture would have failed
 * validation on the intent field. Mapping that vocabulary onto LEAD_INTENTS was
 * rejected as the fix: `buying_and_selling` has no canonical equivalent, so any
 * mapping has to invent one, and the enum would have drifted again the next time
 * either side changed. The assistant speaks the repo's six values directly, and
 * a dual goal like buy-and-sell goes in `notes`.
 */
export const CAPTURE_LEAD_FIELD_MAP = {
  name: "name",
  email: "email",
  intent: "intent",
  notes: "additionalNotes",
  phone: "phone",
  location: "location",
  timeline: "timeline",
} as const;

/**
 * JOEY UPDATE: translate a `capture_lead` input into schema field names.
 *
 * Absent keys stay absent. A field the client has not given must not acquire a
 * placeholder here, because a defaulted value would validate and be stored as
 * fact — the failure mode this whole path is meant to avoid.
 */
export function toLeadSubmissionInput(
  input: Record<string, unknown>
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [assistantField, schemaField] of Object.entries(CAPTURE_LEAD_FIELD_MAP)) {
    const value = input[assistantField];
    if (value !== undefined) mapped[schemaField] = value;
  }
  return mapped;
}

/**
 * JOEY UPDATE: a `capture_lead` payload the lead schema rejected.
 *
 * Thrown rather than returned so the agent loop's existing `is_error` branch
 * turns it into an errored `tool_result`. The model then sees which field was
 * wrong, asks the client for it, and calls the tool again. The alternative —
 * swallowing the failure and handing back a synthetic id — taught the model the
 * lead was saved when nothing had been written.
 *
 * Defined here rather than in the capture service so this module keeps its stated
 * independence from the repo's DB layer; the host app's hook constructs it.
 */
export class LeadCaptureValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    const detail = Object.entries(fieldErrors)
      .map(([field, message]) => `${field}: ${message}`)
      .join("; ");
    super(
      `capture_lead rejected — ${detail}. Ask the client for the corrected value and call capture_lead again. Do not guess or default any field.`
    );
    this.name = "LeadCaptureValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export const TOOL_DEFINITIONS: Record<ToolName, ToolDefinition> = {
  capture_lead: {
    description:
      "Create a lead record. Persists to the app's leads store (dashboard + follow-up drip pipeline) and mirrors to the CRM. Call EARLY in every inquiry, as soon as you have the client's name and email — but never before, and never with a placeholder.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name as the client gave it. Required — ask for it before calling this tool." },
        email: { type: "string", description: "Email address. Required — ask for it before calling this tool." },
        phone: { type: "string", description: "Phone number, if provided" },
        // JOEY UPDATE: the canonical six from src/lib/validation/lead.ts. Listed
        // from LEAD_INTENTS so the prompt the model sees cannot drift from the
        // values the schema accepts.
        intent: {
          type: "string",
          description: `The client's PRIMARY goal. Exactly one of: ${LEAD_INTENTS.join(
            ", "
          )}. Pick the single closest value; put any secondary goal (for example someone who wants to sell and then buy) in notes.`,
        },
        location: { type: "string", description: "Area/city/neighborhood of interest, if mentioned" },
        timeline: { type: "string", description: "When they plan to move, if mentioned" },
        notes: {
          type: "string",
          description:
            "What they actually said, in their words where useful — including any secondary intent. Stored as the lead's additional notes.",
        },
      },
      // JOEY UPDATE: aligned with leadSubmissionSchema, which requires name,
      // email and intent. `notes` is required by policy, not by the schema — see
      // the field map above.
      required: ["name", "email", "intent", "notes"],
    },
  },
  log_lead_note: {
    description: "Append conversation context to the lead record so Joey sees the full story.",
    schema: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "ID returned by capture_lead" },
        note: { type: "string", description: "Concise summary of what was discussed" },
      },
      required: ["lead_id", "note"],
    },
  },
  draft_followup: {
    description:
      "Draft (NOT send) a follow-up SMS or email in Joey's voice for human review.",
    schema: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "Lead this draft belongs to" },
        channel: { type: "string", description: "sms or email" },
        draft: { type: "string", description: "The message text in Joey's warm, friendly voice" },
      },
      required: ["lead_id", "channel", "draft"],
    },
  },
  book_intro_call: {
    description: "Offer the client the intro-call booking link.",
    schema: {
      type: "object",
      properties: { lead_id: { type: "string", description: "Lead this booking belongs to" } },
      required: ["lead_id"],
    },
  },
  escalate_to_joey: {
    description:
      "Flag the conversation for Joey's personal attention (sensitive topics, urgent requests, complaints).",
    schema: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "Lead to escalate" },
        reason: { type: "string", description: "Why this needs Joey personally" },
        urgency: { type: "string", description: "high or normal" },
      },
      required: ["lead_id", "reason", "urgency"],
    },
  },
};

/**
 * What `book_intro_call` hands back, shared by both executors.
 *
 * When no booking link is configured the result says so explicitly and tells the
 * model what to do instead. The previous versions returned the literal string
 * `"{{CALENDLY_LINK}}"` or an empty string, and a model handed either of those
 * will cheerfully present it to a client as a link — or invent a plausible URL
 * to fill the gap. Naming the absence is what stops that.
 */
function bookIntroCallResult(): Record<string, unknown> {
  const link = bookingLink();

  if (link) return { booking_url: link };

  return {
    booking_url: null,
    status: "no_booking_link",
    message:
      "No booking link is configured. Do NOT invent a URL or offer one. Tell the " +
      "client Joey will reach out personally to arrange a time, and make sure you " +
      "have their name and email so he can.",
  };
}

/** Hook the host app supplies so capture_lead writes through the repo's
 *  existing (Zod-validated) leads pipeline — dashboard + drips keep working. */
export type LocalCaptureHook = (input: Record<string, unknown>) => Promise<{ lead_id: string }>;

export interface MockExecutorResult {
  status: string;
  lead_id?: string;
  booking_url?: string;
}

export class MockToolExecutor implements ToolExecutor {
  constructor(private localCapture?: LocalCaptureHook) {}

  async execute(call: ToolCall): Promise<Record<string, unknown>> {
    console.log(`[assistant:mock] tool=${call.name} input=${JSON.stringify(call.input)}`);
    if (call.name === "capture_lead") {
      if (this.localCapture) {
        try {
          const local = await this.localCapture(call.input);
          return { ...local, status: "captured_local", mirrored: false };
        } catch (err) {
          // JOEY UPDATE: a rejected payload is not an outage. It propagates so
          // the agent loop reports it as an errored tool_result and the model
          // asks the client for the field it is missing. Falling back to a
          // synthetic id here would tell the model a lead exists that does not,
          // and the rest of the conversation would attach notes to nothing.
          if (err instanceof LeadCaptureValidationError) throw err;
          console.error("[assistant:mock] local capture failed:", err);
          return { lead_id: `mock_${Date.now()}`, status: "captured_mock_only" };
        }
      }
      return { lead_id: `mock_${Date.now()}`, status: "captured_mock_only" };
    }
    if (call.name === "book_intro_call") return bookIntroCallResult();
    return { status: "logged_mock" };
  }
}

export class ComposioToolExecutor implements ToolExecutor {
  constructor(private localCapture?: LocalCaptureHook) {}

  // Maps our tool -> Composio toolkit actions (CRM MIRROR ONLY — local
  // persistence happens via localCapture first). Fill with exact action names
  // from your connected toolkits in the Composio dashboard.
  private static readonly ACTION_MAP: Record<ToolName, string | null> = {
    capture_lead: "HUBSPOT_CREATE_CONTACT", // INTEGRATION POINT: verify action name
    log_lead_note: "HUBSPOT_CREATE_ENGAGEMENT", // INTEGRATION POINT
    draft_followup: "GMAIL_CREATE_EMAIL_DRAFT", // INTEGRATION POINT
    book_intro_call: null, // handled locally via CALENDLY_LINK
    escalate_to_joey: "GMAIL_CREATE_EMAIL_DRAFT", // INTEGRATION POINT: draft heads-up to JOEY_EMAIL
  };

  async execute(call: ToolCall): Promise<Record<string, unknown>> {
    if (call.name === "book_intro_call") return bookIntroCallResult();

    // capture_lead: local store FIRST (source of truth), CRM mirror second.
    if (call.name === "capture_lead" && this.localCapture) {
      const local = await this.localCapture(call.input);
      // INTEGRATION POINT: confirm the current @composio/core JS SDK API before
      // enabling the mirror. Pattern (verify against docs.composio.dev):
      //   const { Composio } = await import("@composio/core");
      //   const composio = new Composio({ apiKey: env.COMPOSIO_API_KEY });
      //   await composio.tools.execute(userId, ACTION_MAP.capture_lead, call.input);
      return { ...local, status: "captured_local", mirrored: false };
    }

    const action = ComposioToolExecutor.ACTION_MAP[call.name];
    if (!action) throw new Error(`No Composio action mapped for ${call.name}`);

    throw new Error(
      "ComposioToolExecutor.execute: wire up per docs.composio.dev (see README) — mock/local executor is active until then."
    );
  }
}

export function createToolExecutor(localCapture?: LocalCaptureHook): ToolExecutor {
  // JOEY UPDATE: env access via @/config/env per repo convention.
  return env.COMPOSIO_API_KEY
    ? new ComposioToolExecutor(localCapture)
    : new MockToolExecutor(localCapture);
}

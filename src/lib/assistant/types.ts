/**
 * JoeyO AI Sales Assistant — shared types (extracted in v2 so tools.ts and
 * agent.ts import one source of truth).
 */

export type ToolName =
  | "capture_lead"
  | "log_lead_note"
  | "draft_followup"
  | "book_intro_call"
  | "escalate_to_joey";

export interface ToolParamSchema {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required: string[];
  // JOEY UPDATE: type-only addition. The Anthropic SDK's `Tool.input_schema`
  // is declared with an index signature, so a closed interface is not
  // assignable to it. No runtime behaviour changes.
  [key: string]: unknown;
}

export interface ToolCall {
  name: ToolName;
  input: Record<string, unknown>;
}

export interface ToolExecutor {
  execute(call: ToolCall): Promise<Record<string, unknown>>;
}

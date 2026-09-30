/**
 * JoeyO AI Sales Assistant — Claude tool-use loop (v2).
 * Replaces bedrock.ts as the assistant brain (AWS stall resolved → direct API).
 *
 * v2 CHANGES (Kiro review):
 *  - Mock-mode condition is based ONLY on the Anthropic key (mock no longer
 *    misfires when only COMPOSIO_API_KEY is set).
 *  - env access centralized in getAssistantEnv(); switch it to @/config/env
 *    during integration (see note) instead of scattering process.env reads.
 *  - ANTHROPIC_MODEL default flagged for verification against the Anthropic
 *    console — model IDs may require a date suffix.
 */

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/config/env";
import {
  TOOL_DEFINITIONS,
  createToolExecutor,
  ToolCall,
  ToolExecutor,
} from "./tools";
import { getSystemPrompt } from "./system-prompt";
import { getPlaybookDirective } from "./answer-playbook";

// JOEY UPDATE: CREATE v2 item 5 — process.env reads replaced with the repo's
// established @/config/env access. Schema entries AND parse calls were both
// added in src/config/env.ts, since an entry alone leaves the value undefined.
function getAssistantEnv() {
  return {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL, // VERIFY: confirm alias/model ID in Anthropic console; may need date suffix
    maxTokens: env.ANTHROPIC_MAX_TOKENS,
    system: getSystemPrompt({
      SITE_NAME: env.NEXT_PUBLIC_SITE_NAME,
      SERVICE_AREA: env.ASSISTANT_SERVICE_AREA ?? "{{SERVICE_AREA}}",
      SERVICE_AREA_LIST: env.ASSISTANT_SERVICE_AREA_LIST ?? "{{SERVICE_AREA_LIST}}",
      BUYER_SERVICES_SUMMARY: env.ASSISTANT_BUYER_SERVICES ?? "{{BUYER_SERVICES_SUMMARY}}",
      SELLER_SERVICES_SUMMARY: env.ASSISTANT_SELLER_SERVICES ?? "{{SELLER_SERVICES_SUMMARY}}",
      GUIDE_SUMMARY: env.ASSISTANT_GUIDE_SUMMARY ?? "{{GUIDE_SUMMARY}}",
      TEAM_SUMMARY: env.ASSISTANT_TEAM_SUMMARY ?? "{{TEAM_SUMMARY}}",
    }),
  };
}

const MAX_TOOL_ROUNDS = 4; // safety stop — a reply never chains tools forever

export interface AssistantTurn {
  sessionId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[]; // MUST be sanitized upstream (see route.ts)
}

export interface AssistantResult {
  reply: string;
  toolCalls: ToolCall[];
  usage?: { input_tokens: number; output_tokens: number };
  mode: "live" | "mock";
}

function anthropicTools() {
  return (Object.keys(TOOL_DEFINITIONS) as (keyof typeof TOOL_DEFINITIONS)[]).map((name) => ({
    name,
    description: TOOL_DEFINITIONS[name].description,
    input_schema: TOOL_DEFINITIONS[name].schema,
  }));
}

export async function runAssistantTurn(
  turn: AssistantTurn,
  options?: { localCapture?: Parameters<typeof createToolExecutor>[0] }
): Promise<AssistantResult> {
  const assistantEnv = getAssistantEnv();
  const executor: ToolExecutor = createToolExecutor(options?.localCapture);

  if (!assistantEnv.apiKey) {
    // MOCK MODE: no Anthropic key — same defensive pattern as lofty.ts.
    // (Only this condition; Composio key alone does NOT enable live chat.)
    console.log(`[assistant:mock] sessionId=${turn.sessionId} message="${turn.message}"`);
    return {
      reply:
        "Thanks for reaching out to Joey O. Real Estate! (Assistant running in development mode — " +
        "configure ANTHROPIC_API_KEY to enable live responses.)",
      toolCalls: [],
      mode: "mock",
    };
  }

  // JOEY UPDATE: append the approved answer for this question, when there is
  // one. Appended per turn rather than baked into assistantEnv.system because
  // the match depends on what was just said — see ./answer-playbook.ts. Returns
  // undefined on every failure path, so a broken playbook costs the assistant
  // its consistency and not its ability to reply. The directive goes last and
  // restates that the prompt's HARD RULES still win.
  const playbookDirective = await getPlaybookDirective(turn.message);
  const system = playbookDirective
    ? `${assistantEnv.system}\n\n${playbookDirective}`
    : assistantEnv.system;

  const client = new Anthropic({ apiKey: assistantEnv.apiKey });
  const messages: Anthropic.MessageParam[] = [
    ...(turn.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: turn.message },
  ];

  const executed: ToolCall[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: assistantEnv.model,
      max_tokens: assistantEnv.maxTokens,
      system,
      tools: anthropicTools(),
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { reply: text, toolCalls: executed, usage: response.usage, mode: "live" };
    }

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const call: ToolCall = {
        name: block.name as keyof typeof TOOL_DEFINITIONS,
        input: block.input as Record<string, unknown>,
      };
      executed.push(call);
      try {
        const output = await executor.execute(call);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      } catch (err) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: String(err),
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return {
    reply:
      "Thanks for your patience — I'm having Joey follow up with you directly to make sure you get the best answer.",
    toolCalls: executed,
    mode: "live",
  };
}

import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type LanguageModel,
  type UIMessage,
} from "ai";
import type { Engine } from "mcp-server";
import { buildAiTools } from "./tools.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { isTelemetryEnabled } from "./telemetry.js";

/**
 * Chat backend (PRD §6.1 widget, §7). Orchestre le LLM + les 2 tools.
 * Boucle agentique : le modèle peut enchaîner search → execute → réponse.
 */

export interface ChatHandlerOptions {
  model: LanguageModel;
  maxSteps?: number;
}

export interface ChatRequestMeta {
  /** Identifiant de conversation pour regrouper les traces (observabilité). */
  sessionId?: string;
}

export function createChatHandler(engine: Engine, opts: ChatHandlerOptions) {
  const tools = buildAiTools(engine);
  const maxSteps = opts.maxSteps ?? 8;
  const telemetry = isTelemetryEnabled();

  return async function handleChat(
    messages: UIMessage[],
    meta: ChatRequestMeta = {},
  ): Promise<Response> {
    const result = streamText({
      model: opts.model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(maxSteps),
      // Émet des spans OTel (LLM + tool calls) ; exportés vers Langfuse si
      // configuré. No-op si la télémétrie n'est pas active.
      experimental_telemetry: {
        isEnabled: telemetry,
        functionId: "chat",
        metadata: meta.sessionId ? { sessionId: meta.sessionId } : {},
      },
    });
    return result.toUIMessageStreamResponse();
  };
}

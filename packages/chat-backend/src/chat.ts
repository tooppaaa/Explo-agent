import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type LanguageModel,
  type UIMessage,
  type StopCondition,
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

/** Arrête la boucle agentique dès qu'un execute a retourné pending_confirmation.
 *  Sans ça, le LLM voit le signal "neutre" et peut quand même relancer execute. */
const hasPendingMutation: StopCondition<ReturnType<typeof buildAiTools>> = ({ steps }) => {
  const last = steps[steps.length - 1];
  return (
    last?.toolResults?.some(
      (tr) =>
        (tr as { toolName?: string; output?: unknown }).toolName === "execute" &&
        (tr as { output?: { status?: string } }).output?.status === "pending_confirmation",
    ) ?? false
  );
};

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
      stopWhen: [stepCountIs(maxSteps), hasPendingMutation],
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

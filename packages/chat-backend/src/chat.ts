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

/**
 * Chat backend (PRD §6.1 widget, §7). Orchestre le LLM + les 2 tools.
 * Boucle agentique : le modèle peut enchaîner search → execute → réponse.
 */

export interface ChatHandlerOptions {
  model: LanguageModel;
  maxSteps?: number;
}

export function createChatHandler(engine: Engine, opts: ChatHandlerOptions) {
  const tools = buildAiTools(engine);
  const maxSteps = opts.maxSteps ?? 8;

  return async function handleChat(messages: UIMessage[]): Promise<Response> {
    const result = streamText({
      model: opts.model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(maxSteps),
    });
    return result.toUIMessageStreamResponse();
  };
}

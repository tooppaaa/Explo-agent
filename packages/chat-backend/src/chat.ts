import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type LanguageModel,
  type UIMessage,
} from "ai";
import type { Engine } from "mcp-server";
import { buildAiTools } from "./tools.js";

/**
 * Chat backend (PRD §6.1 widget, §7). Orchestre le LLM + les 2 tools.
 * Boucle agentique : le modèle peut enchaîner search → execute → réponse.
 */

const SYSTEM_PROMPT = `Tu es un assistant agentique branché sur des API métier.

Tu n'as PAS la liste des opérations a priori. Pour agir :
1. Utilise l'outil "search" avec des mots-clés pour découvrir les opérations
   disponibles (tu obtiens des signatures TypeScript).
2. Utilise l'outil "execute" pour exécuter du code TypeScript qui appelle ces
   opérations via le global "api" (ex: await api.mock.listOrders({ region: "EMEA" })).
   - Le code tourne dans un sandbox SANS réseau/fs/env : seul "api" est dispo.
   - AGRÈGE et filtre les données DANS le code, puis fais "return" du résultat
     final (le plus compact possible). Ne renvoie jamais les données brutes
     volumineuses.
   - Pour un résultat destiné à un graphique, retourne un tableau d'objets
     { label/categorie..., valeurNumérique } homogène.
3. Réponds en français, de façon concise, en t'appuyant sur le résultat.

Itère si "execute" renvoie une erreur (lis logs/error et corrige ton code).`;

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

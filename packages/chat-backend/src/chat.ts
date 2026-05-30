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

RÈGLE ABSOLUE : tu dois TOUJOURS commencer par appeler "search" avant tout "execute".
Tu n'as PAS la liste des opérations a priori — sans search tu ne connais pas les noms
exacts des opérations ni leurs paramètres, et ton code sera invalide.

Procédure obligatoire :
1. SEARCH d'abord — utilise l'outil "search" avec des mots-clés pour découvrir les
   opérations disponibles. Tu obtiens des signatures TypeScript avec les noms exacts.
2. EXECUTE ensuite — utilise l'outil "execute" pour exécuter du code TypeScript qui
   appelle ces opérations via le global "api" (ex: await api.mock.listOrders({})).
   - Le code tourne dans un sandbox SANS réseau/fs/env : seul "api" est disponible.
   - AGRÈGE et filtre les données DANS le code, puis fais "return" du résultat
     final (le plus compact possible). Ne renvoie jamais les données brutes.
   - Pour un graphique : retourne un tableau d'objets homogènes avec une clé texte
     et une ou plusieurs valeurs numériques.
3. RÉPONDS en français, de façon concise, en t'appuyant sur le résultat retourné.

Si "execute" renvoie une erreur, lis logs/error et corrige le code (re-search si besoin).`;

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

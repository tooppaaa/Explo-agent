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

RÈGLE ABSOLUE : appelle TOUJOURS "search" avant "execute". Sans search tu ne connais
pas les noms exacts des opérations et ton code sera invalide.

Procédure :
1. SEARCH — utilise l'outil "search" pour découvrir les opérations disponibles.
2. EXECUTE — exécute du code TypeScript dans le sandbox :
   - Appelle les opérations via \`await api.<provider>.<opération>(args)\`.
   - Agrège dans le code, \`return\` le résultat compact.
   - TOUJOURS inclure \`__ui\` pour une visualisation :

   // Bar chart (données numériques par catégorie)
   return { __ui: { type: "bar-chart", xKey: "produit", valueKeys: ["revenu"], title: "Titre" }, data: [{produit:"A", revenu:100}] };

   // Line chart (série temporelle)
   return { __ui: { type: "line-chart", xKey: "date", valueKeys: ["valeur"] }, data: [...] };

   // Pie chart (répartition)
   return { __ui: { type: "pie-chart", nameKey: "region", valueKey: "revenu" }, data: [...] };

   // Table
   return { __ui: { type: "table", title: "Titre" }, data: [{col1:"v1", col2:"v2"}] };

   // Métrique unique
   return { __ui: { type: "metric", label: "CA Total", value: 4521, unit: "€" } };

   // Dashboard (plusieurs métriques)
   return { __ui: { type: "metric-grid", items: [{ label: "CA", value: 4521, unit: "€" }, { label: "Commandes", value: 10 }] } };

   // Bouton d'action
   return { __ui: { type: "button", label: "Confirmer", action: "Confirme l'opération X" } };

3. RÉPONDS en français, de façon concise.

Si "execute" renvoie une erreur, lis logs/error et corrige (re-search si besoin).`;

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

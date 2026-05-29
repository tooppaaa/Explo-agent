import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Engine } from "mcp-server";

/**
 * Expose les 2 tools du moteur (`search`, `execute`) au format Vercel AI SDK,
 * câblés en in-process sur l'Engine. C'est la même logique que le serveur MCP
 * (PRD §7) ; le chat backend l'orchestre directement pour M0.
 */
export function buildAiTools(engine: Engine): ToolSet {
  return {
    search: tool({
      description:
        "Recherche les opérations d'API disponibles par mots-clés. Renvoie des " +
        "signatures TypeScript appelables depuis `execute` via le global `api`.",
      inputSchema: z.object({
        query: z.string().describe("Requête en langage naturel ou mots-clés."),
        k: z.number().int().positive().optional().describe("Nombre max de résultats."),
      }),
      execute: async ({ query, k }) => engine.search(query, k),
    }),

    execute: tool({
      description:
        "Exécute du code TypeScript dans un sandbox sans capacités. Appelle les " +
        "opérations via `await api.<provider>.<operation>(args)` et `return` un " +
        "résultat agrégé. Pas de fetch/fs/env. Agrège AVANT de retourner pour " +
        "éviter de faire transiter de gros volumes.",
      inputSchema: z.object({
        code: z.string().describe("Code TypeScript à exécuter. Utilise `return`."),
      }),
      execute: async ({ code }) => engine.execute(code),
    }),
  };
}

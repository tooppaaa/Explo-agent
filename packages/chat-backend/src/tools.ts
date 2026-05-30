import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Engine } from "mcp-server";
import { dbg } from "./debug.js";

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
      execute: async ({ query, k }) => {
        dbg("llm→search", JSON.stringify(query), k !== undefined ? `k=${k}` : "");
        const result = engine.search(query, k);
        dbg("search←", `${result.results.length} résultat(s):`, result.results.map((r) => r.name).join(", "));
        return result;
      },
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
      execute: async ({ code }) => {
        dbg("llm→execute", "\n" + code.split("\n").map((l) => "  " + l).join("\n"));
        const result = await engine.execute(code);
        if (result.logs?.length) dbg("sandbox│log", result.logs.join("\n"));
        if (result.ok) dbg("execute←", `ok  hint=${result.ok ? result.artifactHint ?? "text" : "-"}`, JSON.stringify(result.result)?.slice(0, 200));
        else dbg("execute←", `\x1b[31merror\x1b[0m`, result.error?.message);
        return result;
      },
    }),
  };
}

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { trace } from "@opentelemetry/api";
import type { Engine } from "mcp-server";
import { dbg } from "./debug.js";

/**
 * Pose des attributs sur le span OTel actif (créé par le AI SDK autour de
 * chaque tool call). No-op si la télémétrie est désactivée (pas de span actif).
 */
function annotate(attrs: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  for (const [k, v] of Object.entries(attrs)) span.setAttribute(`code_mode.${k}`, v);
}

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
        annotate({
          query,
          result_count: result.results.length,
          operations: result.results.map((r) => r.name).join(", "),
        });
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
        if (result.ok) dbg("execute←", `ok  ui=${result.ui?.type ?? "none"}`, JSON.stringify(result.result)?.slice(0, 200));
        else dbg("execute←", `\x1b[31merror\x1b[0m`, result.error?.message);
        annotate({
          generated_code: code,
          ok: result.ok,
          ui_type: result.ui?.type ?? "none",
          truncated: result.truncated ?? false,
          ...(result.logs?.length ? { logs: result.logs.join("\n") } : {}),
          ...(result.ok ? {} : { error: result.error?.message ?? "" }),
        });
        return result;
      },
    }),
  };
}

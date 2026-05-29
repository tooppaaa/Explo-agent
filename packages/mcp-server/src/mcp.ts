import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Engine } from "./engine.js";

/**
 * Expose le moteur via MCP : exactement 2 tools, `search` et `execute`
 * (PRD §6.4, §6.5, §7). Le transport HTTP streamable est branché par le
 * chat backend ; ici on ne construit que le McpServer + ses tools.
 */
export function buildMcpServer(engine: Engine): McpServer {
  const server = new McpServer(
    { name: "code-mode-engine", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "search",
    {
      description:
        "Recherche des opérations d'API disponibles par mots-clés. Renvoie des " +
        "signatures TypeScript appelables depuis `execute` via le global `api`.",
      inputSchema: {
        query: z.string().describe("Requête en langage naturel ou mots-clés."),
        k: z.number().int().positive().optional().describe("Nombre max de résultats."),
      },
    },
    async ({ query, k }) => {
      const { results } = engine.search(query, k);
      if (results.length === 0) {
        return {
          content: [
            { type: "text", text: "Aucune opération. Reformule ou élargis la requête." },
          ],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }] };
    },
  );

  server.registerTool(
    "execute",
    {
      description:
        "Exécute du code TypeScript dans un sandbox sans capacités. Le code peut " +
        "appeler les opérations via `await api.<provider>.<operation>(args)` et doit " +
        "`return` un résultat agrégé. Pas de fetch/fs/env. Agrège avant de retourner.",
      inputSchema: {
        code: z.string().describe("Code TypeScript à exécuter. Utilise `return`."),
      },
    },
    async ({ code }) => {
      const res = await engine.execute(code);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  return server;
}

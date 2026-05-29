import express, { type Express } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createEngine } from "./engine.js";
import { buildMcpServer } from "./mcp.js";
import { loadConfigFromFile, type EngineConfig } from "catalogue";

/**
 * Serveur MCP autonome (PRD §7) : monte les 2 tools sur un endpoint
 * `POST /mcp` via StreamableHTTPServerTransport. Le chat backend utilise le
 * moteur en in-process ; cet endpoint expose l'interface MCP standard pour
 * tout autre client.
 */
export async function createMcpHttpApp(config: EngineConfig): Promise<Express> {
  // Le moteur (parsing OpenAPI, index, bridge) est construit une seule fois.
  const engine = await createEngine(config);

  const app = express();
  app.use(express.json());

  // Mode STATELESS : un McpServer + transport frais par requête. Évite tout
  // partage d'état entre clients (« Server already initialized ») et simplifie
  // le scaling horizontal (PRD §9 portabilité).
  app.post("/mcp", async (req, res) => {
    const mcp = buildMcpServer(engine);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  return app;
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const configPath = process.env.ENGINE_CONFIG ?? "./engine.config.json";
  const config = loadConfigFromFileSafe(configPath);
  const port = Number(process.env.MCP_PORT ?? 3000);
  createMcpHttpApp(config).then((app) => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`[mcp-server] listening on http://localhost:${port}/mcp`);
    });
  });
}

function loadConfigFromFileSafe(path: string): EngineConfig {
  try {
    return loadConfigFromFile(path) as unknown as EngineConfig;
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`[mcp-server] no config at ${path}, starting in empty mode`);
    return {};
  }
}

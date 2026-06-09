import { config as dotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Readable } from "node:stream";
import express, { type Express } from "express";
import cors from "cors";
import { anthropic } from "@ai-sdk/anthropic";
import { createMistral } from "@ai-sdk/mistral";
import { createEngine, buildMcpServer, type Engine } from "mcp-server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfigFromFile, type EngineConfig } from "catalogue";
import { createChatHandler } from "./chat.js";
import { initTelemetry, shutdownTelemetry } from "./telemetry.js";
import type { LanguageModel, UIMessage } from "ai";

/**
 * Serveur HTTP du chat backend (PRD §7) :
 *  - POST /chat : streaming consommé par le widget (useChat).
 *  - GET  /health
 *
 * Adapte la Web `Response` du AI SDK vers la réponse Express.
 */

export interface ChatServerOptions {
  engine: Engine;
  model: LanguageModel;
}

/** Extrait le token Bearer du header Authorization.
 *  Retourne undefined si absent ou mal formé. */
function extractBearer(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m?.[1];
}

export function createChatApp(options: ChatServerOptions): Express {
  const handleChat = createChatHandler(options.engine, { model: options.model });

  const app = express();
  // ALLOWED_ORIGIN restreint CORS au domaine de l'app hôte en prod.
  // En dev (absent) : toutes origines autorisées.
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/search", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const k = req.query.k ? Number(req.query.k) : undefined;
    const result = options.engine.search(q, k);
    res.json({ query: q, count: result.results.length, results: result.results });
  });

  app.post("/confirm", async (req, res) => {
    const id = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (!id) {
      res.status(400).json({ ok: false, error: { message: "id requis" } });
      return;
    }
    try {
      const token = extractBearer(req.headers.authorization);
      const ctx = buildCtx(options.engine, token);
      const result = await options.engine.confirmMutation(id, ctx);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.post("/chat", async (req, res) => {
    const messages = (req.body?.messages ?? []) as UIMessage[];
    const sessionId = typeof req.body?.id === "string" ? req.body.id : undefined;
    const token = extractBearer(req.headers.authorization);
    const ctx = buildCtx(options.engine, token);
    const response = await handleChat(messages, { sessionId, tokenOverrides: ctx?.tokenOverrides });
    await pipeWebResponse(response, res);
  });

  // Endpoint MCP stateless (mode StreamableHTTP) — un serveur par requête.
  // Auth : même mécanique que /chat — Bearer token → tokenOverrides dans le bridge.
  app.post("/mcp", async (req, res) => {
    const token = extractBearer(req.headers.authorization);
    const ctx = buildCtx(options.engine, token);
    const mcp = buildMcpServer(options.engine, ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}

/** Construit un ExecutionContext à partir du token Bearer et de la config engine. */
function buildCtx(engine: Engine, token: string | undefined) {
  if (!token) return undefined;
  // Mappe le token sur tous les providers bearer ou apiKey de la config.
  // Clé = tokenEnv / valueEnv du provider, valeur = token fourni par le client.
  const overrides: Record<string, string> = {};
  for (const p of engine.config.providers) {
    const auth = p.auth;
    if (!auth || auth.type === "none") continue;
    if (auth.type === "bearer") overrides[auth.tokenEnv] = token;
    else if (auth.type === "apiKey") overrides[auth.valueEnv] = token;
  }
  return Object.keys(overrides).length > 0 ? { tokenOverrides: overrides } : undefined;
}

function defaultModel(provider: string): string {
  if (provider === "mistral") return "mistral-medium-latest";
  return "claude-sonnet-4-5";
}

function resolveModel(provider: string, modelId: string): LanguageModel {
  switch (provider) {
    case "mistral": {
      const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
      return mistral(modelId);
    }
    case "anthropic":
    default:
      return anthropic(modelId);
  }
}

/** Pipe une Web Response (stream) vers une réponse Express. */
async function pipeWebResponse(
  response: Response,
  res: express.Response,
): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
}

// ── Démarrage direct ─────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  dotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

  // Démarre l'observabilité OTel→Langfuse AVANT toute requête instrumentée.
  const telemetryOn = initTelemetry();

  const configPath = process.env.ENGINE_CONFIG ?? "./engine.config.json";
  let config: EngineConfig = {};
  try {
    config = loadConfigFromFile(configPath) as unknown as EngineConfig;
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`[chat-backend] no config at ${configPath}, empty mode`);
  }

  const provider = process.env.CHAT_PROVIDER ?? "anthropic";
  const modelId = process.env.CHAT_MODEL ?? defaultModel(provider);
  const port = Number(process.env.CHAT_PORT ?? 3000);

  // Répertoire du bundle widget (construit par `pnpm build:widget`).
  // En prod Docker, le Dockerfile le build avant de démarrer le serveur.
  const widgetDist =
    process.env.WIDGET_DIST ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../widget/dist");

  // Démarre le serveur HTTP immédiatement so /health répond pendant l'init engine.
  // createEngine peut être lent (fetch OpenAPI distante) — ne pas bloquer le démarrage.
  createEngine(config).then((engine) => {
    const app = createChatApp({ engine, model: resolveModel(provider, modelId) });

    // Sert le bundle widget sur /widget/agent.js si le dossier dist existe.
    if (existsSync(widgetDist)) {
      app.use("/widget", express.static(widgetDist));
      // eslint-disable-next-line no-console
      console.log(`[chat-backend] widget served at /widget/agent.js (${widgetDist})`);
    }

    // Démarre le serveur HTTP dès que l'engine est prêt.
    const server = app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(
        `[chat-backend] listening on http://localhost:${port} (${provider}/${modelId})` +
          (telemetryOn ? " · Langfuse ON" : ""),
      );
    });

    // Arrêt propre : flush des traces avant de quitter.
    const shutdown = () => {
      server.close(() => {
        void shutdownTelemetry().finally(() => process.exit(0));
      });
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[chat-backend] fatal: engine failed to initialize", err);
    process.exit(1);
  });
}

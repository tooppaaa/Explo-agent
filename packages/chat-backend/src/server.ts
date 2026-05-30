import { config as dotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import express, { type Express } from "express";
import cors from "cors";
import { anthropic } from "@ai-sdk/anthropic";
import { createMistral } from "@ai-sdk/mistral";
import { createEngine, type Engine } from "mcp-server";
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

export function createChatApp(options: ChatServerOptions): Express {
  const handleChat = createChatHandler(options.engine, { model: options.model });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/confirm", async (req, res) => {
    const id = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (!id) {
      res.status(400).json({ ok: false, error: { message: "id requis" } });
      return;
    }
    try {
      const result = await options.engine.confirmMutation(id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: { message: err instanceof Error ? err.message : String(err) } });
    }
  });

  app.post("/chat", async (req, res) => {
    const messages = (req.body?.messages ?? []) as UIMessage[];
    const sessionId = typeof req.body?.id === "string" ? req.body.id : undefined;
    const response = await handleChat(messages, { sessionId });
    await pipeWebResponse(response, res);
  });

  return app;
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

  createEngine(config).then((engine) => {
    const app = createChatApp({ engine, model: resolveModel(provider, modelId) });
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
  });
}

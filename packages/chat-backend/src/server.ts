import { Readable } from "node:stream";
import express, { type Express } from "express";
import cors from "cors";
import { anthropic } from "@ai-sdk/anthropic";
import { createEngine, type Engine } from "mcp-server";
import { loadConfigFromFile, type EngineConfig } from "catalogue";
import { createChatHandler } from "./chat.js";
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

  app.post("/chat", async (req, res) => {
    const messages = (req.body?.messages ?? []) as UIMessage[];
    const response = await handleChat(messages);
    await pipeWebResponse(response, res);
  });

  return app;
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
  const configPath = process.env.ENGINE_CONFIG ?? "./engine.config.json";
  let config: EngineConfig = {};
  try {
    config = loadConfigFromFile(configPath) as unknown as EngineConfig;
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`[chat-backend] no config at ${configPath}, empty mode`);
  }

  const modelId = process.env.CHAT_MODEL ?? "claude-sonnet-4-5";
  const port = Number(process.env.CHAT_PORT ?? 3000);

  createEngine(config).then((engine) => {
    const app = createChatApp({ engine, model: anthropic(modelId) });
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`[chat-backend] listening on http://localhost:${port} (model: ${modelId})`);
    });
  });
}

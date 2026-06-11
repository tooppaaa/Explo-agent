import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { createEngine, type Engine } from "../packages/mcp-server/src/index.js";
import { createChatApp, resolveAuthMode } from "../packages/chat-backend/src/index.js";

/**
 * Sécurité des endpoints publics : AUTH_MODE=required refuse les requêtes
 * sans Bearer (sinon le credential de SERVICE servirait de fallback à
 * n'importe qui), et le rate limiting protège le coût LLM.
 */

const USAGE = {
  inputTokens: { total: 10, noCache: 10 },
  outputTokens: { total: 10 },
  totalTokens: 20,
} as never;

function textModel(text: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "x" },
          { type: "text-delta", id: "x", delta: text },
          { type: "text-end", id: "x" },
          { type: "finish", finishReason: "stop", usage: USAGE },
        ] as never,
      }),
    }),
  });
}

const chatBody = JSON.stringify({
  messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "salut" }] }],
});

let engine: Engine;
beforeAll(async () => {
  engine = await createEngine({});
});

function listen(app: ReturnType<typeof createChatApp>): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, url: `http://localhost:${(server.address() as AddressInfo).port}` });
    });
  });
}

describe("auth required sur /chat, /confirm, /mcp", () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const app = createChatApp({
      engine,
      model: textModel("ok"),
      authMode: "required",
      rateLimit: { max: 0 },
    });
    ({ server, url } = await listen(app));
  });
  afterAll(() => server?.close());

  it("/chat sans Bearer → 401 + WWW-Authenticate", async () => {
    const res = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: chatBody,
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("/chat avec Bearer → 200", async () => {
    const res = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer user-token" },
      body: chatBody,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("ok");
  });

  it("/confirm et /mcp sans Bearer → 401", async () => {
    const confirm = await fetch(`${url}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "x" }),
    });
    expect(confirm.status).toBe(401);

    const mcp = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
    });
    expect(mcp.status).toBe(401);
  });

  it("/health reste ouvert (probe ALB)", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
  });

  it("borne la taille de l'historique (garde-fou de coût)", async () => {
    const messages = Array.from({ length: 201 }, (_, i) => ({
      id: `u${i}`,
      role: "user",
      parts: [{ type: "text", text: "x" }],
    }));
    const res = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ messages }),
    });
    expect(res.status).toBe(400);
  });
});

describe("rate limiting par IP", () => {
  it("renvoie 429 au-delà de la limite, avec Retry-After", async () => {
    const app = createChatApp({
      engine,
      model: textModel("ok"),
      authMode: "optional",
      rateLimit: { max: 2, windowMs: 60_000 },
    });
    const { server, url } = await listen(app);
    try {
      const send = () =>
        fetch(`${url}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: chatBody,
        });
      expect((await send()).status).toBe(200);
      expect((await send()).status).toBe(200);
      const third = await send();
      expect(third.status).toBe(429);
      expect(third.headers.get("retry-after")).toBeTruthy();
    } finally {
      server.close();
    }
  });
});

describe("resolveAuthMode", () => {
  it("explicite via AUTH_MODE, sinon required en production", () => {
    expect(resolveAuthMode({ AUTH_MODE: "optional", NODE_ENV: "production" } as never)).toBe("optional");
    expect(resolveAuthMode({ AUTH_MODE: "required" } as never)).toBe("required");
    expect(resolveAuthMode({ NODE_ENV: "production" } as never)).toBe("required");
    expect(resolveAuthMode({} as never)).toBe("optional");
  });
});

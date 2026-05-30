import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { UIMessage } from "ai";
import { createApp } from "../packages/mock-api/src/server.js";
import { createEngine } from "../packages/mcp-server/src/index.js";
import { createChatHandler } from "../packages/chat-backend/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, "..", "packages", "mock-api", "openapi.yaml");

const USAGE = {
  inputTokens: { total: 10, noCache: 10 },
  outputTokens: { total: 10 },
  totalTokens: 20,
} as never;

let mockServer: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((r) => {
    mockServer = app.listen(0, () => r());
  });
  baseUrl = `http://localhost:${(mockServer.address() as AddressInfo).port}`;
});
afterAll(() => mockServer?.close());

/**
 * Modèle mock à 2 étapes : (1) appelle l'outil execute avec du code qui
 * interroge l'API mock via le sandbox, puis (2) répond en texte. Cela exerce
 * toute la boucle (LLM → execute → sandbox → bridge → HTTP → réponse) sans clé.
 */
function twoStepModel(code: string) {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      call++;
      if (call === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "t1",
                toolName: "execute",
                input: JSON.stringify({ code }),
              },
              { type: "finish", finishReason: "tool-calls", usage: USAGE },
            ] as never,
          }),
        };
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "x" },
            { type: "text-delta", id: "x", delta: "Résumé des ventes prêt." },
            { type: "text-end", id: "x" },
            { type: "finish", finishReason: "stop", usage: USAGE },
          ] as never,
        }),
      };
    },
  });
}

function userMessage(text: string): UIMessage {
  return { id: "u1", role: "user", parts: [{ type: "text", text }] };
}

describe("chat backend — orchestration LLM + tools", () => {
  it("la boucle exécute le tool execute via le sandbox et stream la réponse finale", async () => {
    const engine = await createEngine({
      providers: [{ name: "mock", openapi: specPath, baseUrl }],
    });
    const code =
      "const s = await api.mock.getSalesSummary({}); return s.map(r => ({ region: r.region, revenue: r.revenue }));";
    const handler = createChatHandler(engine, { model: twoStepModel(code) });

    const response = await handler([userMessage("Donne-moi les ventes par région")]);
    expect(response.status).toBe(200);

    const body = await response.text();
    // La réponse finale du modèle est streamée.
    expect(body).toContain("Résumé des ventes prêt.");
    // Le résultat du tool execute (issu du sandbox + bridge + API) est présent.
    expect(body).toContain("revenue");
    expect(body).toContain("EMEA");
  });

  it("stoppe la boucle après pending_confirmation (une seule étape, pas de retry)", async () => {
    const engine = await createEngine({
      providers: [{ name: "mock", openapi: specPath, baseUrl }],
    });
    // createOrder est mutant → le moteur retourne pending_confirmation au LLM.
    const mutatingCode =
      "return await api.mock.createOrder({ body: { customerId: 'c1', region: 'EMEA', items: [] } });";
    let callCount = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                { type: "tool-call", toolCallId: "t1", toolName: "execute", input: JSON.stringify({ code: mutatingCode }) },
                { type: "finish", finishReason: "tool-calls", usage: USAGE },
              ] as never,
            }),
          };
        }
        // Ce second appel NE DOIT PAS arriver — la boucle doit s'être arrêtée.
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "x" },
              { type: "text-delta", id: "x", delta: "Retry inattendu." },
              { type: "text-end", id: "x" },
              { type: "finish", finishReason: "stop", usage: USAGE },
            ] as never,
          }),
        };
      },
    });
    const handler = createChatHandler(engine, { model });
    const response = await handler([userMessage("crée une commande")]);
    expect(response.status).toBe(200);
    const body = await response.text();
    // Le flux ne doit PAS contenir le texte du second appel LLM.
    expect(body).not.toContain("Retry inattendu.");
    // Le signal pending_confirmation doit apparaître dans le flux.
    expect(body).toContain("pending_confirmation");
    // Le modèle n'a été appelé qu'une seule fois (le loop s'est arrêté).
    expect(callCount).toBe(1);
  });

  it("propage proprement une erreur du sandbox dans le flux (pas de crash)", async () => {
    const engine = await createEngine({
      providers: [{ name: "mock", openapi: specPath, baseUrl }],
    });
    const handler = createChatHandler(engine, {
      model: twoStepModel('await fetch("http://evil"); return 1;'),
    });
    const response = await handler([userMessage("essaie un fetch interdit")]);
    const body = await response.text();
    // Le modèle conclut quand même ; l'erreur sandbox n'a pas planté le backend.
    expect(body).toContain("Résumé des ventes prêt.");
  });
});

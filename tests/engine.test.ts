import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "../packages/mock-api/src/server.js";
import { createEngine, truncateResult, inferArtifactHint } from "../packages/mcp-server/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, "..", "packages", "mock-api", "openapi.yaml");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});
afterAll(() => server?.close());

describe("createEngine — mode vide (§10.1)", () => {
  it("démarre sans provider, search('x') → [], pas de crash", async () => {
    const engine = await createEngine({});
    expect(engine.operations).toEqual([]);
    expect(engine.search("x").results).toEqual([]);
  });
});

describe("createEngine — avec provider mock", () => {
  it("search renvoie des hits bornés par topK", async () => {
    const engine = await createEngine({
      providers: [{ name: "mock", openapi: specPath, baseUrl }],
      search: { topK: 3 },
    });
    const { results } = engine.search("orders products sales", 50);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("§10.3 — execute agrège, données brutes absentes, artifactHint chart", async () => {
    const engine = await createEngine({
      providers: [{ name: "mock", openapi: specPath, baseUrl }],
    });
    const code = `
      const summary = await api.mock.getSalesSummary({});
      return summary.map((r) => ({ region: r.region, revenue: r.revenue }));
    `;
    const res = await engine.execute(code);
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.result)).toBe(true);
    expect(res.artifactHint).toBe("chart");
  });

  it("génère un .d.ts décrivant la surface api", async () => {
    const engine = await createEngine({
      providers: [{ name: "mock", openapi: specPath, baseUrl }],
    });
    expect(engine.dts).toContain("const api: Api;");
    expect(engine.dts).toContain("listOrders");
  });
});

describe("truncation (§10.8)", () => {
  it("tronque + signale quand > maxBytes", () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({ i, name: "x".repeat(50) }));
    const { value, truncated } = truncateResult(big, 1000);
    expect(truncated).toBe(true);
    expect((value as { truncated: boolean }).truncated).toBe(true);
    expect((value as { totalBytes: number }).totalBytes).toBeGreaterThan(1000);
  });
  it("ne tronque pas quand sous la limite", () => {
    const { truncated } = truncateResult({ a: 1 }, 1000);
    expect(truncated).toBe(false);
  });
});

describe("artifactHint", () => {
  it("tableau d'objets numériques → chart", () => {
    expect(inferArtifactHint([{ region: "EMEA", revenue: 100 }])).toBe("chart");
  });
  it("tableau d'objets non numériques → table", () => {
    expect(inferArtifactHint([{ name: "a" }, { name: "b" }])).toBe("table");
  });
  it("valeur scalaire → text", () => {
    expect(inferArtifactHint(42)).toBe("text");
  });
});

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCatalogue, generateDts, resolveConfig } from "../packages/catalogue/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, "..", "packages", "mock-api", "openapi.yaml");

describe("catalogue builder", () => {
  it("parse la spec mock en Operation[] (lecture uniquement)", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    // 5 endpoints de lecture (GET) dans la spec mock.
    expect(ops.length).toBe(5);
    expect(ops.every((o) => o.mutating === false)).toBe(true);
    expect(ops.every((o) => o.http.method === "get")).toBe(true);
  });

  it("namespace les opérations par provider", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const names = ops.map((o) => o.name).sort();
    expect(names).toContain("mock.listOrders");
    expect(names).toContain("mock.getOrder");
    expect(names).toContain("mock.getSalesSummary");
  });

  it("produit des signatures TS lisibles avec les bons params", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const getOrder = ops.find((o) => o.name === "mock.getOrder")!;
    expect(getOrder.signature).toContain("id: string");
    expect(getOrder.signature).toMatch(/Promise<.*>/);

    const listOrders = ops.find((o) => o.name === "mock.listOrders")!;
    expect(listOrders.signature).toContain("region?: string");
    expect(listOrders.signature).toContain("status?: string");
  });

  it("construit un schéma Zod qui valide les args et rejette les mauvais types", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const getOrder = ops.find((o) => o.name === "mock.getOrder")!;
    expect(getOrder.schema.safeParse({ id: "o1" }).success).toBe(true);
    expect(getOrder.schema.safeParse({ id: 123 }).success).toBe(false);
    // param requis manquant
    expect(getOrder.schema.safeParse({}).success).toBe(false);

    const listOrders = ops.find((o) => o.name === "mock.listOrders")!;
    // tous les params optionnels → {} accepté
    expect(listOrders.schema.safeParse({}).success).toBe(true);
  });

  it("encode les emplacements de params (path vs query) pour le dispatch HTTP", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const getOrder = ops.find((o) => o.name === "mock.getOrder")!;
    expect(getOrder.http.params).toContainEqual({ name: "id", in: "path" });
    expect(getOrder.http.pathTemplate).toBe("/orders/{id}");

    const listOrders = ops.find((o) => o.name === "mock.listOrders")!;
    expect(listOrders.http.params).toContainEqual({ name: "region", in: "query" });
  });

  it("génère un .d.ts groupé par provider décrivant le global api", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const dts = generateDts(ops);
    expect(dts).toContain("export interface MockApi");
    expect(dts).toContain("listOrders(args:");
    expect(dts).toContain("const api: Api;");
    expect(dts).toContain("mock: MockApi;");
  });
});

describe("config loader", () => {
  it("applique les valeurs par défaut sur une config vide", () => {
    const cfg = resolveConfig({});
    expect(cfg.providers).toEqual([]);
    expect(cfg.sandbox.runtime).toBe("deno");
    expect(cfg.sandbox.timeoutMs).toBe(5000);
    expect(cfg.search.backend).toBe("bm25");
    expect(cfg.search.topK).toBe(8);
    expect(cfg.mutations.mode).toBe("intent");
    expect(cfg.results.maxBytes).toBe(32_000);
  });
});

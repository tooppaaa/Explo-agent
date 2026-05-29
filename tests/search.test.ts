import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCatalogue } from "../packages/catalogue/src/index.js";
import { createSearch } from "../packages/search/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, "..", "packages", "mock-api", "openapi.yaml");

describe("search BM25", () => {
  it("§10.1 — mode vide : aucun provider → search renvoie []", () => {
    const search = createSearch([], 8);
    expect(search.query("anything")).toEqual([]);
  });

  it("§10.2 — hits avec signatures TS valides", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const search = createSearch(ops, 8);
    const hits = search.query("commandes par région");
    expect(hits.length).toBeGreaterThan(0);
    // La signature TS complète est obligatoire (PRD §6.3).
    expect(hits.every((h) => /\(args:.*\):\s*Promise<.*>/.test(h.signature))).toBe(true);
    expect(hits.some((h) => h.name === "mock.listOrders")).toBe(true);
  });

  it("trouve l'agrégat de ventes par mots-clés", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const search = createSearch(ops, 8);
    const hits = search.query("chiffre d'affaires ventes résumé");
    expect(hits.some((h) => h.name === "mock.getSalesSummary")).toBe(true);
  });

  it("borne le nombre de résultats à k", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const search = createSearch(ops, 8);
    const hits = search.query("orders", 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("expose le flag mutating (false en M0)", async () => {
    const ops = await buildCatalogue(specPath, { providerName: "mock" });
    const search = createSearch(ops, 8);
    const hits = search.query("products");
    expect(hits.every((h) => h.mutating === false)).toBe(true);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../packages/mock-api/src/server.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      base = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe("mock-api", () => {
  it("liste tous les produits", async () => {
    const res = await fetch(`${base}/products`);
    expect(res.status).toBe(200);
    const products = (await res.json()) as unknown[];
    expect(products.length).toBe(5);
  });

  it("filtre les produits par catégorie", async () => {
    const res = await fetch(`${base}/products?category=software`);
    const products = (await res.json()) as Array<{ category: string }>;
    expect(products.every((p) => p.category === "software")).toBe(true);
  });

  it("filtre les commandes par région et statut", async () => {
    const res = await fetch(`${base}/orders?region=EMEA&status=delivered`);
    const orders = (await res.json()) as Array<{ region: string; status: string }>;
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.region === "EMEA" && o.status === "delivered")).toBe(true);
  });

  it("récupère une commande par id, 404 sinon", async () => {
    const ok = await fetch(`${base}/orders/o1`);
    expect(ok.status).toBe(200);
    const missing = await fetch(`${base}/orders/does-not-exist`);
    expect(missing.status).toBe(404);
  });

  it("agrège les ventes par région en excluant les annulées", async () => {
    const res = await fetch(`${base}/sales/summary`);
    const rows = (await res.json()) as Array<{ region: string; revenue: number; orderCount: number }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.revenue > 0 && r.orderCount > 0)).toBe(true);
  });
});

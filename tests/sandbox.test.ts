import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "../packages/mock-api/src/server.js";
import { buildCatalogue, type Operation } from "../packages/catalogue/src/index.js";
import { DenoWorkerExecutor, HttpHostBridge } from "../packages/sandbox/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, "..", "packages", "mock-api", "openapi.yaml");

let server: Server;
let baseUrl: string;
let ops: Operation[];
const executor = new DenoWorkerExecutor();
const execOpts = { timeoutMs: 5000, memoryMb: 128 };

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
  ops = await buildCatalogue(specPath, { providerName: "mock" });
});

afterAll(() => {
  server?.close();
  executor.dispose();
});

function makeBridge() {
  return new HttpHostBridge(ops, [{ name: "mock", openapi: specPath, baseUrl }]);
}

describe("DenoWorkerExecutor + HostBridge", () => {
  it("exécute du code pur et renvoie la dernière valeur via return", async () => {
    const res = await executor.execute("return 2 + 40;", makeBridge(), execOpts);
    expect(res.ok).toBe(true);
    expect(res.result).toBe(42);
  });

  it("capture console.log dans logs", async () => {
    const res = await executor.execute(
      'console.log("hello", { a: 1 }); return 1;',
      makeBridge(),
      execOpts,
    );
    expect(res.ok).toBe(true);
    expect(res.logs).toContain('hello {"a":1}');
  });

  it("appelle une opération via le bridge (un seul read)", async () => {
    const res = await executor.execute(
      "const ps = await api.mock.listProducts({}); return ps.length;",
      makeBridge(),
      execOpts,
    );
    expect(res.ok).toBe(true);
    expect(res.result).toBe(5);
  });

  it("§10.3 — chaîne 2+ lectures + filtrage + agrégation ; données brutes absentes", async () => {
    const code = `
      const orders = await api.mock.listOrders({ region: "EMEA" });
      const customers = await api.mock.listCustomers({ region: "EMEA" });
      let revenue = 0;
      for (const o of orders) if (o.status !== "cancelled") revenue += o.total;
      return {
        region: "EMEA",
        orderCount: orders.length,
        customerCount: customers.length,
        revenue: Math.round(revenue * 100) / 100,
      };
    `;
    const res = await executor.execute(code, makeBridge(), execOpts);
    expect(res.ok).toBe(true);
    const result = res.result as Record<string, unknown>;
    expect(result.region).toBe("EMEA");
    expect(result.orderCount).toBeGreaterThan(0);
    expect(result.customerCount).toBeGreaterThan(0);
    expect(typeof result.revenue).toBe("number");

    // Les données brutes (tableau de commandes) ne doivent PAS fuiter.
    const serialized = JSON.stringify(res.result);
    expect(serialized).not.toContain("customerId");
    expect(serialized).not.toContain('"items"');
  });

  it("§10.7 — boucle infinie coupée au timeout, erreur propre, pas de crash", async () => {
    const res = await executor.execute("while (true) {}", makeBridge(), {
      timeoutMs: 1000,
      memoryMb: 128,
    });
    expect(res.ok).toBe(false);
    expect(res.error?.message).toMatch(/timed out/i);

    // Le serveur reste sain : une exécution suivante fonctionne.
    const after = await executor.execute("return 7;", makeBridge(), execOpts);
    expect(after.ok).toBe(true);
    expect(after.result).toBe(7);
  });

  it("remonte le corps de l'erreur HTTP au modèle (auto-correction)", async () => {
    const bridge = makeBridge();
    await expect(bridge.callOperation("mock.getOrder", { id: "does-not-exist" })).rejects.toThrow(
      /HTTP 404 from mock\.getOrder: .*Order not found/,
    );
  });

  it("remonte une erreur du bridge (opération inconnue) sans crash", async () => {
    const res = await executor.execute(
      "return await api.mock.doesNotExist({});",
      makeBridge(),
      execOpts,
    );
    expect(res.ok).toBe(false);
    expect(res.error?.message).toMatch(/Unknown operation/i);
  });
});

describe("pool de process Deno (réutilisation)", () => {
  it("réutilise le même process pour des exécutions successives", async () => {
    const pooled = new DenoWorkerExecutor();
    try {
      const r1 = await pooled.execute("return 1;", makeBridge(), execOpts);
      const r2 = await pooled.execute("return 2;", makeBridge(), execOpts);
      expect(r1.result).toBe(1);
      expect(r2.result).toBe(2);
      // Un seul `deno run` a été lancé pour les deux exécutions.
      expect(pooled.stats().spawned).toBe(1);
      expect(pooled.stats().idle).toBe(1);
    } finally {
      pooled.dispose();
    }
  });

  it("aucun état ne fuit entre deux exécutions du même process (Worker frais)", async () => {
    const pooled = new DenoWorkerExecutor();
    try {
      await pooled.execute("globalThis.leak = 'secret'; return 1;", makeBridge(), execOpts);
      const res = await pooled.execute("return typeof globalThis.leak;", makeBridge(), execOpts);
      expect(pooled.stats().spawned).toBe(1); // bien le MÊME process
      expect(res.result).toBe("undefined");
    } finally {
      pooled.dispose();
    }
  });

  it("un process en timeout interne reste sain ; un crash est remplacé", async () => {
    const pooled = new DenoWorkerExecutor();
    try {
      const t = await pooled.execute("while (true) {}", makeBridge(), { timeoutMs: 500, memoryMb: 128 });
      expect(t.ok).toBe(false);
      // Le timeout interne tue le Worker, pas le process : il est réutilisé.
      const after = await pooled.execute("return 7;", makeBridge(), execOpts);
      expect(after.ok).toBe(true);
      expect(after.result).toBe(7);
      expect(pooled.stats().spawned).toBe(1);
    } finally {
      pooled.dispose();
    }
  });

  it("exécutions concurrentes : pool borné, résultats corrects", async () => {
    const pooled = new DenoWorkerExecutor({ maxProcs: 2 });
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => pooled.execute(`return ${i};`, makeBridge(), execOpts)),
      );
      expect(results.map((r) => r.result)).toEqual([0, 1, 2, 3, 4]);
      expect(pooled.stats().spawned).toBeLessThanOrEqual(2);
    } finally {
      pooled.dispose();
    }
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCatalogue, type Operation } from "../packages/catalogue/src/index.js";
import { DenoWorkerExecutor, HttpHostBridge } from "../packages/sandbox/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, "..", "packages", "mock-api", "openapi.yaml");

const executor = new DenoWorkerExecutor();
const execOpts = { timeoutMs: 5000, memoryMb: 128 };
let ops: Operation[];

beforeAll(async () => {
  ops = await buildCatalogue(specPath, { providerName: "mock" });
});

function emptyBridge() {
  // Bridge sans serveur réel : on teste l'isolation, pas le HTTP.
  return new HttpHostBridge(ops, [{ name: "mock", openapi: specPath, baseUrl: "http://localhost:1" }]);
}

describe("§10.4 — aucune capacité ambiante dans le sandbox", () => {
  const vectors: Array<{ name: string; code: string }> = [
    { name: "fetch", code: 'return await fetch("http://example.com");' },
    { name: "Deno.readTextFile", code: 'return await Deno.readTextFile("/etc/passwd");' },
    { name: "Deno.env.get", code: 'return Deno.env.get("PATH");' },
    { name: "Deno.run/Command", code: 'return new Deno.Command("ls").outputSync();' },
    { name: "Deno.writeTextFile", code: 'return await Deno.writeTextFile("/tmp/x", "y");' },
  ];

  for (const v of vectors) {
    it(`${v.name} → échoue, serveur sain`, async () => {
      const res = await executor.execute(v.code, emptyBridge(), execOpts);
      expect(res.ok).toBe(false);
      expect(res.error?.message).toBeTruthy();
    });
  }

  it("le serveur reste sain après une tentative d'accès interdite", async () => {
    await executor.execute('await fetch("http://x");', emptyBridge(), execOpts);
    const ok = await executor.execute("return 123;", emptyBridge(), execOpts);
    expect(ok.ok).toBe(true);
    expect(ok.result).toBe(123);
  });
});

describe("§10.5 — le credential de service n'est jamais lisible depuis le sandbox", () => {
  const SECRET = "super-secret-service-token-DO-NOT-LEAK";

  beforeAll(() => {
    process.env.TEST_SERVICE_TOKEN = SECRET;
  });

  function bridgeWithSecret() {
    return new HttpHostBridge(ops, [
      {
        name: "mock",
        openapi: specPath,
        baseUrl: "http://localhost:1",
        auth: { type: "bearer", tokenEnv: "TEST_SERVICE_TOKEN" },
      },
    ]);
  }

  it("Deno.env.get du nom de la variable de credential → échoue", async () => {
    const res = await executor.execute(
      'return Deno.env.get("TEST_SERVICE_TOKEN");',
      bridgeWithSecret(),
      execOpts,
    );
    expect(res.ok).toBe(false);
    // Et même en cas d'erreur, le secret n'apparaît nulle part.
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });

  it("balayage de tous les globals/env accessibles ne révèle jamais le secret", async () => {
    const code = `
      const found = [];
      // Tente toutes les sources d'env imaginables.
      try { if (typeof Deno !== "undefined" && Deno.env) found.push(JSON.stringify(Deno.env.toObject())); } catch (e) { found.push("env-denied"); }
      try { found.push(JSON.stringify(globalThis)); } catch (e) {}
      try { if (typeof process !== "undefined") found.push(JSON.stringify(process.env)); } catch (e) {}
      return found.join("|");
    `;
    const res = await executor.execute(code, bridgeWithSecret(), execOpts);
    // Quoi qu'il retourne, le secret ne doit jamais y figurer.
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });

  it("le secret n'est pas exposé comme variable globale injectée", async () => {
    const res = await executor.execute(
      'return typeof TEST_SERVICE_TOKEN !== "undefined" ? TEST_SERVICE_TOKEN : "undefined-global";',
      bridgeWithSecret(),
      execOpts,
    );
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });
});

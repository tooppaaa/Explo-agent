import { readFileSync } from "node:fs";
import { z } from "zod";
import type { EngineConfig } from "./types.js";

/**
 * Config loader (PRD §6.1). Lit et valide la configuration.
 * Secrets via variables d'environnement uniquement (`*Env`) — jamais en clair
 * dans la config.
 */

const providerAuthSchema = z.union([
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), tokenEnv: z.string() }),
  z.object({
    type: z.literal("apiKey"),
    in: z.enum(["header", "query"]),
    name: z.string(),
    valueEnv: z.string(),
  }),
]);

const apiProviderSchema = z.object({
  name: z.string().min(1),
  openapi: z.string().min(1),
  baseUrl: z.string().optional(),
  auth: providerAuthSchema.optional(),
});

const engineConfigSchema = z.object({
  providers: z.array(apiProviderSchema).optional(),
  sandbox: z
    .object({
      runtime: z.enum(["deno", "isolated-vm"]).optional(),
      timeoutMs: z.number().int().positive().optional(),
      memoryMb: z.number().int().positive().optional(),
    })
    .optional(),
  search: z
    .object({
      backend: z.enum(["bm25", "embeddings"]).optional(),
      topK: z.number().int().positive().optional(),
    })
    .optional(),
  mutations: z
    .object({
      mode: z.enum(["intent", "direct"]).optional(),
      confirmTtlMs: z.number().int().positive().optional(),
    })
    .optional(),
  results: z
    .object({ maxBytes: z.number().int().positive().optional() })
    .optional(),
});

export interface ResolvedConfig {
  providers: NonNullable<EngineConfig["providers"]>;
  sandbox: {
    runtime: "deno" | "isolated-vm";
    timeoutMs: number;
    memoryMb: number;
  };
  search: { backend: "bm25" | "embeddings"; topK: number };
  mutations: { mode: "intent" | "direct"; confirmTtlMs: number };
  results: { maxBytes: number };
  /** embeddingsFn ne transite pas par le fichier ; injectée programmatiquement. */
  embeddingsFn?: (texts: string[]) => Promise<number[][]>;
}

const DEFAULTS = {
  sandbox: { runtime: "deno" as const, timeoutMs: 30000, memoryMb: 128 },
  search: { backend: "bm25" as const, topK: 8 },
  mutations: { mode: "intent" as const, confirmTtlMs: 10 * 60_000 },
  results: { maxBytes: 32_000 },
};

/** Applique les valeurs par défaut sur une config (déjà validée ou programmatique). */
export function resolveConfig(config: EngineConfig = {}): ResolvedConfig {
  return {
    providers: config.providers ?? [],
    sandbox: {
      runtime: config.sandbox?.runtime ?? DEFAULTS.sandbox.runtime,
      timeoutMs: config.sandbox?.timeoutMs ?? DEFAULTS.sandbox.timeoutMs,
      memoryMb: config.sandbox?.memoryMb ?? DEFAULTS.sandbox.memoryMb,
    },
    search: {
      backend: config.search?.backend ?? DEFAULTS.search.backend,
      topK: config.search?.topK ?? DEFAULTS.search.topK,
    },
    mutations: {
      mode: config.mutations?.mode ?? DEFAULTS.mutations.mode,
      confirmTtlMs: config.mutations?.confirmTtlMs ?? DEFAULTS.mutations.confirmTtlMs,
    },
    results: {
      maxBytes: config.results?.maxBytes ?? DEFAULTS.results.maxBytes,
    },
    embeddingsFn: config.search?.embeddingsFn,
  };
}

/** Charge une config depuis un fichier JSON, la valide, applique les défauts. */
export function loadConfigFromFile(path: string): ResolvedConfig {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const parsed = engineConfigSchema.parse(raw);
  return resolveConfig(parsed as EngineConfig);
}

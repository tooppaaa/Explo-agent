import {
  buildCatalogue,
  generateDts,
  resolveConfig,
  type EngineConfig,
  type Operation,
  type ResolvedConfig,
  type SandboxExecutor,
} from "catalogue";
import { createSearch, type SearchBackend, type SearchHit } from "search";
import { DenoWorkerExecutor, HttpHostBridge } from "sandbox";
import { truncateResult } from "./truncate.js";
import { inferArtifactHint, type ArtifactHint } from "./artifact-hint.js";

/**
 * Cœur du moteur (PRD §5, §7). Charge le catalogue depuis les providers
 * configurés, construit l'index de recherche, le sandbox et le HostBridge,
 * puis expose les deux tools `search` et `execute`.
 *
 * Sans provider → mode vide : `search` renvoie [], `execute` ne fournit pas
 * d'`api` utile (toute op est inconnue).
 */

export interface SearchResult {
  results: SearchHit[];
}

export interface ExecuteResult {
  ok: boolean;
  result?: unknown;
  logs?: string[];
  artifactHint?: ArtifactHint;
  truncated?: boolean;
  error?: { message: string; stack?: string };
}

export interface Engine {
  config: ResolvedConfig;
  operations: Operation[];
  dts: string;
  search(query: string, k?: number): SearchResult;
  execute(code: string): Promise<ExecuteResult>;
}

export interface CreateEngineOptions {
  /** Override de l'executor (tests). Défaut: DenoWorkerExecutor. */
  executor?: SandboxExecutor;
  /** fetch injectable pour le HostBridge (tests). */
  fetchImpl?: typeof fetch;
}

export async function createEngine(
  config: EngineConfig = {},
  opts: CreateEngineOptions = {},
): Promise<Engine> {
  const resolved = resolveConfig(config);

  // 1. Catalogue : concatène les Operation[] de chaque provider.
  const operations: Operation[] = [];
  for (const provider of resolved.providers) {
    const ops = await buildCatalogue(provider.openapi, { providerName: provider.name });
    operations.push(...ops);
  }

  // 2. Recherche (BM25 par défaut).
  const searchBackend: SearchBackend = createSearch(operations, resolved.search.topK);

  // 3. Sandbox + bridge.
  const executor = opts.executor ?? new DenoWorkerExecutor();
  const bridge = new HttpHostBridge(operations, resolved.providers, {
    fetchImpl: opts.fetchImpl,
  });

  const dts = generateDts(operations);

  return {
    config: resolved,
    operations,
    dts,

    search(query: string, k?: number): SearchResult {
      const bounded = k === undefined ? undefined : Math.min(k, resolved.search.topK);
      return { results: searchBackend.query(query, bounded) };
    },

    async execute(code: string): Promise<ExecuteResult> {
      const raw = await executor.execute(code, bridge, {
        timeoutMs: resolved.sandbox.timeoutMs,
        memoryMb: resolved.sandbox.memoryMb,
      });

      if (!raw.ok) {
        return { ok: false, logs: raw.logs, error: raw.error };
      }

      const { value, truncated } = truncateResult(raw.result, resolved.results.maxBytes);
      return {
        ok: true,
        result: value,
        logs: raw.logs,
        artifactHint: inferArtifactHint(value),
        truncated,
      };
    },
  };
}

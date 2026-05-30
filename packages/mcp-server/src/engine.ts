import {
  buildCatalogue,
  generateDts,
  resolveConfig,
  type EngineConfig,
  type Operation,
  type ResolvedConfig,
  type SandboxExecutor,
  type UiDescriptor,
} from "catalogue";
import { createSearch, type SearchBackend, type SearchHit } from "search";
import { DenoWorkerExecutor, HttpHostBridge } from "sandbox";
import { truncateResult } from "./truncate.js";
import { inferUiDescriptor } from "./infer-ui.js";

export interface SearchResult {
  results: SearchHit[];
}

export interface ExecuteResult {
  ok: boolean;
  result?: unknown;
  logs?: string[];
  ui?: UiDescriptor;
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
  executor?: SandboxExecutor;
  fetchImpl?: typeof fetch;
}

export async function createEngine(
  config: EngineConfig = {},
  opts: CreateEngineOptions = {},
): Promise<Engine> {
  const resolved = resolveConfig(config);

  const operations: Operation[] = [];
  for (const provider of resolved.providers) {
    const ops = await buildCatalogue(provider.openapi, { providerName: provider.name });
    operations.push(...ops);
  }

  const searchBackend: SearchBackend = createSearch(operations, resolved.search.topK);
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

      // Extrait __ui si le sandbox l'a retourné, et isole .data comme résultat.
      let data: unknown = raw.result;
      let ui: UiDescriptor | undefined;
      if (raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)) {
        const obj = raw.result as Record<string, unknown>;
        if ("__ui" in obj) {
          ui = obj.__ui as UiDescriptor;
          data = "data" in obj ? obj.data : undefined;
        }
      }

      const { value, truncated } = truncateResult(data, resolved.results.maxBytes);
      return {
        ok: true,
        result: value,
        logs: raw.logs,
        ui: ui ?? inferUiDescriptor(value),
        truncated,
      };
    },
  };
}

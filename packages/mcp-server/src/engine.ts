import {
  buildCatalogue,
  generateDts,
  resolveConfig,
  parseUiDescriptor,
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
  /** Présent quand une op mutante a été bloquée (mode intent). */
  pendingMutation?: { id: string; opName: string; args: unknown };
}

export interface Engine {
  config: ResolvedConfig;
  operations: Operation[];
  dts: string;
  search(query: string, k?: number): SearchResult;
  execute(code: string): Promise<ExecuteResult>;
  /** Exécute la mutation stockée en attente (après confirmation utilisateur). */
  confirmMutation(id: string): Promise<ExecuteResult>;
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
  // Mode "direct" (config) : les mutations s'exécutent sans confirmation.
  // Mode "intent" (défaut) : elles sont bloquées → bouton de confirmation.
  const allowMutations = resolved.mutations.mode === "direct";
  const bridge = new HttpHostBridge(operations, resolved.providers, {
    fetchImpl: opts.fetchImpl,
    allowMutations,
  });
  const dts = generateDts(operations);
  const pendingMutations = new Map<string, { code: string }>();

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
        // Mode intent : op mutante bloquée → on stocke l'intent et on ÉMET
        // NOUS-MÊMES le bouton de confirmation (pas l'erreur, pas le modèle).
        // Le modèle n'a donc jamais à écrire de code pour rendre un bouton
        // (source d'erreurs "label is not defined") ni à rappeler execute.
        if (raw.error?.message?.startsWith("MUTATION_BLOCKED:")) {
          try {
            const blocked = JSON.parse(raw.error.message.slice("MUTATION_BLOCKED:".length)) as {
              name: string;
              args: unknown;
            };
            const id = crypto.randomUUID();
            pendingMutations.set(id, { code });
            return {
              ok: false,
              logs: raw.logs,
              pendingMutation: { id, opName: blocked.name, args: blocked.args },
              // Bouton rendu directement par le widget (action interceptée → POST /confirm).
              ui: { type: "button", label: "Confirmer et exécuter", action: `__confirm:${id}` },
            };
          } catch {
            // JSON.parse failed – fall through to generic error
          }
        }
        return { ok: false, logs: raw.logs, error: raw.error };
      }

      // Extrait __ui si le sandbox l'a retourné, et isole .data comme résultat.
      // Le __ui est une sortie LLM NON FIABLE : on la valide (règle dure §5) et
      // on retombe sur l'inférence si elle est malformée.
      let data: unknown = raw.result;
      let ui: UiDescriptor | undefined;
      if (raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)) {
        const obj = raw.result as Record<string, unknown>;
        if ("__ui" in obj) {
          data = "data" in obj ? obj.data : undefined;
          // Le modèle renvoie le descripteur SANS `data` (passé séparément, cf.
          // prompt). Les schémas chart/table EXIGENT `data` : il faut fusionner
          // AVANT validation, sinon tout chart échoue et retombe sur l'inférence
          // (un pie-chart demandé devenait un bar-chart). On valide ainsi le
          // descripteur complet, data incluse — c'est ce que le widget rend.
          const meta = obj.__ui;
          const candidate =
            meta && typeof meta === "object" && !Array.isArray(meta) && !("data" in meta) && data !== undefined
              ? { ...(meta as Record<string, unknown>), data }
              : meta;
          ui = parseUiDescriptor(candidate);
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

    async confirmMutation(id: string): Promise<ExecuteResult> {
      const pending = pendingMutations.get(id);
      if (!pending) {
        return { ok: false, error: { message: `Aucune mutation en attente avec l'identifiant "${id}".` } };
      }
      pendingMutations.delete(id);

      const confirmBridge = new HttpHostBridge(operations, resolved.providers, {
        fetchImpl: opts.fetchImpl,
        allowMutations: true,
      });

      const raw = await executor.execute(pending.code, confirmBridge, {
        timeoutMs: resolved.sandbox.timeoutMs,
        memoryMb: resolved.sandbox.memoryMb,
      });

      if (!raw.ok) {
        return { ok: false, logs: raw.logs, error: raw.error };
      }

      let data: unknown = raw.result;
      let ui: UiDescriptor | undefined;
      if (raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)) {
        const obj = raw.result as Record<string, unknown>;
        if ("__ui" in obj) {
          data = "data" in obj ? obj.data : undefined;
          const meta = obj.__ui;
          const candidate =
            meta && typeof meta === "object" && !Array.isArray(meta) && !("data" in meta) && data !== undefined
              ? { ...(meta as Record<string, unknown>), data }
              : meta;
          ui = parseUiDescriptor(candidate);
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

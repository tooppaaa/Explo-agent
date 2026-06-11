import type { ZodType } from "zod";

/**
 * Types partagés du moteur code-mode (PRD §6.1, §6.2, §6.6, §7).
 * Ce module ne contient AUCUNE logique — uniquement les contrats.
 */

// ── Configuration (PRD §6.1) ────────────────────────────────────────────────

export type ProviderAuth =
  | { type: "none" }
  | { type: "bearer"; tokenEnv: string }
  | { type: "apiKey"; in: "header" | "query"; name: string; valueEnv: string };

export interface ApiProvider {
  /** Préfixe de namespace dans le SDK (ex. "orders" → api.orders.*). */
  name: string;
  /** Chemin local ou URL d'une spec OpenAPI 3.0/3.1. */
  openapi: string;
  /** Override de servers[] de la spec. */
  baseUrl?: string;
  /** Auth v1 = credential de service. Le token utilisateur est REPORTÉ. */
  auth?: ProviderAuth;
}

export interface EngineConfig {
  /** Optionnel — 0 provider = mode vide. */
  providers?: ApiProvider[];
  sandbox?: {
    runtime?: "deno" | "isolated-vm"; // défaut: "deno"
    timeoutMs?: number; // défaut: 5000
    memoryMb?: number; // défaut: 128
  };
  search?: {
    backend?: "bm25" | "embeddings"; // défaut: "bm25"
    topK?: number; // défaut: 8
    embeddingsFn?: (texts: string[]) => Promise<number[][]>;
  };
  mutations?: {
    mode?: "intent" | "direct"; // défaut: "intent"
    /** Durée de validité d'une mutation en attente de confirmation. Défaut: 10 min. */
    confirmTtlMs?: number;
  };
  results?: { maxBytes?: number }; // défaut: 32_000
}

// ── Catalogue (PRD §6.2) ─────────────────────────────────────────────────────

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * Décrit où chaque argument validé doit être injecté dans la requête HTTP.
 * Construit par le parser, consommé par le HostBridge (côté serveur de confiance).
 */
export interface ParamLocation {
  name: string;
  in: "path" | "query" | "header";
}

export interface OperationHttp {
  method: HttpMethod;
  /** Template de chemin OpenAPI, ex. "/orders/{id}". */
  pathTemplate: string;
  params: ParamLocation[];
  /** Présent si l'op accepte un requestBody JSON. */
  hasBody: boolean;
}

export interface Operation {
  /** `${provider.name}.${operationId}` (fallback: method+path slugifié). */
  name: string;
  description: string;
  /** Signature TS lisible (pour search). */
  signature: string;
  /** Type TS de la réponse (succès 2xx), dérivé de l'OpenAPI. "unknown" si absent. */
  responseType: string;
  /** Validation des args (params + requestBody) — Zod, côté hôte. */
  schema: ZodType;
  /** true si method ∈ {POST,PUT,PATCH,DELETE} (override possible: x-mutating). */
  mutating: boolean;
  /** Métadonnées de dispatch HTTP, résolues côté serveur par le HostBridge. */
  http: OperationHttp;
  /** Provider d'appartenance. */
  provider: string;
}

// ── Sandbox & bridge (PRD §6.6) ─────────────────────────────────────────────

export interface ExecOpts {
  timeoutMs: number;
  memoryMb: number;
}

export interface RawExecResult {
  ok: boolean;
  result?: unknown;
  logs?: string[];
  error?: { message: string; stack?: string };
}

/**
 * Unique pont vers l'extérieur depuis le sandbox.
 * Implémenté côté serveur de confiance (HostBridge).
 */
export interface HostBridge {
  callOperation(name: string, args: unknown): Promise<unknown>;
}

export interface SandboxExecutor {
  execute(code: string, bridge: HostBridge, opts: ExecOpts): Promise<RawExecResult>;
}

/** Porte le scope d'appel par requête (v1 = credential de service). Jamais global. */
export interface CallContext {
  provider: string;
}

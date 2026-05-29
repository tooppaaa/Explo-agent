import type { ApiProvider, HostBridge, Operation } from "catalogue";

/**
 * HostBridge (PRD §6.6, §8) — côté serveur de confiance.
 *
 * Reçoit les appels `api.*` venus du sandbox et, pour chacun :
 *  1. résout l'opération depuis le catalogue ;
 *  2. valide les args avec le schéma Zod (§8.4) AVANT tout HTTP ;
 *  3. construit la requête (path/query/headers) et injecte le credential ;
 *  4. fait le HTTP côté serveur vers l'API publique ;
 *  5. renvoie le corps JSON.
 *
 * Le credential de service est résolu ici depuis l'environnement et n'est
 * JAMAIS exposé au code sandboxé (§8.7). Les credentials ne sont jamais loggés.
 *
 * M0 : lecture seule. Une op mutante (absente du catalogue M0) est refusée.
 */

interface ResolvedAuth {
  apply(url: URL, headers: Record<string, string>): void;
}

function resolveAuth(provider: ApiProvider): ResolvedAuth {
  const auth = provider.auth ?? { type: "none" as const };
  switch (auth.type) {
    case "none":
      return { apply() {} };
    case "bearer": {
      const token = process.env[auth.tokenEnv];
      return {
        apply(_url, headers) {
          if (token) headers["authorization"] = `Bearer ${token}`;
        },
      };
    }
    case "apiKey": {
      const value = process.env[auth.valueEnv];
      return {
        apply(url, headers) {
          if (!value) return;
          if (auth.in === "header") headers[auth.name.toLowerCase()] = value;
          else url.searchParams.set(auth.name, value);
        },
      };
    }
  }
}

interface ProviderRuntime {
  baseUrl: string;
  auth: ResolvedAuth;
}

export interface HostBridgeOptions {
  /** fetch injectable (tests). Défaut: global fetch. */
  fetchImpl?: typeof fetch;
}

export class HttpHostBridge implements HostBridge {
  private readonly ops = new Map<string, Operation>();
  private readonly providers = new Map<string, ProviderRuntime>();
  private readonly fetchImpl: typeof fetch;

  constructor(operations: Operation[], providerConfigs: ApiProvider[], opts: HostBridgeOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    for (const op of operations) this.ops.set(op.name, op);
    for (const p of providerConfigs) {
      this.providers.set(p.name, {
        baseUrl: (p.baseUrl ?? "").replace(/\/$/, ""),
        auth: resolveAuth(p),
      });
    }
  }

  async callOperation(name: string, rawArgs: unknown): Promise<unknown> {
    const op = this.ops.get(name);
    if (!op) throw new Error(`Unknown operation: ${name}`);

    // M0 : lecture seule. Garde défensive (les mutations arriveront en M4).
    if (op.mutating) {
      throw new Error(`Operation "${name}" is mutating; mutations are not enabled (M0 read-only).`);
    }

    const provider = this.providers.get(op.provider);
    if (!provider) throw new Error(`No provider runtime for "${op.provider}"`);

    // 1. Validation systématique des args côté hôte (§8.4).
    const parsed = op.schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      throw new Error(`Invalid args for ${name}: ${parsed.error.message}`);
    }
    const args = parsed.data as Record<string, unknown>;

    // 2. Construction de l'URL : substitution des path params + query.
    let path = op.http.pathTemplate;
    const headers: Record<string, string> = { accept: "application/json" };

    for (const p of op.http.params) {
      const value = args[p.name];
      if (value === undefined) continue;
      if (p.in === "path") {
        path = path.replace(`{${p.name}}`, encodeURIComponent(String(value)));
      } else if (p.in === "header") {
        headers[p.name.toLowerCase()] = String(value);
      }
    }

    const url = new URL(provider.baseUrl + path);
    for (const p of op.http.params) {
      if (p.in !== "query") continue;
      const value = args[p.name];
      if (value !== undefined) url.searchParams.set(p.name, String(value));
    }

    // 3. Injection du credential (jamais exposé au sandbox, jamais loggé).
    provider.auth.apply(url, headers);

    const init: RequestInit = { method: op.http.method.toUpperCase(), headers };
    if (op.http.hasBody && args.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(args.body);
    }

    // 4. HTTP côté serveur.
    const res = await this.fetchImpl(url.toString(), init);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${op.name}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return await res.json();
    }
    return await res.text();
  }
}

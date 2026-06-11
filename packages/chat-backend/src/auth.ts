import type { RequestHandler } from "express";

/**
 * Auth des endpoints publics (/chat, /confirm, /mcp).
 *
 * Le Bearer token du client est mappé sur les providers (tokenOverrides) par
 * le serveur ; sans token, le bridge retombe sur le credential de SERVICE lu
 * dans l'env. En prod, ce fallback exposerait l'API métier (identité de
 * service) à quiconque atteint l'endpoint : le mode "required" refuse donc
 * toute requête sans Bearer.
 *
 * - "required" : 401 + WWW-Authenticate sans Bearer. Défaut en production.
 * - "optional" : le credential de service sert de fallback. Défaut en dev.
 */
export type AuthMode = "required" | "optional";

export function resolveAuthMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  const mode = env.AUTH_MODE;
  if (mode === "required" || mode === "optional") return mode;
  return env.NODE_ENV === "production" ? "required" : "optional";
}

/** Extrait le token Bearer du header Authorization (undefined si absent/malformé). */
export function extractBearer(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m?.[1];
}

export function requireAuth(mode: AuthMode): RequestHandler {
  return (req, res, next) => {
    if (mode === "optional" || extractBearer(req.headers.authorization)) {
      next();
      return;
    }
    // WWW-Authenticate : signale aux clients MCP (Claude, inspecteurs…) que
    // l'endpoint attend un Bearer (RFC 6750).
    res
      .status(401)
      .set("WWW-Authenticate", 'Bearer realm="code-mode-engine"')
      .json({ ok: false, error: { message: "Authentification requise : header Authorization: Bearer <token>." } });
  };
}

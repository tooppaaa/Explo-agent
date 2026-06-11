import type { RequestHandler } from "express";

/**
 * Rate limiting en mémoire, fenêtre fixe par IP. Volontairement minimal
 * (zéro dépendance) : protège les endpoints qui déclenchent un appel LLM
 * (/chat) ou une mutation (/confirm) contre l'abus de coût.
 *
 * Limite par instance — derrière un ALB multi-tasks, la limite effective est
 * multipliée par le nombre de tasks (acceptable pour un garde-fou de coût).
 */
export interface RateLimitOptions {
  /** Taille de la fenêtre. Défaut: 60 s. */
  windowMs?: number;
  /** Requêtes max par IP et par fenêtre. 0 = désactivé. Défaut: 30. */
  max?: number;
}

export function rateLimit(opts: RateLimitOptions = {}): RequestHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 30;
  if (max <= 0) return (_req, _res, next) => next();

  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    // Purge paresseuse pour borner la mémoire.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count++;
    if (entry.count > max) {
      res
        .status(429)
        .set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)))
        .json({ ok: false, error: { message: "Trop de requêtes, réessaie plus tard." } });
      return;
    }
    next();
  };
}

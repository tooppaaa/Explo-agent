import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseExporter } from "langfuse-vercel";

/**
 * Observabilité via OpenTelemetry (standard vendor-neutral) — Langfuse n'est
 * qu'un exporter branchable (anti-lock-in PRD §9 : on peut le remplacer par
 * n'importe quel backend OTel sans toucher au cœur).
 *
 * Entièrement OPTIONNEL : no-op si les clés LANGFUSE_* ne sont pas présentes.
 * Les credentials vivent côté Node (env), jamais dans le sandbox.
 */

let sdk: NodeSDK | undefined;

export function isTelemetryEnabled(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

/** Démarre l'export OTel→Langfuse si configuré. Renvoie true si actif. */
export function initTelemetry(): boolean {
  if (sdk || !isTelemetryEnabled()) return false;
  sdk = new NodeSDK({
    traceExporter: new LangfuseExporter({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASEURL ?? "https://cloud.langfuse.com",
    }),
  });
  sdk.start();
  return true;
}

/** Flush + arrêt propre (à appeler avant de quitter le process). */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = undefined;
}

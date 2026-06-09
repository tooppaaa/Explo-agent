/**
 * Limites de résultat (PRD §6.8).
 * Si le JSON du résultat dépasse maxBytes, on tronque et on signale.
 * Recommandation au modèle : agréger DANS le sandbox avant de `return`.
 */
export interface TruncatedResult {
  truncated: true;
  preview: string;
  totalBytes: number;
}

export function truncateResult(
  result: unknown,
  maxBytes: number,
): { value: unknown; truncated: boolean } {
  let json: string;
  try {
    json = JSON.stringify(result) ?? "";
  } catch {
    return { value: { truncated: true, preview: "[unserializable]", totalBytes: 0 }, truncated: true };
  }
  const totalBytes = Buffer.byteLength(json, "utf-8");
  if (totalBytes <= maxBytes) return { value: result, truncated: false };

  const preview = json.slice(0, Math.max(0, maxBytes));
  const out: TruncatedResult = { truncated: true, preview, totalBytes };
  return { value: out, truncated: true };
}

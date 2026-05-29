/**
 * Heuristique d'artifactHint (PRD §6.5).
 *  - tableau d'objets avec ≥1 champ numérique → "chart"
 *  - autre tableau d'objets → "table"
 *  - pendingIntents non vide → "action" (géré en amont, M4)
 *  - sinon → "text"
 */
export type ArtifactHint = "chart" | "table" | "text" | "action";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function inferArtifactHint(result: unknown): ArtifactHint {
  if (Array.isArray(result) && result.length > 0 && result.every(isPlainObject)) {
    const rows = result as Array<Record<string, unknown>>;
    const hasNumeric = rows.some((row) =>
      Object.values(row).some((v) => typeof v === "number" && Number.isFinite(v)),
    );
    return hasNumeric ? "chart" : "table";
  }
  return "text";
}

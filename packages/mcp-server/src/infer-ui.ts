import type { UiDescriptor } from "catalogue";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Fallback : si le sandbox n'a pas retourné de `__ui`, on devine le
 * composant à partir de la forme des données (rétro-compat + filet de sécurité).
 */
export function inferUiDescriptor(result: unknown): UiDescriptor | undefined {
  if (!Array.isArray(result) || result.length === 0 || !result.every(isPlainObject))
    return undefined;

  const rows = result as Array<Record<string, unknown>>;
  const keys = Object.keys(rows[0]);
  const valueKeys = keys.filter((k) =>
    rows.every((r) => typeof r[k] === "number" && Number.isFinite(r[k] as number)),
  );

  if (valueKeys.length > 0) {
    const xKey = keys.find((k) => !valueKeys.includes(k)) ?? keys[0];
    return { type: "bar-chart", data: rows, xKey, valueKeys };
  }
  return { type: "table", data: rows };
}

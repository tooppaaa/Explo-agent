/**
 * Helpers purs (testables sans DOM) pour transformer les messages UI du
 * Vercel AI SDK en artifacts rendables. PRD §6.9 : mappe artifactHint → rendu.
 */

export interface ChartData {
  xKey: string;
  numericKeys: string[];
  rows: Array<Record<string, unknown>>;
}

interface UIPartLike {
  type: string;
  text?: string;
  state?: string;
  output?: unknown;
}

interface UIMessageLike {
  role: string;
  parts?: UIPartLike[];
}

/** Concatène le texte d'un message. */
export function extractText(message: UIMessageLike): string {
  return (message.parts ?? [])
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

interface ExecuteOutput {
  ok?: boolean;
  result?: unknown;
  artifactHint?: string;
  error?: { message?: string };
  logs?: string[];
}

/** Récupère les sorties du tool `execute` (parts `tool-execute`, output dispo). */
export function extractExecuteOutputs(message: UIMessageLike): ExecuteOutput[] {
  return (message.parts ?? [])
    .filter(
      (p) =>
        (p.type === "tool-execute" || p.type === "dynamic-tool") &&
        p.state === "output-available" &&
        p.output != null,
    )
    .map((p) => p.output as ExecuteOutput);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Transforme un résultat (tableau d'objets numériques) en données de chart :
 * choisit la première clé non-numérique comme axe X et les clés numériques
 * comme séries. Renvoie null si non charteable.
 */
export function toChartData(result: unknown): ChartData | null {
  if (!Array.isArray(result) || result.length === 0) return null;
  if (!result.every(isPlainObject)) return null;
  const rows = result as Array<Record<string, unknown>>;

  const keys = Object.keys(rows[0]);
  const numericKeys = keys.filter((k) =>
    rows.every((r) => typeof r[k] === "number" && Number.isFinite(r[k] as number)),
  );
  if (numericKeys.length === 0) return null;

  const xKey = keys.find((k) => !numericKeys.includes(k)) ?? "__index";
  const withIndex =
    xKey === "__index" ? rows.map((r, i) => ({ ...r, __index: i })) : rows;

  return { xKey, numericKeys, rows: withIndex };
}

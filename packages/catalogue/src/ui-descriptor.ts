/**
 * Descripteurs UI (GenUI option A) — le sandbox les retourne dans `__ui`,
 * l'engine les passe au widget qui rend le bon composant React.
 * Dupliqué dans packages/widget/src/ui-descriptor.ts (types seulement, 0 runtime).
 */

export type BarChartDescriptor = {
  type: "bar-chart" | "line-chart";
  data: Record<string, unknown>[];
  xKey: string;
  valueKeys: string[];
  title?: string;
};

export type PieChartDescriptor = {
  type: "pie-chart";
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  title?: string;
};

export type TableDescriptor = {
  type: "table";
  data: Record<string, unknown>[];
  title?: string;
};

export type MetricDescriptor = {
  type: "metric";
  label: string;
  value: number | string;
  unit?: string;
  trend?: "up" | "down" | "neutral";
};

export type MetricGridDescriptor = {
  type: "metric-grid";
  items: Array<{ label: string; value: number | string; unit?: string }>;
  title?: string;
};

export type ButtonDescriptor = {
  type: "button";
  label: string;
  /** Message envoyé au chat quand le bouton est cliqué. */
  action: string;
};

export type UiDescriptor =
  | BarChartDescriptor
  | PieChartDescriptor
  | TableDescriptor
  | MetricDescriptor
  | MetricGridDescriptor
  | ButtonDescriptor;

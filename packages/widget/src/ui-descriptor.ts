// Types DUPLIQUÉS depuis packages/catalogue/src/ui-descriptor.ts.
// Le widget n'embarque PAS catalogue (ni zod) dans son bundle IIFE — il ne lui
// faut que les types (effacés au build). Garder en phase avec le schéma Zod
// côté catalogue, qui reste la source de vérité pour la validation.

export type CartesianChartDescriptor = {
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
  action: string;
};

export type UiDescriptor =
  | CartesianChartDescriptor
  | PieChartDescriptor
  | TableDescriptor
  | MetricDescriptor
  | MetricGridDescriptor
  | ButtonDescriptor;

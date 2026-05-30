// Même type que packages/catalogue/src/ui-descriptor.ts — dupliqué pour
// éviter d'importer catalogue dans le bundle widget (zéro code runtime ici).

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
  action: string;
};

export type UiDescriptor =
  | BarChartDescriptor
  | PieChartDescriptor
  | TableDescriptor
  | MetricDescriptor
  | MetricGridDescriptor
  | ButtonDescriptor;

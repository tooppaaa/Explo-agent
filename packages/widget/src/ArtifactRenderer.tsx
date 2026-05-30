import type { UiDescriptor } from "./ui-descriptor.js";
import { BarChartBlock, LineChartBlock, PieChartBlock, TableBlock } from "./ChartBlock.js";
import { MetricCard, MetricGrid } from "./MetricCard.js";
import { ActionButton } from "./ActionButton.js";

interface Props {
  ui: UiDescriptor;
  onAction: (msg: string) => void;
}

export function ArtifactRenderer({ ui, onAction }: Props) {
  switch (ui.type) {
    case "bar-chart":  return <BarChartBlock desc={{ ...ui, type: "bar-chart" }} />;
    case "line-chart": return <LineChartBlock desc={{ ...ui, type: "line-chart" }} />;
    case "pie-chart":  return <PieChartBlock desc={ui} />;
    case "table":      return <TableBlock desc={ui} />;
    case "metric":     return <MetricCard {...ui} />;
    case "metric-grid": return <MetricGrid {...ui} />;
    case "button":     return <ActionButton {...ui} onAction={onAction} />;
  }
}

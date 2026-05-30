import { Component, type ReactNode } from "react";
import type { UiDescriptor } from "./ui-descriptor.js";
import { BarChartBlock, LineChartBlock, PieChartBlock, TableBlock } from "./ChartBlock.js";
import { MetricCard, MetricGrid } from "./MetricCard.js";
import { ActionButton } from "./ActionButton.js";

interface Props {
  ui: UiDescriptor;
  onAction: (msg: string) => void;
}

/** Empêche qu'un artifact défectueux fasse tomber tout le drawer. */
class ArtifactBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <div className="cme-error" role="alert">Impossible d'afficher cet artifact.</div>;
    }
    return this.props.children;
  }
}

function render(ui: UiDescriptor, onAction: (msg: string) => void): ReactNode {
  switch (ui.type) {
    case "bar-chart":   return <BarChartBlock desc={ui} />;
    case "line-chart":  return <LineChartBlock desc={ui} />;
    case "pie-chart":   return <PieChartBlock desc={ui} />;
    case "table":       return <TableBlock desc={ui} />;
    case "metric":      return <MetricCard {...ui} />;
    case "metric-grid": return <MetricGrid {...ui} />;
    case "button":      return <ActionButton {...ui} onAction={onAction} />;
    default:
      return (
        <div className="cme-error" role="alert">
          Type d'artifact non supporté : {String((ui as { type?: unknown }).type)}
        </div>
      );
  }
}

export function ArtifactRenderer({ ui, onAction }: Props) {
  return <ArtifactBoundary>{render(ui, onAction)}</ArtifactBoundary>;
}

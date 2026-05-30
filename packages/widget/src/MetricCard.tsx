import type { MetricDescriptor, MetricGridDescriptor } from "./ui-descriptor.js";

function MetricItem({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="cme-metric">
      <div className="cme-metric-value">
        {String(value)}
        {unit && <span className="cme-metric-unit"> {unit}</span>}
      </div>
      <div className="cme-metric-label">{label}</div>
    </div>
  );
}

export function MetricCard(desc: MetricDescriptor) {
  return (
    <div className="cme-metric-card">
      <MetricItem label={desc.label} value={desc.value} unit={desc.unit} />
    </div>
  );
}

export function MetricGrid(desc: MetricGridDescriptor) {
  return (
    <div>
      {desc.title && <div className="cme-chart-title">{desc.title}</div>}
      <div className="cme-metric-grid">
        {desc.items.map((item, i) => (
          <div key={i} className="cme-metric-card">
            <MetricItem {...item} />
          </div>
        ))}
      </div>
    </div>
  );
}

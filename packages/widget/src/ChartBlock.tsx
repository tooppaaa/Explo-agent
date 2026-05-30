import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { CartesianChartDescriptor, PieChartDescriptor, TableDescriptor } from "./ui-descriptor.js";

const COLORS = ["#4f46e5", "#06b6d4", "#f59e0b", "#ef4444", "#10b981"];
const RADIAN = Math.PI / 180;

function ChartTitle({ title }: { title?: string }) {
  return title ? <div className="cme-chart-title">{title}</div> : null;
}

export function BarChartBlock({ desc }: { desc: CartesianChartDescriptor }) {
  const { data, xKey, valueKeys, title } = desc;
  return (
    <div className="cme-chart">
      <ChartTitle title={title} />
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <XAxis dataKey={xKey} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          {valueKeys.length > 1 && <Legend />}
          {valueKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineChartBlock({ desc }: { desc: CartesianChartDescriptor }) {
  const { data, xKey, valueKeys, title } = desc;
  return (
    <div className="cme-chart">
      <ChartTitle title={title} />
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <XAxis dataKey={xKey} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          {valueKeys.length > 1 && <Legend />}
          {valueKeys.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number; percent: number;
}) {
  if (percent < 0.05) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function PieChartBlock({ desc }: { desc: PieChartDescriptor }) {
  const { data, nameKey, valueKey, title } = desc;
  return (
    <div className="cme-chart">
      <ChartTitle title={title} />
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} labelLine={false} label={PieLabel as never}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TableBlock({ desc }: { desc: TableDescriptor }) {
  const { data, title } = desc;
  const cols = data.length > 0 ? Object.keys(data[0]) : [];
  return (
    <div>
      <ChartTitle title={title} />
      <div className="cme-table-wrap">
        <table className="cme-table">
          <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>{cols.map((c) => <td key={c}>{String(r[c] ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

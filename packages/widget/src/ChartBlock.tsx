import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ChartData } from "./extract.js";

const COLORS = ["#4f46e5", "#06b6d4", "#f59e0b", "#ef4444", "#10b981"];

/** Rendu d'un résultat tabulaire numérique en bar chart (PRD §6.9). */
export function ChartBlock({ data }: { data: ChartData }) {
  return (
    <div className="cme-chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <XAxis dataKey={data.xKey} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          {data.numericKeys.length > 1 && <Legend />}
          {data.numericKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rendu tabulaire générique (artifactHint "table"). */
export function TableBlock({ rows }: { rows: Array<Record<string, unknown>> }) {
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <div className="cme-table-wrap">
      <table className="cme-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c}>{String(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

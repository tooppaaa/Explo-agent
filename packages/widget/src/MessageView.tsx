import type { UIMessage } from "ai";
import { extractText, extractExecuteOutputs, toChartData } from "./extract.js";
import { ChartBlock, TableBlock } from "./ChartBlock.js";

/** Rend un message : texte + artifacts issus du tool execute. */
export function MessageView({ message }: { message: UIMessage }) {
  const text = extractText(message as never);
  const outputs = extractExecuteOutputs(message as never);

  return (
    <div className={`cme-msg cme-msg-${message.role}`}>
      {text && <div className="cme-text">{text}</div>}
      {outputs.map((out, i) => {
        if (!out.ok) {
          return (
            <div key={i} className="cme-error">
              Erreur sandbox : {out.error?.message ?? "inconnue"}
            </div>
          );
        }
        const chart = out.artifactHint === "chart" ? toChartData(out.result) : null;
        if (chart) return <ChartBlock key={i} data={chart} />;
        if (
          out.artifactHint === "table" &&
          Array.isArray(out.result) &&
          out.result.length > 0
        ) {
          return <TableBlock key={i} rows={out.result as Array<Record<string, unknown>>} />;
        }
        return (
          <pre key={i} className="cme-result">
            {JSON.stringify(out.result, null, 2)}
          </pre>
        );
      })}
    </div>
  );
}

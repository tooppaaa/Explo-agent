import type { UIMessage } from "ai";
import { extractText, extractExecuteOutputs } from "./extract.js";
import { ArtifactRenderer } from "./ArtifactRenderer.js";

interface Props {
  message: UIMessage;
  onAction: (msg: string) => void;
}

export function MessageView({ message, onAction }: Props) {
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
        if (out.ui) {
          return <ArtifactRenderer key={i} ui={out.ui} onAction={onAction} />;
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

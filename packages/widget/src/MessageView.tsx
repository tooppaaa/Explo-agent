import type { UIMessage } from "ai";
import { extractText, extractExecuteOutputs } from "./extract.js";
import { ArtifactRenderer } from "./ArtifactRenderer.js";

interface Props {
  message: UIMessage;
  onAction: (msg: string) => void;
}

export function MessageView({ message, onAction }: Props) {
  const text = extractText(message);
  const outputs = extractExecuteOutputs(message);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="cme-msg cme-msg-user">
        {text && <div className="cme-text">{text}</div>}
      </div>
    );
  }

  return (
    <div className="cme-msg cme-msg-assistant">
      <div className="cme-assistant-row">
        <div className="cme-avatar">🤖</div>
        <div className="cme-assistant-content">
          {text && <div className="cme-text">{text}</div>}
          {outputs.map((out, i) => {
            if (!out.ok) {
              return (
                <div key={i} className="cme-error" role="alert">
                  ⚠ {out.error?.message ?? "Erreur inconnue"}
                </div>
              );
            }
            if (out.ui) {
              return (
                <div key={i} className="cme-artifact-card">
                  <ArtifactRenderer ui={out.ui} onAction={onAction} />
                </div>
              );
            }
            return (
              <pre key={i} className="cme-result">
                {JSON.stringify(out.result, null, 2)}
              </pre>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import type { UIMessage } from "ai";
import { extractText, extractOrderedItems } from "./extract.js";
import { ArtifactRenderer } from "./ArtifactRenderer.js";
import { Markdown } from "./Markdown.js";

interface Props {
  message: UIMessage;
  onAction: (msg: string) => void;
}

export function MessageView({ message, onAction }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    const text = extractText(message);
    return (
      <div className="cme-msg cme-msg-user">
        {text && <div className="cme-text">{text}</div>}
      </div>
    );
  }

  // Rendu DANS L'ORDRE de production (texte / artifact / texte…) : un chart se
  // place ainsi là où le modèle l'a inséré, et non systématiquement en bas.
  const items = extractOrderedItems(message);

  return (
    <div className="cme-msg cme-msg-assistant">
      <div className="cme-assistant-row">
        <div className="cme-avatar">🤖</div>
        <div className="cme-assistant-content">
          {items.map((item, i) => {
            if (item.kind === "text") {
              return item.text ? (
                <div key={i} className="cme-text">
                  <Markdown>{item.text}</Markdown>
                </div>
              ) : null;
            }
            const out = item.output;
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

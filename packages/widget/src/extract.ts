import type { UIMessage } from "ai";
import type { UiDescriptor } from "./ui-descriptor.js";

interface UIPartLike {
  type: string;
  text?: string;
  state?: string;
  output?: unknown;
}

// Les parts du SDK `ai` sont une union taguée dynamique (`tool-${name}`) qui ne
// se laisse pas narrower simplement. On les lit via cette forme structurelle :
// le cast est confiné à l'accès `.parts` (pas au message entier).
function parts(message: UIMessage): UIPartLike[] {
  return (message.parts ?? []) as UIPartLike[];
}

export function extractText(message: UIMessage): string {
  return parts(message)
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

export interface ExecuteOutput {
  ok?: boolean;
  result?: unknown;
  ui?: UiDescriptor;
  error?: { message?: string };
  logs?: string[];
}

export function extractExecuteOutputs(message: UIMessage): ExecuteOutput[] {
  return parts(message)
    .filter(
      (p) =>
        (p.type === "tool-execute" || p.type === "dynamic-tool") &&
        p.state === "output-available" &&
        p.output != null,
    )
    .map((p) => p.output as ExecuteOutput);
}

/**
 * Un fragment de message à rendre, dans l'ORDRE où le modèle l'a produit :
 * texte et artifacts intercalés. C'est ce qui permet de placer un chart « au
 * milieu » du texte — le modèle écrit du texte, appelle `execute` (→ artifact),
 * puis reprend son texte. On s'appuie sur l'ordre natif de `message.parts`
 * (le SDK conserve la séquence des deltas texte et des tool calls), sans
 * marqueurs ni parsing fragile.
 */
export type MessageItem =
  | { kind: "text"; text: string }
  | { kind: "artifact"; output: ExecuteOutput };

export function extractOrderedItems(message: UIMessage): MessageItem[] {
  const items: MessageItem[] = [];
  for (const p of parts(message)) {
    if (p.type === "text" && typeof p.text === "string" && p.text.length > 0) {
      items.push({ kind: "text", text: p.text });
    } else if (
      (p.type === "tool-execute" || p.type === "dynamic-tool") &&
      p.state === "output-available" &&
      p.output != null
    ) {
      items.push({ kind: "artifact", output: p.output as ExecuteOutput });
    }
  }
  return items;
}

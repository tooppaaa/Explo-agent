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

import type { UiDescriptor } from "./ui-descriptor.js";

interface UIPartLike {
  type: string;
  text?: string;
  state?: string;
  output?: unknown;
}

interface UIMessageLike {
  role: string;
  parts?: UIPartLike[];
}

export function extractText(message: UIMessageLike): string {
  return (message.parts ?? [])
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

export function extractExecuteOutputs(message: UIMessageLike): ExecuteOutput[] {
  return (message.parts ?? [])
    .filter(
      (p) =>
        (p.type === "tool-execute" || p.type === "dynamic-tool") &&
        p.state === "output-available" &&
        p.output != null,
    )
    .map((p) => p.output as ExecuteOutput);
}

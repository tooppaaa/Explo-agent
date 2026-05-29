import type { Operation } from "./types.js";

/**
 * Génère un `.d.ts` agrégé décrivant le global `api`, groupé par provider
 * (PRD §6.2). Ce .d.ts sert d'aide au modèle (il décrit la surface appelable
 * depuis le code-mode) ; il n'est pas chargé dans le sandbox.
 */
export function generateDts(operations: Operation[]): string {
  const byProvider = new Map<string, Operation[]>();
  for (const op of operations) {
    const list = byProvider.get(op.provider) ?? [];
    list.push(op);
    byProvider.set(op.provider, list);
  }

  const lines: string[] = [];
  lines.push("// Généré automatiquement depuis les specs OpenAPI configurées.");
  lines.push("// Surface appelable depuis le code-mode via le global `api`.");
  lines.push("");

  const providerEntries: string[] = [];

  for (const [provider, ops] of byProvider) {
    lines.push(`export interface ${pascal(provider)}Api {`);
    for (const op of ops) {
      // op.name = "provider.operationId" → on ne garde que la méthode.
      const method = op.name.slice(provider.length + 1);
      const argsType = extractArgsType(op.signature);
      if (op.description) lines.push(`  /** ${op.description.replace(/\n/g, " ")} */`);
      lines.push(`  ${method}(args: ${argsType}): Promise<unknown>;`);
    }
    lines.push("}");
    lines.push("");
    providerEntries.push(`  ${provider}: ${pascal(provider)}Api;`);
  }

  lines.push("export interface Api {");
  lines.push(...providerEntries);
  lines.push("}");
  lines.push("");
  lines.push("declare global {");
  lines.push("  const api: Api;");
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

function pascal(s: string): string {
  return s.replace(/(^|[_-])(\w)/g, (_m, _sep, c: string) => c.toUpperCase());
}

/** Extrait la portion `{ ... }` (type des args) depuis la signature TS. */
function extractArgsType(signature: string): string {
  const match = signature.match(/\(args:\s*(.+)\):\s*Promise/s);
  return match ? match[1] : "{}";
}

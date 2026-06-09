/**
 * Coordinateur exécuté par `deno run` AVEC ZÉRO PERMISSION.
 *
 *   Node (HostBridge, credential, HTTP)
 *     ⇅  stdin/stdout NDJSON
 *   ce process Deno (aucune permission)
 *     ⇅  postMessage
 *   Worker (permissions: "none") ← exécute le code utilisateur
 *
 * Lancé en one-shot : un process par exécution (aucune réutilisation d'état).
 * Lit un message `exec` sur stdin, exécute le code dans un worker isolé,
 * relaie chaque `api.*` vers Node, écrit le résultat final sur stdout, quitte.
 *
 * Ce process n'a lui-même aucune permission : il ne peut ni lire le fs, ni le
 * réseau, ni l'env. Il ne fait que coordonner stdin/stdout ↔ worker.
 */
import { WORKER_HARNESS_SOURCE } from "./worker-harness.ts";

interface ExecMessage {
  type: "exec";
  code: string;
  timeoutMs: number;
}
interface BridgeResultMessage {
  type: "bridge-result";
  callId: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}
type NodeMessage = ExecMessage | BridgeResultMessage;

const encoder = new TextEncoder();
function sendToNode(msg: unknown): void {
  Deno.stdout.writeSync(encoder.encode(JSON.stringify(msg) + "\n"));
}

// ── Lecture NDJSON depuis stdin ──────────────────────────────────────────────
async function* readMessages(): AsyncGenerator<NodeMessage> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) yield JSON.parse(line) as NodeMessage;
    }
  }
}

function runWorker(exec: ExecMessage, onBridgeCall: (callId: string, name: string, args: unknown) => void) {
  const blob = new Blob([WORKER_HARNESS_SOURCE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  // Worker SANS aucune capacité : la seule sortie est postMessage.
  const worker = new Worker(url, {
    type: "module",
    // @ts-ignore — option Deno spécifique
    deno: { permissions: "none" },
  });

  let settled = false;
  const finish = (result: unknown) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try {
      worker.terminate();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
    sendToNode(result);
    // One-shot : on quitte proprement après le résultat.
    Deno.exit(0);
  };

  // Timeout dur : termine le worker même sur boucle CPU (thread séparé).
  const timer = setTimeout(() => {
    finish({
      type: "result",
      ok: false,
      error: { message: `Execution timed out after ${exec.timeoutMs}ms` },
      logs: [],
    });
  }, exec.timeoutMs);

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type === "call") {
      onBridgeCall(msg.callId, msg.name, msg.args);
    } else if (msg?.type === "done") {
      finish({
        type: "result",
        ok: msg.ok,
        result: msg.result,
        error: msg.error,
        logs: msg.logs ?? [],
      });
    }
  };
  worker.onerror = (e: ErrorEvent) => {
    finish({
      type: "result",
      ok: false,
      error: { message: e.message || "worker error" },
      logs: [],
    });
  };

  return worker;
}

async function main() {
  let worker: Worker | null = null;
  for await (const msg of readMessages()) {
    if (msg.type === "exec") {
      worker = runWorker(msg, (callId, name, args) => {
        sendToNode({ type: "bridge-call", callId, name, args });
      });
      // Démarre l'exécution du code utilisateur.
      worker.postMessage({ type: "run", code: msg.code });
    } else if (msg.type === "bridge-result" && worker) {
      worker.postMessage(msg);
    }
  }
}

main().catch((err) => {
  sendToNode({
    type: "result",
    ok: false,
    error: { message: String((err && err.message) || err) },
    logs: [],
  });
  Deno.exit(1);
});

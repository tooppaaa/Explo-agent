/**
 * Coordinateur exécuté par `deno run` AVEC ZÉRO PERMISSION.
 *
 *   Node (HostBridge, credential, HTTP)
 *     ⇅  stdin/stdout NDJSON
 *   ce process Deno (aucune permission)
 *     ⇅  postMessage
 *   Worker (permissions: "none") ← exécute le code utilisateur
 *
 * Process RÉUTILISABLE : il boucle sur stdin et accepte plusieurs messages
 * `exec` successifs (pool côté Node — évite le cold start `deno run` à chaque
 * exécution). L'isolation entre exécutions est garantie par le Worker : un
 * Worker FRAIS est créé par exec et terminé après — aucun état utilisateur ne
 * survit d'une exécution à l'autre. Ce process ne fait que coordonner
 * stdin/stdout ↔ worker et ne détient aucun état sensible.
 *
 * Il n'a lui-même aucune permission : ni fs, ni réseau, ni env.
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

interface RunningExec {
  worker: Worker;
  settled: boolean;
}

function runWorker(
  exec: ExecMessage,
  onBridgeCall: (callId: string, name: string, args: unknown) => void,
  onDone: () => void,
): RunningExec {
  const blob = new Blob([WORKER_HARNESS_SOURCE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  // Worker SANS aucune capacité : la seule sortie est postMessage.
  const worker = new Worker(url, {
    type: "module",
    // @ts-ignore — option Deno spécifique
    deno: { permissions: "none" },
  });

  const running: RunningExec = { worker, settled: false };
  const finish = (result: unknown) => {
    if (running.settled) return;
    running.settled = true;
    clearTimeout(timer);
    try {
      worker.terminate();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
    sendToNode(result);
    // Process réutilisable : on N'EXIT PAS, on attend le prochain exec.
    onDone();
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

  return running;
}

async function main() {
  let current: RunningExec | null = null;
  for await (const msg of readMessages()) {
    if (msg.type === "exec") {
      current = runWorker(
        msg,
        (callId, name, args) => sendToNode({ type: "bridge-call", callId, name, args }),
        () => {
          current = null;
        },
      );
      // Démarre l'exécution du code utilisateur.
      current.worker.postMessage({ type: "run", code: msg.code });
    } else if (msg.type === "bridge-result" && current && !current.settled) {
      current.worker.postMessage(msg);
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

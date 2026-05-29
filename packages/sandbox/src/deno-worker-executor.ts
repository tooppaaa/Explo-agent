import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ExecOpts, HostBridge, RawExecResult, SandboxExecutor } from "catalogue";

/**
 * DenoWorkerExecutor (PRD §6.6, §8).
 *
 * Exécute le code-mode dans un sous-processus `deno run` lancé AVEC ZÉRO
 * PERMISSION. Ce process crée à son tour un Worker `permissions: "none"` qui
 * exécute le code utilisateur. La seule sortie du sandbox est
 * `bridge.callOperation`, relayée ici par NDJSON sur stdin/stdout.
 *
 * Le credential de service n'entre JAMAIS dans le sandbox : il vit dans le
 * HostBridge (côté Node), qui fait le HTTP.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST_SCRIPT = join(__dirname, "deno", "host.ts");

interface BridgeCallMsg {
  type: "bridge-call";
  callId: string;
  name: string;
  args: unknown;
}
interface ResultMsg {
  type: "result";
  ok: boolean;
  result?: unknown;
  error?: { message: string; stack?: string };
  logs?: string[];
}
type HostMsg = BridgeCallMsg | ResultMsg;

export interface DenoWorkerExecutorOptions {
  /** Chemin de l'exécutable Deno. Défaut: "deno" dans le PATH. */
  denoPath?: string;
}

export class DenoWorkerExecutor implements SandboxExecutor {
  private readonly denoPath: string;

  constructor(opts: DenoWorkerExecutorOptions = {}) {
    this.denoPath = opts.denoPath ?? process.env.DENO_PATH ?? "deno";
  }

  execute(code: string, bridge: HostBridge, opts: ExecOpts): Promise<RawExecResult> {
    return new Promise<RawExecResult>((resolve) => {
      const child: ChildProcessWithoutNullStreams = spawn(
        this.denoPath,
        [
          "run",
          "--unstable-worker-options",
          // AUCUN flag --allow-* : le process Deno n'a aucune capacité.
          `--v8-flags=--max-old-space-size=${opts.memoryMb}`,
          HOST_SCRIPT,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );

      let settled = false;
      let stderrBuf = "";
      let stdoutBuf = "";

      // Backstop : si le process Deno ne se termine pas, on le tue.
      const backstop = setTimeout(() => {
        finish({
          ok: false,
          error: { message: `Execution timed out after ${opts.timeoutMs}ms` },
        });
      }, opts.timeoutMs + 1000);

      const finish = (res: RawExecResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(backstop);
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        resolve(res);
      };

      const sendToDeno = (msg: unknown) => {
        if (child.stdin.writable) child.stdin.write(JSON.stringify(msg) + "\n");
      };

      const handleMessage = async (msg: HostMsg) => {
        if (msg.type === "bridge-call") {
          // Le HostBridge valide (Zod) + fait le HTTP côté serveur de confiance.
          try {
            const value = await bridge.callOperation(msg.name, msg.args);
            sendToDeno({ type: "bridge-result", callId: msg.callId, ok: true, value });
          } catch (err) {
            sendToDeno({
              type: "bridge-result",
              callId: msg.callId,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else if (msg.type === "result") {
          finish({
            ok: msg.ok,
            result: msg.result,
            error: msg.error,
            logs: msg.logs ?? [],
          });
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf-8");
        let idx: number;
        while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
          const line = stdoutBuf.slice(0, idx).trim();
          stdoutBuf = stdoutBuf.slice(idx + 1);
          if (!line) continue;
          let parsed: HostMsg;
          try {
            parsed = JSON.parse(line) as HostMsg;
          } catch {
            continue; // ligne non-JSON (bruit) ignorée
          }
          void handleMessage(parsed);
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf-8");
      });

      child.on("error", (err) => {
        finish({
          ok: false,
          error: { message: `Failed to spawn Deno sandbox: ${err.message}` },
        });
      });

      child.on("close", (codeNum) => {
        // Si le process meurt sans avoir émis de "result", on remonte stderr.
        finish({
          ok: false,
          error: {
            message:
              stderrBuf.trim() || `Deno sandbox exited (code ${codeNum}) without result`,
          },
        });
      });

      // Démarre l'exécution.
      sendToDeno({ type: "exec", code, timeoutMs: opts.timeoutMs });
    });
  }
}

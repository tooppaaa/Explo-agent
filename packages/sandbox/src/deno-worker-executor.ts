import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import ts from "typescript";
import type { ExecOpts, HostBridge, RawExecResult, SandboxExecutor } from "catalogue";

/**
 * DenoWorkerExecutor (PRD §6.6, §8).
 *
 * Exécute le code-mode dans un sous-processus `deno run` lancé AVEC ZÉRO
 * PERMISSION. Ce process crée à son tour un Worker `permissions: "none"` qui
 * exécute le code utilisateur. La seule sortie du sandbox est
 * `bridge.callOperation`, relayée ici par NDJSON sur stdin/stdout.
 *
 * Les process Deno sont POOLÉS : un process traite plusieurs exécutions
 * successives (évite ~100-300 ms de cold start par execute). L'isolation
 * entre exécutions reste garantie côté Deno par un Worker frais par exec.
 * Un process en timeout ou en erreur est tué et remplacé, jamais réutilisé.
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

/**
 * Transpile TypeScript → JavaScript using TypeScript's own `transpileModule`.
 * `ModuleKind.None` treats the code as a script (not a module), which allows
 * top-level `return` statements — exactly what the sandbox function body needs.
 * Runs in the trusted Node process before code enters the sandbox.
 */
function transpileTs(code: string): { code: string; error?: string } {
  try {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
        removeComments: false,
      },
    });
    return { code: result.outputText };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { code, error: msg };
  }
}

/** Process Deno persistant : parse le NDJSON sortant et route les messages
 *  vers l'exécution en cours. Un seul exec à la fois par process. */
class DenoHostProcess {
  readonly child: ChildProcessWithoutNullStreams;
  alive = true;
  stderrBuf = "";
  /** Erreur de spawn (ENOENT…) — consultée par l'exec en cours via onClose. */
  spawnError?: NodeJS.ErrnoException;
  /** Routage des messages vers l'exec en cours (null = idle). */
  onMessage: ((msg: HostMsg) => void) | null = null;
  onClose: (() => void) | null = null;
  private stdoutBuf = "";

  constructor(denoPath: string, memoryMb: number) {
    // Enrichit le PATH avec les emplacements d'install courants de Deno
    // (~/.deno/bin, /usr/local/bin) au cas où ils seraient absents du PATH
    // du process Node (fréquent en environnement conteneurisé ou CI).
    const path = [process.env.PATH ?? "", join(homedir(), ".deno", "bin"), "/usr/local/bin", "/usr/bin"].join(":");

    this.child = spawn(
      denoPath,
      [
        "run",
        "--unstable-worker-options",
        // AUCUN flag --allow-* : le process Deno n'a aucune capacité.
        `--v8-flags=--max-old-space-size=${memoryMb}`,
        HOST_SCRIPT,
      ],
      { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PATH: path } },
    );

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuf += chunk.toString("utf-8");
      let idx: number;
      while ((idx = this.stdoutBuf.indexOf("\n")) >= 0) {
        const line = this.stdoutBuf.slice(0, idx).trim();
        this.stdoutBuf = this.stdoutBuf.slice(idx + 1);
        if (!line) continue;
        let parsed: HostMsg;
        try {
          parsed = JSON.parse(line) as HostMsg;
        } catch {
          continue; // ligne non-JSON (bruit) ignorée
        }
        this.onMessage?.(parsed);
      }
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderrBuf += chunk.toString("utf-8");
    });
    // 'error' (spawn raté) et 'close' convergent vers le même chemin de sortie ;
    // alive=false garantit qu'on ne signale qu'une fois et qu'on ne réutilise pas.
    this.child.on("error", (err: NodeJS.ErrnoException) => {
      if (!this.alive) return;
      this.alive = false;
      this.spawnError = err;
      this.onClose?.();
    });
    this.child.on("close", () => {
      if (!this.alive) return;
      this.alive = false;
      this.onClose?.();
    });
  }

  send(msg: unknown): void {
    if (this.child.stdin.writable) this.child.stdin.write(JSON.stringify(msg) + "\n");
  }

  kill(): void {
    this.alive = false;
    try {
      this.child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }

  /** Détache le process de l'event loop Node (process idle dans le pool) :
   *  Node peut quitter même avec des sandbox chauds en attente. */
  unref(): void {
    this.child.unref();
    for (const s of [this.child.stdin, this.child.stdout, this.child.stderr]) {
      (s as unknown as { unref?: () => void }).unref?.();
    }
  }

  ref(): void {
    this.child.ref();
    for (const s of [this.child.stdin, this.child.stdout, this.child.stderr]) {
      (s as unknown as { ref?: () => void }).ref?.();
    }
  }
}

export interface DenoWorkerExecutorOptions {
  /** Chemin de l'exécutable Deno. Défaut: "deno" dans le PATH. */
  denoPath?: string;
  /** Process Deno simultanés max (exécutions concurrentes). Défaut: 4. */
  maxProcs?: number;
  /** Durée de vie d'un process idle avant d'être tué. Défaut: 60 s. */
  idleTtlMs?: number;
}

export class DenoWorkerExecutor implements SandboxExecutor {
  private readonly denoPath: string;
  private readonly maxProcs: number;
  private readonly idleTtlMs: number;

  private idle: DenoHostProcess[] = [];
  private idleTimers = new Map<DenoHostProcess, NodeJS.Timeout>();
  private leased = 0;
  private waiters: Array<{ memoryMb: number; resolve: (proc: DenoHostProcess) => void }> = [];
  private spawnedCount = 0;

  constructor(opts: DenoWorkerExecutorOptions = {}) {
    this.denoPath = opts.denoPath ?? process.env.DENO_PATH ?? "deno";
    this.maxProcs = opts.maxProcs ?? 4;
    this.idleTtlMs = opts.idleTtlMs ?? 60_000;
  }

  async execute(code: string, bridge: HostBridge, opts: ExecOpts): Promise<RawExecResult> {
    // Transpile TypeScript → JavaScript before entering the sandbox.
    // The worker-harness runs code via `new Function` (pure JS engine): TS syntax
    // (type annotations, interfaces, `as` casts) causes "strict mode reserved word"
    // parse errors. The TS layer is stripped in the trusted Node process.
    const transpiled = transpileTs(code);
    if (transpiled.error) {
      return { ok: false, error: { message: `TypeScript transpilation error: ${transpiled.error}` } };
    }
    const jsCode = transpiled.code;

    const proc = await this.acquire(opts.memoryMb);

    return new Promise<RawExecResult>((resolve) => {
      let settled = false;
      proc.stderrBuf = "";

      // Backstop : si le process Deno ne répond pas (timeout interne défaillant),
      // on le tue et on le sort du pool.
      const backstop = setTimeout(() => {
        finish({ ok: false, error: { message: `Execution timed out after ${opts.timeoutMs}ms` } }, false);
      }, opts.timeoutMs + 1000);

      const finish = (res: RawExecResult, reusable: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(backstop);
        proc.onMessage = null;
        proc.onClose = null;
        if (reusable && proc.alive) this.release(proc);
        else this.discard(proc);
        resolve(res);
      };

      proc.onMessage = (msg: HostMsg) => {
        if (msg.type === "bridge-call") {
          // Le HostBridge valide (Zod) + fait le HTTP côté serveur de confiance.
          void (async () => {
            try {
              const value = await bridge.callOperation(msg.name, msg.args);
              proc.send({ type: "bridge-result", callId: msg.callId, ok: true, value });
            } catch (err) {
              proc.send({
                type: "bridge-result",
                callId: msg.callId,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          })();
        } else if (msg.type === "result") {
          // Un timeout interne a tué le Worker mais le process reste sain ;
          // il est réutilisable dans tous les cas où il a répondu proprement.
          finish({ ok: msg.ok, result: msg.result, error: msg.error, logs: msg.logs ?? [] }, true);
        }
      };

      proc.onClose = () => {
        // Le process est mort sans avoir émis de "result" : spawn raté ou crash.
        const message = proc.spawnError
          ? spawnErrorMessage(proc.spawnError)
          : proc.stderrBuf.trim() || "Deno sandbox exited without result";
        finish({ ok: false, error: { message } }, false);
      };

      // Démarre l'exécution avec le code transpilé (JS pur, TS déjà strippé).
      proc.send({ type: "exec", code: jsCode, timeoutMs: opts.timeoutMs });
    });
  }

  /** Tue les process idle (tests, arrêt propre). Les exécutions en cours finissent. */
  dispose(): void {
    for (const proc of this.idle) proc.kill();
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.idle = [];
    this.idleTimers.clear();
  }

  /** Observabilité/tests : process créés depuis le début + idle disponibles. */
  stats(): { spawned: number; idle: number } {
    return { spawned: this.spawnedCount, idle: this.idle.length };
  }

  // ── Pool ──────────────────────────────────────────────────────────────────

  private acquire(memoryMb: number): Promise<DenoHostProcess> {
    // Réutilise un process chaud si possible.
    let proc: DenoHostProcess | undefined;
    while ((proc = this.idle.pop())) {
      const timer = this.idleTimers.get(proc);
      if (timer) clearTimeout(timer);
      this.idleTimers.delete(proc);
      if (!proc.alive) continue;
      proc.ref();
      this.leased++;
      return Promise.resolve(proc);
    }

    if (this.leased < this.maxProcs) {
      this.leased++;
      return Promise.resolve(this.spawnProc(memoryMb));
    }

    // Pool saturé : attend qu'un process se libère.
    return new Promise((resolve) => this.waiters.push({ memoryMb, resolve }));
  }

  private spawnProc(memoryMb: number): DenoHostProcess {
    // NB: la limite mémoire V8 est fixée au spawn — les exécutions suivantes
    // sur ce process réutilisent celle-ci (config sandbox statique par engine).
    // Une erreur de spawn (ENOENT…) arrive de façon asynchrone via onClose.
    const proc = new DenoHostProcess(this.denoPath, memoryMb);
    this.spawnedCount++;
    return proc;
  }

  private release(proc: DenoHostProcess): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      // Reste leased : transfert direct à l'exécution en attente.
      waiter.resolve(proc);
      return;
    }
    this.leased--;
    this.idle.push(proc);
    proc.unref();
    const timer = setTimeout(() => {
      this.idle = this.idle.filter((p) => p !== proc);
      this.idleTimers.delete(proc);
      proc.kill();
    }, this.idleTtlMs);
    timer.unref();
    this.idleTimers.set(proc, timer);
  }

  private discard(proc: DenoHostProcess): void {
    proc.kill();
    this.leased--;
    const waiter = this.waiters.shift();
    if (waiter) {
      // Remplace le process mort pour l'exécution en attente.
      this.leased++;
      waiter.resolve(this.spawnProc(waiter.memoryMb));
    }
  }
}

function spawnErrorMessage(err: NodeJS.ErrnoException): string {
  const hint =
    err.code === "ENOENT"
      ? " — deno introuvable dans le PATH, relancer scripts/setup-deno.sh"
      : err.code === "ENOEXEC" || err.errno === -8
        ? " — binaire deno incompatible (mauvaise architecture), relancer scripts/setup-deno.sh"
        : "";
  return `Failed to spawn Deno sandbox: ${err.message}${hint}`;
}

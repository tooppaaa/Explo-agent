/**
 * Source du harness exécuté DANS le worker Deno (`permissions: "none"`).
 *
 * Exporté comme CHAÎNE constante : elle est transformée en blob URL côté hôte
 * Deno pour instancier le worker. Le code utilisateur n'est JAMAIS concaténé
 * dans cette source — il voyage comme donnée via postMessage et s'exécute via
 * `new Function` (corps de fonction isolé, pas d'accès à la portée module).
 *
 * Dans ce worker :
 *  - aucune capacité ambiante (pas de réseau/fs/env) : permissions "none" ;
 *    tout `fetch`/`Deno.readFile`/`Deno.env` lève PermissionDenied au runtime ;
 *  - la SEULE sortie est `api.<provider>.<op>(args)` → postMessage vers l'hôte ;
 *  - le credential de service n'existe pas ici (il vit côté Node, dans le HostBridge).
 */
export const WORKER_HARNESS_SOURCE = String.raw`
const logs = [];
const origLog = console.log;
console.log = (...args) => {
  try {
    logs.push(
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  } catch {
    logs.push(args.map((a) => String(a)).join(" "));
  }
};

let callSeq = 0;
const pending = new Map();

function makeOpFn(name) {
  return (args) =>
    new Promise((resolve, reject) => {
      const callId = "c" + callSeq++;
      pending.set(callId, { resolve, reject });
      self.postMessage({ type: "call", callId, name, args: args ?? {} });
    });
}

// Proxy à deux niveaux : api.<provider>.<operation>(args).
const api = new Proxy(
  {},
  {
    get(_t, provider) {
      if (typeof provider !== "string") return undefined;
      return new Proxy(
        {},
        {
          get(_t2, op) {
            if (typeof op !== "string") return undefined;
            return makeOpFn(provider + "." + op);
          },
        },
      );
    },
  },
);

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg && msg.type === "bridge-result") {
    const p = pending.get(msg.callId);
    if (!p) return;
    pending.delete(msg.callId);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(msg.error || "bridge error"));
    return;
  }

  if (msg && msg.type === "run") {
    try {
      // Le code utilisateur est un CORPS de fonction async. Il ne voit que
      // (api, console) ; pas d'accès à la portée module du harness.
      const fn = new Function(
        "api",
        "console",
        '"use strict";\nreturn (async () => {\n' + msg.code + "\n})();",
      );
      const result = await fn(api, console);
      self.postMessage({ type: "done", ok: true, result, logs });
    } catch (err) {
      self.postMessage({
        type: "done",
        ok: false,
        error: {
          message: String((err && err.message) || err),
          stack: err && err.stack ? String(err.stack) : undefined,
        },
        logs,
      });
    }
  }
};
`;

# Modèle de sécurité du sandbox (M0)

> À relire de près. Référence : PRD §8. Une faille ici = RCE.

## Chaîne d'isolation

```
Node (serveur de confiance)              ← détient le credential, fait le HTTP
  │  spawn `deno run` SANS aucun --allow-*   (process Deno = zéro capacité)
  ▼
Process Deno coordinateur (host.ts)      ← ne fait que relayer stdin/stdout ↔ worker
  │  new Worker(blobURL, { deno: { permissions: "none" } })
  ▼
Worker (worker-harness)                  ← exécute le code utilisateur, AUCUNE capacité
```

Chaque exécution = **un process Deno frais** (`Deno.exit(0)` après le résultat) :
aucun état partagé entre deux `execute`.

## Garanties (mappées PRD §8)

1. **Aucune capacité ambiante (§8.1).** Le worker tourne en `permissions: "none"`.
   `fetch`, `Deno.readFile`, `Deno.env.get`, `Deno.Command`, `Deno.writeFile`
   lèvent `NotCapable` au runtime. Le process Deno parent est lui-même lancé
   **sans aucun flag `--allow-*`**. Couvert par `tests/sandbox-isolation.test.ts`.
2. **Seule sortie = `bridge.callOperation` (§8.2).** Le seul canal du worker est
   `postMessage`. Le harness n'expose au code utilisateur que `(api, console)`.
   `api.<provider>.<op>(args)` poste un message `call` relayé jusqu'au HostBridge.
3. **Pas de `node:vm`/`vm2` (§8.3).** On utilise exclusivement le worker Deno à
   permissions. Aucun usage de `vm`/`vm2`.
4. **Validation Zod côté hôte (§8.4).** Le `HttpHostBridge` valide les args avec
   le schéma Zod de l'opération **avant** toute requête HTTP.
5. **Mutations (§8.5).** M0 = lecture seule : le catalogue n'expose aucune op
   mutante, et le bridge refuse défensivement toute op `mutating`.
6. **Timeout + mémoire (§8.6).** Double barrière : `setTimeout` côté process Deno
   qui `worker.terminate()` (tue même une boucle CPU, thread séparé), + backstop
   `SIGKILL` côté Node. `--v8-flags=--max-old-space-size` borne la mémoire.
   Couvert par le test « boucle infinie ».
7. **Credential jamais visible (§8.7).** Le credential de service est résolu
   depuis `process.env` **dans le HostBridge (Node)** et injecté dans les headers
   HTTP côté serveur. Il n'est jamais envoyé au process Deno ni au worker. Le
   worker n'a pas d'accès env. Couvert par `tests/sandbox-isolation.test.ts §10.5`
   (balayage de tous les globals/env → le secret n'apparaît jamais).
8. **Pas de log de secret (§8.8).** Le bridge ne logge pas les credentials ni les
   corps. Les `console.log` du sandbox sont capturés côté worker uniquement.

## Pourquoi le code utilisateur ne peut pas s'échapper

- La source du harness (`worker-harness.ts`) est **constante** : le code
  utilisateur n'y est jamais concaténé. Il voyage comme **donnée** via
  `postMessage` et s'exécute via `new Function("api","console", corps)` — un
  corps de fonction qui ne voit que ses deux paramètres, pas la portée module.
- Même en cas d'erreur, les messages d'erreur transitent par le canal JSON ;
  ils ne portent aucun secret (le secret n'existe pas côté worker).

## Limites connues (M0, hors périmètre)

- Pas d'isolation OS (gVisor/Firecracker) — détail de déploiement, derrière
  `SandboxExecutor` (PRD §9), prévu plus tard.
- Limite mémoire = best-effort via `--max-old-space-size`.

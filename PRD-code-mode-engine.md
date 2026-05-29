# PRD — Moteur « code-mode » + widget de chat embarquable

> Nom de travail : **`code-mode-engine`** (à renommer). Document destiné à un agent qui code. Lis-le en entier avant d'écrire la moindre ligne ; le modèle de sécurité du sandbox (§8) n'est pas optionnel.
>
> **v2 — décisions actées :** appels API **exécutés côté serveur** ; **API publiques uniquement** ; front = **widget React drop-in** (`window.initAgent`) basé sur **Vercel AI SDK** ; gestion du **token de l'utilisateur final reportée** (hors v1 — v1 utilise un credential de service par provider).

## 1. Contexte & objectif

On intègre un chatbot agentique à une app. Il doit interroger et agir sur des API métier (lecture → charts, écriture → actions) sans exposer des centaines de tools à un LLM.

Deux livrables :
- un **moteur backend** (serveur MCP) qui n'expose que 2 tools, `search` et `execute`, et exécute du **code TypeScript généré par le modèle** dans un sandbox serveur sans capacités ;
- un **widget front** embarquable (`window.initAgent`) qui fournit l'UI de chat et rend les artifacts.

Le moteur est **agnostique de l'API** : on lui branche une (ou plusieurs) API via configuration. Sans API, il démarre quand même (mode vide).

## 2. Approche en une phrase

Un serveur MCP portable (Node/TS) qui transforme des specs OpenAPI en SDK typé, exécuté par un LLM dans un sandbox serveur sans capacités avec garde sur les mutations, plus un widget React embarquable qui offre le chat et le rendu des artifacts.

## 3. Périmètre v1 (in scope)

**Backend**
- Serveur MCP exposant exactement 2 tools : `search`, `execute`.
- **API en option** via config : 0..N providers, chacun décrit par une spec OpenAPI 3.0/3.1.
- **Catalogue** auto-construit depuis l'OpenAPI (signature TS + schéma Zod + métadonnée `mutating`).
- **Recherche** : backend BM25 par défaut, backend embeddings branchable.
- **Exécution code-mode** dans un sandbox derrière l'interface `SandboxExecutor` (impl. v1 : worker Deno **et/ou** `isolated-vm`).
- **Appels API exécutés côté serveur** : le `HostBridge` fait le HTTP. API publiques uniquement.
- **Auth v1** : credential de service par provider (lu en variable d'env). Identité de service unique, **pas** d'autorisation par utilisateur final.
- **Garde mutations** : les ops mutantes ne s'exécutent pas dans le sandbox ; enregistrées comme *intentions*, renvoyées pour confirmation via `POST /confirm`.
- **Limites de résultat** : troncature/agrégation avant renvoi au modèle.
- Conteneurisable (Dockerfile), déployable sur n'importe quel orchestrateur.

**Front (widget)**
- Bundle **auto-montant** exposant `window.initAgent(config)`.
- Bouton flottant + **drawer** de chat, isolé du CSS de l'app hôte (**shadow DOM ou iframe**).
- UI de chat via **Vercel AI SDK** (`ai` + `@ai-sdk/react`, `useChat`), streaming.
- **Rendu des artifacts** : charts (depuis `result` + `artifactHint`), tables, texte, et **actions** (`pendingIntents` → UI de confirmation appelant `/confirm`).
- Embarquable dans n'importe quelle app via une balise `<script>`, indépendamment du framework hôte.

## 4. Hors périmètre v1 (reporté / non-goals)

- **Token de l'utilisateur final** (forwarding, on-behalf-of, downscoping) — **REPORTÉ**. v1 appelle l'API avec un credential de service configuré ; aucune autorisation par utilisateur final.
- Multi-tenant avancé / isolation par client final.
- **API non publiques** (internes, VPN, derrière firewall) — hors scope.
- Protocoles non-HTTP (gRPC, GraphQL) ; v1 = REST/OpenAPI uniquement.
- Persistance / mémoire de conversation côté serveur.
- Tout service managé spécifique à un cloud (interdit, cf. §9).

## 5. Architecture

Composants (chacun isolable et testable) :

1. **Config loader** — lit/valide la config, instancie les providers.
2. **Catalogue builder** — OpenAPI → `Operation[]` + `.d.ts`.
3. **Search index** — indexe le catalogue, répond à `search`.
4. **MCP server** — expose `search` + `execute` (`@modelcontextprotocol/sdk`, transport HTTP streamable).
5. **Sandbox executor** — interface + implémentation(s) ; exécute le code sans capacités.
6. **Host bridge** — reçoit les appels `api.*`, valide, **fait le HTTP côté serveur**, enregistre les intentions de mutation. Détient le credential de service ; le sandbox ne le voit jamais.
7. **Chat backend** — route de streaming consommée par le widget (orchestration LLM + appel des 2 tools MCP).
8. **Widget** — bundle React auto-montant : drawer, chat, rendu des artifacts.

Flux : `widget → chat backend (LLM) → MCP.search/execute → sandbox → (api.*) → host bridge → HTTP API publique → résultat → widget`.

## 6. Spécifications détaillées

### 6.1 Configuration (« API en option »)

```ts
interface EngineConfig {
  providers?: ApiProvider[];                 // optionnel — 0 = mode vide
  sandbox?: {
    runtime?: "deno" | "isolated-vm";        // défaut: "deno"
    timeoutMs?: number;                        // défaut: 5000
    memoryMb?: number;                         // défaut: 128
  };
  search?: {
    backend?: "bm25" | "embeddings";           // défaut: "bm25"
    topK?: number;                             // défaut: 8
    embeddingsFn?: (texts: string[]) => Promise<number[][]>; // requis si "embeddings"
  };
  mutations?: { mode?: "intent" | "direct" };  // défaut: "intent"
  results?: { maxBytes?: number };             // défaut: 32_000
}

interface ApiProvider {
  name: string;                  // préfixe de namespace dans le SDK (ex. "orders")
  openapi: string;               // chemin local ou URL d'une spec OpenAPI 3.0/3.1
  baseUrl?: string;              // override de servers[]
  // Auth v1 = credential de service (identité unique). Le token utilisateur est REPORTÉ.
  auth?:
    | { type: "none" }
    | { type: "bearer"; tokenEnv: string }
    | { type: "apiKey"; in: "header" | "query"; name: string; valueEnv: string };
}
```

- Config par fichier **ou** programmatique. Aucun provider hardcodé.
- Si `providers` vide/absent : le moteur démarre, `search` renvoie `[]`, `execute` ne fournit pas d'`api`.
- Secrets via variables d'environnement uniquement (`*Env`).

### 6.2 Catalogue builder

- Parse OpenAPI **3.0 et 3.1**. Pour chaque `path` × `method` → une `Operation` :

```ts
interface Operation {
  name: string;            // `${provider.name}.${operationId}` (fallback: method+path slugifié)
  description: string;
  signature: string;       // signature TS lisible (pour search)
  schema: ZodType;         // validation des args (params + requestBody)
  mutating: boolean;       // true si method ∈ {POST, PUT, PATCH, DELETE} (override possible: x-mutating)
  call: (args: unknown, ctx: CallContext) => Promise<unknown>; // dispatch HTTP côté serveur
}
```

- Dérive signature TS + schéma Zod depuis la spec (`openapi-zod-client` ou équivalent ; justifier si écarté).
- Génère un `.d.ts` agrégé, groupé par provider (`api.orders.listOrders(...)`).

### 6.3 Search index

- Indexe `name + description + noms de paramètres`.
- `bm25` : index mémoire (lib légère type `minisearch`).
- `embeddings` : embeddings précalculés au démarrage via `embeddingsFn` (injectée → aucun provider imposé) ; similarité cosinus.
- Renvoie le top-K : `{ name, signature, description, mutating }`. **La signature TS complète est obligatoire.**

### 6.4 Tool `search`

```
search(query: string, k?: number)
  → { results: Array<{ name; signature; description; mutating }> }
```

- `k` borné par `config.search.topK`.
- 0 résultat → message explicite (`"Aucune opération. Reformule ou élargis la requête."`), pas une erreur.

### 6.5 Tool `execute` (code-mode)

```
execute(code: string)
  → {
      ok: boolean;
      result?: unknown;            // valeur retournée (tronquée si > maxBytes)
      logs?: string[];             // console.log capturés
      pendingIntents?: Intent[];   // mutations à confirmer (cf 6.7)
      artifactHint?: "chart" | "table" | "text" | "action";
      error?: { message: string; stack?: string };
    }
```

- Le code reçoit un global `api` (le SDK typé). Wrapper en `async` ; dernière expression / `return` = `result`.
- Aucun autre global utile : pas de `fetch`, `process`, `require`, import réseau, fs, timers longs.
- `console.log` capturé dans `logs` (aide l'itération du modèle).
- Timeout + limite mémoire ; dépassement → `error` propre, jamais de crash serveur.
- `artifactHint` : heuristique simple (tableau d'objets numériques → `chart`/`table` ; `pendingIntents` non vide → `action`).

### 6.6 Sandbox executor & host bridge

```ts
interface SandboxExecutor {
  execute(code: string, bridge: HostBridge, opts: ExecOpts): Promise<RawExecResult>;
}
interface HostBridge {
  callOperation(name: string, args: unknown): Promise<unknown>; // unique pont vers l'extérieur
}
interface ExecOpts { timeoutMs: number; memoryMb: number; }
```

- **Aucune** logique métier dans le sandbox : il exécute du code et relaie via `bridge.callOperation`. Toute la sécurité (validation, auth, mutations, HTTP) vit dans le `HostBridge`, **côté serveur de confiance**.
- v1 fournit au moins :
  - `DenoWorkerExecutor` : `new Worker(url, { type: "module", deno: { permissions: "none" } })`, comm. par `postMessage`. Aucun accès réseau/fs.
  - (optionnel) `IsolatedVmExecutor` : isolat V8, `memoryLimit`, code transpilé TS→JS (esbuild/swc), pont via callbacks.
- Choix via `config.sandbox.runtime`. Ajouter une impl = implémenter l'interface, sans toucher au reste.
- **Les appels sortent côté serveur**, en HTTP, vers des **API publiques**, avec le credential de service du provider. Le credential n'est jamais exposé au code sandboxé.

### 6.7 Garde sur les mutations

```ts
interface Intent { id: string; name: string; args: unknown; description: string; }
```

- Mode `"intent"` (défaut) : un appel `mutating` n'est pas exécuté ; le `HostBridge` enregistre un `Intent`, renvoie `{ __pending: true }`. Les intents remontent dans `pendingIntents`.
- Confirmation : route **`POST /confirm { ids: string[] }`** (hors MCP) qui rejoue les intentions validées. Appelée par le widget après clic utilisateur.
- Mode `"direct"` : exécution immédiate (contextes de confiance uniquement ; documenter le risque).

### 6.8 Limites de résultat

- `result` en JSON ; si > `maxBytes`, tronquer + signaler (`{ truncated: true, preview, totalBytes }`).
- Doc : recommander au modèle d'**agréger dans le sandbox** avant de `return` (le gros payload ne quitte jamais le sandbox).

### 6.9 Widget front (`window.initAgent`)

```ts
window.initAgent({
  apiUrl: string;            // identifie l'API cible ; mappée à un provider configuré côté backend
  backendUrl?: string;       // endpoint du chat backend ; défaut = origine du bundle
  launcher?: { position?: "bottom-right" | "bottom-left"; label?: string };
  theme?: { primary?: string };
  mount?: "shadow" | "iframe"; // défaut: "shadow"
});
```

- Bundle unique auto-montant (IIFE/ESM) ; injecte le bouton + le drawer, isolés via shadow DOM (défaut) ou iframe.
- Chat via `useChat` (Vercel AI SDK) pointant sur `backendUrl` (streaming).
- Mappe `artifactHint` → composant de rendu : `chart` (lib de charts au choix), `table`, `text`, `action` (liste de `pendingIntents` + bouton « Confirmer » → `POST /confirm`).
- v1 : le widget **n'envoie pas de token** (auth gérée côté serveur par provider). `getToken` sera ajouté quand le volet token sera traité.
- v1 : `apiUrl` est résolu vers un provider **pré-enregistré** côté backend. L'onboarding dynamique d'une API arbitraire (fetch auto de l'OpenAPI depuis `apiUrl`) est reporté.

## 7. Interfaces publiques

- **MCP** : 2 tools (`search`, `execute`), transport `StreamableHTTPServerTransport`.
- **HTTP** : `POST /chat` (streaming, consommé par le widget) ; `POST /confirm` (rejoue les intentions).
- **API programmatique** : `createEngine(config): { mcpServer, chatHandler, listen(port) }`.
- **Front** : `window.initAgent(config)`.
- **CallContext** : porte le scope d'appel par requête (v1 = credential de service du provider), jamais stocké globalement.

## 8. Modèle de sécurité du sandbox (exigences dures)

1. Le sandbox n'a **aucune capacité ambiante** : pas de réseau, fs, `process`, env, timers non bornés. Test : un code tentant `fetch`/`Deno.readFile`/`process.env` doit échouer.
2. La **seule** sortie du sandbox est `bridge.callOperation`.
3. **Interdits comme sandbox** : `node:vm` et `vm2` (non sécurisés). Uniquement isolat V8 (`isolated-vm`) ou runtime à permissions (Deno worker `permissions: "none"`).
4. Validation Zod systématique des args **côté hôte** avant tout appel HTTP.
5. Mutations : mode `"intent"` par défaut ; aucune op mutante sans confirmation explicite.
6. Timeout + limite mémoire obligatoires ; dépassement = erreur propre, pas de DoS.
7. Le **credential de service** vit dans le `HostBridge` ; le code sandboxé ne le voit jamais.
8. Ne jamais logger les credentials ni les corps sensibles en clair.

## 9. Contraintes techniques

- **Langage** : TypeScript, Node 20+ (serveur). Sandbox sur Deno si runtime `"deno"`.
- **MCP** : `@modelcontextprotocol/sdk`. **Front** : React + Vercel AI SDK (`ai`, `@ai-sdk/react`).
- **Réseau** : API cibles **publiques** uniquement (joignables depuis le serveur).
- **Portabilité / anti-lock-in** :
  - Le cœur n'importe **aucun** SDK cloud (`aws-sdk`, etc.).
  - Sandbox = primitive de runtime OSS (isolated-vm / Deno), jamais un service managé.
  - Tout conteneurisé (Dockerfile fourni) ; pas de dépendance à un orchestrateur précis.
  - Isolation OS optionnelle (gVisor, Firecracker) = détail de déploiement, derrière `SandboxExecutor`.
  - Widget = bundle framework-agnostic (monte du React en interne mais s'injecte dans n'importe quelle page).
- **Tests** : unitaires par composant + intégration sur une OpenAPI d'exemple (serveur mock public).

## 10. Critères d'acceptation (testables)

1. Démarrage sans provider → serveur up, `search("x")` → `[]`, pas de crash.
2. Avec une OpenAPI d'exemple (≥ 100 ops) → `search` renvoie ≤ topK hits avec signatures TS valides.
3. `execute` chaînant 2+ lectures + filtrage + agrégation → `result` agrégé correct, données brutes **absentes** de la réponse.
4. `execute` tentant `fetch`/accès fs/`process.env` → échoue, serveur sain.
5. Le credential de service n'est **jamais** lisible depuis le code sandboxé (test dédié).
6. `execute` appelant une op `mutating` en mode `"intent"` → 0 effet de bord, `pendingIntents` peuplé ; après `POST /confirm` → effet appliqué.
7. Boucle infinie → coupée au timeout, erreur propre.
8. Résultat > `maxBytes` → tronqué + signalé.
9. Bascule `runtime: "deno" ↔ "isolated-vm"` → comportement identique sur la suite de tests.
10. `grep` sur le cœur : zéro import de SDK cloud spécifique.
11. 2ᵉ provider OpenAPI ajouté → ops namespacées (`api.autre.*`) sans changement de code.
12. **Widget** : `window.initAgent({ apiUrl })` injecte un bouton + drawer ; un message déclenche un stream depuis `/chat` ; un résultat tabulaire numérique rend un chart ; une op mutante affiche une carte « action à confirmer » qui appelle `/confirm`.
13. **Widget** : le CSS de l'app hôte ne fuit pas dans le drawer (et inversement).

## 11. Jalons

- **M1** — Config + catalogue builder (OpenAPI → `Operation[]` + `.d.ts`) + tests.
- **M2** — Search (BM25) + serveur MCP avec `search`.
- **M3** — `DenoWorkerExecutor` + host bridge (HTTP serveur) + `execute` (lecture seule).
- **M4** — Garde mutations (intents) + `POST /confirm`.
- **M5** — Chat backend `/chat` (streaming) + intégration MCP.
- **M6** — Widget : bundle `initAgent`, drawer, `useChat`, rendu des artifacts (chart/table/text/action).
- **M7** — Limites de résultat, embeddings optionnels, Dockerfile, durcissement sécurité, suite d'intégration.

## 12. Questions ouvertes

- Montage du widget : **shadow DOM** (léger, intégration souple) vs **iframe** (isolation maximale, plus rigide) — trancher le défaut.
- Lib de charts pour le rendu côté widget (Recharts, Chart.js, autre).
- `apiUrl` → provider : mapping statique en v1 ; à quel jalon ouvrir l'onboarding dynamique (fetch auto de l'OpenAPI) ?
- `execute` : autoriser le modèle à itérer (re-`execute` en voyant `logs`/`error`) — recommandé : oui.
- Set exact de types d'`artifactHint` à supporter en v1 (chart/table/text/action proposés).

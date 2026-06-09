# CLAUDE.md

Contexte persistant pour Claude Code. Lis-le à chaque session. La **source de vérité complète** est `./PRD-code-mode-engine.md` — ce fichier n'en est qu'un rappel condensé.

## Le projet en deux lignes

Un serveur MCP (Node/TS) qui transforme des specs OpenAPI en SDK typé, exécuté par un LLM dans un **sandbox serveur sans capacités** (« code-mode »), plus un **widget React embarquable** (`window.initAgent`) pour le chat et le rendu des artifacts.

## Stack

- Backend : TypeScript, Node 20+, `@modelcontextprotocol/sdk`.
- Sandbox : worker Deno (`permissions: "none"`) par défaut ; `isolated-vm` en option, derrière l'interface `SandboxExecutor`.
- Front : React + Vercel AI SDK (`ai`, `@ai-sdk/react`), monté en **shadow DOM**, charts via **Recharts**.

## Règles dures (non négociables)

1. **Sécurité du sandbox (PRD §8)** : aucune capacité ambiante dans le sandbox (pas de réseau, fs, `process`, env). La SEULE sortie est `bridge.callOperation`. **Interdits** comme sandbox : `node:vm` et `vm2`. Le credential ne doit jamais être lisible depuis le code sandboxé. Une faille ici = RCE.
2. **Appels côté serveur** : le `HostBridge` fait le HTTP. **API publiques uniquement.**
3. **Anti-lock-in (PRD §9)** : aucun import de SDK cloud (`aws-sdk`, etc.) dans le cœur. Sandbox = primitive de runtime OSS, jamais un service managé. Tout conteneurisable.
4. **Token utilisateur = reporté** : v1 utilise un credential de service par provider. Pas d'autorisation par utilisateur final, pas de `getToken` dans le widget pour l'instant.
5. **Validation systématique** : args validés (Zod) côté hôte avant tout appel HTTP.
6. **Mutations** : mode `intent` par défaut — une op mutante n'est jamais exécutée sans confirmation explicite via `POST /confirm`.

## Conventions de travail

- **Un jalon à la fois** (M0 → M7, cf. PRD §11). Ne pas anticiper les jalons suivants.
- **Plan d'abord** : avant de coder un jalon, proposer un plan (structure de repo, libs, découpage) et **t'arrêter pour validation**.
- **Tests au fur et à mesure**, mappés sur les critères d'acceptation (PRD §10). Fournir de quoi lancer (`npm test`, mock API).
- En cas de doute ou d'écart avec la PRD : **demander**, ne pas improviser sur les règles dures.
- Commits petits et atomiques, un par sous-étape.

## Décisions verrouillées

- Sandbox M0 : worker Deno. (`isolated-vm` plus tard.)
- Recherche par défaut : BM25 (`minisearch` ou équivalent) ; embeddings branchables plus tard.
- OpenAPI : supporter 3.0 et 3.1.
- Widget : shadow DOM, Recharts.
- Front : Vercel AI SDK.

## Architecture (M0)

Monorepo pnpm. Flux : `widget → /chat (LLM) → tools search/execute → sandbox Deno → HostBridge → API mock → résultat → chart`.

| Package | Rôle |
|---|---|
| `packages/mock-api` | API publique de démo (Express) + `openapi.yaml` (5 endpoints lecture) |
| `packages/catalogue` | Config loader, parser OpenAPI→`Operation[]`, schémas Zod, codegen `.d.ts` |
| `packages/search` | Recherche BM25 (`minisearch`) |
| `packages/sandbox` | `DenoWorkerExecutor` (`permissions:none`) + `HttpHostBridge` (HTTP + credential) |
| `packages/mcp-server` | `createEngine`, tools `search`/`execute`, serveur MCP StreamableHTTP |
| `packages/chat-backend` | Route `/chat` streaming (Vercel AI SDK), orchestre LLM + 2 tools |
| `packages/widget` | `window.initAgent`, shadow DOM, drawer, `useChat`, charts Recharts |

## Prérequis

- Node 20+ et `pnpm`.
- **Deno** (runtime du sandbox) : `bash scripts/setup-deno.sh` (auto-installé via le hook SessionStart sur Claude Code web). Vérifier : `deno --version`.

## Installer

```bash
pnpm install
bash scripts/setup-deno.sh   # si `deno` n'est pas déjà dans le PATH
```

## Variables d'environnement

```bash
# .env / export (ne pas committer)
export ANTHROPIC_API_KEY=sk-ant-...     # requis pour le chat backend (LLM réel)
export CHAT_MODEL=claude-sonnet-4-5     # optionnel, modèle Anthropic
export ENGINE_CONFIG=engine.config.json # config providers (défaut: ce fichier)
```

## Lancer la démo (3 terminaux, depuis la racine)

```bash
# 1) API mock publique (port 3001)
pnpm dev:mock

# 2) Chat backend = LLM + tools search/execute (port 3000)
ANTHROPIC_API_KEY=sk-ant-... pnpm dev:chat

# 3) Widget de démo (Vite dev, port 5173)
pnpm dev:widget
# → ouvrir http://localhost:5173
#   Cliquer le launcher, demander p.ex. « ventes par région » :
#   le LLM appelle search → execute (sandbox) → agrège → un chart s'affiche.
```

Intégration en production (bundle embarquable) :

```bash
pnpm build:widget                       # → packages/widget/dist/agent.js (IIFE)
# Voir packages/widget/demo/embed.html : <script src="agent.js"></script> + window.initAgent({...})
```

Serveur MCP autonome (interface standard, optionnel) :

```bash
ENGINE_CONFIG=engine.config.json pnpm dev:server   # POST http://localhost:3000/mcp
```

## Tests

```bash
pnpm test          # suite complète (vitest) — requiert Deno installé
pnpm typecheck     # tsc --noEmit sur tous les packages
```

Les tests sont mappés sur les critères PRD §10 :
`tests/search.test.ts` (§10.1-2), `tests/sandbox.test.ts` (§10.3, §10.7),
`tests/sandbox-isolation.test.ts` (§10.4, §10.5), `tests/engine.test.ts` (§10.1, §10.8),
`tests/mcp-server.test.ts` (interface MCP), `tests/chat-backend.test.ts` (boucle complète),
`tests/widget.test.ts` (§10.12-13).

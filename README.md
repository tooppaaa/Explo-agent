# code-mode-engine

Serveur MCP qui transforme des specs OpenAPI en SDK typé, exécuté par un LLM dans un sandbox sans capacités (« code-mode »), avec un widget React embarquable pour le chat et le rendu de charts.

## Prérequis

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Deno](https://deno.land/) 2+ (installé automatiquement par le script ci-dessous)
- Une clé API Anthropic : [console.anthropic.com](https://console.anthropic.com/)

## Installation

```bash
git clone https://github.com/tooppaaa/Explo-agent.git
cd Explo-agent

pnpm install
bash scripts/setup-deno.sh   # installe Deno si absent
```

Copier et remplir les variables d'environnement (chaque package a son `.env.example`) :

```bash
cp packages/chat-backend/.env.example packages/chat-backend/.env
# Éditer packages/chat-backend/.env : renseigner ANTHROPIC_API_KEY

# Les autres packages n'ont que des variables optionnelles :
# cp packages/mock-api/.env.example packages/mock-api/.env
# cp packages/mcp-server/.env.example packages/mcp-server/.env
```

## Lancer la démo

La démo nécessite **3 terminaux** lancés depuis la racine du projet.

### Terminal 1 — API mock (port 3001)

```bash
pnpm dev:mock
```

> Expose 5 endpoints de démo (`/products`, `/customers`, `/orders`, `/orders/:id`, `/sales/summary`) avec des fixtures 2026.

### Terminal 2 — Chat backend (port 3000)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pnpm dev:chat
```

> Route `/chat` streaming : orchestre le LLM (claude-sonnet) + les tools `search` et `execute` (sandbox Deno).

### Terminal 3 — Widget (port 5173)

```bash
pnpm dev:widget
```

Puis ouvrir **http://localhost:5173** dans le navigateur.

Cliquer le launcher en bas à droite et poser une question, par exemple :

- *« Quels produits performent le mieux en 2026 ? »*
- *« Donne-moi le chiffre d'affaires par région »*
- *« Liste les commandes livrées »*

Le LLM recherche les opérations disponibles, écrit du code dans le sandbox, appelle l'API mock et affiche le résultat sous forme de chart ou de tableau.

## Variables d'environnement

| Variable | Requis | Défaut | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Oui | — | Clé API Anthropic |
| `CHAT_MODEL` | Non | `claude-sonnet-4-5` | Modèle Anthropic à utiliser |
| `ENGINE_CONFIG` | Non | `engine.config.json` | Chemin vers la config providers |
| `MOCK_API_PORT` | Non | `3001` | Port de l'API mock |

## Tests

```bash
pnpm test          # 52 tests (vitest) — requiert Deno installé
pnpm typecheck     # vérification TypeScript (tsc --noEmit)
```

## Architecture

```
widget (React, shadow DOM, port 5173)
  └─► /chat (Express + Vercel AI SDK, port 3000)
        └─► LLM (Anthropic)
              ├─► tool search  → BM25 sur le catalogue OpenAPI
              └─► tool execute → sandbox Deno (permissions: none)
                                    └─► HttpHostBridge → API mock (port 3001)
```

| Package | Rôle |
|---|---|
| `packages/mock-api` | API Express de démo + spec OpenAPI (5 endpoints) |
| `packages/catalogue` | Parser OpenAPI → `Operation[]`, validation Zod, codegen `.d.ts` |
| `packages/search` | Recherche BM25 (MiniSearch) |
| `packages/sandbox` | Sandbox Deno (`permissions: none`) + bridge HTTP |
| `packages/mcp-server` | `createEngine`, tools MCP `search`/`execute` |
| `packages/chat-backend` | Route `/chat` streaming, LLM + 2 tools |
| `packages/widget` | `window.initAgent`, shadow DOM, charts Recharts |

## Intégration (bundle embarquable)

```bash
pnpm build:widget   # → packages/widget/dist/agent.js (IIFE)
```

```html
<script src="agent.js"></script>
<script>
  window.initAgent({ backendUrl: "https://your-chat-backend/chat" });
</script>
```

Voir `packages/widget/demo/embed.html` pour un exemple complet.

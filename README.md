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
| `AUTH_MODE` | Non | `required` si `NODE_ENV=production`, sinon `optional` | `required` : 401 sans `Authorization: Bearer` sur `/chat`, `/confirm`, `/mcp` |
| `RATE_LIMIT_MAX` | Non | `30` | Requêtes max par IP par fenêtre (0 = désactivé) |
| `RATE_LIMIT_WINDOW_MS` | Non | `60000` | Taille de la fenêtre du rate limiting |
| `ALLOWED_ORIGIN` | Non | toutes | Restreint CORS au domaine de l'app hôte |

## Sécurité des endpoints

Le Bearer token reçu sur `/chat`, `/confirm` et `/mcp` est mappé sur les providers
configurés (`tokenOverrides`) : chaque utilisateur appelle l'API métier avec **son**
credential, qui ne transite jamais dans le sandbox. Sans token, le moteur retombe
sur le credential de **service** lu dans l'env — c'est pourquoi, en production
(`AUTH_MODE=required`), les requêtes sans Bearer sont refusées (401 +
`WWW-Authenticate`).

Côté widget :

```js
window.initAgent({
  backendUrl: "https://your-chat-backend/chat",
  auth: { token: () => myApp.getUserApiKey() },   // statique ou callback
});
```

### Brancher le serveur MCP dans Claude (ou un autre client)

L'endpoint `POST /mcp` parle StreamableHTTP standard. Deux options :

1. **Bearer statique** (simple, recommandé pour démarrer) : générer un token par
   utilisateur/intégration et le passer en header. Exemple avec Claude Code :
   `claude mcp add --transport http code-mode https://…/mcp --header "Authorization: Bearer <token>"`.
   Fonctionne avec tout client MCP qui supporte les headers personnalisés.
2. **OAuth 2.1** (requis pour les connecteurs claude.ai grand public) : la spec MCP
   attend un Authorization Server (PKCE + Dynamic Client Registration). Plutôt que
   de l'implémenter soi-même, mettre l'endpoint derrière un proxy OAuth (Cloudflare
   `workers-oauth-provider`, Auth0, Stytch…) qui échange le grant contre le Bearer
   attendu ici. Le 401 renvoie déjà `WWW-Authenticate: Bearer`, point d'entrée du
   flow de découverte côté client.

## Tests

```bash
pnpm test          # suite complète (vitest) — requiert Deno installé
pnpm typecheck     # vérification TypeScript (tsc --noEmit)
```

## Observabilité (Langfuse, optionnel)

Le chat backend est instrumenté via **OpenTelemetry** (standard vendor-neutral) ;
**Langfuse** n'est qu'un exporter branchable — remplaçable par n'importe quel
backend OTel sans toucher au cœur.

Activation : renseigner les clés dans `packages/chat-backend/.env` (laisser vide = désactivé).

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASEURL=https://cloud.langfuse.com   # ou self-hosted
```

Chaque message produit une trace : appels LLM (tokens, coût, latence) et tool calls,
avec **le code généré**, les logs sandbox, le `__ui` produit et les erreurs — utile
pour diagnostiquer un chart manquant ou un code qui échoue.

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

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

## Lancer le projet

```bash
# Installer les dépendances
pnpm install

# Démarrer le mock API (port 3001)
pnpm dev:mock

# Démarrer le serveur MCP + chat backend (port 3000)
pnpm dev:chat

# Ouvrir la démo widget
# Ouvrir packages/widget/demo/index.html dans un navigateur
# ou: pnpm dev:widget (port 5173)
```

### Variables d'environnement requises

```bash
# .env à la racine (ne pas committer)
ANTHROPIC_API_KEY=sk-ant-...
MOCK_API_BASE_URL=http://localhost:3001
```

### Tests

```bash
pnpm test
```

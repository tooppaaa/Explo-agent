FROM node:20-alpine

# Deno requis pour le sandbox (DenoWorkerExecutor lance `deno run` en sous-process).
# Téléchargement direct du binaire — plus fiable que le script sur Alpine.
RUN apk add --no-cache curl unzip bash

# Deno — binaire x86_64 épinglé (Fargate est toujours amd64)
RUN curl -fsSL "https://github.com/denoland/deno/releases/download/v2.3.3/deno-x86_64-unknown-linux-gnu.zip" \
      -o /tmp/deno.zip \
    && unzip -p /tmp/deno.zip deno > /usr/local/bin/deno \
    && chmod +x /usr/local/bin/deno \
    && rm /tmp/deno.zip \
    && deno --version

ENV DENO_PATH=/usr/local/bin/deno

RUN npm install -g pnpm
WORKDIR /app

# Dépendances : copie d'abord les manifestes pour profiter du cache Docker
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages

# Installe toutes les dépendances (tsx compris — utilisé comme runtime TypeScript)
RUN pnpm install --frozen-lockfile

# Build le widget → packages/widget/dist/agent.js
# Le chat backend le sert sur GET /widget/agent.js
RUN pnpm build:widget

EXPOSE 3000
ENV NODE_ENV=production

# Pas de build TypeScript séparé : tsx transpile à la volée dans le process Node.
# Cela évite de gérer les symlinks pnpm workspace dans un build tsc multi-packages.
CMD ["pnpm", "dev:chat"]

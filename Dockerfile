FROM node:20-slim

# Deno requis pour le sandbox (DenoWorkerExecutor lance `deno run` en sous-process).
# node:20-slim est Debian/glibc — compatible avec le binaire Deno glibc (linux-gnu).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

# Deno — binaire x86_64 épinglé (Fargate est toujours amd64)
RUN curl -fsSL "https://github.com/denoland/deno/releases/download/v2.3.3/deno-x86_64-unknown-linux-gnu.zip" \
      -o /tmp/deno.zip \
    && unzip /tmp/deno.zip -d /tmp/deno_bin \
    && mv /tmp/deno_bin/deno /usr/local/bin/deno \
    && chmod +x /usr/local/bin/deno \
    && rm -rf /tmp/deno.zip /tmp/deno_bin \
    && deno --version

ENV DENO_PATH=/usr/local/bin/deno

RUN npm install -g pnpm
WORKDIR /app

# Dépendances : copie d'abord les manifestes pour profiter du cache Docker
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY engine.config.prod.json ./

# Installe toutes les dépendances (tsx compris — utilisé comme runtime TypeScript)
RUN pnpm install --frozen-lockfile

# Build le widget → packages/widget/dist/agent.js
# Le chat backend le sert sur GET /widget/agent.js
RUN pnpm build:widget

EXPOSE 3000
ENV NODE_ENV=production
ENV ENGINE_CONFIG=engine.config.prod.json

# Pas de build TypeScript séparé : tsx transpile à la volée dans le process Node.
# Cela évite de gérer les symlinks pnpm workspace dans un build tsc multi-packages.
CMD ["pnpm", "dev:chat"]

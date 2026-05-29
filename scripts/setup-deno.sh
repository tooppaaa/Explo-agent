#!/usr/bin/env bash
# Installe Deno (runtime du sandbox M0) s'il est absent.
# Le sandbox `DenoWorkerExecutor` requiert l'exécutable `deno` dans le PATH.
set -euo pipefail

if command -v deno >/dev/null 2>&1; then
  echo "[setup-deno] deno déjà présent: $(deno --version | head -1)"
  exit 0
fi

echo "[setup-deno] installation de Deno…"
DENO_DIR="${HOME}/.deno/bin"
mkdir -p "$DENO_DIR"
ZIP="/tmp/deno.zip"

# deno.land peut être bloqué selon la policy réseau ; on passe par GitHub releases.
URL="https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip"
curl -fsSL -o "$ZIP" "$URL"
unzip -o -q "$ZIP" -d "$DENO_DIR"
chmod +x "$DENO_DIR/deno"
rm -f "$ZIP"

# Lien dans le PATH si possible.
if [ -w /usr/local/bin ]; then
  ln -sf "$DENO_DIR/deno" /usr/local/bin/deno
fi

echo "[setup-deno] installé: $("$DENO_DIR/deno" --version | head -1)"
echo "[setup-deno] ajoute ${DENO_DIR} au PATH si nécessaire."

#!/usr/bin/env bash
# Installe Deno (runtime du sandbox M0) s'il est absent.
# Le sandbox `DenoWorkerExecutor` requiert l'exécutable `deno` dans le PATH.
set -euo pipefail

if command -v deno >/dev/null 2>&1; then
  # Vérifie que le binaire tourne vraiment (mauvaise archi = exec format error)
  if deno --version >/dev/null 2>&1; then
    echo "[setup-deno] deno déjà présent: $(deno --version | head -1)"
    exit 0
  fi
  echo "[setup-deno] deno trouvé mais inutilisable (mauvaise architecture ?), réinstallation…"
fi

echo "[setup-deno] installation de Deno…"
DENO_DIR="${HOME}/.deno/bin"
mkdir -p "$DENO_DIR"
ZIP="/tmp/deno.zip"

# Détection OS + architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "${OS}-${ARCH}" in
  Linux-x86_64)   TARGET="deno-x86_64-unknown-linux-gnu" ;;
  Linux-aarch64)  TARGET="deno-aarch64-unknown-linux-gnu" ;;
  Darwin-x86_64)  TARGET="deno-x86_64-apple-darwin" ;;
  Darwin-arm64)   TARGET="deno-aarch64-apple-darwin" ;;
  *)
    echo "[setup-deno] architecture non supportée : ${OS}-${ARCH}" >&2
    exit 1
    ;;
esac

URL="https://github.com/denoland/deno/releases/latest/download/${TARGET}.zip"
echo "[setup-deno] téléchargement ${TARGET}…"
curl -fsSL -o "$ZIP" "$URL"
unzip -o -q "$ZIP" -d "$DENO_DIR"
chmod +x "$DENO_DIR/deno"
rm -f "$ZIP"

# Lien dans le PATH si possible.
if [ -w /usr/local/bin ]; then
  ln -sf "$DENO_DIR/deno" /usr/local/bin/deno
fi

# Ajout de ~/.deno/bin au PATH si absent du shell courant.
SHELL_RC=""
case "${SHELL:-}" in
  */zsh)  SHELL_RC="${HOME}/.zshrc" ;;
  */bash) SHELL_RC="${HOME}/.bashrc" ;;
esac

if [ -n "$SHELL_RC" ] && ! grep -q '\.deno/bin' "$SHELL_RC" 2>/dev/null; then
  echo "export PATH=\"\$HOME/.deno/bin:\$PATH\"" >> "$SHELL_RC"
  echo "[setup-deno] PATH ajouté dans ${SHELL_RC} — relancer le shell ou : source ${SHELL_RC}"
fi

echo "[setup-deno] installé: $("$DENO_DIR/deno" --version | head -1)"

#!/usr/bin/env bash
set -euo pipefail

# NikCLI curl installer (beta)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash -s -- --tag beta
#   curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash -s -- --version 0.3.3-beta

TAG="beta"
VERSION="0.3.2"
PACKAGE="@cadcamfun/nikcli"

log() { echo -e "[NikCLI] $*"; }
err() { echo -e "[NikCLI][ERROR] $*" >&2; }
usage() {
  cat <<EOF
NikCLI Installer

Options:
  --tag <npm-tag>        NPM tag to install (default: beta)
  --version <x.y.z>      Exact version to install (overrides --tag)
  -h, --help             Show this help

Examples:
  bash install.sh --tag beta
  bash install.sh --version 0.2.60-beta
EOF
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      [[ $# -ge 2 ]] || { err "--tag requires a value"; exit 1; }
      TAG="$2"; shift 2 ;;
    --version)
      [[ $# -ge 2 ]] || { err "--version requires a value"; exit 1; }
      VERSION="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      err "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

# Checks
if ! command -v node >/dev/null 2>&1; then
  err "Node.js is required. Please install Node.js >= 18 first: https://nodejs.org/en/download"; exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  err "npm is required. Please install npm (bundled with Node.js)."; exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ -z "$NODE_MAJOR" ]] || (( NODE_MAJOR < 18 )); then
  err "Node.js >= 18 is required. Detected: $(node -v 2>/dev/null || echo unknown)"; exit 1
fi

TARGET="$PACKAGE@${TAG}"
if [[ -n "$VERSION" ]]; then
  TARGET="$PACKAGE@$VERSION"
fi

log "Installing $TARGET globally via npm..."
npm i -g "$TARGET"

if command -v nikcli >/dev/null 2>&1; then
  log "Installation complete. You can start with: nikcli"
  log "Version: $(nikcli --version 2>/dev/null || echo installed)"
else
  err "nikcli not found on PATH after install. Ensure your npm global bin is on PATH."
  npm bin -g | sed 's/^/[NikCLI] Global npm bin: /'
fi

log "Uninstall with: npm uninstall -g $PACKAGE"

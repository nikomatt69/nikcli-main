#!/usr/bin/env bash
set -euo pipefail

# NikCLI curl uninstaller (beta)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nikomatt69/agent-cli/main/installer/uninstall.sh | bash

PACKAGE="@cadcamfun/nikcli"

log() { echo -e "[NikCLI] $*"; }
err() { echo -e "[NikCLI][ERROR] $*" >&2; }

if ! command -v node >/dev/null 2>&1; then
  err "Node.js is required to manage global npm packages. Please install Node.js >= 18 first: https://nodejs.org/en/download"; exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  err "npm is required. Please install npm (bundled with Node.js)."; exit 1
fi

log "Uninstalling $PACKAGE globally via npm..."
if npm ls -g --depth=0 "$PACKAGE" >/dev/null 2>&1; then
  npm uninstall -g "$PACKAGE"
  log "Uninstalled."
else
  log "$PACKAGE not found globally. Nothing to do."
fi

GLOBAL_BIN="$(npm bin -g)"
log "Global npm bin: $GLOBAL_BIN"
log "If 'nikcli' persists, ensure your PATH doesn't include stale locations."

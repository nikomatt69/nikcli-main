#!/usr/bin/env bash
set -euo pipefail

PACKAGE="@nicomatt69/nikcli"
RELEASE_REPO="${NIKCLI_RELEASE_REPO:-nicomatt69/nikcli-main}"
NODE_MIN_MAJOR=22
DEFAULT_METHODS=( "bun" "npm" "standalone")

info() { echo -e "[NikCLI] $*"; }
warn() { echo -e "[NikCLI][WARN] $*" >&2; }
error() { echo -e "[NikCLI][ERROR] $*" >&2; }

usage() {
  cat <<'EOF'
NikCLI universal installer
Usage: bash install.sh [--method=brew|bun|npm|standalone]
Default priority: brew -> bun -> npm -> standalone
EOF
}

method_label() {
  case "$1" in
    brew) echo "Homebrew";;
    bun) echo "Bun";;
    npm) echo "npm";;
    standalone) echo "standalone binary";;
    *) echo "$1";;
  esac
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

parse_method_override() {
  local override=""
  for arg in "$@"; do
    case "$arg" in
      --method=*)
        override="${arg#*=}"
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        error "Unknown argument: $arg"
        usage
        exit 1
        ;;
    esac
  done

  if [[ -n "$override" ]]; then
    case "$override" in
      brew|bun|npm|standalone) ;;
      *) error "Invalid method: $override"; exit 1;;
    esac
    local reordered=("$override")
    for m in "${DEFAULT_METHODS[@]}"; do
      [[ "$m" == "$override" ]] || reordered+=("$m")
    done
    METHOD_ORDER=("${reordered[@]}")
  else
    METHOD_ORDER=("${DEFAULT_METHODS[@]}")
  fi
}

node_version_ok() {
  if ! command_exists node; then
    warn "Node.js not found; skipping npm install path."
    return 1
  fi
  local major
  major=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)
  if [[ -z "$major" ]] || (( major < NODE_MIN_MAJOR )); then
    warn "Node.js ${NODE_MIN_MAJOR}+ required for npm install (found $(node -v 2>/dev/null))."
    return 1
  fi
  return 0
}

resolve_standalone_asset() {
  local os arch
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin) os="macos";;
    Linux) os="linux";;
    *) return 1;;
  esac

  case "$arch" in
    arm64|aarch64) arch="arm64";;
    x86_64|amd64) arch="x64";;
    *) return 1;;
  esac

  if [[ "$os" == "macos" && "$arch" == "arm64" ]]; then
    echo "nikcli-macos-arm64.tar.gz"
  elif [[ "$os" == "macos" && "$arch" == "x64" ]]; then
    echo "nikcli-macos-x64.tar.gz"
  elif [[ "$os" == "linux" && "$arch" == "x64" ]]; then
    echo "nikcli-linux-x64.tar.gz"
  else
    return 1
  fi
}

download_file() {
  local url=$1 dest=$2
  if command_exists curl; then
    curl -fL "$url" -o "$dest"
  elif command_exists wget; then
    wget -qO "$dest" "$url"
  else
    return 1
  fi
}

INSTALLER_SUDO=""
INSTALL_ROOT=""
BIN_DIR=""

run_cmd() {
  if [[ -n "$INSTALLER_SUDO" ]]; then
    sudo "$@"
  else
    "$@"
  fi
}

prepare_paths() {
  local base="${NIKCLI_PREFIX:-/usr/local}"
  INSTALLER_SUDO=""

  if ! mkdir -p "$base" 2>/dev/null; then
    if command_exists sudo && sudo mkdir -p "$base" 2>/dev/null; then
      INSTALLER_SUDO="sudo"
    else
      base="$HOME/.local"
      if ! mkdir -p "$base" 2>/dev/null; then
        error "Cannot create install path at $base."
        return 1
      fi
      warn "Using $base because /usr/local is not writable."
    fi
  fi

  INSTALL_ROOT="$base/lib/nikcli"
  BIN_DIR="$base/bin"

  run_cmd mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
}

install_with_brew() {
  if ! command_exists brew; then
    warn "Homebrew not found."
    return 1
  fi

  info "Installing via Homebrew..."
  brew tap nicomatt69/nikcli >/dev/null 2>&1 || true
  if brew install nicomatt69/nikcli/nikcli; then
    return 0
  fi

  return 1
}

install_with_bun() {
  if ! command_exists bun; then
    warn "Bun not found."
    return 1
  fi

  info "Installing via Bun..."
  if bun install -g "$PACKAGE"; then
    return 0
  fi
  return 1
}

install_with_npm() {
  if ! command_exists npm; then
    warn "npm not found."
    return 1
  fi
  if ! node_version_ok; then
    return 1
  fi

  info "Installing via npm..."
  if npm install -g "$PACKAGE"; then
    return 0
  fi
  return 1
}

install_standalone() {
  local asset
  asset=$(resolve_standalone_asset) || { warn "Unsupported platform for standalone install."; return 1; }

  if ! command_exists tar; then
    warn "tar is required for standalone install."
    return 1
  fi

  if ! command_exists curl && ! command_exists wget; then
    warn "Neither curl nor wget is available to download the standalone package."
    return 1
  fi

  local url="https://github.com/${RELEASE_REPO}/releases/latest/download/${asset}"
  local tmp_dir archive_path extracted_dir
  tmp_dir=$(mktemp -d 2>/dev/null || mktemp -d -t nikcli) || { warn "Cannot create temp directory."; return 1; }
  archive_path="${tmp_dir}/${asset}"

  info "Downloading standalone package (${asset})..."
  if ! download_file "$url" "$archive_path"; then
    warn "Download failed from $url"
    rm -rf "$tmp_dir"
    return 1
  fi

  if ! tar -xzf "$archive_path" -C "$tmp_dir"; then
    warn "Failed to extract archive."
    rm -rf "$tmp_dir"
    return 1
  fi

  extracted_dir="${tmp_dir}/${asset%.tar.gz}"
  if [[ ! -d "$extracted_dir" ]]; then
    warn "Unexpected archive structure."
    rm -rf "$tmp_dir"
    return 1
  fi

  if ! prepare_paths; then
    rm -rf "$tmp_dir"
    return 1
  fi

  info "Installing standalone payload into ${INSTALL_ROOT}..."
  run_cmd rm -rf "$INSTALL_ROOT"
  run_cmd mkdir -p "$INSTALL_ROOT"
  run_cmd cp -R "${extracted_dir}/." "$INSTALL_ROOT"
  run_cmd mkdir -p "$BIN_DIR"
  run_cmd ln -sf "${INSTALL_ROOT}/bin/nikcli" "${BIN_DIR}/nikcli"
  run_cmd chmod +x "${INSTALL_ROOT}/bin/nikcli" 2>/dev/null || true
  if ls "${INSTALL_ROOT}"/bin/nikcli-* >/dev/null 2>&1; then
    run_cmd chmod +x "${INSTALL_ROOT}"/bin/nikcli-*
  fi

  rm -rf "$tmp_dir"
  info "Standalone install complete (linked at ${BIN_DIR}/nikcli)."
  return 0
}

verify_install() {
  local check_cmd="nikcli"
  if ! command_exists nikcli && [[ -n "${BIN_DIR:-}" && -x "${BIN_DIR}/nikcli" ]]; then
    check_cmd="${BIN_DIR}/nikcli"
  fi

  if ! command_exists "$check_cmd"; then
    warn "nikcli not found on PATH after install. Ensure ${BIN_DIR:-/usr/local/bin} is in your PATH."
    return 1
  fi

  if "$check_cmd" --version >/dev/null 2>&1; then
    info "nikcli installed successfully. Run: ${check_cmd} --help"
    return 0
  else
    warn "nikcli installed but version check failed."
    return 1
  fi
}

run_method() {
  case "$1" in
    brew) install_with_brew;;
    bun) install_with_bun;;
    npm) install_with_npm;;
    standalone) install_standalone;;
    *) return 1;;
  esac
}

parse_method_override "$@"
info "Preferred order: ${METHOD_ORDER[*]}"

SUCCESS_METHOD=""
for method in "${METHOD_ORDER[@]}"; do
  info "Attempting $(method_label "$method")..."
  if run_method "$method"; then
    SUCCESS_METHOD="$method"
    break
  else
    warn "Method $(method_label "$method") failed, trying next option."
  fi
done

if [[ -z "$SUCCESS_METHOD" ]]; then
  error "All installation methods failed."
  exit 1
fi

info "Installation completed using $(method_label "$SUCCESS_METHOD")."

verify_install || exit 1

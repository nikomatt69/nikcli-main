#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Bench script for NikCLI (Node vs wrapper vs pkg binary)
# Env overrides:
#   NIKCLI_BENCH_CMD="--help"             # command passed to CLI
#   NIKCLI_BENCH_ITERS="2000"             # iterations for concurrency test
#   NIKCLI_BENCH_PARALLEL="$(sysctl -n hw.ncpu)" # parallelism
#   NIKCLI_BENCH_SOAK_SEC="600"           # duration of soak test (not used by default)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/reports/bench/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${OUT_DIR}"

CMD="${NIKCLI_BENCH_CMD:---help}"
ITERATIONS="${NIKCLI_BENCH_ITERS:-2000}"
PARALLEL="${NIKCLI_BENCH_PARALLEL:-$( (sysctl -n hw.ncpu) 2>/dev/null || echo 4 )}"
SOAK_SECONDS="${NIKCLI_BENCH_SOAK_SEC:-600}"

# Targets
DIST_JS="${ROOT_DIR}/dist/cli/index.js"
WRAPPER="${ROOT_DIR}/bin/nikcli"

OS="$(uname -s || echo unknown)"
ARCH="$(uname -m || echo unknown)"
PKG_BIN=""
case "${OS}-${ARCH}" in
  Darwin-arm64)  PKG_BIN="${ROOT_DIR}/public/bin/nikcli-aarch64-apple-darwin" ;;
  Darwin-x86_64) PKG_BIN="${ROOT_DIR}/public/bin/nikcli-x86_64-apple-darwin" ;;
  Linux-x86_64)  PKG_BIN="${ROOT_DIR}/public/bin/nikcli-x86_64-linux" ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT-*) PKG_BIN="${ROOT_DIR}/public/bin/nikcli-x86_64-windows.exe" ;;
  *) PKG_BIN="" ;;
esac
# If not found, try to pick any pkged binary in public/bin
if [[ -z "${PKG_BIN}" || ! -x "${PKG_BIN}" ]]; then
  if [[ -d "${ROOT_DIR}/public/bin" ]]; then
    CANDIDATE="$(find "${ROOT_DIR}/public/bin" -maxdepth 1 -type f -perm +111 -name 'nikcli*' 2>/dev/null | head -n1 || true)"
    [[ -n "${CANDIDATE:-}" ]] && PKG_BIN="${CANDIDATE}"
  fi
fi

# Tools
HYPERFINE="$(command -v hyperfine || true)"
GTIME="$(command -v gtime || true)" # gnu-time on macOS via 'brew install gnu-time'
NODE_BIN="$(command -v node || true)"
PNPM_BIN="$(command -v pnpm || true)"
JQ_BIN="$(command -v jq || true)"

need_tool() {
  local name="$1" hint="${2:-}"
  if [[ -z "$(command -v "$name" || true)" ]]; then
    echo "Missing dependency: $name ${hint}" >&2
    exit 1
  fi
}

echo "Output dir: ${OUT_DIR}"
echo "Command: ${CMD}"
echo "Iterations: ${ITERATIONS}, Parallel: ${PARALLEL}"

# Validate base tools
need_tool node
need_tool pnpm
if [[ -z "${HYPERFINE}" ]]; then
  echo "Warning: hyperfine not found. Startup benchmark will be skipped. Install with: brew install hyperfine" >&2
fi
if [[ -z "${GTIME}" ]]; then
  echo "Warning: gtime (GNU time) not found. Concurrency resource metrics may be limited. Install with: brew install gnu-time" >&2
fi

# Build artifacts if missing
if [[ ! -f "${DIST_JS}" ]]; then
  echo "Building JS distribution..."
  (cd "${ROOT_DIR}" && "${PNPM_BIN}" run build)
fi

if [[ -n "${PKG_BIN}" && ! -x "${PKG_BIN}" ]]; then
  echo "pkg binary not found at ${PKG_BIN}."
  case "${OS}-${ARCH}" in
    Darwin-arm64)
      echo "Attempting to build pkg binary for macOS ARM..."
      (cd "${ROOT_DIR}" && "${PNPM_BIN}" run pkg:macos:arm64) || true
      ;;
    Darwin-x86_64)
      echo "Attempting to build pkg binary for macOS x64..."
      (cd "${ROOT_DIR}" && "${PNPM_BIN}" run pkg:macos:x64) || true
      ;;
    Linux-x86_64)
      echo "Attempting to build pkg binary for Linux x64..."
      (cd "${ROOT_DIR}" && "${PNPM_BIN}" run pkg:linux:x64) || true
      ;;
    *)
      echo "Skip auto-building pkg for this platform."
      ;;
  esac
fi

# Re-evaluate PKG_BIN existence
if [[ -n "${PKG_BIN}" && ! -x "${PKG_BIN}" ]] ; then
  echo "Note: pkg binary still not present at ${PKG_BIN}. It will be skipped." >&2
  PKG_BIN=""
fi

# --- 1) Startup benchmarks (cold/warm) ---
run_startup_bench() {
  [[ -z "${HYPERFINE}" ]] && return 0
  echo "Running startup benchmarks (hyperfine)..."

  local cmds=()
  [[ -f "${DIST_JS}"     ]] && cmds+=("/usr/bin/env node ${DIST_JS} ${CMD}")
  [[ -x "${WRAPPER}"     ]] && cmds+=("${WRAPPER} ${CMD}")
  [[ -n "${PKG_BIN}" ]] && [[ -x "${PKG_BIN}" ]] && cmds+=("${PKG_BIN} ${CMD}")

  if [[ "${#cmds[@]}" -eq 0 ]]; then
    echo "No commands available for startup benchmark." >&2
    return 0
  fi

  "${HYPERFINE}" --warmup 3 --runs 25 \
    --export-json "${OUT_DIR}/startup.json" \
    --export-markdown "${OUT_DIR}/startup.md" \
    "${cmds[@]}"

  # Quick summary into SUMMARY.md
  {
    echo "## Startup Benchmark (hyperfine)"
    echo
    if [[ -n "${JQ_BIN}" && -f "${OUT_DIR}/startup.json" ]]; then
      "${JQ_BIN}" -r '.results[] | "- " + .command + ": mean=" + (.mean|tostring) + "s, stddev=" + (.stddev|tostring) + "s"' "${OUT_DIR}/startup.json"
    else
      echo "_Install jq to get per-command summary. Raw files saved to startup.json and startup.md_"
    fi
    echo
  } >> "${OUT_DIR}/SUMMARY.md"
}

# --- 2) Concurrency throughput + resource usage ---
run_concurrency_bench() {
  echo "Running concurrency tests (xargs -P ${PARALLEL}, iterations=${ITERATIONS})..."
  local base="seq ${ITERATIONS} | xargs -n1 -P ${PARALLEL} -I{}"
  local devnull="> /dev/null 2>&1"

  if [[ -f "${DIST_JS}" ]]; then
    if [[ -n "${GTIME}" ]]; then
      "${GTIME}" -v -o "${OUT_DIR}/concurrency-node.txt" bash -lc "${base} /usr/bin/env node \"${DIST_JS}\" ${CMD} ${devnull}"
    else
      time bash -lc "${base} /usr/bin/env node \"${DIST_JS}\" ${CMD} ${devnull}" 2> "${OUT_DIR}/concurrency-node.txt"
    fi
  fi

  if [[ -x "${WRAPPER}" ]]; then
    if [[ -n "${GTIME}" ]]; then
      "${GTIME}" -v -o "${OUT_DIR}/concurrency-wrapper.txt" bash -lc "${base} \"${WRAPPER}\" ${CMD} ${devnull}"
    else
      time bash -lc "${base} \"${WRAPPER}\" ${CMD} ${devnull}" 2> "${OUT_DIR}/concurrency-wrapper.txt"
    fi
  fi

  if [[ -n "${PKG_BIN}" && -x "${PKG_BIN}" ]]; then
    if [[ -n "${GTIME}" ]]; then
      "${GTIME}" -v -o "${OUT_DIR}/concurrency-pkg.txt" bash -lc "${base} \"${PKG_BIN}\" ${CMD} ${devnull}"
    else
      time bash -lc "${base} \"${PKG_BIN}\" ${CMD} ${devnull}" 2> "${OUT_DIR}/concurrency-pkg.txt"
    fi
  fi

  {
    echo "## Concurrency Test"
    for f in concurrency-node.txt concurrency-wrapper.txt concurrency-pkg.txt; do
      if [[ -f "${OUT_DIR}/${f}" ]]; then
        echo
        echo "### ${f}"
        # Extract common interesting lines from GNU time output
        grep -E 'User time|System time|Percent of CPU|Elapsed|Maximum resident set size|Minor|Major|Voluntary|Involuntary' "${OUT_DIR}/${f}" || cat "${OUT_DIR}/${f}"
        echo
      fi
    done
  } >> "${OUT_DIR}/SUMMARY.md"
}

# --- 3) Node profiling (CPU/Heap) ---
run_node_profiling() {
  echo "Running Node profiling (CPU/Heap) for JS entrypoint..."
  if [[ -f "${DIST_JS}" ]]; then
    "${NODE_BIN}" --cpu-prof "${DIST_JS}" ${CMD} >/dev/null 2>&1 || true
    "${NODE_BIN}" --heap-prof "${DIST_JS}" ${CMD} >/dev/null 2>&1 || true
    # Move created profiles into OUT_DIR
    find . -maxdepth 1 -type f -name '*.cpuprofile' -exec mv {} "${OUT_DIR}/" \; 2>/dev/null || true
    find . -maxdepth 1 -type f -name '*.heapprofile' -exec mv {} "${OUT_DIR}/" \; 2>/dev/null || true
    {
      echo "## Profiling Artifacts"
      ls -1 "${OUT_DIR}" | grep -E '\\.cpuprofile$|\\.heapprofile$' || echo "_No profile files found_"
      echo
    } >> "${OUT_DIR}/SUMMARY.md"
  else
    echo "JS entrypoint not found; skipping profiling." >> "${OUT_DIR}/SUMMARY.md"
  fi
}

# --- Run all ---
{
  echo "# NikCLI Bench Report"
  echo
  echo "- Date (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- Command tested: ${CMD}"
  echo "- Iterations: ${ITERATIONS}"
  echo "- Parallelism: ${PARALLEL}"
  echo "- OS: ${OS}, Arch: ${ARCH}"
  echo "- Targets:"
  echo "  - Node JS: ${DIST_JS} $( [[ -f "${DIST_JS}" ]] && echo '[OK]' || echo '[MISSING]' )"
  echo "  - Wrapper: ${WRAPPER} $( [[ -x "${WRAPPER}" ]] && echo '[OK]' || echo '[MISSING]' )"
  echo "  - Pkg bin: ${PKG_BIN:-<none>} $( [[ -n "${PKG_BIN}" && -x "${PKG_BIN}" ]] && echo '[OK]' || echo '[MISSING]' )"
  echo
} > "${OUT_DIR}/SUMMARY.md"

run_startup_bench
run_concurrency_bench
run_node_profiling

echo
echo "Bench complete. Artifacts:"
echo "  ${OUT_DIR}/SUMMARY.md"
echo "  ${OUT_DIR}/startup.json (if hyperfine present)"
echo "  ${OUT_DIR}/startup.md (if hyperfine present)"
echo "  ${OUT_DIR}/concurrency-*.txt"
echo "  ${OUT_DIR}/*.cpuprofile / *.heapprofile (if generated)"
echo
echo "Tip:"
echo "- Override the tested command via: NIKCLI_BENCH_CMD=\"your subcommand\" ${0}"
echo "- This script uses pkg for binary comparison."



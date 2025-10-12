import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Resolve the effective working directory for tools and services.
 * Priority:
 * 1) Explicit input (if provided)
 * 2) NIKCLI_WORKSPACE env var
 * 3) Process CWD, adjusted when pointing at build output (dist)
 */
export function getWorkingDirectory(explicit?: string): string {
  const fromEnv = process.env.NIKCLI_WORKSPACE

  let base = explicit || fromEnv || process.cwd()
  base = path.resolve(base)

  // If CWD is inside a build folder (dist/*), try to snap to project root
  // This helps when running compiled output or via different toolchains (node/bun)
  const parts = base.split(path.sep)
  const distIdx = parts.lastIndexOf('dist')
  if (distIdx >= 0) {
    const candidate = path.resolve(parts.slice(0, distIdx).join(path.sep) || path.sep)
    // Prefer a parent that looks like a project root (has package.json or .git)
    if (looksLikeProjectRoot(candidate)) {
      return candidate
    }
  }

  return base
}

function looksLikeProjectRoot(dir: string): boolean {
  try {
    const pkg = path.join(dir, 'package.json')
    const git = path.join(dir, '.git')
    if (fs.existsSync(pkg)) return true
    if (fs.existsSync(git) && fs.statSync(git).isDirectory()) return true
  } catch {}
  return false
}


// TODO: Consider refactoring for reduced complexity

import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import * as jsdiff from 'diff'
import { bunExec } from './bun-compat'

export interface ShowDiffOptions {
  context?: number
  forceJsDiff?: boolean
  compact?: boolean
}

async function isGitAvailable(): Promise<boolean> {
  try {
    const { exitCode } = await bunExec('git --version', { timeout: 2000 })
    return exitCode === 0
  } catch (_e) {
    return false
  }
}

async function readFileSafe(filePath?: string): Promise<string> {
  if (!filePath) return ''
  try {
    if (typeof Bun !== 'undefined') {
      return await Bun.file(path.resolve(filePath)).text()
    }
    return await fs.promises.readFile(path.resolve(filePath), 'utf8')
  } catch {
    return ''
  }
}

/**
 * Generate a unified diff string between oldContent and newContent.
 * If git is available and not forced to JS fallback, uses `git diff --no-index` for a familiar output.
 * Otherwise falls back to jsdiff.createPatch.
 */
export async function generateUnifiedDiff(
  oldPath: string | undefined,
  newPath: string,
  options: { context?: number; forceJsDiff?: boolean } = {}
): Promise<string> {
  const context = options.context ?? 3
  const forceJs = options.forceJsDiff ?? false

  const oldExists = !!oldPath && fs.existsSync(oldPath)
  const oldDisplay = oldExists ? oldPath! : '/dev/null'

  if (!forceJs && (await isGitAvailable())) {
    // Use git diff --no-index to generate a unified diff similar to GitHub
    try {
      const { stdout, exitCode } = await bunExec(
        `git --no-pager diff --no-index -U${context} -- "${oldDisplay}" "${newPath}"`,
        { timeout: 10000, cwd: process.cwd() }
      )
      // git exit code for diffs can be non-zero when there are differences
      if (stdout) return stdout
    } catch (err: any) {
      // Fall through to JS diff
    }
  }

  // Fallback: use jsdiff to create a patch
  const oldContent = await readFileSafe(oldPath)
  const newContent = await readFileSafe(newPath)
  const patch = jsdiff.createPatch(path.basename(newPath), oldContent, newContent, oldPath || '', newPath, { context })
  return patch
}

/**
 * Colorize a unified diff for terminal output (GitHub-like coloring)
 */
export function colorizeUnifiedDiff(patch: string): string {
  if (!patch) return ''

  const lines = patch.split(/\r?\n/)
  const out: string[] = []

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      out.push(chalk.cyan.bold(line))
    } else if (line.startsWith('@@')) {
      out.push(chalk.magenta(line))
    } else if (line.startsWith('+')) {
      out.push(chalk.green(line))
    } else if (line.startsWith('-')) {
      out.push(chalk.red(line))
    } else if (line.startsWith('diff --git')) {
      out.push(chalk.yellow(line))
    } else {
      out.push(chalk.gray(line))
    }
  }

  return out.join('\n')
}

/**
 * Generate and print a colored unified diff between two files.
 * If oldPath is falsy or doesn't exist, it will be treated as an empty file (new file).
 */
export async function showUnifiedDiff(oldPath: string | undefined, newPath: string, opts: ShowDiffOptions = {}) {
  const forceJs = opts.forceJsDiff ?? false
  const context = opts.context ?? 3

  const patch = await generateUnifiedDiff(oldPath, newPath, {
    context,
    forceJsDiff: forceJs,
  })
  if (!patch || patch.trim().length === 0) {
    console.log(chalk.gray('No differences detected.'))
    return
  }

  const colored = colorizeUnifiedDiff(patch)
  console.log(`\n${colored}\n`)
}

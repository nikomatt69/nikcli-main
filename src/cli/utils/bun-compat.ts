/**
 * Bun Compatibility Layer
 * Provides Bun-native APIs with fallbacks for Node.js compatibility
 */

// Re-export Bun Shell API
export { $ } from 'bun'

// ============================================================================
// FILE SYSTEM HELPERS
// ============================================================================

/**
 * Get a Bun file reference
 */
export const bunFile = Bun.file

/**
 * Write content to a file using Bun
 */
export const bunWrite = Bun.write

/**
 * Check if file or directory exists
 * Replacement for fs.existsSync / fs.promises.access
 */
export async function fileExists(path: string): Promise<boolean> {
  const file = Bun.file(path)
  return await file.exists()
}

/**
 * Synchronous file existence check
 */
export function fileExistsSync(path: string): boolean {
  try {
    const result = Bun.spawnSync(['test', '-e', path])
    return result.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Create directory recursively (mkdir -p)
 * Replacement for fs.mkdir({ recursive: true })
 */
export async function mkdirp(path: string): Promise<void> {
  const { $ } = await import('bun')
  await $`mkdir -p ${path}`.quiet()
}

/**
 * Synchronous recursive directory creation
 */
export function mkdirpSync(path: string): void {
  Bun.spawnSync(['mkdir', '-p', path])
}

/**
 * Read and parse JSON file
 */
export async function readJson<T = unknown>(path: string): Promise<T> {
  return await bunFile(path).json()
}

/**
 * Write JSON file with formatting
 */
export async function writeJson(path: string, data: unknown, options?: { spaces?: number }): Promise<void> {
  const json = JSON.stringify(data, null, options?.spaces ?? 2)
  await bunWrite(path, json)
}

/**
 * Copy file (replacement for fs.copyFile)
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  const { $ } = await import('bun')
  await $`cp ${src} ${dest}`.quiet()
}

/**
 * Remove file (replacement for fs.unlink)
 */
export async function removeFile(path: string): Promise<void> {
  const { $ } = await import('bun')
  await $`rm -f ${path}`.quiet()
}

/**
 * Remove directory recursively (replacement for fs.rm({ recursive: true }))
 */
export async function removeDir(path: string): Promise<void> {
  const { $ } = await import('bun')
  await $`rm -rf ${path}`.quiet()
}

/**
 * Read file as text
 */
export async function readText(path: string): Promise<string> {
  return await bunFile(path).text()
}

/**
 * Read file as ArrayBuffer
 */
export async function readBuffer(path: string): Promise<ArrayBuffer> {
  return await bunFile(path).arrayBuffer()
}

// ============================================================================
// CRYPTO HELPERS
// ============================================================================

/**
 * Hash data using Bun's native hasher
 * Replacement for crypto.createHash
 */
export function bunHash(algorithm: 'sha256' | 'sha512' | 'md5', data: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher(algorithm)
  hasher.update(data)
  return hasher.digest('hex')
}

/**
 * Generate random bytes as hex string
 * Replacement for crypto.randomBytes
 */
export function bunRandomBytes(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ============================================================================
// PROCESS / SHELL HELPERS
// ============================================================================

/**
 * Execute shell command and return output
 */
export async function bunShell(
  command: string,
  options?: { cwd?: string; quiet?: boolean }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { $ } = await import('bun')

  let cmd = $`${command}`

  if (options?.cwd) {
    cmd = cmd.cwd(options.cwd)
  }

  if (options?.quiet) {
    cmd = cmd.quiet()
  }

  try {
    const result = await cmd
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode,
    }
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message,
      exitCode: error.exitCode || 1,
    }
  }
}

/**
 * Execute shell command synchronously
 */
export function bunShellSync(
  command: string,
  options?: { cwd?: string }
): { stdout: string; stderr: string; exitCode: number } {
  const args = ['sh', '-c', command]
  const result = Bun.spawnSync(args, {
    cwd: options?.cwd,
  })

  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}
/**
 * Write text to file
 *
 * @param path - File path
 * @param content - Text content
 *
 * @example
 * await writeText('/path/to/file.txt', 'Hello World')
 */
export async function writeText(path: string, content: string): Promise<void> {
  await Bun.write(path, content)
}

/**
 * Spawn a process using Bun
 */
export function bunSpawn(
  cmd: string[],
  options?: {
    cwd?: string
    env?: Record<string, string>
    stdin?: 'inherit' | 'pipe' | 'ignore'
    stdout?: 'inherit' | 'pipe' | 'ignore'
    stderr?: 'inherit' | 'pipe' | 'ignore'
  }
) {
  return Bun.spawn(cmd, {
    cwd: options?.cwd,
    env: options?.env,
    stdin: options?.stdin,
    stdout: options?.stdout,
    stderr: options?.stderr,
  })
}

/**
 * Spawn a process synchronously using Bun
 */
export function bunSpawnSync(
  cmd: string[],
  options?: {
    cwd?: string
    env?: Record<string, string>
  }
) {
  return Bun.spawnSync(cmd, {
    cwd: options?.cwd,
    env: options?.env,
  })
}

/**
 * Execute a command with full result (stdout, stderr, exitCode)
 */
export async function bunExec(
  command: string,
  options?: { cwd?: string; timeout?: number; env?: Record<string, string | undefined> }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return await bunShell(command, { cwd: options?.cwd, quiet: true })
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

/**
 * Glob pattern matching using Bun.Glob
 */
export function bunGlob(pattern: string): Bun.Glob {
  return new Bun.Glob(pattern)
}
/**
 * Remove file or directory
 *
 * @param path - Path to remove
 * @param recursive - Remove recursively (for directories)
 */
export async function remove(path: string, recursive = false): Promise<void> {
  if (recursive) {
    await Bun.$`rm -rf ${path}`.quiet()
  } else {
    await Bun.$`rm -f ${path}`.quiet()
  }
}
/**
 * Sleep for a duration
 */
export async function bunSleep(ms: number): Promise<void> {
  await Bun.sleep(ms)
}

/**
 * Find executable in PATH
 */
export function bunWhich(name: string): string | null {
  return Bun.which(name)
}

/**
 * Resolve module path
 */
export function bunResolve(specifier: string, parent?: string): string {
  return Bun.resolveSync(specifier, parent || import.meta.dir)
}

// ============================================================================
// META HELPERS
// ============================================================================

/**
 * Get current file's directory (replacement for __dirname)
 */
export const currentDir = import.meta.dir

/**
 * Get current file's path (replacement for __filename)
 */
export const currentFile = import.meta.path

/**
 * Check if running in Bun
 */
export const isBun = typeof Bun !== 'undefined'

/**
 * Get Bun version
 */
export const bunVersion = isBun ? Bun.version : null

/**
 * Bun Compatibility Layer
 * Helper utilities for Node.js → Bun native API migration
 *
 * @module bun-compat
 * @description Provides Bun-native equivalents for common Node.js operations
 *
 * Features:
 * - File I/O: Bun.file, Bun.write
 * - Shell API: Bun.$ for elegant shell commands
 * - Process: Bun.spawn, Bun.spawnSync
 * - Utilities: Bun.Glob, Bun.sleep, Bun.which
 * - Crypto: Bun.CryptoHasher, Bun.password
 */
import { $ } from 'bun'
import { prometheusExporter } from '../monitoring'

// ============================================================================
// BUN SHELL API - $ Template Literal
// ============================================================================

/**
 * Re-export Bun Shell API for direct usage
 * The $ template literal provides safe shell command execution with:
 * - Automatic argument escaping
 * - Native pipe support
 * - Cross-platform compatibility
 *
 * @example
 * import { $ } from './bun-compat'
 * const result = await $`ls -la ${directory}`.text()
 * const files = await $`find ${path} -name "*.ts"`.lines()
 * await $`echo ${userInput}` // Safe - automatically escaped
 */
export { $ }

/**
 * Execute a shell command using Bun Shell and return text output
 * Simplified wrapper for common use cases
 *
 * @param strings - Template strings
 * @param values - Template values (automatically escaped)
 * @returns Promise<string> - Command output as text
 *
 * @example
 * const output = await shell`git status`
 * const version = await shell`node --version`
 */
export async function shell(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<string> {
  return await $({ raw: strings }, ...values).text()
}

/**
 * Execute a shell command synchronously using Bun Shell
 *
 * @param strings - Template strings
 * @param values - Template values (automatically escaped)
 * @returns string - Command output as text
 *
 * @example
 * const output = shellSync`pwd`
 */
export function shellSync(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return $.sync({ raw: strings }, ...values).text()
}

/**
 * Execute shell command quietly (no output to console)
 *
 * @example
 * const result = await shellQuiet`npm install ${package}`
 */
export async function shellQuiet(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await $({ raw: strings }, ...values).quiet()
  return {
    stdout: await result.text(),
    stderr: '', // stderr is combined in quiet mode
    exitCode: result.exitCode,
  }
}

/**
 * Execute shell command and get output as lines array
 *
 * @example
 * const files = await shellLines`find . -name "*.ts"`
 * for (const file of files) { console.log(file) }
 */
export async function shellLines(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<string[]> {
  return await $({ raw: strings }, ...values).lines()
}

/**
 * Execute shell command and get output as JSON
 *
 * @example
 * const pkg = await shellJson`cat package.json`
 */
export async function shellJson<T = unknown>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  return await $({ raw: strings }, ...values).json()
}

/**
 * Execute shell command with custom options
 *
 * @param command - Shell command string
 * @param options - Execution options
 * @returns Command result
 *
 * @example
 * const result = await bunShell('npm install', { cwd: '/app', quiet: true })
 */
export async function bunShell(
  command: string,
  options?: {
    cwd?: string
    env?: Record<string, string>
    quiet?: boolean
    timeout?: number
  }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const start = Date.now()

  try {
    // Build the shell command with options
    let shellCmd = $`${command}`

    if (options?.cwd) {
      shellCmd = shellCmd.cwd(options.cwd)
    }

    if (options?.env) {
      shellCmd = shellCmd.env(options.env)
    }

    if (options?.quiet) {
      shellCmd = shellCmd.quiet()
    }

    if (options?.timeout) {
      shellCmd = shellCmd.timeout(options.timeout)
    }

    const result = await shellCmd

    prometheusExporter.bunSpawnDuration.observe(
      { source: 'bunShell', status: result.exitCode === 0 ? 'success' : 'error' },
      (Date.now() - start) / 1000
    )

    return {
      stdout: await result.text(),
      stderr: '',
      exitCode: result.exitCode,
    }
  } catch (error: any) {
    prometheusExporter.bunSpawnDuration.observe(
      { source: 'bunShell', status: 'error' },
      (Date.now() - start) / 1000
    )

    return {
      stdout: '',
      stderr: error.message,
      exitCode: error.exitCode ?? 1,
    }
  }
}

/**
 * Execute shell command synchronously with options
 */
export function bunShellSync(
  command: string,
  options?: {
    cwd?: string
    env?: Record<string, string>
  }
): { stdout: string; stderr: string; exitCode: number } {
  try {
    let shellCmd = $.sync`${command}`

    if (options?.cwd) {
      shellCmd = shellCmd.cwd(options.cwd)
    }

    if (options?.env) {
      shellCmd = shellCmd.env(options.env)
    }

    return {
      stdout: shellCmd.text(),
      stderr: '',
      exitCode: shellCmd.exitCode,
    }
  } catch (error: any) {
    return {
      stdout: '',
      stderr: error.message,
      exitCode: error.exitCode ?? 1,
    }
  }
}

// ============================================================================
// GLOB OPERATIONS
// ============================================================================

/**
 * Bun.Glob wrapper - Fast glob pattern matching
 * Replacement for globby, fast-glob, glob packages
 *
 * @param pattern - Glob pattern
 * @returns AsyncIterableIterator of matching paths
 *
 * @example
 * const tsFiles = await bunGlob('**\/*.ts').all()
 * for await (const file of bunGlob('src/**\/*.ts')) { console.log(file) }
 */
export function bunGlob(pattern: string): Bun.Glob {
  return new Bun.Glob(pattern)
}

/**
 * Scan directory with glob pattern and return all matches
 *
 * @param pattern - Glob pattern
 * @param options - Scan options
 * @returns Array of matching file paths
 *
 * @example
 * const files = await globScan('**\/*.ts', { cwd: 'src' })
 */
export async function globScan(
  pattern: string,
  options?: {
    cwd?: string
    absolute?: boolean
    onlyFiles?: boolean
  }
): Promise<string[]> {
  const glob = new Bun.Glob(pattern)
  const results: string[] = []

  for await (const file of glob.scan({
    cwd: options?.cwd ?? '.',
    absolute: options?.absolute ?? false,
    onlyFiles: options?.onlyFiles ?? true,
  })) {
    results.push(file)
  }

  return results
}

/**
 * Synchronous glob scan
 */
export function globScanSync(
  pattern: string,
  options?: {
    cwd?: string
    absolute?: boolean
    onlyFiles?: boolean
  }
): string[] {
  const glob = new Bun.Glob(pattern)
  return Array.from(
    glob.scanSync({
      cwd: options?.cwd ?? '.',
      absolute: options?.absolute ?? false,
      onlyFiles: options?.onlyFiles ?? true,
    })
  )
}

/**
 * Check if a path matches a glob pattern
 *
 * @param pattern - Glob pattern
 * @param path - Path to check
 * @returns true if path matches pattern
 *
 * @example
 * if (globMatch('**\/*.ts', 'src/index.ts')) { ... }
 */
export function globMatch(pattern: string, path: string): boolean {
  const glob = new Bun.Glob(pattern)
  return glob.match(path)
}

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Bun.sleep wrapper - Async sleep/delay
 * Replacement for setTimeout-based delays
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 *
 * @example
 * await bunSleep(1000) // Sleep for 1 second
 * await bunSleep(100) // Sleep for 100ms
 */
export async function bunSleep(ms: number): Promise<void> {
  await Bun.sleep(ms)
}

/**
 * Synchronous sleep using Bun.sleepSync
 * Blocks the thread - use sparingly!
 *
 * @param ms - Milliseconds to sleep
 */
export function bunSleepSync(ms: number): void {
  Bun.sleepSync(ms)
}

/**
 * Get high-resolution nanoseconds timestamp
 * Useful for precise timing/benchmarks
 *
 * @returns Nanoseconds since Bun started
 *
 * @example
 * const start = bunNanoseconds()
 * // ... operation
 * const duration = bunNanoseconds() - start
 * console.log(`Took ${duration / 1_000_000}ms`)
 */
export function bunNanoseconds(): number {
  return Bun.nanoseconds()
}

// ============================================================================
// SYSTEM UTILITIES
// ============================================================================

/**
 * Bun.which wrapper - Find executable in PATH
 * Replacement for which package
 *
 * @param command - Command to find
 * @returns Full path to executable or null if not found
 *
 * @example
 * const nodePath = bunWhich('node') // '/usr/local/bin/node'
 * const gitPath = bunWhich('git')
 */
export function bunWhich(command: string): string | null {
  return Bun.which(command)
}

/**
 * Check if a command exists in PATH
 *
 * @param command - Command to check
 * @returns true if command exists
 *
 * @example
 * if (commandExists('docker')) { ... }
 */
export function commandExists(command: string): boolean {
  return Bun.which(command) !== null
}

/**
 * Bun.resolveSync wrapper - Resolve module path
 * Replacement for require.resolve
 *
 * @param specifier - Module specifier
 * @param parent - Parent module path (optional)
 * @returns Resolved absolute path
 *
 * @example
 * const lodashPath = bunResolve('lodash')
 * const localPath = bunResolve('./utils', import.meta.dir)
 */
export function bunResolve(specifier: string, parent?: string): string {
  return Bun.resolveSync(specifier, parent ?? import.meta.dir)
}

// ============================================================================
// ENVIRONMENT & CONFIGURATION
// ============================================================================

/**
 * Get environment variable with type safety
 * Uses Bun.env which is faster than process.env
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Environment variable value
 *
 * @example
 * const port = bunEnv('PORT', '3000')
 * const nodeEnv = bunEnv('NODE_ENV', 'development')
 */
export function bunEnv(key: string, defaultValue?: string): string | undefined {
  return Bun.env[key] ?? defaultValue
}

/**
 * Set environment variable
 */
export function bunSetEnv(key: string, value: string): void {
  Bun.env[key] = value
}

/**
 * Get all environment variables
 */
export function bunEnvAll(): Record<string, string | undefined> {
  return { ...Bun.env }
}

// ============================================================================
// PASSWORD HASHING (Bun.password)
// ============================================================================

/**
 * Hash a password using Bun.password (argon2id by default)
 * Much faster and more secure than bcrypt
 *
 * @param password - Password to hash
 * @returns Hashed password string
 *
 * @example
 * const hash = await bunPasswordHash('myPassword123')
 */
export async function bunPasswordHash(password: string): Promise<string> {
  return await Bun.password.hash(password)
}

/**
 * Verify a password against a hash
 *
 * @param password - Password to verify
 * @param hash - Hash to verify against
 * @returns true if password matches
 *
 * @example
 * const isValid = await bunPasswordVerify('myPassword123', storedHash)
 */
export async function bunPasswordVerify(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash)
}

// ============================================================================
// COMPRESSION UTILITIES
// ============================================================================

/**
 * Compress data using gzip
 *
 * @param data - Data to compress
 * @returns Compressed data
 *
 * @example
 * const compressed = bunGzip('Hello World')
 */
export function bunGzip(data: string | Uint8Array): Uint8Array {
  return Bun.gzipSync(typeof data === 'string' ? new TextEncoder().encode(data) : data)
}

/**
 * Decompress gzip data
 *
 * @param data - Compressed data
 * @returns Decompressed data
 */
export function bunGunzip(data: Uint8Array): Uint8Array {
  return Bun.gunzipSync(data)
}

/**
 * Compress data as string (gzip → base64)
 */
export function bunGzipString(data: string): string {
  const compressed = Bun.gzipSync(new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...compressed))
}

/**
 * Decompress base64 gzip data to string
 */
export function bunGunzipString(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const decompressed = Bun.gunzipSync(bytes)
  return new TextDecoder().decode(decompressed)
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Bun.file wrapper - Fast file reading
 * Replacement for fs.readFile / fs.promises.readFile
 *
 * @example
 * const content = await bunFile('/path/to/file.txt').text()
 * const json = await bunFile('/path/to/config.json').json()
 * const buffer = await bunFile('/path/to/binary').arrayBuffer()
 */
export const bunFile = Bun.file

/**
 * Bun.write wrapper - Fast file writing
 * Replacement for fs.writeFile / fs.promises.writeFile
 *
 * @example
 * await bunWrite('/path/to/file.txt', 'content')
 * await bunWrite('/path/to/config.json', JSON.stringify(data))
 * await bunWrite('/path/to/binary', buffer)
 */
export const bunWrite = Bun.write

// ============================================================================
// PROCESS SPAWNING
// ============================================================================

/**
 * Bun.spawn wrapper - Fast process spawning
 * Replacement for child_process.spawn / child_process.exec
 *
 * Performance: 5-10x faster than child_process
 *
 * @example
 * const proc = bunSpawn(['echo', 'hello'])
 * const exitCode = await proc.exited
 *
 * const proc2 = bunSpawn({
 *   cmd: ['ls', '-la'],
 *   cwd: '/tmp',
 *   stdout: 'pipe'
 * })
 */
export const bunSpawn = Bun.spawn

// ============================================================================
// CRYPTO OPERATIONS
// ============================================================================

/**
 * Bun.CryptoHasher wrapper - Fast hashing
 * Replacement for crypto.createHash
 *
 * Supported algorithms: md5, sha1, sha256, sha512, blake2b256
 *
 * @param algorithm - Hash algorithm
 * @param data - Data to hash (string or ArrayBuffer)
 * @param encoding - Output encoding (default: 'hex')
 * @returns Hash digest
 *
 * @example
 * const hash = await bunHash('sha256', 'hello world')
 * const md5 = await bunHash('md5', buffer, 'base64')
 */
export async function bunHash(
  algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512' | 'blake2b256',
  data: string | ArrayBuffer,
  encoding: 'hex' | 'base64' = 'hex'
): Promise<string> {
  const hasher = new Bun.CryptoHasher(algorithm)
  hasher.update(data)
  return hasher.digest(encoding)
}

/**
 * Synchronous version of bunHash
 *
 * @param algorithm - Hash algorithm
 * @param data - Data to hash
 * @param encoding - Output encoding (default: 'hex')
 * @returns Hash digest
 */
export function bunHashSync(
  algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512' | 'blake2b256',
  data: string | ArrayBuffer,
  encoding: 'hex' | 'base64' = 'hex'
): string {
  const hasher = new Bun.CryptoHasher(algorithm)
  hasher.update(data)
  return hasher.digest(encoding)
}

/**
 * Generate cryptographically secure random bytes
 * Replacement for crypto.randomBytes
 *
 * @param size - Number of bytes to generate
 * @param encoding - Output encoding (default: 'hex')
 * @returns Random bytes as string
 *
 * @example
 * const salt = bunRandomBytes(32) // 64 hex characters
 * const token = bunRandomBytes(16, 'base64')
 */
export function bunRandomBytes(size: number, encoding: 'hex' | 'base64' = 'hex'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size))

  if (encoding === 'hex') {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Base64 encoding
  return btoa(String.fromCharCode(...bytes))
}

// ============================================================================
// PATH UTILITIES
// ============================================================================

/**
 * Get directory name of current module (Bun-specific)
 * Replacement for __dirname or path.dirname(fileURLToPath(import.meta.url))
 *
 * @example
 * const dir = __bundir // /Users/user/project/src/cli
 */
export const __bundir = import.meta.dir

/**
 * Get full path of current module (Bun-specific)
 * Replacement for __filename or fileURLToPath(import.meta.url)
 *
 * @example
 * const file = __bunfile // /Users/user/project/src/cli/index.ts
 */
export const __bunfile = import.meta.path

// ============================================================================
// STREAM UTILITIES
// ============================================================================

/**
 * Read entire stream to string
 * Helper for reading Bun.spawn stdout/stderr
 *
 * @param stream - ReadableStream to read
 * @returns Complete stream content as string
 *
 * @example
 * const proc = bunSpawn({ cmd: ['ls'], stdout: 'pipe' })
 * const output = await readStreamToString(proc.stdout)
 */
export async function readStreamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }

  return result
}

/**
 * Read stream with size limit
 * Prevents memory overflow from large outputs
 *
 * @param stream - ReadableStream to read
 * @param maxSize - Maximum bytes to read
 * @param truncateMessage - Message to append if truncated
 * @returns Stream content (potentially truncated)
 *
 * @example
 * const output = await readStreamWithLimit(proc.stdout, 10000)
 */
export async function readStreamWithLimit(
  stream: ReadableStream,
  maxSize: number,
  truncateMessage = '\n... [output truncated]'
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  let bytesRead = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    bytesRead += value.length

    if (bytesRead > maxSize) {
      const remaining = maxSize - (bytesRead - value.length)
      if (remaining > 0) {
        result += decoder.decode(value.slice(0, remaining), { stream: true })
      }
      result += truncateMessage
      await reader.cancel()
      break
    }

    result += decoder.decode(value, { stream: true })
  }

 return result
}

// ============================================================================
// EXEC HELPERS (for Docker/shell commands)
// ============================================================================

/**
 * Execute shell command and return output
 * Simplified exec replacement for simple commands
 *
 * @param command - Shell command to execute
 * @param options - Execution options
 * @returns stdout and stderr
 *
 * @example
 * const { stdout, stderr } = await bunExec('ls -la')
 * const { stdout } = await bunExec('docker ps', { timeout: 5000 })
 */
export async function bunExec(
  command: string,
  options?: {
    cwd?: string
    env?: Record<string, string>
    timeout?: number
    metricsSource?: string
  }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const start = Date.now()
  const metricSource = options?.metricsSource ?? 'bunExec'

  const proc = Bun.spawn({
    cmd: ['sh', '-c', command],
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Handle timeout
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  if (options?.timeout) {
    timeoutId = setTimeout(() => {
      proc.kill()
    }, options.timeout)
  }

  try {
    const [stdout, stderr] = await Promise.all([
      readStreamToString(proc.stdout),
      readStreamToString(proc.stderr),
    ])

    const exitCode = await proc.exited

    if (timeoutId) clearTimeout(timeoutId)

    prometheusExporter.bunSpawnDuration.observe(
      { source: metricSource, status: exitCode === 0 ? 'success' : 'error' },
      (Date.now() - start) / 1000
    )

    return { stdout, stderr, exitCode }
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId)
    prometheusExporter.bunSpawnDuration.observe(
      { source: metricSource, status: 'error' },
      (Date.now() - start) / 1000
    )
    throw error
  }
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Re-export common Bun types for convenience
 */
export type BunFile = ReturnType<typeof Bun.file>
export type BunSpawnOptions = Parameters<typeof Bun.spawn>[0]
export type BunSubprocess = ReturnType<typeof Bun.spawn>
export type BunCryptoHasher = InstanceType<typeof Bun.CryptoHasher>

// ============================================================================
// COMPATIBILITY CHECKS
// ============================================================================

/**
 * Check if running in Bun runtime
 * @returns true if running in Bun
 */
export function isBunRuntime(): boolean {
  return typeof Bun !== 'undefined'
}

/**
 * Get Bun version
 * @returns Bun version string or undefined if not in Bun
 */
export function getBunVersion(): string | undefined {
  return isBunRuntime() ? Bun.version : undefined
}

/**
 * Assert we're running in Bun (throw if not)
 */
export function assertBunRuntime(): void {
  if (!isBunRuntime()) {
    throw new Error('This module requires Bun runtime. Please run with: bun run')
  }
}

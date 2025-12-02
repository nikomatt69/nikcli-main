/**
 * Bun Compatibility Layer
 * Helper utilities for Node.js → Bun native API migration
 *
 * @module bun-compat
 * @description Provides Bun-native equivalents for common Node.js operations
 */
import { prometheusExporter } from '../monitoring'

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

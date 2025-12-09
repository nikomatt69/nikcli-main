/**
 * Runtime Detection Utilities
 * Detects current runtime and provides appropriate APIs
 */

// ============================================================================
// RUNTIME DETECTION
// ============================================================================

export type Runtime = 'bun' | 'node' | 'deno' | 'unknown'

/**
 * Get current runtime
 */
export function getRuntime(): Runtime {
  if (typeof Bun !== 'undefined') return 'bun'
  if (typeof process !== 'undefined' && process.versions?.node) return 'node'

  return 'unknown'
}

/**
 * Check if running in Bun
 */
export const isBun = getRuntime() === 'bun'

/**
 * Check if running in Node.js
 */
export const isNode = getRuntime() === 'node'

/**
 * Check if running in Deno
 */
export const isDeno = getRuntime() === 'deno'

// ============================================================================
// FEATURE DETECTION
// ============================================================================

/**
 * Runtime feature detection
 */
export interface RuntimeFeatures {
  shell: boolean
  spawn: boolean
  fileSystem: boolean
  crypto: boolean
  glob: boolean
  nativeFetch: boolean
  webWorkers: boolean
  wasm: boolean
}

/**
 * Get available features for current runtime
 */
export function getRuntimeFeatures(): RuntimeFeatures {
  const runtime = getRuntime()

  switch (runtime) {
    case 'bun':
      return {
        shell: true,
        spawn: true,
        fileSystem: true,
        crypto: true,
        glob: true,
        nativeFetch: true,
        webWorkers: true,
        wasm: true,
      }

    case 'node':
      return {
        shell: true,
        spawn: true,
        fileSystem: true,
        crypto: true,
        glob: false, // Requires external glob package
        nativeFetch: false, // Requires node-fetch
        webWorkers: true,
        wasm: true,
      }

    case 'deno':
      return {
        shell: true,
        spawn: true,
        fileSystem: true,
        crypto: true,
        glob: true,
        nativeFetch: true,
        webWorkers: true,
        wasm: true,
      }

    default:
      return {
        shell: false,
        spawn: false,
        fileSystem: false,
        crypto: false,
        glob: false,
        nativeFetch: false,
        webWorkers: false,
        wasm: false,
      }
  }
}

/**
 * Check if a specific feature is available
 */
export function hasFeature(feature: keyof RuntimeFeatures): boolean {
  return getRuntimeFeatures()[feature]
}

// ============================================================================
// API SELECTION
// ============================================================================

/**
 * Get appropriate file system API for current runtime
 */
export async function getFilesystemAPI() {
  const runtime = getRuntime()

  if (runtime === 'bun') {
    const { bunFile, bunWrite, fileExists, mkdirp } = await import('./bun-compat')
    return {
      readFile: (path: string) => bunFile(path).text(),
      writeFile: bunWrite,
      exists: fileExists,
      mkdir: mkdirp,
    }
  }

  // Fallback to Node.js APIs
  const fs = await import('node:fs/promises')
  return {
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    exists: (path: string) =>
      fs.access(path).then(
        () => true,
        () => false
      ),
    mkdir: (path: string) => fs.mkdir(path, { recursive: true }),
  }
}

/**
 * Get appropriate shell API for current runtime
 */
export async function getShellAPI() {
  const runtime = getRuntime()

  if (runtime === 'bun') {
    const { $, bunShell, bunExec } = await import('./bun-compat')
    return {
      exec: bunShell,
      execSync: (cmd: string) => {
        const result = Bun.spawnSync(['sh', '-c', cmd])
        return {
          stdout: result.stdout.toString(),
          stderr: result.stderr.toString(),
          exitCode: result.exitCode,
        }
      },
      spawn: Bun.spawn,
      template: $,
    }
  }

  // Fallback to Node.js APIs
  const { exec } = await import('node:child_process')
  const { promisify } = await import('node:util')
  return {
    exec: promisify(exec),
    execSync: (cmd: string) => {
      const { spawnSync } = require('node:child_process')
      return spawnSync('sh', ['-c', cmd])
    },
    spawn: (cmd: string[]) => {
      const { spawn } = require('node:child_process')
      return spawn(cmd[0], cmd.slice(1))
    },
    template: null,
  }
}

/**
 * Get appropriate crypto API for current runtime
 */
export async function getCryptoAPI() {
  const runtime = getRuntime()

  if (runtime === 'bun') {
    const { bunHash, bunRandomBytes } = await import('./bun-compat')
    return {
      hash: bunHash,
      randomBytes: bunRandomBytes,
    }
  }

  // Fallback to Node.js APIs
  const crypto = await import('node:crypto')
  return {
    hash: (algorithm: string, data: string | Uint8Array) => {
      const hasher = crypto.createHash(algorithm)
      hasher.update(data)
      return hasher.digest('hex')
    },
    randomBytes: (length: number) => crypto.randomBytes(length).toString('hex'),
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Execute a function with runtime-specific APIs
 */
export async function withRuntimeAPI<T>(
  apiType: 'filesystem' | 'shell' | 'crypto',
  fn: (api: any) => Promise<T>
): Promise<T> {
  let api

  switch (apiType) {
    case 'filesystem':
      api = await getFilesystemAPI()
      break
    case 'shell':
      api = await getShellAPI()
      break
    case 'crypto':
      api = await getCryptoAPI()
      break
    default:
      throw new Error(`Unknown API type: ${apiType}`)
  }

  return fn(api)
}

/**
 * Get runtime information string
 */
export function getRuntimeInfo(): string {
  const runtime = getRuntime()
  const features = getRuntimeFeatures()

  const availableFeatures = Object.entries(features)
    .filter(([, available]) => available)
    .map(([name]) => name)
    .join(', ')

  return `${runtime} (${availableFeatures})`
}

/**
 * Log runtime information
 */
export function logRuntimeInfo(): void {
  console.log(`Runtime: ${getRuntimeInfo()}`)
}

/**
 * Runtime Detection Utilities
 *
 * Provides utilities to detect the current runtime environment
 * and whether we're running as a compiled Bun standalone binary.
 *
 * @module runtime-detect
 */

/**
 * Check if running in Bun runtime
 * @returns true if running in Bun
 */
export function isBunRuntime(): boolean {
  return typeof Bun !== 'undefined'
}

/**
 * Check if running as a compiled Bun standalone binary
 * This is important for avoiding NAPI modules that use libuv
 * which crashes with "unsupported uv function: uv_default_loop"
 *
 * @returns true if running as compiled Bun binary
 */
export function isBunStandalone(): boolean {
  if (!isBunRuntime()) return false

  // Check if we're running from a compiled binary
  // Bun.main will be undefined or point to the executable itself
  try {
    // When compiled, Bun embeds the code and Bun.main points to the binary
    const main = Bun.main
    if (!main) return true // No main file means embedded

    // Check if the main file is the binary itself (no .ts/.js extension)
    if (!main.endsWith('.ts') && !main.endsWith('.js') && !main.endsWith('.mjs')) {
      return true
    }

    // Check for common compiled binary patterns
    if (main.includes('/dist/cli/nikcli') || main.endsWith('/nikcli')) {
      return true
    }

    return false
  } catch {
    // If we can't determine, assume not standalone
    return false
  }
}

/**
 * Check if NAPI modules are safe to use
 * NAPI modules using libuv will crash in Bun standalone
 *
 * @returns true if NAPI modules can be safely imported
 */
export function isNapiSafe(): boolean {
  // NAPI modules are NOT safe in Bun standalone due to libuv dependency
  return !isBunStandalone()
}

/**
 * Get current runtime information
 */
export function getRuntimeInfo(): RuntimeInfo {
  return {
    runtime: isBunRuntime() ? 'bun' : 'node',
    version: isBunRuntime() ? Bun.version : process.version,
    isStandalone: isBunStandalone(),
    isNapiSafe: isNapiSafe(),
    platform: process.platform,
    arch: process.arch,
  }
}

/**
 * Assert that NAPI modules can be used safely
 * Throws if running in Bun standalone where NAPI would crash
 */
export function assertNapiSafe(moduleName: string): void {
  if (!isNapiSafe()) {
    throw new Error(
      `Cannot use NAPI module "${moduleName}" in Bun standalone binary. ` +
        `This module uses libuv which is not supported. ` +
        `Please use the development version or run with: bun run src/cli/index.ts`
    )
  }
}

/**
 * Safely import a NAPI module with fallback
 * Returns null if in Bun standalone mode
 */
export async function safeImportNapi<T>(
  moduleName: string,
  importFn: () => Promise<T>
): Promise<T | null> {
  if (!isNapiSafe()) {
    console.warn(
      `[runtime-detect] Skipping NAPI module "${moduleName}" in Bun standalone mode`
    )
    return null
  }

  try {
    return await importFn()
  } catch (error: any) {
    console.error(`[runtime-detect] Failed to import "${moduleName}": ${error.message}`)
    return null
  }
}

/**
 * Create a lazy loader for NAPI modules
 * Only loads the module when first accessed and if NAPI is safe
 */
export function createLazyNapiLoader<T>(
  moduleName: string,
  importFn: () => Promise<T>
): () => Promise<T | null> {
  let cached: T | null = null
  let loaded = false

  return async () => {
    if (loaded) return cached

    if (!isNapiSafe()) {
      console.warn(
        `[runtime-detect] NAPI module "${moduleName}" not available in Bun standalone`
      )
      loaded = true
      return null
    }

    try {
      cached = await importFn()
      loaded = true
      return cached
    } catch (error: any) {
      console.error(`[runtime-detect] Failed to load "${moduleName}": ${error.message}`)
      loaded = true
      return null
    }
  }
}

// Type definitions
export interface RuntimeInfo {
  runtime: 'bun' | 'node'
  version: string
  isStandalone: boolean
  isNapiSafe: boolean
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
}

// Export singleton runtime info for quick access
export const RUNTIME = getRuntimeInfo()



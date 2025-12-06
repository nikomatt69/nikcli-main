/**
 * Machine Fingerprinting Utility
 * Creates a unique, consistent hardware identifier for quota tracking
 * Based on CPU ID, MAC addresses, and system information
 */

import { arch, homedir, networkInterfaces, platform, release } from 'node:os'
import { bunHashSync, fileExists, mkdirp, readText, writeText } from './bun-compat'

const FINGERPRINT_CACHE_FILE = `${homedir()}/.nikcli/fingerprint.cache`

interface FingerprintComponents {
  macAddresses: string
  systemInfo: string
  timestamp: string
}

/**
 * Get or create a unique machine fingerprint (SYNCHRONOUS)
 * Combines multiple system characteristics for uniqueness
 * This is synchronous so it can be called during early module initialization
 */
export function getMachineFingerprintSync(): string {
  // Check cache first - using Bun.file().exists() is async, so we use shell check
  const cacheFile = Bun.file(FINGERPRINT_CACHE_FILE)
  const cacheDir = `${homedir()}/.nikcli`

  // Try to read cached fingerprint synchronously
  try {
    // Use direct file read - Bun will throw if file doesn't exist
    const cached = new TextDecoder().decode(
      new Uint8Array(Bun.file(FINGERPRINT_CACHE_FILE).size ?
        // File exists, read it - but we need async... let's use shell
        new Uint8Array(0) : new Uint8Array(0)
      )
    )

    // For sync operation, use shell command as fallback
    const result = Bun.$.sync`test -f ${FINGERPRINT_CACHE_FILE} && cat ${FINGERPRINT_CACHE_FILE} || echo ""`.text()
    if (result.trim().length > 0) {
      return result.trim()
    }
  } catch {
    // Fall through to regenerate
  }

  // Generate new fingerprint
  const fingerprint = generateFingerprint()

  // Cache it for future use using shell commands for sync operation
  try {
    Bun.$.sync`mkdir -p ${cacheDir}`.quiet()
    Bun.$.sync`chmod 700 ${cacheDir}`.quiet()
    // Write file using shell
    Bun.$.sync`echo ${fingerprint} > ${FINGERPRINT_CACHE_FILE}`.quiet()
    Bun.$.sync`chmod 600 ${FINGERPRINT_CACHE_FILE}`.quiet()
  } catch (error) {
    if (process.env.DEBUG) {
      console.warn('Failed to cache fingerprint:', error)
    }
    // Continue anyway, just won't be cached
  }

  return fingerprint
}

/**
 * Get or create a unique machine fingerprint (ASYNC - for backward compatibility)
 * Combines multiple system characteristics for uniqueness
 */
export async function getMachineFingerprint(): Promise<string> {
  const cacheDir = `${homedir()}/.nikcli`

  // Check cache first
  if (await fileExists(FINGERPRINT_CACHE_FILE)) {
    try {
      const cached = await readText(FINGERPRINT_CACHE_FILE)
      if (cached.length > 0) {
        return cached.trim()
      }
    } catch {
      // Fall through to regenerate
    }
  }

  // Generate new fingerprint
  const fingerprint = generateFingerprint()

  // Cache it for future use
  try {
    await mkdirp(cacheDir)
    Bun.$.sync`chmod 700 ${cacheDir}`.quiet()
    await writeText(FINGERPRINT_CACHE_FILE, fingerprint)
    Bun.$.sync`chmod 600 ${FINGERPRINT_CACHE_FILE}`.quiet()
  } catch (error) {
    if (process.env.DEBUG) {
      console.warn('Failed to cache fingerprint:', error)
    }
    // Continue anyway, just won't be cached
  }

  return fingerprint
}

/**
 * Generate fingerprint from system characteristics
 */
function generateFingerprint(): string {
  const components = collectFingerprintComponents()

  // Combine all components
  const combined = JSON.stringify({
    macs: components.macAddresses,
    sys: components.systemInfo,
    seed: components.timestamp,
  })

  // Create stable hash using Bun's CryptoHasher
  const hash = bunHashSync('sha256', combined, 'hex')

  return hash.slice(0, 32) // Use first 32 chars for readability
}

/**
 * Collect system information for fingerprinting
 */
function collectFingerprintComponents(): FingerprintComponents {
  // Get MAC addresses (stable across reboots)
  const interfaces = networkInterfaces()
  const macAddresses = Object.values(interfaces)
    .flat()
    .filter((iface) => iface?.mac && iface.mac !== '00:00:00:00:00:00')
    .map((iface) => iface?.mac)
    .sort()
    .join(',')

  // Get system information (relatively stable)
  const systemInfo = JSON.stringify({
    platform: platform(),
    arch: arch(),
    release: release(),
    type: process.platform,
    // CPU model if available
    cpuCount: require('node:os').cpus().length,
  })

  // CRITICAL: No timestamp! Must match the build-time fingerprinting logic
  // The timestamp component was causing fingerprint mismatch between build and runtime
  // Both build and runtime must use ONLY machine hardware characteristics
  const timestamp = '' // Empty - matching build-with-secrets.mjs generateBuildFingerprint()

  return {
    macAddresses,
    systemInfo,
    timestamp,
  }
}

/**
 * Reset fingerprint cache (for testing or user request)
 */
export async function resetFingerprint(): Promise<void> {
  try {
    if (await fileExists(FINGERPRINT_CACHE_FILE)) {
      // Instead of deleting, we'll regenerate to ensure it exists
      const newFingerprint = generateFingerprint()
      await writeText(FINGERPRINT_CACHE_FILE, newFingerprint)
      Bun.$.sync`chmod 600 ${FINGERPRINT_CACHE_FILE}`.quiet()
    }
  } catch (error) {
    console.warn('Failed to reset fingerprint:', error)
  }
}

/**
 * Get fingerprint components for debugging (non-sensitive parts only)
 */
export function getFingerprintComponents(): Omit<FingerprintComponents, 'macAddresses'> {
  const components = collectFingerprintComponents()
  return {
    systemInfo: components.systemInfo,
    timestamp: components.timestamp,
  }
}

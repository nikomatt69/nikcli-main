/**
 * Machine Fingerprinting Utility
 * Creates a unique, consistent hardware identifier for quota tracking
 * Based on CPU ID, MAC addresses, and system information
 */

import { createHash } from 'node:crypto'
import { networkInterfaces, platform, arch, release } from 'node:os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const FINGERPRINT_CACHE_FILE = join(homedir(), '.nikcli', 'fingerprint.cache')

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
  // Check cache first
  if (existsSync(FINGERPRINT_CACHE_FILE)) {
    try {
      const cached = readFileSync(FINGERPRINT_CACHE_FILE, 'utf-8')
      if (cached.length > 0) {
        return cached
      }
    } catch {
      // Fall through to regenerate
    }
  }

  // Generate new fingerprint
  const fingerprint = generateFingerprint()

  // Cache it for future use
  try {
    const cacheDir = join(homedir(), '.nikcli')
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true, mode: 0o700 })
    }
    writeFileSync(FINGERPRINT_CACHE_FILE, fingerprint, { mode: 0o600 })
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
  return getMachineFingerprintSync()
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

  // Create stable hash
  const hash = createHash('sha256').update(combined).digest('hex')

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
    if (existsSync(FINGERPRINT_CACHE_FILE)) {
      // Instead of deleting, we'll regenerate to ensure it exists
      const newFingerprint = generateFingerprint()
      writeFileSync(FINGERPRINT_CACHE_FILE, newFingerprint, { mode: 0o600 })
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

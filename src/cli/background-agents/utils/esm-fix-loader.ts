/**
 * ESM Module Resolution Fix Loader
 * Automatically fixes ESM-only packages that lack "main" field in package.json
 * This prevents "No exports main defined" errors during dynamic imports
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve, isAbsolute } from 'node:path'
import { createRequire } from 'node:module'

interface PackageInfo {
  name: string
  main: string
  alternatives?: string[]
}

const ESM_PACKAGES_TO_FIX: PackageInfo[] = [
  { name: 'unicorn-magic', main: './node.js' },
  { name: 'is-plain-obj', main: './index.js' },
  { name: 'is-docker', main: './index.js' },
  { name: 'is-inside-container', main: './index.js' },
  { name: 'responselike', main: './index.js' },
]

/**
 * Fix a single ESM package by adding "main" field
 */
function fixESMPackage(packagePath: string, packageInfo: PackageInfo): boolean {
  try {
    if (!existsSync(packagePath)) {
      return false
    }

    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

    // Skip if already has main field
    if (packageJson.main) {
      return false
    }

    // Try the specified main field first
    const mainPath = join(dirname(packagePath), packageInfo.main)
    if (existsSync(mainPath)) {
      packageJson.main = packageInfo.main
      writeFileSync(packagePath, JSON.stringify(packageJson, null, '\t') + '\n', 'utf8')
      return true
    }

    // Try alternatives
    const alternatives = packageInfo.alternatives || ['./index.js', './dist/index.js', './src/index.js']
    for (const alt of alternatives) {
      const altPath = join(dirname(packagePath), alt)
      if (existsSync(altPath)) {
        packageJson.main = alt
        writeFileSync(packagePath, JSON.stringify(packageJson, null, '\t') + '\n', 'utf8')
        return true
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Find package.json in pnpm structure (.pnpm/package@version/node_modules/package)
 * pnpm can nest packages inside other packages (e.g., .pnpm/globby@15.0.0/node_modules/unicorn-magic)
 */
function findPackageInPnpm(nodeModulesPath: string, pkgName: string): string | null {
  const pnpmPath = join(nodeModulesPath, '.pnpm')
  if (!existsSync(pnpmPath)) {
    return null
  }

  try {
    const fs = require('fs')
    const entries = fs.readdirSync(pnpmPath, { withFileTypes: true })
    // Search in ALL directories, not just those containing the package name
    // because packages can be nested inside other packages' node_modules
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidatePath = join(pnpmPath, entry.name, 'node_modules', pkgName, 'package.json')
        if (existsSync(candidatePath)) {
          return candidatePath
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return null
}

/**
 * Fix all ESM packages in a given node_modules directory
 * Handles both standard npm/yarn structure and pnpm structure
 */
export function fixESMPackagesInNodeModules(nodeModulesPath: string): number {
  let fixedCount = 0

  for (const pkgInfo of ESM_PACKAGES_TO_FIX) {
    // Try standard location first
    let packageJsonPath = join(nodeModulesPath, pkgInfo.name, 'package.json')
    
    // If not found, try pnpm structure
    if (!existsSync(packageJsonPath)) {
      const pnpmPath = findPackageInPnpm(nodeModulesPath, pkgInfo.name)
      if (pnpmPath) {
        packageJsonPath = pnpmPath
      }
    }

    if (fixESMPackage(packageJsonPath, pkgInfo)) {
      fixedCount++
    }
  }

  return fixedCount
}

/**
 * Auto-fix ESM packages when module resolution fails
 * This can be called before imports to proactively fix packages
 * 
 * @param basePath - Base path to search for node_modules (default: process.cwd())
 * @param silent - If true, don't log messages (default: false)
 */
export function autoFixESMPackages(basePath: string = process.cwd(), silent: boolean = false): void {
  const nodeModulesPath = join(basePath, 'node_modules')
  
  if (!existsSync(nodeModulesPath)) {
    if (!silent) {
      console.log(`ℹ️  No node_modules found at ${basePath}, skipping ESM fix`)
    }
    return
  }

  const fixedCount = fixESMPackagesInNodeModules(nodeModulesPath)
  if (fixedCount > 0 && !silent) {
    console.log(`🔧 Auto-fixed ${fixedCount} ESM package(s) in ${basePath}`)
  }
}

/**
 * Safe dynamic import wrapper that automatically fixes ESM errors
 * Use this for node modules or when you need ESM error handling
 * For relative imports, use direct import() from the calling file instead
 * 
 * @param modulePath - Module path (node module name or absolute path)
 * @param basePath - Base path for fixing ESM packages (default: process.cwd())
 * @param retries - Number of retry attempts (default: 2)
 */
export async function safeDynamicImport<T = any>(
  modulePath: string,
  basePath: string = process.cwd(),
  retries: number = 2
): Promise<T> {
  let lastError: any

  // Fix ESM packages proactively before first attempt
  autoFixESMPackages(basePath)

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Try to fix ESM packages before importing (especially on retry)
      if (attempt > 0) {
        autoFixESMPackages(basePath)
        // Small delay to ensure file system writes are flushed
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Use direct import - it will resolve correctly for node modules
      const module = await import(modulePath)
      return module as T
    } catch (error: any) {
      lastError = error

      // Check if this is an ESM module resolution error
      const isESMError =
        (error?.message?.includes('exports') && error?.message?.includes('package.json')) ||
        error?.message?.includes('Cannot find module') ||
        error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' ||
        error?.code === 'ERR_MODULE_NOT_FOUND'

      if (isESMError && attempt < retries) {
        // Try to fix packages and retry
        autoFixESMPackages(basePath)
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }

      // If not an ESM error or out of retries, throw
      throw error
    }
  }

  throw lastError
}


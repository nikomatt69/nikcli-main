/**
 * PathResolver - Centralized path resolution with proper directory/file detection
 * Fixes path handling issues across all tools
 */
import { dirname, normalize, resolve, sep } from 'node:path'
import { statSync } from 'node:fs'

export interface ResolvedPath {
  absolutePath: string
  isDirectoryIntent: boolean // User wants a directory (trailing slash)
  exists: boolean
  existsAsFile: boolean
  existsAsDirectory: boolean
  relativePath: string // Relative to workingDirectory
}

export interface PathCheckResult {
  exists: boolean
  isFile: boolean
  isDirectory: boolean
}

export class PathResolver {
  private workingDirectory: string

  constructor(workingDirectory: string) {
    this.workingDirectory = resolve(workingDirectory)
  }

  /**
   * Resolve path with proper directory/file detection
   */
  resolve(userPath: string): ResolvedPath {
    // Detect directory intent from trailing slash
    const hasTrailingSlash = userPath.endsWith('/') || userPath.endsWith('\\')

    // Normalize and resolve to absolute
    const normalized = normalize(userPath)
    const absolute = resolve(this.workingDirectory, normalized)

    // Security: prevent path traversal
    if (!this.isWithinWorkingDirectory(absolute)) {
      throw new Error(`Path traversal detected: ${userPath} resolves outside working directory`)
    }

    // Check actual filesystem state
    let exists = false
    let existsAsFile = false
    let existsAsDirectory = false

    try {
      const stats = statSync(absolute)
      exists = true
      existsAsFile = stats.isFile()
      existsAsDirectory = stats.isDirectory()
    } catch {
      // Path doesn't exist yet - that's OK
    }

    // Calculate relative path
    const workingDirWithSep = this.workingDirectory + sep
    let relativePath = ''
    if (absolute === this.workingDirectory) {
      relativePath = '.'
    } else if (absolute.startsWith(workingDirWithSep)) {
      relativePath = absolute.substring(workingDirWithSep.length)
    } else {
      relativePath = absolute
    }

    return {
      absolutePath: absolute,
      isDirectoryIntent: hasTrailingSlash || existsAsDirectory,
      exists,
      existsAsFile,
      existsAsDirectory,
      relativePath,
    }
  }

  /**
   * Check if path is within working directory
   */
  isWithinWorkingDirectory(absolutePath: string): boolean {
    const normalizedPath = resolve(absolutePath)
    const workingDirNormalized = this.workingDirectory + sep
    return normalizedPath === this.workingDirectory || normalizedPath.startsWith(workingDirNormalized)
  }

  /**
   * Get parent directory of a path
   */
  getParentDirectory(filePath: string): string {
    const resolved = this.resolve(filePath)
    return dirname(resolved.absolutePath)
  }

  /**
   * Get the current working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory
  }

  /**
   * Update working directory and return new instance
   */
  withWorkingDirectory(newDir: string): PathResolver {
    return new PathResolver(newDir)
  }
}

/**
 * Legacy compatibility: sanitizePath replacement
 */
export function sanitizePath(filePath: string, workingDirectory: string): string {
  const resolver = new PathResolver(workingDirectory)
  return resolver.resolve(filePath).absolutePath
}

/**
 * Better path checking: distinguishes "doesn't exist" from "exists but is file/directory"
 */
export function checkPath(path: string): PathCheckResult {
  try {
    const stats = statSync(path)
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    }
  } catch {
    return {
      exists: false,
      isFile: false,
      isDirectory: false,
    }
  }
}

/**
 * Validate path is safe (within working directory)
 */
export function isPathSafe(path: string, workingDirectory: string): boolean {
  try {
    const resolver = new PathResolver(workingDirectory)
    resolver.resolve(path)
    return true
  } catch {
    return false
  }
}

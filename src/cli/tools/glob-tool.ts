import { stat } from 'node:fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import { PromptManager } from '../prompts/prompt-manager'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { sanitizePath } from './secure-file-tools'

/**
 * GlobTool - Fast file pattern matching with glob support
 *
 * This tool provides:
 * - Fast glob pattern matching (**, *.{ts,tsx}, etc.)
 * - Files sorted by modification time
 * - Multiple pattern support
 * - Gitignore pattern support
 * - Size and date filtering
 */

export interface GlobToolParams {
  pattern: string | string[]
  path?: string
  ignorePatterns?: string[]
  onlyFiles?: boolean
  onlyDirectories?: boolean
  followSymlinks?: boolean
  caseSensitive?: boolean
  maxDepth?: number
  sortBy?: 'name' | 'size' | 'mtime' | 'atime'
  sortOrder?: 'asc' | 'desc'
  maxResults?: number
  minSize?: number
  maxSize?: number
  modifiedAfter?: Date
  modifiedBefore?: Date
}

export interface GlobMatch {
  path: string
  relativePath: string
  size: number
  modified: Date
  accessed: Date
  isFile: boolean
  isDirectory: boolean
}

export interface GlobResult {
  pattern: string | string[]
  searchPath: string
  totalMatches: number
  matches: GlobMatch[]
  truncated: boolean
  searchStats: {
    filesFound: number
    directoriesFound: number
    executionTime: number
    patternsUsed: number
  }
}

const DEFAULT_MAX_RESULTS = 1000
const DEFAULT_MAX_DEPTH = 10

export class GlobTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('glob-tool', workingDirectory)
  }

  async execute(params: GlobToolParams): Promise<ToolExecutionResult> {
    const requestId = uuidv4()
    try {
      // Load tool-specific prompt
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'glob-tool',
        parameters: params,
      })

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      if (!params.pattern || (Array.isArray(params.pattern) && params.pattern.length === 0)) {
        throw new Error('Pattern is required for glob search')
      }

      const searchPath = params.path || this.workingDirectory
      const maxResults = params.maxResults || DEFAULT_MAX_RESULTS
      const sortBy = params.sortBy || 'mtime'
      const sortOrder = params.sortOrder || 'desc'

      // Security validation
      const sanitizedPath = sanitizePath(searchPath, this.workingDirectory)

      // Normalize pattern to array
      const patterns = Array.isArray(params.pattern) ? params.pattern : [params.pattern]

      advancedUI.logInfo(`🔍 Globbing pattern(s): ${CliUI.highlight(patterns.join(', '))}`)
      const globOptions: any = {
        cwd: sanitizedPath,
        onlyFiles: params.onlyFiles !== undefined ? params.onlyFiles : true,
        onlyDirectories: params.onlyDirectories || false,
        followSymbolicLinks: params.followSymlinks || false,
        caseSensitiveMatch: params.caseSensitive || false,
        deep: params.maxDepth !== undefined ? params.maxDepth : DEFAULT_MAX_DEPTH,
        ignore: params.ignorePatterns || ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        markDirectories: true,
        absolute: false,
      }

      const startTime = Date.now()
      await logger.info('glob start', {
        requestId,
        cwd: sanitizedPath,
        patterns,
        options: {
          onlyFiles: globOptions.onlyFiles,
          onlyDirectories: globOptions.onlyDirectories,
          deep: globOptions.deep,
          ignore: globOptions.ignore,
        },
      })



      // Execute glob search (ESM-safe dynamic import)
      const globbyModule: any = (await import('globby')) as any
      const globbyFn = globbyModule.globby || globbyModule.default || globbyModule
      const files = (await globbyFn(patterns, globOptions)) as unknown as string[]

      CliUI.logDebug(`Found ${files.length} raw matches`)
      await logger.debug('glob raw matches', { requestId, count: files.length })

      // Get file stats and build GlobMatch objects
      const matches: GlobMatch[] = []
      let filesCount = 0
      let directoriesCount = 0

      for (const file of files) {
        try {
          const fullPath = require('node:path').join(sanitizedPath, file)
          const stats = await stat(fullPath)

          // Apply filters
          if (params.minSize !== undefined && stats.size < params.minSize) continue
          if (params.maxSize !== undefined && stats.size > params.maxSize) continue
          if (params.modifiedAfter && stats.mtime < params.modifiedAfter) continue
          if (params.modifiedBefore && stats.mtime > params.modifiedBefore) continue

          const match: GlobMatch = {
            path: fullPath,
            relativePath: file,
            size: stats.size,
            modified: stats.mtime,
            accessed: stats.atime,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
          }

          matches.push(match)

          if (stats.isFile()) filesCount++
          if (stats.isDirectory()) directoriesCount++
        } catch (error) {
          CliUI.logDebug(`Skipping ${file}: ${error}`)
        }
      }

      // Sort matches
      this.sortMatches(matches, sortBy, sortOrder)

      // Truncate if needed
      const truncated = matches.length > maxResults
      const finalMatches = matches.slice(0, maxResults)

      const executionTime = Date.now() - startTime

      const result: GlobResult = {
        pattern: params.pattern,
        searchPath: sanitizedPath,
        totalMatches: matches.length,
        matches: finalMatches,
        truncated,
        searchStats: {
          filesFound: filesCount,
          directoriesFound: directoriesCount,
          executionTime,
          patternsUsed: patterns.length,
        },
      }

      advancedUI.logSuccess(`✓ Found ${result.totalMatches} matches (${filesCount} files, ${directoriesCount} dirs)`)
      await logger.info('glob completed', {
        requestId,
        totalMatches: result.totalMatches,
        filesFound: filesCount,
        directoriesFound: directoriesCount,
        truncated,
        elapsedMs: executionTime,
      })

      // Show glob results in structured UI
      if (result.matches.length > 0) {
        advancedUI.showFileList(
          result.matches.map((m) => m.relativePath),
          `🔍 Glob: ${patterns.join(', ')}`
        )
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      CliUI.logError(`Glob tool failed: ${error.message}`)
      await logger.error('glob failed', { requestId, errorMessage: error.message }, error)
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Sort matches based on criteria
   */
  private sortMatches(matches: GlobMatch[], sortBy: string, sortOrder: string): void {
    matches.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name':
          comparison = a.relativePath.localeCompare(b.relativePath)
          break
        case 'size':
          comparison = a.size - b.size
          break
        case 'mtime':
          comparison = a.modified.getTime() - b.modified.getTime()
          break
        case 'atime':
          comparison = a.accessed.getTime() - b.accessed.getTime()
          break
        default:
          comparison = 0
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })
  }
}

import * as fs from 'node:fs'
import * as path from 'node:path'
import { globby } from 'globby'
import { PromptManager } from '../prompts/prompt-manager'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { IGNORE_PATTERNS } from './list-tool'
import { sanitizePath } from './secure-file-tools'

export interface MultiReadParams {
  files?: string[]
  globs?: string[]
  root?: string
  exclude?: string[]
  includeHidden?: boolean
  maxFileSizeBytes?: number
  pattern?: string
  useRegex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
  contextLines?: number
  previewOnly?: boolean
}

export interface MultiReadFileResult {
  path: string
  relativePath: string
  size: number
  modified: Date
  extension: string
  content: string
  truncated: boolean
  matches?: Array<{
    lineNumber: number
    line: string
    match: string
    column?: number
    beforeContext?: string[]
    afterContext?: string[]
  }>
}

export interface MultiReadResult {
  root: string
  totalRequested: number
  totalRead: number
  skipped: Array<{ path: string; reason: string }>
  files: MultiReadFileResult[]
  search?: {
    pattern: string
    totalMatches: number
    filesWithMatches: number
  }
}

const DEFAULT_MAX_FILE_SIZE = 512 * 1024 // 512KB safeguard for content

export class MultiReadTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('multi-read-tool', workingDirectory)
  }

  getMetadata(): any {
    return {
      id: 'multi_read',
      name: 'multi_read',
      description: 'Read multiple files safely with optional content search and context',
      version: '0.1.0',
      category: 'file-ops',
      author: 'system',
      tags: ['read', 'batch', 'multi', 'analysis', 'filesystem'],
      capabilities: ['file-read', 'batch-read', 'pattern-search'],
      requiredCapabilities: [],
      dependencies: [],
      permissions: {
        canReadFiles: true,
        canWriteFiles: false,
        canDeleteFiles: false,
        canExecuteCommands: false,
        allowedPaths: [],
        forbiddenPaths: [],
        allowedCommands: [],
        forbiddenCommands: [],
        canAccessNetwork: false,
        maxExecutionTime: 300000,
        maxMemoryUsage: 512 * 1024 * 1024,
        requiresApproval: false,
      },
      inputSchema: {},
      outputSchema: {},
      examples: [],
      isBuiltIn: true,
      isEnabled: true,
      priority: 60,
      loadOrder: 0,
    }
  }

  async execute(params: MultiReadParams): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    try {
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'multi-read-tool',
        parameters: params,
      })
      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      const root = sanitizePath(params.root || '.', this.getWorkingDirectory())
      const includeHidden = !!params.includeHidden
      const maxSize = params.maxFileSizeBytes || DEFAULT_MAX_FILE_SIZE
      const exclude = [...IGNORE_PATTERNS, ...(params.exclude || [])]

      // Resolve target files
      let targets: string[] = []
      if (Array.isArray(params.files) && params.files.length > 0) {
        for (const f of params.files) {
          const p = sanitizePath(f, root)
          targets.push(p)
        }
      }
      if (Array.isArray(params.globs) && params.globs.length > 0) {
        const globbed = await globby(params.globs, { cwd: root, onlyFiles: true, dot: includeHidden })
        targets.push(...globbed.map((p) => path.resolve(root, p)))
      }

      // Deduplicate and filter by exclude patterns
      const seen = new Set<string>()
      const filtered: string[] = []
      for (const abs of targets) {
        if (seen.has(abs)) continue
        seen.add(abs)
        const rel = path.relative(root, abs)
        const lower = rel.toLowerCase()
        const ignored = exclude.some((pat) => {
          if (pat.endsWith('/')) return lower.includes(pat.toLowerCase())
          if (pat.includes('*')) {
            const rx = new RegExp(pat.replace(/\*/g, '.*'))
            return rx.test(lower)
          }
          return lower.includes(pat.toLowerCase())
        })
        if (!ignored) filtered.push(abs)
      }

      if (filtered.length === 0) {
        return {
          success: true,
          data: {
            root,
            totalRequested: targets.length,
            totalRead: 0,
            skipped: targets.map((p) => ({ path: path.relative(root, p), reason: 'filtered or not found' })),
            files: [],
          } as MultiReadResult,
          metadata: { executionTime: Date.now() - startTime, toolName: this.getName(), parameters: params },
        }
      }

      // Optional search configuration
      const search = this.buildSearchConfig(params)

      const results: MultiReadFileResult[] = []
      const skipped: Array<{ path: string; reason: string }> = []
      let filesWithMatches = 0
      let totalMatches = 0

      for (const abs of filtered) {
        try {
          const stat = fs.statSync(abs)
          if (!stat.isFile()) {
            skipped.push({ path: path.relative(root, abs), reason: 'not a file' })
            continue
          }
          if (stat.size > maxSize) {
            skipped.push({ path: path.relative(root, abs), reason: `too large (${stat.size} bytes)` })
            continue
          }

          const content = fs.readFileSync(abs, 'utf8')
          const extension = path.extname(abs).slice(1)
          const rel = path.relative(root, abs)

          const fileRes: MultiReadFileResult = {
            path: abs,
            relativePath: rel,
            size: stat.size,
            modified: stat.mtime,
            extension,
            content,
            truncated: false,
          }

          if (search) {
            const { regex, contextLines } = search
            const lines = content.split('\n')
            const matches: MultiReadFileResult['matches'] = []
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              const m = regex.exec(line)
              if (m) {
                matches.push({
                  lineNumber: i + 1,
                  line,
                  match: m[0],
                  column: m.index,
                  beforeContext: contextLines ? lines.slice(Math.max(0, i - contextLines), i) : undefined,
                  afterContext: contextLines ? lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines)) : undefined,
                })
                regex.lastIndex = 0
              }
            }
            if (matches.length > 0) {
              fileRes.matches = matches
              filesWithMatches++
              totalMatches += matches.length
            }
          }

          results.push(fileRes)
        } catch (e: any) {
          skipped.push({ path: path.relative(root, abs), reason: e.message })
        }
      }

      const data: MultiReadResult = {
        root,
        totalRequested: filtered.length,
        totalRead: results.length,
        skipped,
        files: results,
        ...(search
          ? { search: { pattern: params.pattern!, totalMatches, filesWithMatches } }
          : {}),
      }

      CliUI.logSuccess(`📖 Read ${results.length}/${filtered.length} files${search ? `, ${totalMatches} matches` : ''}`)

      return {
        success: true,
        data,
        metadata: { executionTime: Date.now() - startTime, toolName: this.getName(), parameters: params },
      }
    } catch (error: any) {
      CliUI.logError(`Multi-read tool failed: ${error.message}`)
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: { executionTime: Date.now() - startTime, toolName: this.getName(), parameters: params },
      }
    }
  }

  private buildSearchConfig(params: MultiReadParams): { regex: RegExp; contextLines: number } | null {
    if (!params.pattern) return null
    let pattern = params.pattern
    if (!params.useRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    if (params.wholeWord) pattern = `\\b${pattern}\\b`
    const flags = params.caseSensitive ? 'g' : 'gi'
    let regex: RegExp
    try {
      regex = new RegExp(pattern, flags)
    } catch (e: any) {
      throw new Error(`Invalid pattern: ${e.message}`)
    }
    return { regex, contextLines: params.contextLines || 0 }
  }
}

export default MultiReadTool


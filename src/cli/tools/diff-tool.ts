import { readFile } from 'node:fs/promises'
import chalk from 'chalk'
import { type Change, diffLines, diffWords } from 'diff'
import { PromptManager } from '../prompts/prompt-manager'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { sanitizePath } from './secure-file-tools'

/**
 * DiffTool - File and content comparison with multiple diff algorithms
 *
 * Features:
 * - Line-by-line diff
 * - Word-by-word diff
 * - Character-by-character diff
 * - Unified diff format
 * - Side-by-side comparison
 * - Syntax highlighting support
 */

export interface DiffToolParams {
  source: string // File path or content
  target: string // File path or content
  mode?: 'lines' | 'words' | 'chars'
  format?: 'unified' | 'side-by-side' | 'inline'
  context?: number // Lines of context for unified diff
  ignoreWhitespace?: boolean
  ignoreCase?: boolean
  showLineNumbers?: boolean
  colorize?: boolean
}

export interface DiffChange {
  type: 'added' | 'removed' | 'unchanged'
  value: string
  lineNumber?: number
  oldLineNumber?: number
  newLineNumber?: number
}

export interface DiffResult {
  sourceLabel: string
  targetLabel: string
  totalChanges: number
  additions: number
  deletions: number
  unchanged: number
  changes: DiffChange[]
  formatted: string
  stats: {
    linesAdded: number
    linesRemoved: number
    linesChanged: number
    executionTime: number
  }
}

export class DiffTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('diff-tool', workingDirectory)
  }

  async execute(params: DiffToolParams): Promise<ToolExecutionResult> {
    try {
      // Load tool-specific prompt
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'diff-tool',
        parameters: params,
      })

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      if (!params.source || !params.target) {
        throw new Error('Both source and target are required')
      }

      const mode = params.mode || 'lines'
      const format = params.format || 'unified'
      const context = params.context !== undefined ? params.context : 3
      const colorize = params.colorize !== undefined ? params.colorize : true

      CliUI.logInfo(`🔍 Comparing: ${CliUI.highlight(params.source)} vs ${CliUI.highlight(params.target)}`)

      const startTime = Date.now()

      // Read source and target (could be file paths or direct content)
      const sourceContent = await this.readContentOrFile(params.source)
      const targetContent = await this.readContentOrFile(params.target)

      // Apply preprocessing
      let processedSource = sourceContent
      let processedTarget = targetContent

      if (params.ignoreWhitespace) {
        processedSource = this.normalizeWhitespace(processedSource)
        processedTarget = this.normalizeWhitespace(processedTarget)
      }

      if (params.ignoreCase) {
        processedSource = processedSource.toLowerCase()
        processedTarget = processedTarget.toLowerCase()
      }

      // Compute diff based on mode
      let changes: Change[]
      switch (mode) {
        case 'words':
          changes = diffWords(processedSource, processedTarget)
          break
        case 'chars':
          changes = this.diffChars(processedSource, processedTarget)
          break
        case 'lines':
        default:
          changes = diffLines(processedSource, processedTarget)
          break
      }

      // Convert to DiffChange format
      const diffChanges = this.convertChanges(changes, mode)

      // Calculate statistics
      const additions = diffChanges.filter((c) => c.type === 'added').length
      const deletions = diffChanges.filter((c) => c.type === 'removed').length
      const unchanged = diffChanges.filter((c) => c.type === 'unchanged').length

      const linesAdded = diffChanges.filter((c) => c.type === 'added' && c.value.trim()).length
      const linesRemoved = diffChanges.filter((c) => c.type === 'removed' && c.value.trim()).length

      // Format output
      const formatted = this.formatDiff(diffChanges, format, context, params.showLineNumbers || false, colorize)

      const executionTime = Date.now() - startTime

      const result: DiffResult = {
        sourceLabel: this.getLabel(params.source),
        targetLabel: this.getLabel(params.target),
        totalChanges: additions + deletions,
        additions,
        deletions,
        unchanged,
        changes: diffChanges,
        formatted,
        stats: {
          linesAdded,
          linesRemoved,
          linesChanged: Math.max(linesAdded, linesRemoved),
          executionTime,
        },
      }

      CliUI.logSuccess(`✓ Diff complete: +${additions} -${deletions} (${unchanged} unchanged)`)

      // Display formatted diff
      console.log('\n' + result.formatted + '\n')

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
      CliUI.logError(`Diff tool failed: ${error.message}`)
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
   * Read content from file or treat as direct content
   */
  private async readContentOrFile(input: string): Promise<string> {
    try {
      // Try to read as file path
      const sanitized = sanitizePath(input, this.workingDirectory)
      return await readFile(sanitized, 'utf-8')
    } catch {
      // Treat as direct content
      return input
    }
  }

  /**
   * Normalize whitespace for comparison
   */
  private normalizeWhitespace(content: string): string {
    return content.replace(/\s+/g, ' ').trim()
  }

  /**
   * Character-level diff (using word diff as base)
   */
  private diffChars(source: string, target: string): Change[] {
    // Simple character diff implementation
    const sourceChars = source.split('')
    const targetChars = target.split('')
    const changes: Change[] = []

    let i = 0
    let j = 0

    while (i < sourceChars.length || j < targetChars.length) {
      if (i < sourceChars.length && j < targetChars.length && sourceChars[i] === targetChars[j]) {
        changes.push({ value: sourceChars[i], added: false, removed: false, count: 1 })
        i++
        j++
      } else if (i < sourceChars.length) {
        changes.push({ value: sourceChars[i], added: false, removed: true, count: 1 })
        i++
      } else {
        changes.push({ value: targetChars[j], added: true, removed: false, count: 1 })
        j++
      }
    }

    return changes
  }

  /**
   * Convert diff library changes to DiffChange format
   */
  private convertChanges(changes: Change[], _mode: string): DiffChange[] {
    const diffChanges: DiffChange[] = []
    let oldLineNum = 1
    let newLineNum = 1

    for (const change of changes) {
      const type = change.added ? 'added' : change.removed ? 'removed' : 'unchanged'

      const lines = change.value.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (i === lines.length - 1 && lines[i] === '') continue // Skip last empty line

        const diffChange: DiffChange = {
          type,
          value: lines[i],
          oldLineNumber: type !== 'added' ? oldLineNum : undefined,
          newLineNumber: type !== 'removed' ? newLineNum : undefined,
        }

        diffChanges.push(diffChange)

        if (type !== 'added') oldLineNum++
        if (type !== 'removed') newLineNum++
      }
    }

    return diffChanges
  }

  /**
   * Format diff for display
   */
  private formatDiff(
    changes: DiffChange[],
    format: string,
    context: number,
    showLineNumbers: boolean,
    colorize: boolean
  ): string {
    switch (format) {
      case 'side-by-side':
        return this.formatSideBySide(changes, showLineNumbers, colorize)
      case 'inline':
        return this.formatInline(changes, showLineNumbers, colorize)
      case 'unified':
      default:
        return this.formatUnified(changes, context, showLineNumbers, colorize)
    }
  }

  /**
   * Format as unified diff
   */
  private formatUnified(changes: DiffChange[], _context: number, showLineNumbers: boolean, colorize: boolean): string {
    const lines: string[] = []

    for (const change of changes) {
      const lineNum = showLineNumbers
        ? `${(change.oldLineNumber || change.newLineNumber || 0).toString().padStart(4)} `
        : ''

      let prefix = ' '
      let line = change.value

      if (change.type === 'added') {
        prefix = '+'
        line = colorize ? chalk.green(line) : line
      } else if (change.type === 'removed') {
        prefix = '-'
        line = colorize ? chalk.red(line) : line
      }

      lines.push(`${prefix}${lineNum}${line}`)
    }

    return lines.join('\n')
  }

  /**
   * Format as side-by-side diff
   */
  private formatSideBySide(_changes: DiffChange[], _showLineNumbers: boolean, _colorize: boolean): string {
    return 'Side-by-side format not yet implemented'
  }

  /**
   * Format as inline diff
   */
  private formatInline(changes: DiffChange[], showLineNumbers: boolean, colorize: boolean): string {
    return this.formatUnified(changes, 0, showLineNumbers, colorize)
  }

  /**
   * Get label for source/target
   */
  private getLabel(input: string): string {
    if (input.includes('/') || input.includes('\\')) {
      return input // Likely a file path
    }
    return '<content>'
  }
}

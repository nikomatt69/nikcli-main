import { globby } from 'globby'
import { logger as cliLogger } from '../utils/logger'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { sanitizePath, validateIsDirectory } from './secure-file-tools'

export class FindFilesTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('find-files-tool', workingDirectory)
  }
  async showPrompt() {
    const { advancedUI } = await import('../ui/advanced-cli-ui')
    this.showPrompt()
  }
  async execute(pattern: string, options: { cwd?: string } = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const sanitizedCwd = sanitizePath(options.cwd || '.', this.workingDirectory)

      // Validate that cwd is a directory
      validateIsDirectory(sanitizedCwd, `Search path must be a directory: ${options.cwd || '.'}`)

      const files = await globby(pattern, { cwd: sanitizedCwd, onlyFiles: true })

      // Show file list in structured UI (optional; safe in headless envs)
      if (files.length > 0 && typeof process !== 'undefined' && process.stdout && process.stdout.isTTY) {
        try {
          // Lazy import to avoid bundling/UI dependency in non-interactive flows
          const { advancedUI } = await import('../ui/advanced-cli-ui')
          advancedUI.showFileList(files, `🔍 Find: ${pattern}`)
        } catch (error: any) {
          // Non-fatal: swallow UI errors but log for diagnostics
          try {
            cliLogger.debug('Optional advanced UI display failed; continuing without UI', {
              tool: 'find-files-tool',
              pattern,
              fileCount: files.length,
              error:
                error && typeof error === 'object'
                  ? { message: error.message, name: error.name, stack: error.stack }
                  : String(error),
            })
          } catch {
            // Best-effort logging; never throw from here
          }
          process.stdout.write('')
          await new Promise((resolve) => setTimeout(resolve, 150))
          this.showPrompt() // Extra newline for better separation
        }
      }

      return {
        success: true,
        data: files,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { pattern, options },
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: [],
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { pattern, options },
        },
      }
    }
  }
}

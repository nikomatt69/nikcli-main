import chalk from 'chalk'
import { ListDirectoryTool, ReadFileTool, ReplaceInFileTool, sanitizePath, WriteFileTool } from './secure-file-tools'
import { getWorkingDirectory, resolveWorkspacePath, toWorkspaceRelative } from '../utils/working-dir'

export type { BatchSession } from './secure-command-tool'

import { type BatchSession, type CommandResult, SecureCommandTool } from '.'
import { BrowserbaseTool, type BrowserbaseToolResult } from './browserbase-tool'
import { CoinbaseAgentKitTool } from './coinbase-agentkit-tool'
import { FigmaTool, type FigmaToolResult } from './figma-tool'
import { FindFilesTool } from './find-files-tool'
import { GitTools } from './git-tools'
import { type GrepResult, GrepTool, type GrepToolParams } from './grep-tool'
import { JsonPatchTool } from './json-patch-tool'
import { MultiReadTool } from './multi-read-tool'

/**
 * Tool execution context with security metadata
 */
export interface ToolContext {
  workingDirectory: string
  userId?: string
  sessionId?: string
  timestamp: Date
  securityLevel: 'safe' | 'confirmed' | 'dangerous'
}

/**
 * Tool execution result with security tracking
 */
export interface ToolResult<T = any> {
  success: boolean
  data?: T
  error?: string
  context: ToolContext
  executionTime: number
  securityChecks: {
    pathValidated: boolean
    userConfirmed: boolean
    commandAnalyzed?: boolean
  }
}

/**
 * Secure tools registry that provides sandboxed, confirmed operations
 * Replaces the unsafe ToolsManager with security-first approach
 */
export class SecureToolsRegistry {
  private workingDirectory: string
  private readFileTool: ReadFileTool
  private writeFileTool: WriteFileTool
  private listDirectoryTool: ListDirectoryTool
  private replaceInFileTool: ReplaceInFileTool
  private secureCommandTool: SecureCommandTool
  private findFilesTool: FindFilesTool
  private coinbaseAgentKitTool: CoinbaseAgentKitTool
  private jsonPatchTool: JsonPatchTool
  private gitTools: GitTools
  private multiReadTool: MultiReadTool
  private grepTool: GrepTool
  private browserbaseTool: BrowserbaseTool
  private figmaTool: FigmaTool
  private executionHistory: ToolResult[] = []

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || getWorkingDirectory()

    // Initialize secure tools
    this.readFileTool = new ReadFileTool(this.workingDirectory)
    this.writeFileTool = new WriteFileTool(this.workingDirectory)
    this.listDirectoryTool = new ListDirectoryTool(this.workingDirectory)
    this.replaceInFileTool = new ReplaceInFileTool(this.workingDirectory)
    this.secureCommandTool = new SecureCommandTool(this.workingDirectory)
    this.findFilesTool = new FindFilesTool(this.workingDirectory)
    this.coinbaseAgentKitTool = new CoinbaseAgentKitTool(this.workingDirectory)
    this.jsonPatchTool = new JsonPatchTool(this.workingDirectory)
    this.gitTools = new GitTools(this.workingDirectory)
    this.multiReadTool = new MultiReadTool(this.workingDirectory)
    this.grepTool = new GrepTool(this.workingDirectory)
    this.browserbaseTool = new BrowserbaseTool(this.workingDirectory)
    this.figmaTool = new FigmaTool()

    console.log(chalk.green('🔒 Secure Tools Registry initialized'))
    console.log(chalk.gray(`📁 Working directory: ${this.workingDirectory}`))
    try {
      const distNotice = this.workingDirectory.includes(`${require('node:path').sep}dist${require('node:path').sep}`)
      if (distNotice) {
        console.log(
          chalk.yellow(
            '⚠️ Working directory appears inside a dist build. Consider setting NIKCLI_WORKSPACE to project root.'
          )
        )
      }
    } catch { }
  }

  /**
   * Apply structured patch to JSON/YAML files with confirmation
   */
  async applyConfigPatch(
    filePath: string,
    operations: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: any }>,
    options: { skipConfirmation?: boolean; createBackup?: boolean; previewOnly?: boolean; allowMissing?: boolean } = {}
  ): Promise<
    ToolResult<{
      changes: number
      backupPath?: string
    }>
  > {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed')
    return this.executeWithTracking(
      'ApplyConfigPatch',
      async () => {
        const res = await this.jsonPatchTool.execute({
          filePath,
          operations: operations as any,
          createBackup: options.createBackup,
          previewOnly: options.previewOnly,
          allowMissing: options.allowMissing,
          skipConfirmation: options.skipConfirmation,
        })
        if (!res.success) throw new Error(res.error || 'Patch failed')
        return res.data as { changes: number; backupPath?: string }
      },
      context,
      { pathValidated: true, userConfirmed: !options.skipConfirmation }
    )
  }

  /**
   * Git status via secure wrapper
   */
  async gitStatus(): Promise<ToolResult<any>> {
    const context = this.createContext('safe')
    return this.executeWithTracking(
      'GitStatus',
      async () => {
        const res = await this.gitTools.execute({ action: 'status' })
        if (!res.success) throw new Error(res.error || 'git status failed')
        return res.data
      },
      context,
      { pathValidated: true, userConfirmed: false, commandAnalyzed: true }
    )
  }

  /**
   * Git diff via secure wrapper
   */
  async gitDiff(args: { staged?: boolean; pathspec?: string[] } = {}): Promise<ToolResult<any>> {
    const context = this.createContext('safe')
    return this.executeWithTracking(
      'GitDiff',
      async () => {
        const res = await this.gitTools.execute({ action: 'diff', args })
        if (!res.success) throw new Error(res.error || 'git diff failed')
        return res.data
      },
      context,
      { pathValidated: true, userConfirmed: false, commandAnalyzed: true }
    )
  }

  /**
   * Git commit with confirmation prompt
   */
  async gitCommit(args: { message: string; add?: string[]; allowEmpty?: boolean }): Promise<ToolResult<any>> {
    const context = this.createContext('confirmed')
    return this.executeWithTracking(
      'GitCommit',
      async () => {
        const res = await this.gitTools.execute({ action: 'commit', args })
        if (!res.success) throw new Error(res.error || 'git commit failed')
        return res.data
      },
      context,
      { pathValidated: true, userConfirmed: true, commandAnalyzed: true }
    )
  }

  /**
   * Apply a unified diff patch safely
   */
  async gitApplyPatch(patch: string): Promise<ToolResult<any>> {
    const context = this.createContext('confirmed')
    return this.executeWithTracking(
      'GitApplyPatch',
      async () => {
        const res = await this.gitTools.execute({ action: 'applyPatch', args: { patch } })
        if (!res.success) throw new Error(res.error || 'git apply failed')
        return res.data
      },
      context,
      { pathValidated: true, userConfirmed: true, commandAnalyzed: true }
    )
  }

  /**
   * Create a tool execution context
   */
  private createContext(securityLevel: 'safe' | 'confirmed' | 'dangerous' = 'safe'): ToolContext {
    return {
      workingDirectory: this.workingDirectory,
      timestamp: new Date(),
      securityLevel,
    }
  }

  /**
   * Execute a tool with security tracking
   */
  private async executeWithTracking<T>(
    toolName: string,
    operation: () => Promise<T>,
    context: ToolContext,
    securityChecks: ToolResult['securityChecks']
  ): Promise<ToolResult<T>> {
    const startTime = Date.now()

    try {
      console.log(chalk.blue(`🔧 Executing tool: ${toolName}`))

      const data = await operation()
      const executionTime = Date.now() - startTime

      const result: ToolResult<T> = {
        success: true,
        data,
        context,
        executionTime,
        securityChecks,
      }

      this.executionHistory.push(result)
      console.log(chalk.green(`✓ Tool completed: ${toolName} (${executionTime}ms)`))

      return result
    } catch (error: any) {
      const executionTime = Date.now() - startTime

      const result: ToolResult<T> = {
        success: false,
        error: error.message,
        context,
        executionTime,
        securityChecks,
      }

      this.executionHistory.push(result)
      console.log(chalk.red(`❌ Tool failed: ${toolName} - ${error.message}`))

      throw error
    }
  }

  /**
   * Secure file reading with path validation
   */
  async readFile(filePath: string): Promise<
    ToolResult<{
      path: string
      content: string
      size: number
      modified: Date
      extension: string
    }>
  > {
    const context = this.createContext('safe')

    return this.executeWithTracking('ReadFile', () => this.readFileTool.execute(filePath), context, {
      pathValidated: true,
      userConfirmed: false,
    })
  }

  /**
   * Secure file writing with user confirmation
   */
  async writeFile(
    filePath: string,
    content: string,
    options: {
      skipConfirmation?: boolean
      createDirectories?: boolean
    } = {}
  ): Promise<ToolResult<void>> {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed')

    return this.executeWithTracking(
      'WriteFile',
      () => this.writeFileTool.execute(filePath, content, options),
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
      }
    )
  }

  /**
   * Secure directory listing with path validation
   */
  async listDirectory(
    directoryPath: string = '.',
    options: {
      recursive?: boolean
      includeHidden?: boolean
      pattern?: RegExp
    } = {}
  ): Promise<
    ToolResult<{
      files: string[]
      directories: string[]
      total: number
    }>
  > {
    const context = this.createContext('safe')

    return this.executeWithTracking(
      'ListDirectory',
      () => this.listDirectoryTool.execute(directoryPath, options),
      context,
      { pathValidated: true, userConfirmed: false }
    )
  }

  /**
   * Secure file content replacement with user confirmation
   */
  async replaceInFile(
    filePath: string,
    replacements: Array<{
      find: string | RegExp
      replace: string
      global?: boolean
    }>,
    options: {
      skipConfirmation?: boolean
      createBackup?: boolean
    } = {}
  ): Promise<
    ToolResult<{
      replacements: number
      backup?: string
    }>
  > {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed')

    return this.executeWithTracking(
      'ReplaceInFile',
      () => this.replaceInFileTool.execute(filePath, replacements, options),
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
      }
    )
  }

  /**
   * Secure file finding with path validation
   */
  async findFiles(pattern: string, options: { cwd?: string } = {}): Promise<ToolResult<string[]>> {
    const context = this.createContext('safe')

    return this.executeWithTracking(
      'FindFiles',
      async () => {
        const result = await this.findFilesTool.execute(pattern, options)
        return result.data as string[]
      },
      context,
      { pathValidated: true, userConfirmed: false }
    )
  }

  /**
   * Secure command execution with allow-listing and confirmation
   */
  async executeCommand(
    command: string,
    options: {
      cwd?: string
      timeout?: number
      env?: Record<string, string>
      skipConfirmation?: boolean
      allowDangerous?: boolean
    } = {}
  ): Promise<ToolResult<CommandResult>> {
    const context = this.createContext(
      options.allowDangerous ? 'dangerous' : options.skipConfirmation ? 'safe' : 'confirmed'
    )

    return this.executeWithTracking('ExecuteCommand', () => this.secureCommandTool.execute(command, options), context, {
      pathValidated: true,
      userConfirmed: !options.skipConfirmation,
      commandAnalyzed: true,
    })
  }

  /**
   * Execute multiple commands in sequence with confirmation
   */
  async executeCommandSequence(
    commands: string[],
    options: {
      cwd?: string
      timeout?: number
      env?: Record<string, string>
      skipConfirmation?: boolean
      allowDangerous?: boolean
    } = {}
  ): Promise<ToolResult<CommandResult[]>> {
    const context = this.createContext(
      options.allowDangerous ? 'dangerous' : options.skipConfirmation ? 'safe' : 'confirmed'
    )

    return this.executeWithTracking(
      'ExecuteCommandSequence',
      () => this.secureCommandTool.executeSequence(commands, options),
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Create a batch session for one-time approval of multiple commands
   */
  async createBatchSession(
    commands: string[],
    options: {
      sessionDuration?: number
      allowDangerous?: boolean
      onProgress?: (command: string, index: number, total: number) => void
      onComplete?: (results: CommandResult[]) => void
      onError?: (error: Error, command: string, index: number) => void
    } = {}
  ): Promise<ToolResult<BatchSession>> {
    const context = this.createContext(options.allowDangerous ? 'dangerous' : 'confirmed')

    return this.executeWithTracking(
      'CreateBatchSession',
      () => this.secureCommandTool.createBatchSession(commands, options),
      context,
      {
        pathValidated: true,
        userConfirmed: true,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Execute a batch session asynchronously
   */
  async executeBatchAsync(
    sessionId: string,
    options: {
      cwd?: string
      timeout?: number
      env?: Record<string, string>
    } = {}
  ): Promise<ToolResult<void>> {
    const context = this.createContext('confirmed')

    return this.executeWithTracking(
      'ExecuteBatchAsync',
      () => this.secureCommandTool.executeBatchAsync(sessionId, options),
      context,
      {
        pathValidated: true,
        userConfirmed: true,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Get batch session status
   */
  getBatchSession(sessionId: string): BatchSession | undefined {
    return this.secureCommandTool.getBatchSession(sessionId)
  }

  /**
   * List all batch sessions
   */
  listBatchSessions(): BatchSession[] {
    return this.secureCommandTool.listBatchSessions()
  }

  /**
   * Clean up expired batch sessions
   */
  cleanupExpiredSessions(): number {
    return this.secureCommandTool.cleanupExpiredSessions()
  }

  /**
   * Execute Coinbase AgentKit operations
   */
  async executeCoinbaseAgentKit(
    action: string,
    params: any = {},
    options: {
      skipConfirmation?: boolean
    } = {}
  ): Promise<ToolResult<any>> {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed')

    return this.executeWithTracking(
      'CoinbaseAgentKit',
      () => this.coinbaseAgentKitTool.execute(action, params),
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
      }
    )
  }

  /**
   * Validate a file path without executing any operation
   */
  validatePath(filePath: string): { valid: boolean; safePath?: string; error?: string } {
    try {
      const safePath = sanitizePath(filePath, this.workingDirectory)
      return { valid: true, safePath }
    } catch (error: any) {
      return { valid: false, error: error.message }
    }
  }

  /**
   * Read multiple files safely with optional pattern search
   */
  async multiRead(
    params: import('./multi-read-tool').MultiReadParams
  ): Promise<ToolResult<import('./multi-read-tool').MultiReadResult>> {
    const context = this.createContext('safe')
    return this.executeWithTracking(
      'MultiRead',
      async () => {
        const res = await this.multiReadTool.execute(params)
        if (!res.success) throw new Error(res.error || 'multi-read failed')
        return res.data as any
      },
      context,
      { pathValidated: true, userConfirmed: false }
    )
  }

  /**
   * Grep with safety, ignore patterns and context
   */
  async grep(params: GrepToolParams): Promise<ToolResult<GrepResult>> {
    const context = this.createContext('safe')
    return this.executeWithTracking(
      'Grep',
      async () => {
        const res = await this.grepTool.execute(params)
        if (!res.success) throw new Error(res.error || 'grep failed')
        return res.data as GrepResult
      },
      context,
      { pathValidated: true, userConfirmed: false }
    )
  }

  /**
   * Check if a command would be safe to execute
   */
  checkCommand(command: string): {
    safe: boolean
    analysis: {
      safe: boolean
      dangerous: boolean
      risks: string[]
      suggestions: string[]
    }
  } {
    return this.secureCommandTool.checkCommand(command)
  }

  /**
   * Get execution history with optional filtering
   */
  getExecutionHistory(
    options: {
      limit?: number
      toolName?: string
      securityLevel?: 'safe' | 'confirmed' | 'dangerous'
      successOnly?: boolean
    } = {}
  ): ToolResult[] {
    let history = this.executionHistory.slice().reverse()

    if (options.securityLevel) {
      history = history.filter((result) => result.context.securityLevel === options.securityLevel)
    }

    if (options.successOnly) {
      history = history.filter((result) => result.success)
    }

    if (options.limit) {
      history = history.slice(0, options.limit)
    }

    return history
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalOperations: number
    safeOperations: number
    confirmedOperations: number
    dangerousOperations: number
    failedOperations: number
    pathValidationRate: number
    userConfirmationRate: number
  } {
    const total = this.executionHistory.length
    const safe = this.executionHistory.filter((r) => r.context.securityLevel === 'safe').length
    const confirmed = this.executionHistory.filter((r) => r.context.securityLevel === 'confirmed').length
    const dangerous = this.executionHistory.filter((r) => r.context.securityLevel === 'dangerous').length
    const failed = this.executionHistory.filter((r) => !r.success).length
    const pathValidated = this.executionHistory.filter((r) => r.securityChecks.pathValidated).length
    const userConfirmed = this.executionHistory.filter((r) => r.securityChecks.userConfirmed).length

    return {
      totalOperations: total,
      safeOperations: safe,
      confirmedOperations: confirmed,
      dangerousOperations: dangerous,
      failedOperations: failed,
      pathValidationRate: total > 0 ? pathValidated / total : 0,
      userConfirmationRate: total > 0 ? userConfirmed / total : 0,
    }
  }

  /**
   * Print security summary
   */
  printSecuritySummary(): void {
    const stats = this.getSecurityStats()

    console.log(chalk.blue.bold('\n🔒 Security Summary'))
    console.log(chalk.gray('─'.repeat(50)))
    console.log(chalk.white(`Total Operations: ${stats.totalOperations}`))
    console.log(chalk.green(`Safe Operations: ${stats.safeOperations}`))
    console.log(chalk.yellow(`Confirmed Operations: ${stats.confirmedOperations}`))
    console.log(chalk.red(`Dangerous Operations: ${stats.dangerousOperations}`))
    console.log(chalk.red(`Failed Operations: ${stats.failedOperations}`))
    console.log(chalk.blue(`Path Validation Rate: ${(stats.pathValidationRate * 100).toFixed(1)}%`))
    console.log(chalk.blue(`User Confirmation Rate: ${(stats.userConfirmationRate * 100).toFixed(1)}%`))
  }

  /**
   * Browse URL and analyze with Browserbase
   */
  async browseAndAnalyze(
    url: string,
    options: {
      analysisProvider?: 'claude' | 'openai' | 'google' | 'openrouter'
      analysisType?: 'summary' | 'detailed' | 'technical' | 'custom'
      customPrompt?: string
      skipConfirmation?: boolean
    } = {}
  ): Promise<ToolResult<BrowserbaseToolResult>> {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed')

    return this.executeWithTracking(
      'BrowseAndAnalyze',
      async () => {
        const res = await this.browserbaseTool.browseAndAnalyze(url, {
          analysisOptions: {
            provider: options.analysisProvider,
            analysisType: options.analysisType,
            prompt: options.customPrompt,
          },
        })
        if (!res.success) throw new Error(res.error || 'Browse and analyze failed')
        return res.data as BrowserbaseToolResult
      },
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Create Browserbase session
   */
  async createBrowserbaseSession(
    options: { timeout?: number; keepAlive?: boolean; skipConfirmation?: boolean } = {}
  ): Promise<ToolResult<BrowserbaseToolResult>> {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed')

    return this.executeWithTracking(
      'CreateBrowserbaseSession',
      async () => {
        const res = await this.browserbaseTool.createSession({
          timeout: options.timeout,
          keepAlive: options.keepAlive,
        })
        if (!res.success) throw new Error(res.error || 'Session creation failed')
        return res.data as BrowserbaseToolResult
      },
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Navigate and extract content with Browserbase
   */
  async navigateAndExtract(
    sessionId: string,
    url: string,
    options: {
      waitFor?: number
      selector?: string
      screenshot?: boolean
      skipConfirmation?: boolean
    } = {}
  ): Promise<ToolResult<BrowserbaseToolResult>> {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed')

    return this.executeWithTracking(
      'NavigateAndExtract',
      async () => {
        const res = await this.browserbaseTool.navigateAndExtract(sessionId, url, {
          waitFor: options.waitFor,
          selector: options.selector,
          screenshot: options.screenshot,
        })
        if (!res.success) throw new Error(res.error || 'Navigate and extract failed')
        return res.data as BrowserbaseToolResult
      },
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Close Browserbase session
   */
  async closeBrowserbaseSession(
    sessionId: string,
    options: {
      skipConfirmation?: boolean
    } = {}
  ): Promise<ToolResult<BrowserbaseToolResult>> {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed')

    return this.executeWithTracking(
      'CloseBrowserbaseSession',
      async () => {
        const res = await this.browserbaseTool.closeSession(sessionId)
        if (!res.success) throw new Error(res.error || 'Session close failed')
        return res.data as BrowserbaseToolResult
      },
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Get Browserbase session status
   */
  async getBrowserbaseSession(sessionId: string): Promise<ToolResult<BrowserbaseToolResult>> {
    const context = this.createContext('safe')

    return this.executeWithTracking(
      'GetBrowserbaseSession',
      async () => {
        const res = await this.browserbaseTool.getSession(sessionId)
        if (!res.success) throw new Error(res.error || 'Get session failed')
        return res.data as BrowserbaseToolResult
      },
      context,
      {
        pathValidated: true,
        userConfirmed: false,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Get Browserbase available providers
   */
  getBrowserbaseProviders(): string[] {
    return this.browserbaseTool.getAvailableProviders()
  }

  /**
   * Get active Browserbase sessions
   */
  getActiveBrowserbaseSessions(): any[] {
    return this.browserbaseTool.getActiveSessions()
  }

  /**
   * Cleanup expired Browserbase sessions
   */
  async cleanupExpiredBrowserbaseSessions(): Promise<ToolResult<BrowserbaseToolResult>> {
    const context = this.createContext('safe')

    return this.executeWithTracking(
      'CleanupExpiredBrowserbaseSessions',
      async () => {
        const res = await this.browserbaseTool.cleanupExpiredSessions()
        if (!res.success) throw new Error(res.error || 'Cleanup failed')
        return res.data as BrowserbaseToolResult
      },
      context,
      {
        pathValidated: true,
        userConfirmed: false,
        commandAnalyzed: true,
      }
    )
  }

  // ==================== FIGMA DESIGN TOOLS ====================

  /**
   * Get Figma file information
   */
  async figmaGetFileInfo(fileId: string): Promise<ToolResult<FigmaToolResult>> {
    const context = this.createContext('safe')

    return this.executeWithTracking(
      'FigmaGetFileInfo',
      async () => {
        const res = await this.figmaTool.execute({
          command: 'figma-info',
          args: [fileId],
        })
        if (!res.success) throw new Error(res.error || 'Failed to get file info')
        return res
      },
      context,
      {
        pathValidated: true,
        userConfirmed: false,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Export Figma designs to images
   */
  async figmaExportDesigns(
    fileId: string,
    options: {
      format?: 'png' | 'jpg' | 'svg' | 'pdf'
      outputPath?: string
      scale?: number
      nodeIds?: string[]
    } = {}
  ): Promise<ToolResult<FigmaToolResult>> {
    const context = this.createContext('confirmed')

    return this.executeWithTracking(
      'FigmaExportDesigns',
      async () => {
        const args = [fileId]
        if (options.format) args.push(options.format)
        if (options.outputPath) args.push(options.outputPath)

        const res = await this.figmaTool.execute({
          command: 'figma-export',
          args,
        })
        if (!res.success) throw new Error(res.error || 'Export failed')
        return res
      },
      context,
      {
        pathValidated: true,
        userConfirmed: true,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Generate code from Figma designs using AI
   */
  async figmaGenerateCode(
    fileId: string,
    options: {
      framework?: 'react' | 'vue' | 'svelte' | 'html'
      library?: 'shadcn' | 'chakra' | 'mantine' | 'custom'
      nodeId?: string
    } = {}
  ): Promise<ToolResult<FigmaToolResult>> {
    const context = this.createContext('safe')

    return this.executeWithTracking(
      'FigmaGenerateCode',
      async () => {
        const args = [fileId]
        if (options.framework) args.push(options.framework)
        if (options.library) args.push(options.library)

        const res = await this.figmaTool.execute({
          command: 'figma-to-code',
          args,
        })
        if (!res.success) throw new Error(res.error || 'Code generation failed')
        return res
      },
      context,
      {
        pathValidated: true,
        userConfirmed: false,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Open Figma file in desktop app (macOS only)
   */
  async figmaOpenInDesktop(fileUrl: string): Promise<ToolResult<FigmaToolResult>> {
    const context = this.createContext('confirmed')

    return this.executeWithTracking(
      'FigmaOpenInDesktop',
      async () => {
        const res = await this.figmaTool.execute({
          command: 'figma-open',
          args: [fileUrl],
        })
        if (!res.success) throw new Error(res.error || 'Failed to open in desktop app')
        return res
      },
      context,
      {
        pathValidated: true,
        userConfirmed: true,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Extract design tokens from Figma file
   */
  async figmaExtractTokens(
    fileId: string,
    options: {
      format?: 'json' | 'css' | 'scss' | 'tokens-studio'
      includeColors?: boolean
      includeTypography?: boolean
      includeSpacing?: boolean
    } = {}
  ): Promise<ToolResult<FigmaToolResult>> {
    const context = this.createContext('safe')

    return this.executeWithTracking(
      'FigmaExtractTokens',
      async () => {
        const args = [fileId]
        if (options.format) args.push(options.format)

        const res = await this.figmaTool.execute({
          command: 'figma-tokens',
          args,
        })
        if (!res.success) throw new Error(res.error || 'Token extraction failed')
        return res
      },
      context,
      {
        pathValidated: true,
        userConfirmed: false,
        commandAnalyzed: true,
      }
    )
  }

  /**
   * Check if Figma integration is configured
   */
  isFigmaConfigured(): boolean {
    return !!(
      process.env.FIGMA_API_TOKEN || require('../core/config-manager').simpleConfigManager.get('figma.apiToken')
    )
  }

  /**
   * Extract file ID from Figma URL
   */
  extractFigmaFileId(url: string): string | null {
    const match = url.match(/\/file\/([a-zA-Z0-9_-]+)/)
    return match ? match[1] : null
  }
}

// Export singleton instance
export const secureTools = new SecureToolsRegistry()

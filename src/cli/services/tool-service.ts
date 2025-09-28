import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import chalk from 'chalk'
// Import RAG and semantic search capabilities
import { unifiedRAGSystem } from '../context/rag-system'
import { semanticSearchEngine } from '../context/semantic-search-engine'
import { workspaceContext } from '../context/workspace-context'
import { simpleConfigManager } from '../core/config-manager'
import { ExecutionPolicyManager, type ToolApprovalRequest } from '../policies/execution-policy'
import { ContentValidators } from '../tools/write-file-tool'
import { type ApprovalRequest, type ApprovalResponse, ApprovalSystem } from '../ui/approval-system'

export interface ToolExecution {
  id: string
  toolName: string
  args: any
  startTime: Date
  endTime?: Date
  status: 'running' | 'completed' | 'failed'
  result?: any
  error?: string
}

export interface ToolCapability {
  name: string
  description: string
  category: 'file' | 'command' | 'analysis' | 'git' | 'package' | 'semantic' | 'rag'
  handler: (args: any) => Promise<any>
}

export class ToolService {
  private tools: Map<string, ToolCapability> = new Map()
  private executions: Map<string, ToolExecution> = new Map()
  private workingDirectory: string = process.cwd()
  private policyManager: ExecutionPolicyManager
  private approvalSystem: ApprovalSystem

  constructor() {
    this.policyManager = new ExecutionPolicyManager(simpleConfigManager)
    this.approvalSystem = new ApprovalSystem({
      autoApprove: {
        lowRisk: false,
        mediumRisk: false,
        fileOperations: false,
        packageInstalls: false,
      },
      requireConfirmation: {
        destructiveOperations: true,
        networkRequests: true,
        systemCommands: true,
      },
      timeout: 30000, // 30 seconds timeout
    })
    this.registerDefaultTools()
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir
  }

  private registerDefaultTools(): void {
    // File operations
    this.registerTool({
      name: 'read_file',
      description: 'Read file contents',
      category: 'file',
      handler: this.readFile.bind(this),
    })

    this.registerTool({
      name: 'write_file',
      description: 'Write content to file',
      category: 'file',
      handler: this.writeFile.bind(this),
    })

    this.registerTool({
      name: 'list_files',
      description: 'List files in directory',
      category: 'file',
      handler: this.listFiles.bind(this),
    })

    this.registerTool({
      name: 'find_files',
      description: 'Find files matching pattern',
      category: 'file',
      handler: this.findFiles.bind(this),
    })

    // Command execution
    this.registerTool({
      name: 'execute_command',
      description: 'Execute shell command',
      category: 'command',
      handler: this.executeCommand.bind(this),
    })

    // Git operations
    this.registerTool({
      name: 'git_status',
      description: 'Get git repository status',
      category: 'git',
      handler: this.gitStatus.bind(this),
    })

    this.registerTool({
      name: 'git_diff',
      description: 'Get git diff',
      category: 'git',
      handler: this.gitDiff.bind(this),
    })

    // Package management
    this.registerTool({
      name: 'npm_install',
      description: 'Install npm package',
      category: 'package',
      handler: this.npmInstall.bind(this),
    })

    // Project analysis
    this.registerTool({
      name: 'analyze_project',
      description: 'Analyze project structure',
      category: 'analysis',
      handler: this.analyzeProject.bind(this),
    })

    // Semantic search tools
    this.registerTool({
      name: 'semantic_search',
      description: 'Search files using semantic understanding',
      category: 'semantic',
      handler: this.semanticSearch.bind(this),
    })

    this.registerTool({
      name: 'analyze_query',
      description: 'Analyze search query for intent and entities',
      category: 'semantic',
      handler: this.analyzeQuery.bind(this),
    })

    // RAG tools
    this.registerTool({
      name: 'rag_search',
      description: 'Search codebase using RAG system',
      category: 'rag',
      handler: this.ragSearch.bind(this),
    })

    this.registerTool({
      name: 'index_project',
      description: 'Index project for better search',
      category: 'rag',
      handler: this.indexProject.bind(this),
    })
  }

  registerTool(tool: ToolCapability): void {
    this.tools.set(tool.name, tool)
    if (!process.env.NIKCLI_SUPPRESS_TOOL_REGISTER_LOGS && !process.env.NIKCLI_QUIET_STARTUP) {
      console.log(chalk.dim(`🔧 Registered tool: ${tool.name}`))
    }
  }

  // New semantic search capabilities
  private async semanticSearch(args: { query: string; directory?: string; limit?: number }): Promise<any> {
    try {
      const results = await workspaceContext.searchSemantic({
        query: args.query,
        limit: args.limit || 10,
        threshold: 0.3,
        useRAG: true,
      })

      return {
        success: true,
        results: results.map((r) => ({
          path: r.file.path,
          score: r.score,
          matchType: r.matchType,
          snippet: r.snippet,
        })),
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private async analyzeQuery(args: { query: string }): Promise<any> {
    try {
      const analysis = await semanticSearchEngine.analyzeQuery(args.query)
      return {
        success: true,
        analysis: {
          intent: analysis.intent.type,
          confidence: analysis.confidence,
          entities: analysis.entities.map((e) => ({ text: e.text, type: e.type })),
          expandedQuery: analysis.expandedQuery,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private async ragSearch(args: { query: string; options?: any }): Promise<any> {
    try {
      const results = await unifiedRAGSystem.search(args.query, {
        limit: args.options?.limit || 10,
        semanticOnly: args.options?.semanticOnly || false,
        workingDirectory: this.workingDirectory,
      })

      return {
        success: true,
        results: results.map((r) => ({
          path: r.path,
          content: r.content.substring(0, 300),
          score: r.score,
          metadata: r.metadata,
        })),
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private async indexProject(args: { directory?: string }): Promise<any> {
    try {
      const targetDir = args.directory || this.workingDirectory
      const result = await unifiedRAGSystem.analyzeProject(targetDir)

      return {
        success: true,
        indexed: result.indexedFiles || 0,
        fallbackMode: result.fallbackMode || false,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Execute tool with security checks and approval process
   */
  async executeToolSafely(toolName: string, operation: string, args: any): Promise<any> {
    try {
      // Check if approval is needed
      const approvalRequest = await this.policyManager.shouldApproveToolOperation(toolName, operation, args)

      if (approvalRequest) {
        // Request user approval
        const approval = await this.requestToolApproval(approvalRequest)

        if (!approval.approved) {
          await this.policyManager.logPolicyDecision(`tool:${toolName}`, 'denied', {
            operation,
            args,
            userComments: approval.userComments,
          })
          throw new Error(`Operation cancelled by user: ${toolName} - ${operation}`)
        }

        // Log approval decision
        await this.policyManager.logPolicyDecision(`tool:${toolName}`, 'requires_approval', {
          operation,
          args,
          approved: true,
          userComments: approval.userComments,
        })

        // Add to session approvals if requested
        if (approval.userComments?.includes('approve-session')) {
          this.policyManager.addSessionApproval(toolName, operation)
        }
      } else {
        // Log auto-approval
        await this.policyManager.logPolicyDecision(`tool:${toolName}`, 'allowed', {
          operation,
          args,
          reason: 'auto-approved by policy',
        })
      }

      // Execute the tool
      return await this.executeTool(toolName, args)
    } catch (error: any) {
      // Log execution error
      await this.policyManager.logPolicyDecision(`tool:${toolName}`, 'denied', {
        operation,
        args,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Request approval for tool operation
   */
  private async requestToolApproval(toolRequest: ToolApprovalRequest): Promise<ApprovalResponse> {
    const approvalRequest: ApprovalRequest = {
      id: `tool-${Date.now()}`,
      title: `Tool Operation: ${toolRequest.toolName}`,
      description: `Operation: ${toolRequest.operation}\n\nRisk Level: ${toolRequest.riskAssessment.level}\n\nReasons:\n${toolRequest.riskAssessment.reasons.map((r) => `• ${r}`).join('\n')}`,
      riskLevel:
        toolRequest.riskAssessment.level === 'low'
          ? 'low'
          : toolRequest.riskAssessment.level === 'medium'
            ? 'medium'
            : 'high',
      actions: [
        {
          type: this.getActionType(toolRequest.toolName),
          description: `Execute ${toolRequest.toolName} with operation: ${toolRequest.operation}`,
          details: toolRequest.args,
          riskLevel:
            toolRequest.riskAssessment.level === 'low'
              ? 'low'
              : toolRequest.riskAssessment.level === 'medium'
                ? 'medium'
                : 'high',
        },
      ],
      context: {
        workingDirectory: this.workingDirectory,
        affectedFiles: toolRequest.riskAssessment.affectedFiles,
        estimatedDuration: 5000, // 5 seconds default
      },
      timeout: simpleConfigManager.getAll().sessionSettings.approvalTimeoutMs,
    }

    return await this.approvalSystem.requestApproval(approvalRequest)
  }

  /**
   * Map tool name to approval action type
   */
  private getActionType(
    toolName: string
  ): 'file_create' | 'file_modify' | 'file_delete' | 'command_execute' | 'package_install' | 'network_request' {
    if (toolName.includes('write') || toolName.includes('create')) return 'file_create'
    if (toolName.includes('edit') || toolName.includes('modify')) return 'file_modify'
    if (toolName.includes('delete') || toolName.includes('remove')) return 'file_delete'
    if (toolName.includes('install') || toolName.includes('package')) return 'package_install'
    if (toolName.includes('network') || toolName.includes('fetch')) return 'network_request'
    return 'command_execute'
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    const compact = process.env.NIKCLI_COMPACT === '1'
    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`)
    }

    const execution: ToolExecution = {
      id: Date.now().toString(),
      toolName,
      args,
      startTime: new Date(),
      status: 'running',
    }

    this.executions.set(execution.id, execution)

    // Per-execution timeout guard
    const timeoutMs = typeof args?.timeout === 'number' && args.timeout > 0 ? args.timeout : 30000
    let timeoutHandle: NodeJS.Timeout | undefined

    try {
      if (!compact) console.log(chalk.blue(`🔧 Executing ${toolName}...`))

      const timed = new Promise<any>((_resolve, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Tool '${toolName}' timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      })

      const result = await Promise.race([tool.handler(args), timed])

      execution.endTime = new Date()
      execution.status = 'completed'
      execution.result = result

      const duration = execution.endTime.getTime() - execution.startTime.getTime()
      if (!compact) console.log(chalk.green(`✓ ${toolName} completed (${duration}ms)`))

      return result
    } catch (error: any) {
      execution.endTime = new Date()
      execution.status = 'failed'
      execution.error = error.message

      if (!compact) console.log(chalk.red(`❌ ${toolName} failed: ${error.message}`))
      throw error
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }

  /**
   * Get available tools (original method for compatibility)
   */
  getAvailableTools(): ToolCapability[] {
    return Array.from(this.tools.values())
  }

  getExecutionHistory(): ToolExecution[] {
    return Array.from(this.executions.values())
  }

  // Tool implementations
  private async readFile(args: { filePath: string }): Promise<{ content: string; size: number }> {
    const fullPath = path.resolve(this.workingDirectory, args.filePath)

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${args.filePath}`)
    }

    const content = fs.readFileSync(fullPath, 'utf8')
    return {
      content,
      size: content.length,
    }
  }

  private async writeFile(args: { filePath: string; content: string }): Promise<{ written: boolean; size: number }> {
    const fullPath = path.resolve(this.workingDirectory, args.filePath)
    const dir = path.dirname(fullPath)

    // Validate content using Claude Code best practices
    const pathValidation = await ContentValidators.noAbsolutePaths(args.content, args.filePath)
    if (!pathValidation.isValid) {
      throw new Error(`Content validation failed: ${pathValidation.errors.join(', ')}`)
    }

    const versionValidation = await ContentValidators.noLatestVersions(args.content, args.filePath)
    if (versionValidation.warnings && versionValidation.warnings.length > 0) {
      console.log(`⚠️  ${versionValidation.warnings.join(', ')}`)
    }

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(fullPath, args.content, 'utf8')

    // Show relative path in logs
    const relativePath = args.filePath.startsWith(this.workingDirectory)
      ? args.filePath.replace(this.workingDirectory, '').replace(/^\//, '')
      : args.filePath

    console.log(chalk.green(`✓ File written: ${relativePath} (${args.content.length} bytes)`))

    return {
      written: true,
      size: args.content.length,
    }
  }

  private async listFiles(args: {
    path?: string
  }): Promise<{ files: Array<{ name: string; type: 'file' | 'directory'; size?: number }> }> {
    const targetPath = path.resolve(this.workingDirectory, args.path || '.')

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Directory not found: ${args.path || '.'}`)
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true })
    const files = items.map((item) => {
      const result: any = {
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
      }

      if (item.isFile()) {
        try {
          const stats = fs.statSync(path.join(targetPath, item.name))
          result.size = stats.size
        } catch {
          // Ignore stat errors
        }
      }

      return result
    })

    return { files }
  }

  private async findFiles(args: { pattern: string; path?: string }): Promise<{ matches: string[] }> {
    const searchPath = path.resolve(this.workingDirectory, args.path || '.')
    const matches: string[] = []

    // Convert glob-like pattern (e.g., **/*.{ts,tsx}) to RegExp
    const globToRegex = (glob: string): RegExp => {
      const toSource = (g: string): string => {
        let src = ''
        for (let i = 0; i < g.length; i++) {
          const ch = g[i]
          if (ch === '*') {
            if (g[i + 1] === '*') {
              src += '.*'
              i++
            } else {
              src += '[^/]*'
            }
          } else if (ch === '?') {
            src += '.'
          } else if (ch === '{') {
            // Brace expansion
            let j = i + 1
            let level = 1
            let inner = ''
            while (j < g.length && level > 0) {
              const c = g[j]
              if (c === '{') level++
              else if (c === '}') level--
              if (level > 0) inner += c
              j++
            }
            const parts = inner.split(',').map((part) => toSource(part))
            src += `(?:${parts.join('|')})`
            i = j - 1
          } else if ('\\^$.|+()[]'.includes(ch)) {
            src += `\\${ch}`
          } else {
            src += ch
          }
        }
        return src
      }
      return new RegExp(`^${toSource(glob)}$`)
    }

    const patternRegex = globToRegex(args.pattern)
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage'])

    const searchRecursive = (dir: string) => {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true })

        for (const item of items) {
          const fullPath = path.join(dir, item.name)
          const relativePath = path.relative(this.workingDirectory, fullPath)

          if (item.isDirectory()) {
            if (!ignoreDirs.has(item.name)) searchRecursive(fullPath)
          } else {
            if (patternRegex.test(relativePath.replace(/\\/g, '/'))) {
              matches.push(relativePath)
            }
          }
        }
      } catch {
        // Ignore directory access errors
      }
    }

    searchRecursive(searchPath)
    return { matches }
  }

  private async executeCommand(args: {
    command: string
    timeout?: number
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const result = execSync(args.command, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        timeout: args.timeout || 30000,
      })

      return {
        stdout: result.toString(),
        stderr: '',
        exitCode: 0,
      }
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message,
        exitCode: error.status || 1,
      }
    }
  }

  private async gitStatus(_args: {}): Promise<{ status: string; files: Array<{ path: string; status: string }> }> {
    try {
      const result = execSync('git status --porcelain', {
        cwd: this.workingDirectory,
        encoding: 'utf8',
      })

      const files = result
        .trim()
        .split('\\n')
        .filter((line) => line)
        .map((line) => {
          const status = line.slice(0, 2)
          const path = line.slice(3)
          return { path, status }
        })

      return {
        status: files.length > 0 ? 'dirty' : 'clean',
        files,
      }
    } catch (_error) {
      throw new Error('Not a git repository or git not available')
    }
  }

  private async gitDiff(args: { staged?: boolean }): Promise<{ diff: string }> {
    try {
      const command = args.staged ? 'git diff --cached' : 'git diff'
      const result = execSync(command, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
      })

      return { diff: result }
    } catch (_error) {
      throw new Error('Failed to get git diff')
    }
  }

  private async npmInstall(args: {
    package?: string
    dev?: boolean
  }): Promise<{ installed: string[]; error?: string }> {
    try {
      let command = 'npm install'

      if (args.package) {
        command += ` ${args.package}`
        if (args.dev) {
          command += ' --save-dev'
        }
      }

      const _result = execSync(command, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
      })

      return {
        installed: args.package ? [args.package] : ['dependencies'],
      }
    } catch (error: any) {
      return {
        installed: [],
        error: error.message,
      }
    }
  }

  private async analyzeProject(_args: {}): Promise<{
    name: string
    type: string
    languages: string[]
    fileCount: number
    structure: any
  }> {
    try {
      // Read package.json if available
      let projectName = path.basename(this.workingDirectory)
      let projectType = 'unknown'

      try {
        const packageJsonPath = path.join(this.workingDirectory, 'package.json')
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
          projectName = packageJson.name || projectName
          projectType = 'node'
        }
      } catch {
        // Ignore package.json errors
      }

      // Detect languages
      const languages = new Set<string>()
      let fileCount = 0

      const analyzeDir = (dir: string, depth = 0) => {
        if (depth > 10) return // Increase recursion depth for deeper analysis

        try {
          const items = fs.readdirSync(dir, { withFileTypes: true })

          for (const item of items) {
            if (item.name.startsWith('.')) continue

            const fullPath = path.join(dir, item.name)

            if (item.isDirectory()) {
              analyzeDir(fullPath, depth + 1)
            } else {
              fileCount++
              const ext = path.extname(item.name)

              // Map extensions to languages
              const langMap: Record<string, string> = {
                '.js': 'JavaScript',
                '.ts': 'TypeScript',
                '.tsx': 'TypeScript',
                '.jsx': 'JavaScript',
                '.py': 'Python',
                '.rs': 'Rust',
                '.go': 'Go',
                '.java': 'Java',
                '.cpp': 'C++',
                '.c': 'C',
              }

              if (langMap[ext]) {
                languages.add(langMap[ext])
              }
            }
          }
        } catch {
          // Ignore directory access errors
        }
      }

      analyzeDir(this.workingDirectory)

      return {
        name: projectName,
        type: projectType,
        languages: Array.from(languages),
        fileCount,
        structure: {}, // Could be expanded
      }
    } catch (error: any) {
      throw new Error(`Failed to analyze project: ${error.message}`)
    }
  }

  /**
   * Enable developer mode for current session
   */
  enableDevMode(timeoutMs?: number): void {
    this.policyManager.enableDevMode(timeoutMs)
    console.log(chalk.yellow('🔨 Developer mode enabled - reduced security restrictions'))
  }

  /**
   * Check if developer mode is active
   */
  isDevModeActive(): boolean {
    return this.policyManager.isDevModeActive()
  }

  /**
   * Get current security mode status
   */
  getSecurityStatus(): {
    mode: string
    devModeActive: boolean
    sessionApprovals: number
    toolPolicies: { name: string; risk: string; requiresApproval: boolean }[]
  } {
    const config = simpleConfigManager.getAll()
    const toolsWithSecurity = this.getAvailableToolsWithSecurity()

    return {
      mode: config.securityMode,
      devModeActive: this.isDevModeActive(),
      sessionApprovals: this.policyManager['sessionApprovals'].size,
      toolPolicies: toolsWithSecurity.map((tool) => ({
        name: tool.name,
        risk: tool.riskLevel || 'unknown',
        requiresApproval: tool.requiresApproval || false,
      })),
    }
  }

  /**
   * Clear all session approvals
   */
  clearSessionApprovals(): void {
    this.policyManager.clearSessionApprovals()
    console.log(chalk.blue('⚡︎ Session approvals cleared'))
  }

  /**
   * Add a tool to session approvals
   */
  addSessionApproval(toolName: string, operation: string): void {
    this.policyManager.addSessionApproval(toolName, operation)
    console.log(chalk.green(`✓ Added session approval for ${toolName}:${operation}`))
  }

  /**
   * Get available tools with their security status
   */
  getAvailableToolsWithSecurity(): Array<{
    name: string
    description: string
    category: string
    riskLevel?: string
    requiresApproval?: boolean
    allowedInSafeMode?: boolean
  }> {
    return Array.from(this.tools.values()).map((tool) => {
      const policy = this.policyManager.getToolPolicy(tool.name)
      return {
        name: tool.name,
        description: tool.description,
        category: tool.category,
        riskLevel: policy?.riskLevel,
        requiresApproval: policy?.requiresApproval,
        allowedInSafeMode: policy?.allowedInSafeMode,
      }
    })
  }
}

export const toolService = new ToolService()

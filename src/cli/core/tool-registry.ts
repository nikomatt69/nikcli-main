import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { z } from 'zod/v3';
import { ContextAwareRAGSystem } from '../context/context-aware-rag'
import { lspManager } from '../lsp/lsp-manager'
import { ImageGenerationTool, VisionAnalysisTool } from '../tools'
import type { ToolExecutionResult } from '../tools/base-tool'
import { advancedUI } from '../ui/advanced-cli-ui'
import { structuredLogger } from '../utils/structured-logger'
import { AnalyticsManager } from './analytics-manager'
import { PerformanceOptimizer } from './performance-optimizer'

export const ToolPermissionSchema = z.object({
  canReadFiles: z.boolean().default(true),
  canWriteFiles: z.boolean().default(true),
  canDeleteFiles: z.boolean().default(false),
  canExecuteCommands: z.boolean().default(false),
  allowedPaths: z.array(z.string()).default([]),
  forbiddenPaths: z.array(z.string()).default([]),
  allowedCommands: z.array(z.string()).default([]),
  forbiddenCommands: z.array(z.string()).default([]),
  canAccessNetwork: z.boolean().default(false),
  maxExecutionTime: z.number().int().min(1000).default(300000),
  maxMemoryUsage: z
    .number()
    .int()
    .min(1024 * 1024)
    .default(512 * 1024 * 1024),
  requiresApproval: z.boolean().default(false),
})

export const ToolMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.6.0'),
  author: z.string().optional(),
  category: z.enum([
    'file-ops',
    'code-analysis',
    'system',
    'network',
    'development',
    'utility',
    'image-analysis',
    'text-analysis',
    'image-generation',
    'web-browsing',
  ]),
  tags: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  requiredCapabilities: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  permissions: ToolPermissionSchema,
  inputSchema: z.any(),
  outputSchema: z.any(),
  examples: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        input: z.any(),
        expectedOutput: z.any(),
      })
    )
    .default([]),
  documentation: z.string().optional(),
  promptFile: z.string().optional(),
  isBuiltIn: z.boolean().default(true),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(50),
  loadOrder: z.number().int().default(0),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

export const ToolInstanceSchema = z.object({
  metadata: ToolMetadataSchema,
  instance: z.any(),
  isLoaded: z.boolean().default(false),
  isInitialized: z.boolean().default(false),
  loadTime: z.number().optional(),
  lastUsed: z.date().optional(),
  usageCount: z.number().int().default(0),
  successRate: z.number().min(0).max(1).default(1),
  averageExecutionTime: z.number().default(0),
  errors: z.array(z.string()).default([]),
})

export const ToolRegistryConfigSchema = z.object({
  enabledCategories: z
    .array(z.string())
    .default([
      'file-ops',
      'code-analysis',
      'system',
      'network',
      'development',
      'utility',
      'image-analysis',
      'image-generation',
    ]),
  autoDiscovery: z.boolean().default(true),
  discoveryPaths: z.array(z.string()).default([]),
  loadTimeout: z.number().int().default(30000),
  enableMetrics: z.boolean().default(true),
  enableCaching: z.boolean().default(true),
  maxConcurrentTools: z.number().int().default(10),
  toolValidation: z.boolean().default(true),
  allowDynamicLoading: z.boolean().default(true),
  requireDocumentation: z.boolean().default(false),
  enforcePermissions: z.boolean().default(true),
  enableHotReload: z.boolean().default(false),
})

export type ToolPermission = z.infer<typeof ToolPermissionSchema>
export type ToolMetadata = z.infer<typeof ToolMetadataSchema>
export type ToolInstance = z.infer<typeof ToolInstanceSchema>
export type ToolRegistryConfig = z.infer<typeof ToolRegistryConfigSchema>

export interface ToolInterface {
  execute(...args: any[]): Promise<ToolExecutionResult>
  canHandle?(input: any): boolean
  validate?(input: any): boolean
  initialize?(): Promise<void>
  cleanup?(): Promise<void>
  getMetadata(): ToolMetadata
}

export class ToolRegistry {
  private static instance: ToolRegistry
  private tools: Map<string, ToolInstance> = new Map()
  private categories: Map<string, string[]> = new Map()
  private loadedTools: Set<string> = new Set()
  private config: ToolRegistryConfig
  private workingDirectory: string
  private contextSystem: ContextAwareRAGSystem
  private analyticsManager: AnalyticsManager
  private performanceOptimizer: PerformanceOptimizer
  private isInitialized = false

  // Resource cleanup tracking
  private sessions: Map<string, any> = new Map()
  private timers: Set<NodeJS.Timeout> = new Set()
  private intervals: Set<NodeJS.Timeout> = new Set()

  // LSP workspace insights cache with TTL (5 seconds)
  private workspaceInsightsCache: Map<
    string,
    {
      insights: any
      timestamp: number
    }
  > = new Map()
  private readonly LSP_CACHE_TTL = 5000 // 5 seconds

  // Sandbox approvals session cache - stores approved operations in current session
  // Format: "toolName:operation:target" -> approved boolean
  private sandboxApprovalCache: Set<string> = new Set()

  constructor(workingDirectory: string = process.cwd(), config: Partial<ToolRegistryConfig> = {}) {
    this.workingDirectory = workingDirectory
    this.config = ToolRegistryConfigSchema.parse(config)
    this.contextSystem = new ContextAwareRAGSystem(workingDirectory)
    this.analyticsManager = new AnalyticsManager(workingDirectory)
    this.performanceOptimizer = new PerformanceOptimizer()
  }

  static getInstance(workingDirectory?: string, config?: Partial<ToolRegistryConfig>): ToolRegistry {
    if (!ToolRegistry.instance && workingDirectory) {
      ToolRegistry.instance = new ToolRegistry(workingDirectory, config)
    }
    return ToolRegistry.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    advancedUI.logInfo('🔧 Initializing Tool Registry...')
    const startTime = Date.now()

    try {
      await this.registerBuiltInTools()

      if (this.config.autoDiscovery) {
        await this.discoverTools()
      }

      await this.validateTool(this.tools, this.config.toolValidation as any)
      await this.loadEssentialTools()

      this.isInitialized = true
      const loadTime = Date.now() - startTime

      advancedUI.logSuccess(`✓ Tool Registry initialized (${this.tools.size} tools, ${loadTime}ms)`)

      if (this.config.enableMetrics) {
        this.logRegistryStats()
      }
    } catch (error: any) {
      advancedUI.logError(`✖ Tool Registry initialization failed: ${error.message}`)
      throw error
    }
  }

  async registerTool(toolClass: any, metadata?: Partial<ToolMetadata>): Promise<string> {
    try {
      const instance = new toolClass(this.workingDirectory)
      let toolMetadata: ToolMetadata

      if (metadata) {
        toolMetadata = ToolMetadataSchema.parse({
          id: metadata.id || nanoid(),
          name: metadata.name || instance.constructor.name,
          description: metadata.description || 'No description provided',
          ...metadata,
        })
      } else if (instance.getMetadata && typeof instance.getMetadata === 'function') {
        toolMetadata = ToolMetadataSchema.parse(instance.getMetadata())
      } else {
        toolMetadata = ToolMetadataSchema.parse({
          id: nanoid(),
          name: instance.constructor.name,
          description: 'Auto-registered tool',
          category: 'utility',
        })
      }

      if (this.config.toolValidation) {
        await this.validateTool(instance, toolMetadata)
      }

      const toolInstance: ToolInstance = {
        metadata: toolMetadata,
        usageCount: 0,
        successRate: 1,
        averageExecutionTime: 0,
        errors: [],
        instance,
        isLoaded: true,
        isInitialized: false,
        loadTime: Date.now(),
      }

      this.tools.set(toolMetadata.id, toolInstance)
      this.addToCategory(toolMetadata.category, toolMetadata.id)
      this.loadedTools.add(toolMetadata.id)

      if (!process.env.NIKCLI_SUPPRESS_TOOL_REGISTER_LOGS && !process.env.NIKCLI_QUIET_STARTUP) {
      }
      return toolMetadata.id
    } catch (error: any) {
      advancedUI.logError(`✖ Failed to register tool: ${error.message}`)
      throw error
    }
  }

  async getTool(toolId: string): Promise<ToolInterface | null> {
    const toolInstance = this.tools.get(toolId)
    if (!toolInstance) return null

    if (!toolInstance.isInitialized && toolInstance.instance.initialize) {
      try {
        await toolInstance.instance.initialize()
        toolInstance.isInitialized = true
      } catch (error: any) {
        advancedUI.logWarning(`⚠︎  Tool initialization failed: ${toolInstance.metadata.name} - ${error.message}`)
      }
    }

    toolInstance.lastUsed = new Date()
    toolInstance.usageCount++

    return toolInstance.instance
  }

  async executeTool(toolId: string, ...args: any[]): Promise<ToolExecutionResult> {
    const sessionId = `tool-${toolId}-${Date.now()}`
    this.performanceOptimizer.startMonitoring()

    const toolInstance = this.tools.get(toolId)

    if (!toolInstance) {
      throw new Error(`Tool not found: ${toolId}`)
    }

    if (!toolInstance.metadata.isEnabled) {
      throw new Error(`Tool is disabled: ${toolInstance.metadata.name}`)
    }

    try {
      if (this.config.enforcePermissions) {
        await this.checkPermissions(toolInstance.metadata.permissions, toolInstance.metadata.name)
      }

      // LSP + Context Analysis before tool execution
      await this.performLSPContextAnalysis(toolInstance, args)

      const tool = await this.getTool(toolId)
      if (!tool) {
        throw new Error(`Failed to get tool instance: ${toolId}`)
      }

      // Execute tool with resource timeout enforcement
      const maxExecutionTime = toolInstance.metadata.permissions.maxExecutionTime
      const executionPromise = tool.execute(...args)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error(`Tool execution timeout after ${maxExecutionTime}ms`))
        }, maxExecutionTime)
      )

      const result = await Promise.race([executionPromise, timeoutPromise])

      // Type safety fix: ensure result matches ToolExecutionResult interface
      if (result && typeof result === 'object' && 'success' in result) {
        return result as ToolExecutionResult
      }

      // Fallback: wrap result in expected format

      // Performance monitoring
      const metrics = this.performanceOptimizer.endMonitoring(sessionId, {
        toolCallCount: 1,
        responseQuality: 100, // Tool execution is binary success
      })

      // Analytics tracking
      this.analyticsManager.trackToolCall(sessionId, toolInstance.metadata.name, true, metrics.processingTime)

      // Performance tracking
      this.analyticsManager.trackPerformance(sessionId, {
        tool: toolInstance.metadata.name,
        category: toolInstance.metadata.category,
        duration: metrics.processingTime,
        success: true,
      })

      // Record successful tool execution in context
      this.contextSystem.recordInteraction(
        `Tool execution: ${toolInstance.metadata.name}`,
        `Successfully executed ${toolInstance.metadata.name} tool`,
        [
          {
            type: 'execute_command',
            target: toolInstance.metadata.name,
            params: { args: args.map((a) => typeof a), executionTime: metrics.processingTime },
            result: 'success',
            duration: metrics.processingTime,
          },
        ]
      )

      this.updateToolMetrics(toolId, true, metrics.processingTime)
      return result as ToolExecutionResult
    } catch (error: any) {
      const metrics = this.performanceOptimizer.endMonitoring(sessionId, {
        toolCallCount: 1,
        responseQuality: 0,
      })

      // Analytics tracking for failures
      this.analyticsManager.trackToolCall(sessionId, toolInstance.metadata.name, false, metrics.processingTime)
      this.analyticsManager.trackEvent({
        eventType: 'error',
        sessionId,
        data: { tool: toolInstance.metadata.name, error: error.message, duration: metrics.processingTime },
      })

      this.updateToolMetrics(toolId, false, metrics.processingTime)
      toolInstance.errors.push(`${new Date().toISOString()}: ${error.message}`)

      // Record failed tool execution in context
      this.contextSystem.recordInteraction(
        `Tool execution failed: ${toolInstance.metadata.name}`,
        `Failed to execute ${toolInstance.metadata.name}: ${error.message}`,
        [
          {
            type: 'execute_command',
            target: toolInstance.metadata.name,
            params: { args: args.map((a) => typeof a), executionTime: metrics.processingTime },
            result: 'error',
            duration: metrics.processingTime,
          },
        ]
      )

      throw error
    }
  }

  getToolsByCategory(category: string): ToolInstance[] {
    const toolIds = this.categories.get(category) || []
    return toolIds.map((id) => this.tools.get(id)).filter(Boolean) as ToolInstance[]
  }

  getAvailableTools(): Map<string, ToolInstance> {
    return new Map([...this.tools.entries()].filter(([, tool]) => tool.metadata.isEnabled))
  }

  getAllTools(): Map<string, ToolInstance> {
    return new Map(this.tools.entries())
  }

  searchTools(query: string): ToolInstance[] {
    const searchTerm = query.toLowerCase()
    return Array.from(this.tools.values()).filter(
      (tool) =>
        tool.metadata.name.toLowerCase().includes(searchTerm) ||
        tool.metadata.description.toLowerCase().includes(searchTerm) ||
        tool.metadata.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
    )
  }

  async unregisterTool(toolId: string): Promise<boolean> {
    const toolInstance = this.tools.get(toolId)
    if (!toolInstance) return false

    try {
      if (toolInstance.instance.cleanup && typeof toolInstance.instance.cleanup === 'function') {
        await toolInstance.instance.cleanup()
      }

      this.tools.delete(toolId)
      this.loadedTools.delete(toolId)
      this.removeFromCategory(toolInstance.metadata.category, toolId)

      advancedUI.logInfo(`🗑️  Unregistered tool: ${toolInstance.metadata.name}`)
      return true
    } catch (error: any) {
      advancedUI.logError(`✖ Failed to unregister tool ${toolId}: ${error.message}`)
      return false
    }
  }

  async reloadTool(toolId: string): Promise<boolean> {
    const toolInstance = this.tools.get(toolId)
    if (!toolInstance || toolInstance.metadata.isBuiltIn) return false

    try {
      const metadata = toolInstance.metadata
      await this.unregisterTool(toolId)

      // TODO: Implement dynamic loading from file system
      advancedUI.logInfo(`⚡︎ Reloaded tool: ${metadata.name}`)
      return true
    } catch (error: any) {
      advancedUI.logError(`✖ Failed to reload tool ${toolId}: ${error.message}`)
      return false
    }
  }

  getRegistryStats() {
    const stats = {
      totalTools: this.tools.size,
      loadedTools: this.loadedTools.size,
      enabledTools: Array.from(this.tools.values()).filter((t) => t.metadata.isEnabled).length,
      categories: Object.fromEntries(this.categories.entries()),
      topTools: Array.from(this.tools.values())
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5)
        .map((t) => ({ name: t.metadata.name, usage: t.usageCount, successRate: t.successRate })),
    }

    return stats
  }

  updateConfig(newConfig: Partial<ToolRegistryConfig>): void {
    this.config = { ...this.config, ...newConfig }
    advancedUI.logInfo('🔧 Tool Registry configuration updated')
  }

  private async registerBuiltInTools(): Promise<void> {
    const _toolsDir = join(this.workingDirectory, 'src/cli/tools')

    try {
      const { WriteFileTool } = await import('../tools/write-file-tool')
      const { ReadFileTool } = await import('../tools/read-file-tool')

      await this.registerTool(WriteFileTool, {
        name: 'write-file',
        description: 'Write content to files with validation and backup',
        category: 'file-ops',
        capabilities: ['file-write', 'backup', 'validation'],
        permissions: {
          canReadFiles: true,
          canWriteFiles: true,
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
      })

      await this.registerTool(VisionAnalysisTool, {
        name: 'analyze-image',
        description: 'Analyze image with processing options',
        category: 'image-analysis',
        capabilities: ['image-analysis', 'processing'],
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
      })

      await this.registerTool(ImageGenerationTool, {
        name: 'generate-image',
        description: 'Generate image with processing options',
        category: 'image-generation',
        capabilities: ['image-generation', 'processing'],
        permissions: {
          canReadFiles: true,
          canWriteFiles: true,
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
      })

      await this.registerTool(ReadFileTool, {
        name: 'read-file',
        description: 'Read file contents with processing options',
        category: 'file-ops',
        capabilities: ['file-read', 'processing'],
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
      })
    } catch (error: any) {
      advancedUI.logWarning(`⚠︎  Some built-in tools failed to load: ${error.message}`)
    }
  }

  private async discoverTools(): Promise<void> {
    const discoveryPaths = [
      join(this.workingDirectory, 'src/cli/tools'),
      join(this.workingDirectory, 'plugins'),
      ...this.config.discoveryPaths,
    ]

    for (const discoveryPath of discoveryPaths) {
      try {
        await this.scanDirectory(discoveryPath)
      } catch (error: any) {
        structuredLogger.info(`Tool discovery failed for ${discoveryPath}: ${error.message}`, 'Tool discovery failed')
      }
    }
  }

  private async scanDirectory(dirPath: string): Promise<void> {
    try {
      const items = await readdir(dirPath)

      for (const item of items) {
        const itemPath = join(dirPath, item)
        const itemStat = await stat(itemPath)

        if (itemStat.isFile() && extname(item) === '.ts' && !item.includes('.spec.') && !item.includes('.test.')) {
          await this.loadToolFromFile(itemPath)
        }
      }
    } catch (_error) {
      // Directory doesn't exist or not accessible
    }
  }

  private async loadToolFromFile(filePath: string): Promise<void> {
    try {
      const module = await import(filePath)

      // Look for exported tool classes
      Object.values(module).forEach((exportedClass: any) => {
        if (typeof exportedClass === 'function' && exportedClass.prototype && exportedClass.prototype.execute) {
          // This looks like a tool class, try to register it
          this.registerTool(exportedClass).catch((error) => {
            structuredLogger.info(
              `Failed to auto-register tool from ${filePath}: ${error.message}`,
              'Failed to auto-register tool'
            )
          })
        }
      })
    } catch (error: any) {
      structuredLogger.info(`Failed to load tool from ${filePath}: ${error.message}`, 'Failed to load tool')
    }
  }

  private async validateTool(instance: any, metadata: ToolMetadata): Promise<void> {
    if (typeof instance.execute !== 'function') {
      throw new Error(`Tool ${metadata.name} must implement execute method`)
    }

    if (metadata.requiredCapabilities.length > 0) {
      const missingCapabilities = metadata.requiredCapabilities.filter((cap) => !metadata.capabilities.includes(cap))
      if (missingCapabilities.length > 0) {
        throw new Error(`Tool ${metadata.name} missing required capabilities: ${missingCapabilities.join(', ')}`)
      }
    }

    if (this.config.requireDocumentation && !metadata.documentation) {
      throw new Error(`Tool ${metadata.name} requires documentation`)
    }
  }

  private async loadEssentialTools(): Promise<void> {
    const essentialTools = Array.from(this.tools.values()).filter((tool) => tool.metadata.priority >= 90)

    for (const tool of essentialTools) {
      await this.getTool(tool.metadata.id)
    }
  }

  /**
   * Enhanced permission checking with session cache, config persistence, and user approval
   */
  private async checkPermissions(permissions: ToolPermission, toolName: string = 'unknown'): Promise<void> {
    // If permissions enforcement is disabled, skip all checks
    if (!this.config.enforcePermissions) {
      return
    }

    // Import here to avoid circular dependency
    const { approvalSystem } = await import('../ui/approval-system')
    const { simpleConfigManager } = await import('./config-manager')

    try {
      // Check for dangerous operations that require approval
      const needsApproval = this.detectDangerousOperations(permissions)

      if (needsApproval.type === 'none') {
        return // No dangerous operations detected
      }

      // Build approval key for caching
      const approvalKey = `${toolName}:${needsApproval.type}:${needsApproval.target}`

      // Check session cache first
      if (this.sandboxApprovalCache.has(approvalKey)) {
        return // Already approved in this session
      }

      // Check persistent config for cached approvals
      const config = simpleConfigManager.getAll()
      const cachedApproval = this.findCachedApproval(config.sandboxApprovals, needsApproval)

      if (cachedApproval && !this.isApprovalExpired(cachedApproval, config.sandboxApprovals.expirationDays)) {
        // Add to session cache to avoid re-checking
        this.sandboxApprovalCache.add(approvalKey)
        return // Approval is still valid
      }

      // Operation needs user approval
      // Type assertion needed due to dynamic import type inference limitation
      const approval = await (approvalSystem as any).requestSandboxApproval(
        toolName,
        needsApproval.type === 'path'
          ? 'path-access'
          : needsApproval.type === 'command'
            ? 'command-execution'
            : 'resource-limit',
        needsApproval.target,
        {
          reason: needsApproval.reason,
          riskLevel: needsApproval.riskLevel,
          path: needsApproval.type === 'path' ? needsApproval.target : undefined,
          command: needsApproval.type === 'command' ? needsApproval.target : undefined,
        }
      )

      if (!approval.approved) {
        throw new Error(`Sandbox Permission Denied: ${needsApproval.reason}`)
      }

      // Add to session cache to avoid re-asking in same session
      this.sandboxApprovalCache.add(approvalKey)

      // Save to persistent config if user chose "remember"
      if (approval.remember && config.sandboxApprovals.rememberChoices) {
        this.saveApprovalToConfig(config, simpleConfigManager, toolName, needsApproval.type, needsApproval.target)
      }
    } catch (error: any) {
      throw new Error(`Permission check failed: ${error.message}`)
    }
  }

  /**
   * Detect dangerous operations that require approval
   */
  private detectDangerousOperations(permissions: ToolPermission): {
    type: 'none' | 'path' | 'command' | 'resource'
    target: string
    reason: string
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  } {
    // Check forbidden paths
    if (permissions.forbiddenPaths && permissions.forbiddenPaths.length > 0 && permissions.canReadFiles) {
      return {
        type: 'path',
        target: permissions.forbiddenPaths[0],
        reason: `Access to forbidden path: ${permissions.forbiddenPaths[0]}`,
        riskLevel: 'high',
      }
    }

    // Check forbidden commands
    if (permissions.forbiddenCommands && permissions.forbiddenCommands.length > 0 && permissions.canExecuteCommands) {
      return {
        type: 'command',
        target: permissions.forbiddenCommands[0],
        reason: `Execution of forbidden command: ${permissions.forbiddenCommands[0]}`,
        riskLevel: 'critical',
      }
    }

    // Check for file deletion without explicit approval
    if (permissions.canDeleteFiles) {
      return {
        type: 'path',
        target: '*',
        reason: 'File deletion capability enabled',
        riskLevel: 'high',
      }
    }

    // Check for network access without explicit approval
    if (permissions.canAccessNetwork) {
      return {
        type: 'resource',
        target: 'network',
        reason: 'Network access capability enabled',
        riskLevel: 'medium',
      }
    }

    // Check for command execution without explicit approval
    if (permissions.canExecuteCommands) {
      return {
        type: 'command',
        target: 'shell',
        reason: 'Command execution capability enabled',
        riskLevel: 'high',
      }
    }

    return {
      type: 'none',
      target: '',
      reason: '',
      riskLevel: 'low',
    }
  }

  /**
   * Find cached approval in config
   */
  private findCachedApproval(
    sandboxApprovals: any,
    needsApproval: {
      type: string
      target: string
    }
  ): any | null {
    if (needsApproval.type === 'path') {
      return sandboxApprovals.approvedPaths.find((a: any) => a.path === needsApproval.target)
    }
    if (needsApproval.type === 'command') {
      return sandboxApprovals.approvedCommands.find((a: any) => a.command === needsApproval.target)
    }
    return null
  }

  /**
   * Check if approval has expired
   */
  private isApprovalExpired(approval: any, expirationDays: number): boolean {
    if (!approval.expiresAt) {
      return false // No expiration
    }
    const expiryDate = new Date(approval.expiresAt)
    return expiryDate < new Date()
  }

  /**
   * Save approval to persistent config
   */
  private saveApprovalToConfig(config: any, configManager: any, toolName: string, type: string, target: string): void {
    const now = new Date().toISOString()
    const expiryDate = new Date(Date.now() + config.sandboxApprovals.expirationDays * 24 * 60 * 60 * 1000).toISOString()

    if (type === 'path') {
      config.sandboxApprovals.approvedPaths.push({
        path: target,
        operation: 'read', // Default operation
        toolName,
        timestamp: now,
        expiresAt: expiryDate,
      })
    } else if (type === 'command') {
      config.sandboxApprovals.approvedCommands.push({
        command: target,
        toolName,
        timestamp: now,
        expiresAt: expiryDate,
      })
    }

    // Save to config file
    configManager.set('sandboxApprovals', config.sandboxApprovals)
  }

  private updateToolMetrics(toolId: string, success: boolean, executionTime: number): void {
    const toolInstance = this.tools.get(toolId)
    if (!toolInstance || !this.config.enableMetrics) return

    const totalExecutions = toolInstance.usageCount
    const successCount = Math.round(toolInstance.successRate * (totalExecutions - 1)) + (success ? 1 : 0)

    toolInstance.successRate = successCount / totalExecutions
    toolInstance.averageExecutionTime =
      (toolInstance.averageExecutionTime * (totalExecutions - 1) + executionTime) / totalExecutions
  }

  private addToCategory(category: string, toolId: string): void {
    if (!this.categories.has(category)) {
      this.categories.set(category, [])
    }
    this.categories.get(category)?.push(toolId)
  }

  private removeFromCategory(category: string, toolId: string): void {
    const categoryTools = this.categories.get(category)
    if (categoryTools) {
      const index = categoryTools.indexOf(toolId)
      if (index > -1) {
        categoryTools.splice(index, 1)
      }
    }
  }

  private logRegistryStats(): void {
    const stats = this.getRegistryStats()

    advancedUI.logInfo(`📊 Tool Registry Statistics:`)
    console.log(chalk.cyan(`   Total Tools: ${stats.totalTools}`))
    console.log(chalk.cyan(`   Loaded: ${stats.loadedTools}`))
    console.log(chalk.cyan(`   Enabled: ${stats.enabledTools}`))
    console.log(chalk.cyan(`   Categories: ${Object.keys(stats.categories).length}`))

    if (stats.topTools.length > 0) {
      console.log(chalk.cyan(`   Top Tools:`))
      stats.topTools.forEach((tool) => {
        console.log(
          chalk.gray(`     ${tool.name}: ${tool.usage} uses (${(tool.successRate * 100).toFixed(1)}% success)`)
        )
      })
    }
  }

  private async getWorkspaceInsights(directory: string): Promise<any> {
    // Check cache first (TTL: 5 seconds)
    const cached = this.workspaceInsightsCache.get(directory)
    if (cached && Date.now() - cached.timestamp < this.LSP_CACHE_TTL) {
      return cached.insights
    }

    // Fetch fresh insights
    const insights = await lspManager.getWorkspaceInsights(directory)

    // Store in cache
    this.workspaceInsightsCache.set(directory, {
      insights,
      timestamp: Date.now(),
    })

    return insights
  }

  private async performLSPContextAnalysis(toolInstance: ToolInstance, args: any[]): Promise<void> {
    try {
      // Get workspace insights for better tool execution context (using cache)
      const insights = await this.getWorkspaceInsights(this.workingDirectory)

      if (insights.diagnostics.errors > 0) {
        advancedUI.logWarning(
          `⚠︎  LSP found ${insights.diagnostics.errors} errors before ${toolInstance.metadata.name} execution`
        )
      }

      // Record tool usage pattern in context for learning
      this.contextSystem.recordInteraction(
        `Preparing ${toolInstance.metadata.name} execution`,
        `Pre-execution analysis for ${toolInstance.metadata.name} tool`,
        [
          {
            type: 'execute_command',
            target: toolInstance.metadata.name,
            params: {
              category: toolInstance.metadata.category,
              capabilities: toolInstance.metadata.capabilities,
              argsCount: args.length,
            },
            result: 'prepared',
            duration: 0,
          },
        ]
      )
    } catch (error: any) {
      // Non-critical error, log but don't block execution
      structuredLogger.info(
        `LSP/Context analysis failed for ${toolInstance.metadata.name}: ${error.message}`,
        'LSP/Context analysis failed'
      )
    }
  }

  /**
   * Register a session for cleanup tracking
   */
  registerSession(id: string, session: any): void {
    this.sessions.set(id, session)
  }

  /**
   * Register a timer for cleanup tracking
   */
  registerTimer(timer: NodeJS.Timeout): void {
    this.timers.add(timer)
  }

  /**
   * Register an interval for cleanup tracking
   */
  registerInterval(interval: NodeJS.Timeout): void {
    this.intervals.add(interval)
  }

  /**
   * Cleanup all resources and tools
   */
  async cleanup(): Promise<void> {
    advancedUI.logInfo('🧹 Cleaning up tool registry resources...')

    // Cleanup all registered tools
    for (const [name, tool] of this.tools.entries()) {
      try {
        if (tool.instance && typeof tool.instance.cleanup === 'function') {
          await tool.instance.cleanup()
        }
        advancedUI.logSuccess(`✓ Cleaned up tool: ${name}`)
      } catch (error: any) {
        advancedUI.logError(`⚠︎ Failed to cleanup tool ${name}: ${error.message}`)
      }
    }
    this.tools.clear()
    this.categories.clear()
    this.loadedTools.clear()

    // Close all sessions
    for (const [id, session] of this.sessions.entries()) {
      try {
        if (session && typeof session.close === 'function') {
          await session.close()
        } else if (session && typeof session.end === 'function') {
          await session.end()
        }
        advancedUI.logSuccess(`✓ Closed session: ${id}`)
      } catch (error: any) {
        advancedUI.logError(`⚠︎ Failed to close session ${id}: ${error.message}`)
      }
    }
    this.sessions.clear()

    // Clear all timers and intervals
    for (const timer of this.timers) {
      clearTimeout(timer)
    }
    this.timers.clear()

    for (const interval of this.intervals) {
      clearInterval(interval)
    }
    this.intervals.clear()

    // Cleanup subsystems
    try {
      if (this.contextSystem && typeof this.contextSystem.clearMemory === 'function') {
        ; async () => this.contextSystem.clearMemory()
        return
      }
      if (this.analyticsManager && typeof this.analyticsManager.getSummary === 'function') {
        ; async () => this.analyticsManager.getSummary()
        return
      }
    } catch (error: any) {
      advancedUI.logError(`⚠︎ Error cleaning up subsystems: ${error.message}`)
    }

    this.isInitialized = false
    advancedUI.logSuccess('✓ Tool registry cleanup completed')
  }
}

export const toolRegistry = ToolRegistry.getInstance()

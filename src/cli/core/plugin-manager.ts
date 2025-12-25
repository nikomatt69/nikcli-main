import { EventEmitter } from 'node:events'
import { type CoreTool, tool } from 'ai'
import type { z } from 'zod'
import type { ToolRegistry } from '../tools/tool-registry'
import {
  type PluginAgentDefinition,
  type PluginAgentRegistry,
  type PluginConfigStore,
  type PluginContext,
  PluginErrorCode,
  type PluginEventEmitter,
  PluginHealth,
  PluginHookContext,
  type PluginInstance,
  type PluginLifecycleHooks,
  type PluginLogger,
  type PluginManifest,
  PluginMetadata,
  type PluginResolutionResult,
  PluginState,
  type PluginToolDefinition,
  type PluginToolRegistry,
} from '../types/plugin-types'
import type { Agent } from '../types/types'
import type { AgentManager } from './agent-manager'
import { PluginContextImpl } from './plugin-context'
import { createPluginRegistry, PluginManifestSchema, type PluginRegistry } from './plugin-registry'

export interface PluginLoadOptions {
  autoActivate?: boolean
  config?: Record<string, unknown>
  validatePermissions?: boolean
}

export interface PluginStats {
  totalPlugins: number
  activePlugins: number
  loadedPlugins: number
  errorPlugins: number
  totalTools: number
  totalAgents: number
}

/**
 * Default logger for plugins
 */
function createDefaultLogger(prefix: string): PluginLogger {
  return {
    debug: (message: string, ...args: unknown[]) => {
      console.debug(`${prefix} [DEBUG] ${message}`, ...args)
    },
    info: (message: string, ...args: unknown[]) => {
      console.info(`${prefix} [INFO] ${message}`, ...args)
    },
    warn: (message: string, ...args: unknown[]) => {
      console.warn(`${prefix} [WARN] ${message}`, ...args)
    },
    error: (message: string, error?: Error, ...args: unknown[]) => {
      console.error(`${prefix} [ERROR] ${message}`, error, ...args)
    },
  }
}

/**
 * Default config store
 */
function createDefaultConfigStore(initialConfig: Record<string, unknown> = {}): PluginConfigStore {
  const config = { ...initialConfig }
  return {
    get: <T = unknown>(key: string): T | undefined => config[key] as T | undefined,
    set: (key: string, value: unknown): void => {
      config[key] = value
    },
    delete: (key: string): void => {
      delete config[key]
    },
    has: (key: string): boolean => key in config,
    all: (): Record<string, unknown> => ({ ...config }),
  }
}

/**
 * Default event emitter
 */
function createDefaultEventEmitter(): PluginEventEmitter {
  const emitter = new EventEmitter()
  return {
    on: (event: string, handler: (...args: unknown[]) => void): void => {
      emitter.on(event, handler)
    },
    off: (event: string, handler: (...args: unknown[]) => void): void => {
      emitter.off(event, handler)
    },
    emit: (event: string, ...args: unknown[]): void => {
      emitter.emit(event, ...args)
    },
    once: (event: string, handler: (...args: unknown[]) => void): void => {
      emitter.once(event, handler)
    },
  }
}

/**
 * Default tool registry for plugins
 */
function createDefaultToolRegistry(): PluginToolRegistry {
  const tools = new Map<
    string,
    {
      description: string
      schema: z.ZodTypeAny
      execute: (args: unknown, context: PluginContext) => Promise<unknown>
      dangerous?: boolean
    }
  >()

  return {
    register: (
      name: string,
      tool: {
        description: string
        schema: z.ZodTypeAny
        execute: (args: unknown, context: PluginContext) => Promise<unknown>
        dangerous?: boolean
      }
    ): void => {
      tools.set(name, tool)
    },
    unregister: (name: string): void => {
      tools.delete(name)
    },
    get: (name: string) => tools.get(name),
    list: (): string[] => Array.from(tools.keys()),
  }
}

/**
 * Default agent registry for plugins
 */
function createDefaultAgentRegistry(): PluginAgentRegistry {
  const agents = new Map<string, Agent>()

  return {
    register: (agent: Agent): void => {
      agents.set(agent.id, agent)
    },
    unregister: (agentId: string): void => {
      agents.delete(agentId)
    },
    get: (agentId: string) => agents.get(agentId),
    list: (): string[] => Array.from(agents.keys()),
  }
}

/**
 * NikCLI Plugin Manager - handles plugin lifecycle, registration, and execution
 */
export class PluginManager extends EventEmitter {
  private plugins: Map<string, PluginInstance> = new Map()
  private registry: PluginRegistry
  private toolRegistry?: ToolRegistry
  private agentManager?: AgentManager
  private pluginContexts: Map<string, PluginContext> = new Map()
  private pluginTools: Map<string, Map<string, PluginToolDefinition>> = new Map()
  private pluginAgents: Map<string, Map<string, PluginAgentDefinition>> = new Map()

  constructor(
    options: {
      searchPaths?: string[]
      toolRegistry?: ToolRegistry
      agentManager?: AgentManager
    } = {}
  ) {
    super()
    this.registry = createPluginRegistry(options.searchPaths)
    this.toolRegistry = options.toolRegistry
    this.agentManager = options.agentManager
  }

  /**
   * Set the tool registry for plugin tool integration
   */
  setToolRegistry(toolRegistry: ToolRegistry): void {
    this.toolRegistry = toolRegistry
  }

  /**
   * Set the agent manager for plugin agent integration
   */
  setAgentManager(agentManager: AgentManager): void {
    this.agentManager = agentManager
  }

  /**
   * Discover plugins in configured search paths
   */
  async discoverPlugins(): Promise<PluginResolutionResult[]> {
    return this.registry.discoverPlugins()
  }

  /**
   * Load a plugin from a path
   */
  async loadPlugin(pluginPath: string, options: PluginLoadOptions = {}): Promise<PluginInstance | null> {
    try {
      // Check if already loaded
      const manifest = await this.registry.loadManifest(pluginPath)
      if (!manifest) {
        console.error(`[PluginManager] Failed to load manifest: ${pluginPath}`)
        return null
      }

      const pluginId = manifest.metadata.id
      if (this.plugins.has(pluginId)) {
        console.warn(`[PluginManager] Plugin already loaded: ${pluginId}`)
        return this.plugins.get(pluginId)!
      }

      // Create plugin instance
      const instance: PluginInstance = {
        manifest,
        state: PluginState.LOADED,
        health: PluginHealth.HEALTHY,
        loadedAt: new Date(),
        config: options.config || {},
        registeredTools: [],
        registeredAgents: [],
        metrics: {
          executionCount: 0,
          totalExecutionTime: 0,
          averageExecutionTime: 0,
          errorCount: 0,
        },
        path: pluginPath,
        builtin: false,
      }

      // Create plugin context
      const context = this.createPluginContext(manifest, instance)
      this.pluginContexts.set(pluginId, context)

      // Execute onLoad hook
      if (manifest.hooks?.onLoad) {
        try {
          await manifest.hooks.onLoad(context)
        } catch (error) {
          console.error(`[PluginManager] onLoad hook failed: ${pluginId}`, error)
          instance.health = PluginHealth.DEGRADED
        }
      }

      // Store plugin
      this.plugins.set(pluginId, instance)

      // Emit event
      this.emit('plugin:loaded', { pluginId, instance })

      // Auto-activate if requested
      if (options.autoActivate) {
        await this.activatePlugin(pluginId)
      }

      console.log(`[PluginManager] Plugin loaded: ${pluginId} v${manifest.metadata.version}`)
      return instance
    } catch (error) {
      console.error(`[PluginManager] Failed to load plugin: ${pluginPath}`, error)
      return null
    }
  }

  /**
   * Activate a plugin
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      console.error(`[PluginManager] Plugin not found: ${pluginId}`)
      return false
    }

    if (instance.state === PluginState.ACTIVE) {
      console.warn(`[PluginManager] Plugin already active: ${pluginId}`)
      return true
    }

    try {
      instance.state = PluginState.INITIALIZED

      const context = this.pluginContexts.get(pluginId)
      if (!context) {
        throw new Error('Plugin context not found')
      }

      // Execute onInit hook
      if (instance.manifest.hooks?.onInit) {
        await instance.manifest.hooks.onInit(context)
      }

      // Register tools
      if (instance.manifest.tools) {
        await this.registerPluginTools(pluginId, instance.manifest.tools, context)
      }

      // Register agents
      if (instance.manifest.agents) {
        await this.registerPluginAgents(pluginId, instance.manifest.agents, context)
      }

      // Execute onActivate hook
      if (instance.manifest.hooks?.onBeforeActivate) {
        await instance.manifest.hooks.onBeforeActivate(context)
      }

      instance.state = PluginState.ACTIVE
      instance.activatedAt = new Date()

      if (instance.manifest.hooks?.onActivate) {
        await instance.manifest.hooks.onActivate(context)
      }

      // Emit event
      this.emit('plugin:activated', { pluginId, instance })

      console.log(`[PluginManager] Plugin activated: ${pluginId}`)
      return true
    } catch (error) {
      console.error(`[PluginManager] Failed to activate plugin: ${pluginId}`, error)
      instance.state = PluginState.ERROR
      instance.health = PluginHealth.UNHEALTHY
      instance.lastError = {
        error: error as Error,
        timestamp: new Date(),
        context: 'activate',
      }
      return false
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      return false
    }

    if (instance.state !== PluginState.ACTIVE) {
      return true
    }

    try {
      const context = this.pluginContexts.get(pluginId)

      if (instance.manifest.hooks?.onBeforeDeactivate && context) {
        await instance.manifest.hooks.onBeforeDeactivate(context)
      }

      // Unregister tools
      await this.unregisterPluginTools(pluginId)

      // Unregister agents
      await this.unregisterPluginAgents(pluginId)

      if (instance.manifest.hooks?.onDeactivate && context) {
        await instance.manifest.hooks.onDeactivate(context)
      }

      instance.state = PluginState.DEACTIVATED
      instance.deactivatedAt = new Date()

      if (instance.manifest.hooks?.onDeactivate && context) {
        await instance.manifest.hooks.onDeactivate(context)
      }

      // Emit event
      this.emit('plugin:deactivated', { pluginId, instance })

      console.log(`[PluginManager] Plugin deactivated: ${pluginId}`)
      return true
    } catch (error) {
      console.error(`[PluginManager] Failed to deactivate plugin: ${pluginId}`, error)
      return false
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      return false
    }

    try {
      // Deactivate first
      await this.deactivatePlugin(pluginId)

      const context = this.pluginContexts.get(pluginId)

      // Execute onUnload hook
      if (instance.manifest.hooks?.onUnload && context) {
        await instance.manifest.hooks.onUnload(context)
      }

      // Remove from registry
      this.plugins.delete(pluginId)
      this.pluginContexts.delete(pluginId)
      this.pluginTools.delete(pluginId)
      this.pluginAgents.delete(pluginId)

      // Emit event
      this.emit('plugin:unloaded', { pluginId })

      console.log(`[PluginManager] Plugin unloaded: ${pluginId}`)
      return true
    } catch (error) {
      console.error(`[PluginManager] Failed to unload plugin: ${pluginId}`, error)
      return false
    }
  }

  /**
   * Reload a plugin
   */
  async reloadPlugin(pluginId: string): Promise<boolean> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      return false
    }

    const pluginPath = instance.path

    // Unload
    await this.unloadPlugin(pluginId)

    // Reload
    return (await this.loadPlugin(pluginPath, { autoActivate: true })) !== null
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Get all plugins
   */
  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Get plugins by state
   */
  getPluginsByState(state: PluginState): PluginInstance[] {
    return this.getAllPlugins().filter((p) => p.state === state)
  }

  /**
   * Get active plugins
   */
  getActivePlugins(): PluginInstance[] {
    return this.getPluginsByState(PluginState.ACTIVE)
  }

  /**
   * Get plugin stats
   */
  getStats(): PluginStats {
    const plugins = this.getAllPlugins()
    return {
      totalPlugins: plugins.length,
      activePlugins: plugins.filter((p) => p.state === PluginState.ACTIVE).length,
      loadedPlugins: plugins.filter((p) => p.state === PluginState.LOADED).length,
      errorPlugins: plugins.filter((p) => p.state === PluginState.ERROR).length,
      totalTools: plugins.reduce((sum, p) => sum + p.registeredTools.length, 0),
      totalAgents: plugins.reduce((sum, p) => sum + p.registeredAgents.length, 0),
    }
  }

  /**
   * Get all plugin tools as CoreTool format for AI providers
   */
  getAllPluginTools(): Record<string, CoreTool> {
    const tools: Record<string, CoreTool> = {}

    for (const [pluginId, instance] of this.plugins) {
      if (instance.state !== PluginState.ACTIVE) continue

      const context = this.pluginContexts.get(pluginId)
      if (!context) continue

      const pluginToolNames = context.tools.list()
      for (const toolName of pluginToolNames) {
        const toolDef = context.tools.get(toolName)
        if (!toolDef) continue

        const fullName = `${pluginId}_${toolName}`
        tools[fullName] = tool({
          description: toolDef.description,
          parameters: toolDef.schema as any,
          execute: async (args: Record<string, unknown>, { signal }: { signal?: AbortSignal } = {}) => {
            try {
              const ctx = this.createExecutionContext(pluginId, args, signal)
              return await toolDef.execute(args, ctx)
            } catch (error) {
              console.error(`[PluginManager] Tool execution failed: ${fullName}`, error)
              throw error
            }
          },
        })
      }
    }

    return tools
  }

  /**
   * Get tool names from all active plugins
   */
  getAllPluginToolNames(): string[] {
    const names: string[] = []

    for (const [pluginId, instance] of this.plugins) {
      if (instance.state !== PluginState.ACTIVE) continue

      const context = this.pluginContexts.get(pluginId)
      if (!context) continue

      for (const toolName of context.tools.list()) {
        names.push(`${pluginId}_${toolName}`)
      }
    }

    return names
  }

  /**
   * Discover and load all plugins from configured paths
   */
  async discoverAndLoadPlugins(options: PluginLoadOptions = {}): Promise<void> {
    console.log('[PluginManager] Discovering plugins...')
    const results = await this.discoverPlugins()

    for (const result of results) {
      if (!result.valid) {
        console.warn(`[PluginManager] Invalid plugin: ${result.id} - ${result.validationErrors?.join(', ')}`)
        continue
      }

      await this.loadPlugin(result.path, options)
    }

    console.log(`[PluginManager] Discovered ${results.length} plugins`)
  }

  /**
   * Create execution context for tool execution
   */
  private createExecutionContext(pluginId: string, args: Record<string, unknown>, signal?: AbortSignal): PluginContext {
    const instance = this.plugins.get(pluginId)
    const context = this.pluginContexts.get(pluginId)
    if (!instance || !context) {
      throw new Error(`Plugin context not found: ${pluginId}`)
    }

    return {
      ...context,
      config: {
        ...context.config,
        get: <T = unknown>(key: string) => args[key] as T | undefined,
        set: (key: string, value: unknown) => {
          args[key] = value
        },
      },
    }
  }

  /**
   * Create plugin context
   */
  private createPluginContext(manifest: PluginManifest, instance: PluginInstance): PluginContext {
    const pluginTools = createDefaultToolRegistry()
    const pluginAgents = createDefaultAgentRegistry()
    const events = createDefaultEventEmitter()
    const logger = createDefaultLogger(`[${manifest.metadata.id}]`)
    const config = createDefaultConfigStore(instance.config)

    // Sanitize environment variables (filter out undefined values)
    const sanitizedEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        sanitizedEnv[key] = value
      }
    }

    // Store local registries for this plugin
    this.pluginTools.set(manifest.metadata.id, new Map())
    this.pluginAgents.set(manifest.metadata.id, new Map())

    return new PluginContextImpl(manifest, instance, {
      cwd: process.cwd(),
      env: sanitizedEnv,
      logger,
      config,
      tools: pluginTools,
      agents: pluginAgents,
      events,
      registerHook: (hook, handler) => {
        if (!instance.manifest.hooks) {
          instance.manifest.hooks = {}
        }
        ;(instance.manifest.hooks as PluginLifecycleHooks)[hook] = handler
      },
    })
  }

  /**
   * Register plugin tools
   */
  private async registerPluginTools(
    pluginId: string,
    tools: PluginToolDefinition[],
    context: PluginContext
  ): Promise<void> {
    const toolMap = this.pluginTools.get(pluginId) || new Map()

    for (const toolDef of tools) {
      const fullName = `${pluginId}_${toolDef.name}`

      // Store tool definition
      toolMap.set(toolDef.name, toolDef)

      // Register with tool registry if available
      if (this.toolRegistry) {
        // Tools are registered via the plugin context
        context.tools.register(toolDef.name, {
          description: toolDef.description,
          schema: toolDef.inputSchema,
          execute: async (args, ctx) => {
            const startTime = Date.now()
            try {
              const result = await toolDef.handler(args, ctx)
              const executionTime = Date.now() - startTime
              this.updateMetrics(pluginId, executionTime, false)
              return result
            } catch (error) {
              const executionTime = Date.now() - startTime
              this.updateMetrics(pluginId, executionTime, true)
              throw error
            }
          },
          dangerous: toolDef.dangerous,
        })
      }
    }

    this.pluginTools.set(pluginId, toolMap)
    console.log(`[PluginManager] Registered ${tools.length} tools for plugin: ${pluginId}`)
  }

  /**
   * Unregister plugin tools
   */
  private async unregisterPluginTools(pluginId: string): Promise<void> {
    const toolMap = this.pluginTools.get(pluginId)
    if (toolMap) {
      for (const toolName of toolMap.keys()) {
        const fullName = `${pluginId}_${toolName}`
        // Tool unregistration is handled by the context
      }
      this.pluginTools.delete(pluginId)
    }
  }

  /**
   * Register plugin agents
   */
  private async registerPluginAgents(
    pluginId: string,
    agents: PluginAgentDefinition[],
    context: PluginContext
  ): Promise<void> {
    const agentMap = this.pluginAgents.get(pluginId) || new Map()

    for (const agentDef of agents) {
      // Store agent definition
      agentMap.set(agentDef.type, agentDef)

      // Register with agent manager if available and has initialize
      if (this.agentManager && agentDef.initialize) {
        try {
          const agent = await agentDef.initialize(context)
          await this.agentManager.registerAgent(agent)
        } catch (error) {
          console.error(`[PluginManager] Failed to initialize agent: ${agentDef.type}`, error)
        }
      }
    }

    this.pluginAgents.set(pluginId, agentMap)
    console.log(`[PluginManager] Registered ${agents.length} agents for plugin: ${pluginId}`)
  }

  /**
   * Unregister plugin agents
   */
  private async unregisterPluginAgents(pluginId: string): Promise<void> {
    const agentMap = this.pluginAgents.get(pluginId)
    if (agentMap) {
      this.pluginAgents.delete(pluginId)
    }
  }

  /**
   * Update plugin metrics
   */
  private updateMetrics(pluginId: string, executionTime: number, isError: boolean): void {
    const instance = this.plugins.get(pluginId)
    if (instance) {
      instance.metrics.executionCount++
      instance.metrics.totalExecutionTime += executionTime
      instance.metrics.averageExecutionTime = instance.metrics.totalExecutionTime / instance.metrics.executionCount
      if (isError) {
        instance.metrics.errorCount++
      }
      instance.metrics.lastExecutionTime = new Date()
    }
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    console.log('[PluginManager] Shutting down all plugins...')

    for (const [pluginId] of this.plugins) {
      await this.unloadPlugin(pluginId)
    }

    this.plugins.clear()
    this.pluginContexts.clear()
    this.pluginTools.clear()
    this.pluginAgents.clear()

    console.log('[PluginManager] All plugins unloaded')
  }
}

/**
 * Create the default plugin manager
 */
export function createPluginManager(options?: ConstructorParameters<typeof PluginManager>[0]): PluginManager {
  return new PluginManager(options)
}

// Singleton instance for easy access
let singletonPluginManager: PluginManager | null = null

export function getPluginManager(): PluginManager {
  if (!singletonPluginManager) {
    singletonPluginManager = new PluginManager()
  }
  return singletonPluginManager
}

export const pluginManager: PluginManager = getPluginManager()

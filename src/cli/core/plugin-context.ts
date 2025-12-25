import { EventEmitter } from 'node:events'
import type {
  PluginAgentRegistry,
  PluginConfigStore,
  PluginContext,
  PluginEventEmitter,
  PluginHookContext,
  PluginInstance,
  PluginLifecycleHooks,
  PluginLogger,
  PluginManifest,
  PluginToolRegistry,
} from '../types/plugin-types'
import type { Agent } from '../types/types'

export class PluginContextImpl implements PluginContext, PluginHookContext {
  public readonly manifest: PluginManifest
  public readonly instance: PluginInstance
  public readonly plugin: PluginInstance
  public readonly cwd: string
  public readonly env: Record<string, string>
  public readonly logger: PluginLogger
  public readonly config: PluginConfigStore
  public readonly tools: PluginToolRegistry
  public readonly agents: PluginAgentRegistry
  public readonly events: PluginEventEmitter
  public readonly registerHook: <K extends keyof PluginLifecycleHooks>(
    hook: K,
    handler: PluginLifecycleHooks[K]
  ) => void

  constructor(
    manifest: PluginManifest,
    instance: PluginInstance,
    options: {
      cwd?: string
      env?: Record<string, string>
      logger?: PluginLogger
      config?: PluginConfigStore
      tools?: PluginToolRegistry
      agents?: PluginAgentRegistry
      events?: PluginEventEmitter
      registerHook?: <K extends keyof PluginLifecycleHooks>(hook: K, handler: PluginLifecycleHooks[K]) => void
    } = {}
  ) {
    this.manifest = manifest
    this.instance = instance
    this.plugin = instance
    this.cwd = options.cwd || process.cwd()
    this.env = options.env || this.sanitizeEnv()
    this.logger = options.logger || this.createDefaultLogger()
    this.config = options.config || this.createDefaultConfigStore()
    this.tools = options.tools || this.createDefaultToolRegistry()
    this.agents = options.agents || this.createDefaultAgentRegistry()
    this.events = options.events || new EventEmitter()
    this.registerHook = options.registerHook || (() => {})
  }

  private sanitizeEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value
      }
    }
    return env
  }

  private createDefaultLogger(): PluginLogger {
    const prefix = `[${this.manifest.metadata.id}]`
    return {
      debug: (message: string, ...args: unknown[]) => {
        console.debug(`${prefix} ${message}`, ...args)
      },
      info: (message: string, ...args: unknown[]) => {
        console.info(`${prefix} ${message}`, ...args)
      },
      warn: (message: string, ...args: unknown[]) => {
        console.warn(`${prefix} ${message}`, ...args)
      },
      error: (message: string, error?: Error, ...args: unknown[]) => {
        console.error(`${prefix} ${message}`, error, ...args)
      },
    }
  }

  private createDefaultConfigStore(): PluginConfigStore {
    const store: Record<string, unknown> = { ...this.instance.config }
    return {
      get: <T = unknown>(key: string): T | undefined => {
        return store[key] as T | undefined
      },
      set: (key: string, value: unknown): void => {
        store[key] = value
        this.instance.config[key] = value
      },
      delete: (key: string): void => {
        delete store[key]
        delete this.instance.config[key]
      },
      has: (key: string): boolean => {
        return key in store
      },
      all: (): Record<string, unknown> => {
        return { ...store }
      },
    }
  }

  private createDefaultToolRegistry(): PluginToolRegistry {
    const tools = new Map<
      string,
      {
        description: string
        schema: unknown
        execute: (args: unknown, context: PluginContext) => Promise<unknown>
        dangerous?: boolean
      }
    >()

    return {
      register: (
        name: string,
        tool: {
          description: string
          schema: unknown
          execute: (args: unknown, context: PluginContext) => Promise<unknown>
          dangerous?: boolean
        }
      ): void => {
        tools.set(name, tool)
      },
      unregister: (name: string): void => {
        tools.delete(name)
      },
      get: (name: string) => {
        return tools.get(name) as PluginToolRegistry['get'] extends (k: string) => infer R ? R : never
      },
      list: (): string[] => {
        return Array.from(tools.keys())
      },
    }
  }

  private createDefaultAgentRegistry(): PluginAgentRegistry {
    const agents = new Map<string, unknown>()

    return {
      register: (agent: unknown): void => {
        const agentWithId = agent as { id: string }
        agents.set(agentWithId.id, agent)
      },
      unregister: (agentId: string): void => {
        agents.delete(agentId)
      },
      get: (agentId: string) => {
        return agents.get(agentId) as Agent | undefined
      },
      list: (): string[] => {
        return Array.from(agents.keys())
      },
    }
  }
}

/**
 * Factory function to create a plugin context
 */
export function createPluginContext(
  manifest: PluginManifest,
  instance: PluginInstance,
  overrides?: Partial<PluginContext>
): PluginContext {
  return new PluginContextImpl(manifest, instance, overrides)
}

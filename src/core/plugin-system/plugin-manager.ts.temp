import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import * as semver from 'semver';
import {
  type PluginManifest,
  type PluginInstance,
  type PluginLoadOptions,
  type PluginDiscoveryOptions,
  type PluginResolutionResult,
  type PluginSystemConfig,
  type PluginSystemStats,
  type PluginHookContext,
  type PluginLogger,
  type PluginConfigStore,
  type PluginEventEmitter,
  type PluginPermissions,
  PluginState,
  PluginHealth,
  PluginError,
  PluginErrorCode,
} from './types';
import { Logger } from '../logger';
import { toolService } from '../tool-service';
import { AgentManager } from '../agent-manager';

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Zod schema for validating plugin manifests
 */
const PluginManifestSchema = z.object({
  metadata: z.object({
    id: z.string().min(1, 'Plugin ID is required'),
    name: z.string().min(1, 'Plugin name is required'),
    description: z.string().min(1, 'Plugin description is required'),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'Version must follow semver'),
    minNikCLIVersion: z.string().optional(),
    maxNikCLIVersion: z.string().optional(),
    author: z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      url: z.string().url().optional(),
    }),
    license: z.string().min(1),
    repository: z
      .object({
        type: z.enum(['git', 'hg', 'svn']),
        url: z.string().url(),
        directory: z.string().optional(),
      })
      .optional(),
    homepage: z.string().url().optional(),
    keywords: z.array(z.string()).optional(),
    category: z.enum([
      'tool',
      'agent',
      'ui',
      'integration',
      'middleware',
      'other',
    ]),
    dependencies: z
      .array(
        z.object({
          id: z.string(),
          version: z.string().optional(),
          optional: z.boolean().optional(),
          reason: z.string().optional(),
        }),
      )
      .optional(),
    incompatibilities: z.array(z.string()).optional(),
    icon: z.string().optional(),
  }),
  main: z.string().min(1, 'Entry point is required'),
  permissions: z
    .object({
      filesystem: z
        .object({
          read: z.array(z.string()).optional(),
          write: z.array(z.string()).optional(),
          exec: z.array(z.string()).optional(),
        })
        .optional(),
      network: z
        .object({
          domains: z.array(z.string()).optional(),
          ports: z.array(z.number()).optional(),
          protocols: z
            .array(z.enum(['http', 'https', 'ws', 'wss', 'tcp', 'udp']))
            .optional(),
        })
        .optional(),
      env: z
        .object({
          read: z.array(z.string()).optional(),
          write: z.array(z.string()).optional(),
        })
        .optional(),
      tools: z
        .object({
          allowed: z.array(z.string()).optional(),
          blocked: z.array(z.string()).optional(),
        })
        .optional(),
      agents: z
        .object({
          allowed: z.array(z.string()).optional(),
          blocked: z.array(z.string()).optional(),
        })
        .optional(),
      system: z
        .object({
          allowProcesses: z.boolean().optional(),
          allowNotifications: z.boolean().optional(),
          allowClipboard: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  config: z
    .array(
      z.object({
        key: z.string().min(1),
        type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
        default: z.any().optional(),
        schema: z.any().optional(),
        required: z.boolean().optional(),
        description: z.string().optional(),
        example: z.any().optional(),
        envVar: z.string().optional(),
        mutable: z.boolean().optional(),
      }),
    )
    .optional(),
  hooks: z
    .object({
      onLoad: z.function().optional(),
      onInit: z.function().optional(),
      onBeforeActivate: z.function().optional(),
      onActivate: z.function().optional(),
      onBeforeDeactivate: z.function().optional(),
      onDeactivate: z.function().optional(),
      onConfigChange: z.function().optional(),
      onPluginChange: z.function().optional(),
      onBeforeUnload: z.function().optional(),
      onUnload: z.function().optional(),
      onError: z.function().optional(),
    })
    .optional(),
  tools: z.array(z.any()).optional(),
  agents: z.array(z.any()).optional(),
  ui: z.array(z.any()).optional(),
  assets: z.record(z.string()).optional(),
  settings: z
    .object({
      priority: z.number().optional(),
      hotReloadable: z.boolean().optional(),
      sandboxed: z.boolean().optional(),
      maxMemory: z.number().optional(),
      maxExecutionTime: z.number().optional(),
    })
    .optional(),
});

// ============================================================================
// Plugin Manager Class
// ============================================================================

/**
 * Main plugin manager class
 * Handles all plugin lifecycle operations
 */
export class PluginManager extends EventEmitter {
  private plugins: Map<string, PluginInstance> = new Map();
  private config: PluginSystemConfig;
  private logger: Logger;
  private startTime: number;
  private hotReloadTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config?: Partial<PluginSystemConfig>) {
    super();
    this.config = this.mergeWithDefaultConfig(config);
    this.logger = new Logger('PluginManager');
    this.startTime = Date.now();

    // Set maximum listeners for plugin events
    this.setMaxListeners(100);
  }

  /**
   * Merge provided config with defaults
   */
  private mergeWithDefaultConfig(
    config?: Partial<PluginSystemConfig>,
  ): PluginSystemConfig {
    const defaults: PluginSystemConfig = {
      pluginPaths: [
        path.join(process.cwd(), '.nikcli', 'plugins'),
        path.join(process.env.HOME || '', '.nikcli', 'plugins'),
        path.join(process.cwd(), 'node_modules', '.nikcli-plugins'),
      ],
      autoLoadPlugins: false,
      autoActivatePlugins: true,
      validateDependencies: true,
      maxConcurrentOperations: 5,
      operationTimeout: 30000,
      hotReloadEnabled: false,
      hotReloadInterval: 5000,
      sandboxPlugins: false,
      telemetry: {
        enabled: false,
        sampleRate: 0.1,
      },
    };

    return { ...defaults, ...config };
  }

  /**
   * Discover plugins in configured paths
   */
  async discoverPlugins(
    options?: PluginDiscoveryOptions,
  ): Promise<PluginResolutionResult[]> {
    const results: PluginResolutionResult[] = [];
    const searchPaths = options?.searchPaths || this.config.pluginPaths;

    this.logger.info(`Discovering plugins in ${searchPaths.length} paths...`);

    for (const searchPath of searchPaths) {
      try {
        await fs.access(searchPath);
        const plugins = await this.discoverInPath(searchPath, options);
        results.push(...plugins);
      } catch (error) {
        // Path doesn't exist, skip
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.warn(
            `Failed to access plugin path: ${searchPath}`,
            error,
          );
        }
      }
    }

    this.logger.info(`Discovered ${results.length} plugins`);
    return results;
  }

  /**
   * Discover plugins in a specific path
   */
  private async discoverInPath(
    searchPath: string,
    options?: PluginDiscoveryOptions,
  ): Promise<PluginResolutionResult[]> {
    const results: PluginResolutionResult[] = [];
    const maxDepth = options?.maxDepth || 2;

    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(searchPath, entry.name);

        // Skip hidden files and directories
        if (entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          // Check if this is a plugin directory (contains package.json)
          const manifestPath = path.join(entryPath, 'nikcli-plugin.json');
          const packagePath = path.join(entryPath, 'package.json');

          let manifestExists = false;
          try {
            await fs.access(manifestPath);
            manifestExists = true;
          } catch {
            // Check package.json for nikcli plugin field
            try {
              const pkgContent = await fs.readFile(packagePath, 'utf-8');
              const pkg = JSON.parse(pkgContent);
              if (pkg['nikcli-plugin']) {
                manifestExists = true;
              }
            } catch {
              // Not a plugin directory
            }
          }

          if (manifestExists) {
            const result = await this.resolvePlugin(entryPath);
            if (result) {
              // Filter by category if specified
              if (options?.category) {
                const manifest = await this.loadManifest(entryPath);
                if (manifest?.metadata.category !== options.category) {
                  continue;
                }
              }

              // Filter by keywords if specified
              if (options?.keywords && options.keywords.length > 0) {
                const manifest = await this.loadManifest(entryPath);
                const hasKeyword = manifest?.metadata.keywords?.some((kw) =>
                  options.keywords!.includes(kw),
                );
                if (!hasKeyword) {
                  continue;
                }
              }

              results.push(result);
            }
          } else if (maxDepth > 1) {
            // Recurse into subdirectories
            const subResults = await this.discoverInPath(entryPath, {
              ...options,
              maxDepth: maxDepth - 1,
            });
            results.push(...subResults);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to discover plugins in ${searchPath}`, error);
    }

    return results;
  }

  /**
   * Resolve a plugin from a path
   */
  private async resolvePlugin(
    pluginPath: string,
  ): Promise<PluginResolutionResult | null> {
    try {
      const manifest = await this.loadManifest(pluginPath);
      if (!manifest) {
        return {
          path: pluginPath,
          id: path.basename(pluginPath),
          source: 'local',
          valid: false,
          validationErrors: ['Could not load manifest'],
        };
      }

      return {
        path: pluginPath,
        id: manifest.metadata.id,
        source: 'local',
        valid: true,
      };
    } catch (error) {
      return {
        path: pluginPath,
        id: path.basename(pluginPath),
        source: 'local',
        valid: false,
        validationErrors: [(error as Error).message],
      };
    }
  }

  /**
   * Load plugin manifest from disk
   */
  private async loadManifest(
    pluginPath: string,
  ): Promise<PluginManifest | null> {
    let manifestPath = path.join(pluginPath, 'nikcli-plugin.json');
    let manifestContent: string;

    try {
      manifestContent = await fs.readFile(manifestPath, 'utf-8');
    } catch {
      // Try package.json
      manifestPath = path.join(pluginPath, 'package.json');
      try {
        const pkgContent = await fs.readFile(manifestPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        if (!pkg['nikcli-plugin']) {
          return null;
        }
        manifestContent = pkg['nikcli-plugin'];
      } catch {
        return null;
      }
    }

    try {
      const manifest = JSON.parse(manifestContent);
      const result = PluginManifestSchema.safeParse(manifest);

      if (!result.success) {
        this.logger.error(
          `Invalid manifest in ${pluginPath}`,
          result.error.issues,
        );
        return null;
      }

      return result.data as PluginManifest;
    } catch (error) {
      this.logger.error(`Failed to parse manifest in ${pluginPath}`, error);
      return null;
    }
  }

  /**
   * Load a plugin
   */
  async loadPlugin(
    pluginPath: string,
    options?: PluginLoadOptions,
  ): Promise<PluginInstance> {
    const startTime = Date.now();
    const normalizedPath = path.resolve(pluginPath);

    this.logger.info(`Loading plugin from ${normalizedPath}`);

    // Load manifest
    const manifest = await this.loadManifest(normalizedPath);
    if (!manifest) {
      throw new PluginError(
        PluginErrorCode.MANIFEST_INVALID,
        `Could not load manifest from ${normalizedPath}`,
        undefined,
        { path: normalizedPath },
      );
    }

    // Check if plugin already loaded
    if (this.plugins.has(manifest.metadata.id)) {
      throw new PluginError(
        PluginErrorCode.ALREADY_LOADED,
        `Plugin ${manifest.metadata.id} is already loaded`,
        manifest.metadata.id,
      );
    }

    // Validate NikCLI version compatibility
    if (
      manifest.metadata.minNikCLIVersion ||
      manifest.metadata.maxNikCLIVersion
    ) {
      const nikcliVersion = this.getNikCLIVersion();
      if (
        manifest.metadata.minNikCLIVersion &&
        !semver.gte(nikcliVersion, manifest.metadata.minNikCLIVersion)
      ) {
        throw new PluginError(
          PluginErrorCode.VERSION_INCOMPATIBLE,
          `NikCLI version ${nikcliVersion} is too old for plugin (requires ${manifest.metadata.minNikCLIVersion})`,
          manifest.metadata.id,
        );
      }
      if (
        manifest.metadata.maxNikCLIVersion &&
        !semver.lte(nikcliVersion, manifest.metadata.maxNikCLIVersion)
      ) {
        throw new PluginError(
          PluginErrorCode.VERSION_INCOMPATIBLE,
          `NikCLI version ${nikcliVersion} is too new for plugin (max ${manifest.metadata.maxNikCLIVersion})`,
          manifest.metadata.id,
        );
      }
    }

    // Validate and resolve dependencies
    if (
      options?.validateDependencies !== false &&
      this.config.validateDependencies
    ) {
      await this.validateDependencies(manifest, options);
    }

    // Create plugin instance
    const instance: PluginInstance = {
      manifest,
      state: PluginState.LOADED,
      health: PluginHealth.HEALTHY,
      loadedAt: new Date(),
      config: this.initializeConfig(manifest, options?.config),
      registeredTools: [],
      registeredAgents: [],
      metrics: {
        executionCount: 0,
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        errorCount: 0,
      },
      path: normalizedPath,
      builtin: false,
    };

    // Store instance
    this.plugins.set(manifest.metadata.id, instance);

    // Create hook context
    const context = await this.createHookContext(instance);

    // Execute onLoad hook
    if (manifest.hooks?.onLoad) {
      try {
        await this.executeHook(manifest.hooks.onLoad, context);
      } catch (error) {
        this.plugins.delete(manifest.metadata.id);
        throw new PluginError(
          PluginErrorCode.LIFECYCLE_HOOK_FAILED,
          `onLoad hook failed: ${(error as Error).message}`,
          manifest.metadata.id,
          { hook: 'onLoad', error },
        );
      }
    }

    // Emit event
    this.emit('plugin:load', {
      pluginId: manifest.metadata.id,
      path: normalizedPath,
    });

    // Initialize plugin
    await this.initializePlugin(instance);

    const loadTime = Date.now() - startTime;
    this.logger.info(`Plugin ${manifest.metadata.id} loaded in ${loadTime}ms`);

    // Auto-activate if configured
    if (options?.autoActivate ?? this.config.autoActivatePlugins) {
      await this.activatePlugin(manifest.metadata.id);
    }

    // Setup hot reload if enabled
    if (options?.hotReload ?? this.config.hotReloadEnabled) {
      if (manifest.settings?.hotReloadable !== false) {
        this.setupHotReload(instance);
      }
    }

    return instance;
  }

  /**
   * Initialize a plugin
   */
  private async initializePlugin(instance: PluginInstance): Promise<void> {
    const { manifest } = instance;
    const context = await this.createHookContext(instance);

    try {
      // Execute onInit hook
      if (manifest.hooks?.onInit) {
        await this.executeHook(manifest.hooks.onInit, context);
      }

      // Register tools
      if (manifest.tools) {
        for (const toolDef of manifest.tools) {
          // Validate permissions before registering
          if (toolDef.requiredPermissions) {
            this.validatePermissions(toolDef.requiredPermissions, instance);
          }

          const tool = await toolService.registerTool({
            name: `${manifest.metadata.id}:${toolDef.name}`,
            description: toolDef.description,
            inputSchema: toolDef.inputSchema,
            handler: async (input: unknown) => {
              const startTime = Date.now();
              try {
                const result = await toolDef.handler(input, context);
                const executionTime = Date.now() - startTime;
                this.updateMetrics(instance, executionTime, false);
                return result;
              } catch (error) {
                const executionTime = Date.now() - startTime;
                this.updateMetrics(instance, executionTime, true);
                throw error;
              }
            },
            dangerous: toolDef.dangerous,
          });

          instance.registeredTools.push(tool);
        }
      }

      // Register agents
      if (manifest.agents) {
        const agentManager = new AgentManager();
        for (const agentDef of manifest.agents) {
          // Validate permissions before registering
          if (agentDef.requiredPermissions) {
            this.validatePermissions(agentDef.requiredPermissions, instance);
          }

          if (agentDef.initialize) {
            const agent = await agentDef.initialize(context);
            await agentManager.registerAgent(agent);
            instance.registeredAgents.push(agent);
          }
        }
      }

      // Update state
      instance.state = PluginState.INITIALIZED;

      // Emit event
      this.emit('plugin:init', { pluginId: manifest.metadata.id });
    } catch (error) {
      instance.state = PluginState.ERROR;
      instance.health = PluginHealth.UNHEALTHY;
      instance.lastError = {
        error: error as Error,
        timestamp: new Date(),
        context: 'initialization',
      };
      throw error;
    }
  }

  /**
   * Activate a plugin
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new PluginError(
        PluginErrorCode.NOT_FOUND,
        `Plugin ${pluginId} not found`,
      );
    }

    if (instance.state === PluginState.ACTIVE) {
      return; // Already active
    }

    const { manifest } = instance;
    const context = await this.createHookContext(instance);

    // Execute onBeforeActivate hook
    if (manifest.hooks?.onBeforeActivate) {
      await this.executeHook(manifest.hooks.onBeforeActivate, context);
    }

    // Update state
    instance.state = PluginState.ACTIVE;
    instance.activatedAt = new Date();

    // Execute onActivate hook
    if (manifest.hooks?.onActivate) {
      await this.executeHook(manifest.hooks.onActivate, context);
    }

    // Emit event
    this.emit('plugin:activate', { pluginId });

    this.logger.info(`Plugin ${pluginId} activated`);
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new PluginError(
        PluginErrorCode.NOT_FOUND,
        `Plugin ${pluginId} not found`,
      );
    }

    if (instance.state !== PluginState.ACTIVE) {
      return; // Not active
    }

    const { manifest } = instance;
    const context = await this.createHookContext(instance);

    // Execute onBeforeDeactivate hook
    if (manifest.hooks?.onBeforeDeactivate) {
      await this.executeHook(manifest.hooks.onBeforeDeactivate, context);
    }

    // Update state
    instance.state = PluginState.DEACTIVATED;
    instance.deactivatedAt = new Date();

    // Execute onDeactivate hook
    if (manifest.hooks?.onDeactivate) {
      await this.executeHook(manifest.hooks.onDeactivate, context);
    }

    // Clear hot reload timer
    const timer = this.hotReloadTimers.get(pluginId);
    if (timer) {
      clearInterval(timer);
      this.hotReloadTimers.delete(pluginId);
    }

    // Emit event
    this.emit('plugin:deactivate', { pluginId });

    this.logger.info(`Plugin ${pluginId} deactivated`);
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new PluginError(
        PluginErrorCode.NOT_FOUND,
        `Plugin ${pluginId} not found`,
      );
    }

    // Deactivate if active
    if (instance.state === PluginState.ACTIVE) {
      await this.deactivatePlugin(pluginId);
    }

    const { manifest } = instance;
    const context = await this.createHookContext(instance);

    // Execute onBeforeUnload hook
    if (manifest.hooks?.onBeforeUnload) {
      await this.executeHook(manifest.hooks.onBeforeUnload, context);
    }

    // Update state
    instance.state = PluginState.UNLOADING;

    // Unregister tools
    for (const tool of instance.registeredTools) {
      await toolService.unregisterTool(tool.name);
    }

    // Unregister agents
    // (Would need to implement unregisterAgent in AgentManager)

    // Execute onUnload hook
    if (manifest.hooks?.onUnload) {
      await this.executeHook(manifest.hooks.onUnload, context);
    }

    // Remove from registry
    this.plugins.delete(pluginId);

    // Emit event
    this.emit('plugin:unload', { pluginId });

    this.logger.info(`Plugin ${pluginId} unloaded`);
  }

  /**
   * Reload a plugin (hot reload)
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new PluginError(
        PluginErrorCode.NOT_FOUND,
        `Plugin ${pluginId} not found`,
      );
    }

    const { path: pluginPath, manifest } = instance;

    // Check if hot reload is enabled
    if (manifest.settings?.hotReloadable === false) {
      this.logger.warn(`Plugin ${pluginId} does not support hot reload`);
      return;
    }

    this.logger.info(`Reloading plugin ${pluginId}`);

    // Unload plugin
    await this.unloadPlugin(pluginId);

    // Reload plugin
    await this.loadPlugin(pluginPath, {
      autoActivate: true,
      hotReload: true,
    });

    this.logger.info(`Plugin ${pluginId} reloaded`);
  }

  /**
   * Setup hot reload for a plugin
   */
  private setupHotReload(instance: PluginInstance): void {
    const { manifest } = instance;

    if (manifest.settings?.hotReloadable === false) {
      return;
    }

    const interval = this.config.hotReloadInterval;
    const timer = setInterval(async () => {
      try {
        const manifestPath = path.join(instance.path, 'nikcli-plugin.json');
        const stats = await fs.stat(manifestPath);
        // Compare mtime with loaded time
        if (stats.mtimeMs > instance.loadedAt.getTime()) {
          this.logger.info(`Hot reload triggered for ${manifest.metadata.id}`);
          await this.reloadPlugin(manifest.metadata.id);
        }
      } catch (error) {
        // File doesn't exist or can't be accessed, ignore
      }
    }, interval);

    this.hotReloadTimers.set(manifest.metadata.id, timer);
  }

  /**
   * Validate plugin dependencies
   */
  private async validateDependencies(
    manifest: PluginManifest,
    options?: PluginLoadOptions,
  ): Promise<void> {
    const dependencies = manifest.metadata.dependencies || [];

    for (const dep of dependencies) {
      const dependencyInstance = this.plugins.get(dep.id);

      if (!dependencyInstance) {
        if (dep.optional) {
          this.logger.warn(`Optional dependency ${dep.id} not found`);
          continue;
        }

        if (options?.loadDependencies) {
          // Try to load the dependency
          const resolution = await this.resolvePluginById(dep.id);
          if (resolution) {
            await this.loadPlugin(resolution.path, {
              autoActivate: false,
              loadDependencies: true,
              validateDependencies: true,
            });
          } else {
            throw new PluginError(
              PluginErrorCode.DEPENDENCY_MISSING,
              `Required dependency ${dep.id} not found`,
              manifest.metadata.id,
            );
          }
        } else {
          throw new PluginError(
            PluginErrorCode.DEPENDENCY_MISSING,
            `Required dependency ${dep.id} not loaded`,
            manifest.metadata.id,
          );
        }
      }

      // Check version compatibility
      if (dep.version && dependencyInstance) {
        const depVersion = dependencyInstance.manifest.metadata.version;
        if (!semver.satisfies(depVersion, dep.version)) {
          throw new PluginError(
            PluginErrorCode.DEPENDENCY_INCOMPATIBLE,
            `Dependency ${dep.id} version ${depVersion} does not satisfy requirement ${dep.version}`,
            manifest.metadata.id,
          );
        }
      }
    }

    // Check for incompatibilities
    const incompatibilities = manifest.metadata.incompatibilities || [];
    for (const incompatibleId of incompatibilities) {
      if (this.plugins.has(incompatibleId)) {
        throw new PluginError(
          PluginErrorCode.VERSION_INCOMPATIBLE,
          `Plugin ${manifest.metadata.id} is incompatible with loaded plugin ${incompatibleId}`,
          manifest.metadata.id,
        );
      }
    }
  }

  /**
   * Resolve a plugin by ID
   */
  private async resolvePluginById(
    pluginId: string,
  ): Promise<PluginResolutionResult | null> {
    const results = await this.discoverPlugins();
    return results.find((r) => r.id === pluginId) || null;
  }

  /**
   * Validate plugin permissions
   */
  private validatePermissions(
    permissions: PluginPermissions,
    instance: PluginInstance,
  ): void {
    const requested = permissions;
    const allowed = instance.manifest.permissions || {};

    // This is a simplified check - real implementation would be more comprehensive
    // For now, we just log warnings if requesting more than allowed

    if (requested.filesystem?.read?.length && !allowed.filesystem?.read) {
      this.logger.warn(
        `Plugin ${instance.manifest.metadata.id} requesting filesystem read access not in manifest`,
      );
    }

    // Add more permission checks as needed
  }

  /**
   * Initialize plugin configuration
   */
  private initializeConfig(
    manifest: PluginManifest,
    userConfig?: Record<string, unknown>,
  ): Record<string, unknown> {
    const config: Record<string, unknown> = {};

    if (manifest.config) {
      for (const configDef of manifest.config) {
        // Check environment variable first
        if (configDef.envVar) {
          const envValue = process.env[configDef.envVar];
          if (envValue !== undefined) {
            config[configDef.key] = this.parseConfigValue(
              envValue,
              configDef.type,
            );
            continue;
          }
        }

        // Check user-provided config
        if (userConfig && configDef.key in userConfig) {
          config[configDef.key] = userConfig[configDef.key];
          continue;
        }

        // Use default value
        if (configDef.default !== undefined) {
          config[configDef.key] = configDef.default;
        } else if (configDef.required) {
          this.logger.warn(
            `Required config ${configDef.key} not provided for plugin ${manifest.metadata.id}`,
          );
        }
      }
    }

    return config;
  }

  /**
   * Parse configuration value to correct type
   */
  private parseConfigValue(value: string, type: string): unknown {
    switch (type) {
      case 'string':
        return value;
      case 'number':
        return Number(value);
      case 'boolean':
        return value === 'true' || value === '1';
      case 'object':
      case 'array':
        return JSON.parse(value);
      default:
        return value;
    }
  }

  /**
   * Create hook context for plugin
   */
  private async createHookContext(
    instance: PluginInstance,
  ): Promise<PluginHookContext> {
    return {
      plugin: instance,
      cwd: process.cwd(),
      env: { ...process.env },
      logger: this.createPluginLogger(instance),
      config: this.createConfigStore(instance),
      events: this.createEventEmitter(instance),
    };
  }

  /**
   * Create plugin logger
   */
  private createPluginLogger(instance: PluginInstance): PluginLogger {
    return {
      debug: (message: string, ...args: unknown[]) => {
        this.logger.debug(
          `[${instance.manifest.metadata.id}] ${message}`,
          ...args,
        );
      },
      info: (message: string, ...args: unknown[]) => {
        this.logger.info(
          `[${instance.manifest.metadata.id}] ${message}`,
          ...args,
        );
      },
      warn: (message: string, ...args: unknown[]) => {
        this.logger.warn(
          `[${instance.manifest.metadata.id}] ${message}`,
          ...args,
        );
      },
      error: (message: string, error?: Error, ...args: unknown[]) => {
        this.logger.error(
          `[${instance.manifest.metadata.id}] ${message}`,
          error,
          ...args,
        );
      },
    };
  }

  /**
   * Create config store for plugin
   */
  private createConfigStore(instance: PluginInstance): PluginConfigStore {
    return {
      get: (key: string) => instance.config[key],
      set: (key: string, value: unknown) => {
        instance.config[key] = value;
        this.emit('plugin:config', {
          pluginId: instance.manifest.metadata.id,
          key,
          value,
        });
      },
      delete: (key: string) => {
        delete instance.config[key];
      },
      has: (key: string) => key in instance.config,
      all: () => ({ ...instance.config }),
    };
  }

  /**
   * Create event emitter for plugin
   */
  private createEventEmitter(instance: PluginInstance): PluginEventEmitter {
    return {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        this.on(`plugin:${instance.manifest.metadata.id}:${event}`, handler);
      },
      off: (event: string, handler: (...args: unknown[]) => void) => {
        this.off(`plugin:${instance.manifest.metadata.id}:${event}`, handler);
      },
      emit: (event: string, ...args: unknown[]) => {
        this.emit(`plugin:${instance.manifest.metadata.id}:${event}`, ...args);
      },
      once: (event: string, handler: (...args: unknown[]) => void) => {
        this.once(`plugin:${instance.manifest.metadata.id}:${event}`, handler);
      },
    };
  }

  /**
   * Execute lifecycle hook with error handling
   */
  private async executeHook(
    hook: (context: PluginHookContext, data?: unknown) => Promise<void> | void,
    context: PluginHookContext,
    data?: unknown,
  ): Promise<void> {
    const timeout = this.config.operationTimeout;

    await Promise.race([
      hook(context, data),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Hook execution timeout')), timeout),
      ),
    ]);
  }

  /**
   * Update plugin metrics
   */
  private updateMetrics(
    instance: PluginInstance,
    executionTime: number,
    hadError: boolean,
  ): void {
    instance.metrics.executionCount++;
    instance.metrics.totalExecutionTime += executionTime;
    instance.metrics.averageExecutionTime =
      instance.metrics.totalExecutionTime / instance.metrics.executionCount;
    instance.metrics.lastExecutionTime = new Date();

    if (hadError) {
      instance.metrics.errorCount++;
      instance.health = PluginHealth.DEGRADED;

      if (instance.metrics.errorCount > 10) {
        instance.health = PluginHealth.UNHEALTHY;
      }
    }
  }

  /**
   * Get NikCLI version
   */
  private getNikCLIVersion(): string {
    try {
      const pkgPath = path.join(__dirname, '../../../package.json');
      const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Get a plugin instance
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all plugins
   */
  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get active plugins
   */
  getActivePlugins(): PluginInstance[] {
    return this.getAllPlugins().filter((p) => p.state === PluginState.ACTIVE);
  }

  /**
   * Get plugin system statistics
   */
  getStats(): PluginSystemStats {
    const plugins = this.getAllPlugins();
    const activePlugins = this.getActivePlugins();

    const totalExecutions = plugins.reduce(
      (sum, p) => sum + p.metrics.executionCount,
      0,
    );
    const totalExecutionTime = plugins.reduce(
      (sum, p) => sum + p.metrics.totalExecutionTime,
      0,
    );

    const stateDistribution: Record<PluginState, number> = {
      [PluginState.LOADED]: 0,
      [PluginState.INITIALIZED]: 0,
      [PluginState.ACTIVE]: 0,
      [PluginState.DEACTIVATED]: 0,
      [PluginState.ERROR]: 0,
      [PluginState.UNLOADING]: 0,
    };

    for (const plugin of plugins) {
      stateDistribution[plugin.state]++;
    }

    return {
      totalPlugins: plugins.length,
      activePlugins: activePlugins.length,
      errorPlugins: plugins.filter((p) => p.state === PluginState.ERROR).length,
      totalTools: plugins.reduce((sum, p) => sum + p.registeredTools.length, 0),
      totalAgents: plugins.reduce(
        (sum, p) => sum + p.registeredAgents.length,
        0,
      ),
      uptime: Date.now() - this.startTime,
      totalExecutions,
      avgExecutionTime:
        totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0,
      stateDistribution,
    };
  }

  /**
   * Shutdown plugin manager
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down plugin manager...');

    // Deactivate all active plugins
    const activePlugins = this.getActivePlugins();
    for (const plugin of activePlugins) {
      try {
        await this.deactivatePlugin(plugin.manifest.metadata.id);
      } catch (error) {
        this.logger.error(
          `Failed to deactivate plugin ${plugin.manifest.metadata.id}`,
          error,
        );
      }
    }

    // Unload all plugins
    const allPlugins = this.getAllPlugins();
    for (const plugin of allPlugins) {
      try {
        await this.unloadPlugin(plugin.manifest.metadata.id);
      } catch (error) {
        this.logger.error(
          `Failed to unload plugin ${plugin.manifest.metadata.id}`,
          error,
        );
      }
    }

    // Clear hot reload timers
    for (const timer of this.hotReloadTimers.values()) {
      clearInterval(timer);
    }
    this.hotReloadTimers.clear();

    this.logger.info('Plugin manager shutdown complete');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global plugin manager instance
 */
let pluginManagerInstance: PluginManager | null = null;

/**
 * Get or create the plugin manager singleton
 */
export function getPluginManager(
  config?: Partial<PluginSystemConfig>,
): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager(config);
  }
  return pluginManagerInstance;
}

/**
 * Reset the plugin manager singleton (for testing)
 */
export function resetPluginManager(): void {
  if (pluginManagerInstance) {
    pluginManagerInstance.removeAllListeners();
    pluginManagerInstance = null;
  }
}

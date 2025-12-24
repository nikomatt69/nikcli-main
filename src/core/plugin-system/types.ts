import type { z } from 'zod';
import type { Tool } from '../tool-service';
import type { Agent } from '../agent-manager';

// ============================================================================
// Core Plugin Types
// ============================================================================

/**
 * Semantic versioning of plugins
 * Follows semver.org specification
 */
export type PluginVersion =
  | `${number}.${number}.${number}`
  | `${number}.${number}.${number}-${string}`;

/**
 * Unique plugin identifier
 * Format: <scope>/<name> or <name>
 * Examples: @nikcli/code-formatter, my-custom-tool
 */
export type PluginId = string;

/**
 * Plugin manifest validation result
 */
export interface ManifestValidationResult {
  isValid: boolean;
  errors: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  warnings: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Plugin dependency specification
 */
export interface PluginDependency {
  /** Plugin ID that is required */
  id: PluginId;

  /** Version range (semver format) */
  version?: string;

  /** Whether this dependency is optional */
  optional?: boolean;

  /** Reason for the dependency */
  reason?: string;
}

/**
 * Plugin metadata - basic information about the plugin
 */
export interface PluginMetadata {
  /** Unique identifier */
  id: PluginId;

  /** Human-readable name */
  name: string;

  /** Short description */
  description: string;

  /** Version following semver */
  version: PluginVersion;

  /** Minimum NikCLI version required */
  minNikCLIVersion?: string;

  /** Maximum NikCLI version supported */
  maxNikCLIVersion?: string;

  /** Plugin author information */
  author: {
    name: string;
    email?: string;
    url?: string;
  };

  /** Plugin license */
  license: string;

  /** Repository information */
  repository?: {
    type: 'git' | 'hg' | 'svn';
    url: string;
    directory?: string;
  };

  /** Homepage URL */
  homepage?: string;

  /** Plugin keywords for discoverability */
  keywords?: string[];

  /** Plugin category */
  category: 'tool' | 'agent' | 'ui' | 'integration' | 'middleware' | 'other';

  /** List of other plugins this plugin depends on */
  dependencies?: PluginDependency[];

  /** Plugins this is incompatible with */
  incompatibilities?: PluginId[];

  /** Icon (emoji or URL) */
  icon?: string;
}

/**
 * Plugin permissions - security model for plugins
 */
export interface PluginPermissions {
  /** Allowed file system access patterns */
  filesystem?: {
    read?: string[]; // Glob patterns for read access
    write?: string[]; // Glob patterns for write access
    exec?: string[]; // Executable paths allowed
  };

  /** Network access permissions */
  network?: {
    domains?: string[]; // Allowed domains
    ports?: number[]; // Allowed ports
    protocols?: ('http' | 'https' | 'ws' | 'wss' | 'tcp' | 'udp')[];
  };

  /** Environment variable access */
  env?: {
    read?: string[]; // Patterns for env vars to read
    write?: string[]; // Patterns for env vars to set
  };

  /** Tool execution permissions */
  tools?: {
    allowed?: string[]; // Tool names allowed
    blocked?: string[]; // Tool names explicitly blocked
  };

  /** Agent interaction permissions */
  agents?: {
    allowed?: string[]; // Agent types allowed to interact with
    blocked?: string[]; // Agent types blocked
  };

  /** System-level permissions */
  system?: {
    allowProcesses?: boolean; // Can spawn processes
    allowNotifications?: boolean; // Can show notifications
    allowClipboard?: boolean; // Can access clipboard
  };
}

/**
 * Plugin lifecycle hook context
 */
export interface PluginHookContext {
  /** Plugin instance */
  plugin: PluginInstance;

  /** Current working directory */
  cwd: string;

  /** Environment variables */
  env: Record<string, string>;

  /** Logger instance */
  logger: PluginLogger;

  /** Configuration store */
  config: PluginConfigStore;

  /** Event emitter for system events */
  events: PluginEventEmitter;
}

/**
 * Lifecycle hook types
 */
export type LifecycleHook<T = unknown> = (
  context: PluginHookContext,
  data?: T,
) => Promise<void> | void;

/**
 * Plugin lifecycle hooks
 */
export interface PluginLifecycleHooks {
  /** Called when plugin is loaded */
  onLoad?: LifecycleHook;

  /** Called when plugin is initialized */
  onInit?: LifecycleHook;

  /** Called before plugin is activated */
  onBeforeActivate?: LifecycleHook;

  /** Called after plugin is activated */
  onActivate?: LifecycleHook;

  /** Called before plugin is deactivated */
  onBeforeDeactivate?: LifecycleHook;

  /** Called after plugin is deactivated */
  onDeactivate?: LifecycleHook;

  /** Called when configuration changes */
  onConfigChange?: LifecycleHook<Record<string, unknown>>;

  /** Called when another plugin is loaded/activated */
  onPluginChange?: LifecycleHook<{
    id: PluginId;
    action: 'load' | 'activate' | 'deactivate' | 'unload';
  }>;

  /** Called before plugin is unloaded */
  onBeforeUnload?: LifecycleHook;

  /** Called when plugin is unloaded */
  onUnload?: LifecycleHook;

  /** Called when an error occurs */
  onError?: LifecycleHook<{ error: Error; context?: string }>;
}

/**
 * Plugin configuration schema
 */
export interface PluginConfigSchema {
  /** Configuration key */
  key: string;

  /** Type of the configuration value */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';

  /** Default value */
  default?: unknown;

  /** Validation schema (Zod) */
  schema?: z.ZodTypeAny;

  /** Whether the value is required */
  required?: boolean;

  /** Human-readable description */
  description?: string;

  /** Example value */
  example?: unknown;

  /** Environment variable to load from (fallback) */
  envVar?: string;

  /** Whether this can be changed at runtime */
  mutable?: boolean;
}

/**
 * Plugin tool definition
 */
export interface PluginToolDefinition {
  /** Tool name */
  name: string;

  /** Tool description */
  description: string;

  /** Input schema (Zod) */
  inputSchema: z.ZodTypeAny;

  /** Tool execution handler */
  handler: (
    input: unknown,
    context: PluginHookContext,
  ) => Promise<unknown> | unknown;

  /** Whether the tool is dangerous (requires approval) */
  dangerous?: boolean;

  /** Required permissions for this tool */
  requiredPermissions?: PluginPermissions;
}

/**
 * Plugin agent definition
 */
export interface PluginAgentDefinition {
  /** Agent type */
  type: string;

  /** Agent name */
  name: string;

  /** Agent description */
  description: string;

  /** Agent capabilities */
  capabilities: string[];

  /** Agent initialization handler */
  initialize?: (context: PluginHookContext) => Promise<Agent>;

  /** Required permissions for this agent */
  requiredPermissions?: PluginPermissions;
}

/**
 * Plugin UI component definition
 */
export interface PluginUIComponent {
  /** Component name */
  name: string;

  /** Component type */
  type: 'command' | 'slash-command' | 'widget' | 'panel' | 'overlay';

  /** Component implementation */
  component: unknown; // Would be React/Vue/etc component

  /** Required permissions */
  requiredPermissions?: PluginPermissions;
}

/**
 * Plugin manifest - complete plugin specification
 */
export interface PluginManifest {
  /** Plugin metadata */
  metadata: PluginMetadata;

  /** Entry point file */
  main: string;

  /** Plugin permissions */
  permissions?: PluginPermissions;

  /** Configuration schema */
  config?: PluginConfigSchema[];

  /** Lifecycle hooks */
  hooks?: PluginLifecycleHooks;

  /** Tools provided by this plugin */
  tools?: PluginToolDefinition[];

  /** Agents provided by this plugin */
  agents?: PluginAgentDefinition[];

  /** UI components provided by this plugin */
  ui?: PluginUIComponent[];

  /** Static assets provided by this plugin */
  assets?: Record<string, string>;

  /** Custom settings for the plugin system */
  settings?: {
    /** Priority for execution order */
    priority?: number;

    /** Whether plugin can be hot-reloaded */
    hotReloadable?: boolean;

    /** Whether plugin runs in sandbox */
    sandboxed?: boolean;

    /** Maximum memory allowed (MB) */
    maxMemory?: number;

    /** Maximum execution time (ms) */
    maxExecutionTime?: number;
  };
}

// ============================================================================
// Plugin Instance Types
// ============================================================================

/**
 * Plugin state enum
 */
export enum PluginState {
  /** Plugin is loaded but not initialized */
  LOADED = 'loaded',

  /** Plugin is initialized but not activated */
  INITIALIZED = 'initialized',

  /** Plugin is active and running */
  ACTIVE = 'active',

  /** Plugin is deactivated */
  DEACTIVATED = 'deactivated',

  /** Plugin encountered an error */
  ERROR = 'error',

  /** Plugin is being unloaded */
  UNLOADING = 'unloading',
}

/**
 * Plugin health status
 */
export enum PluginHealth {
  /** Plugin is healthy */
  HEALTHY = 'healthy',

  /** Plugin has warnings but is functional */
  DEGRADED = 'degraded',

  /** Plugin is not functional */
  UNHEALTHY = 'unhealthy',
}

/**
 * Plugin instance - runtime representation of a plugin
 */
export interface PluginInstance {
  /** Plugin manifest */
  manifest: PluginManifest;

  /** Plugin state */
  state: PluginState;

  /** Plugin health status */
  health: PluginHealth;

  /** Plugin load timestamp */
  loadedAt: Date;

  /** Plugin activation timestamp */
  activatedAt?: Date;

  /** Plugin deactivation timestamp */
  deactivatedAt?: Date;

  /** Last error encountered */
  lastError?: {
    error: Error;
    timestamp: Date;
    context?: string;
  };

  /** Plugin configuration values */
  config: Record<string, unknown>;

  /** Tools registered by this plugin */
  registeredTools: Tool[];

  /** Agents registered by this plugin */
  registeredAgents: Agent[];

  /** Performance metrics */
  metrics: {
    executionCount: number;
    totalExecutionTime: number;
    averageExecutionTime: number;
    errorCount: number;
    lastExecutionTime?: Date;
  };

  /** Plugin directory path */
  path: string;

  /** Whether plugin is builtin */
  builtin: boolean;
}

// ============================================================================
// Plugin Manager Types
// ============================================================================

/**
 * Plugin load options
 */
export interface PluginLoadOptions {
  /** Whether to activate the plugin immediately */
  autoActivate?: boolean;

  /** Configuration values to apply */
  config?: Record<string, unknown>;

  /** Whether to validate dependencies */
  validateDependencies?: boolean;

  /** Whether to load dependencies recursively */
  loadDependencies?: boolean;

  /** Timeout for loading (ms) */
  timeout?: number;

  /** Whether to enable hot reload */
  hotReload?: boolean;
}

/**
 * Plugin discovery options
 */
export interface PluginDiscoveryOptions {
  /** Directories to search for plugins */
  searchPaths?: string[];

  /** Whether to search npm for plugins */
  searchNpm?: boolean;

  /** Whether to include built-in plugins */
  includeBuiltin?: boolean;

  /** Filter by category */
  category?: string;

  /** Filter by keyword */
  keywords?: string[];

  /** Maximum depth for directory search */
  maxDepth?: number;
}

/**
 * Plugin resolution result
 */
export interface PluginResolutionResult {
  /** Resolved plugin path */
  path: string;

  /** Plugin ID */
  id: PluginId;

  /** Resolution source */
  source: 'builtin' | 'local' | 'npm' | 'git' | 'url';

  /** Whether the plugin is valid */
  valid: boolean;

  /** Validation errors if any */
  validationErrors?: string[];
}

// ============================================================================
// Plugin System Types
// ============================================================================

/**
 * Plugin system configuration
 */
export interface PluginSystemConfig {
  /** Directories to search for plugins */
  pluginPaths: string[];

  /** Whether to auto-load plugins on startup */
  autoLoadPlugins: boolean;

  /** Whether to auto-activate loaded plugins */
  autoActivatePlugins: boolean;

  /** Whether to validate dependencies */
  validateDependencies: boolean;

  /** Maximum number of concurrent plugin operations */
  maxConcurrentOperations: number;

  /** Plugin operation timeout (ms) */
  operationTimeout: number;

  /** Whether to enable hot reload */
  hotReloadEnabled: boolean;

  /** Hot reload polling interval (ms) */
  hotReloadInterval: number;

  /** Whether to sandbox plugins */
  sandboxPlugins: boolean;

  /** Sandbox configuration */
  sandboxConfig?: {
    /** Maximum memory per plugin (MB) */
    maxMemory?: number;

    /** Maximum execution time (ms) */
    maxExecutionTime?: number;

    /** Blocked modules */
    blockedModules?: string[];
  };

  /** Telemetry configuration */
  telemetry?: {
    /** Whether to collect plugin metrics */
    enabled: boolean;

    /** Sample rate (0-1) */
    sampleRate?: number;
  };
}

/**
 * Plugin system statistics
 */
export interface PluginSystemStats {
  /** Total plugins loaded */
  totalPlugins: number;

  /** Active plugins */
  activePlugins: number;

  /** Plugins in error state */
  errorPlugins: number;

  /** Total tools registered */
  totalTools: number;

  /** Total agents registered */
  totalAgents: number;

  /** System uptime (ms) */
  uptime: number;

  /** Total plugin executions */
  totalExecutions: number;

  /** Average execution time (ms) */
  avgExecutionTime: number;

  /** Plugin state distribution */
  stateDistribution: Record<PluginState, number>;
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Plugin logger interface
 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: Error, ...args: unknown[]): void;
}

/**
 * Plugin config store interface
 */
export interface PluginConfigStore {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  has(key: string): boolean;
  all(): Record<string, unknown>;
}

/**
 * Plugin event emitter interface
 */
export interface PluginEventEmitter {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  once(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * Plugin error types
 */
export enum PluginErrorCode {
  /** Plugin manifest is invalid */
  MANIFEST_INVALID = 'MANIFEST_INVALID',

  /** Plugin dependency is missing */
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',

  /** Plugin dependency version is incompatible */
  DEPENDENCY_INCOMPATIBLE = 'DEPENDENCY_INCOMPATIBLE',

  /** Plugin lifecycle hook failed */
  LIFECYCLE_HOOK_FAILED = 'LIFECYCLE_HOOK_FAILED',

  /** Plugin permission denied */
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  /** Plugin timeout */
  TIMEOUT = 'TIMEOUT',

  /** Plugin execution failed */
  EXECUTION_FAILED = 'EXECUTION_FAILED',

  /** Plugin already loaded */
  ALREADY_LOADED = 'ALREADY_LOADED',

  /** Plugin not found */
  NOT_FOUND = 'NOT_FOUND',

  /** Plugin version incompatible */
  VERSION_INCOMPATIBLE = 'VERSION_INCOMPATIBLE',
}

/**
 * Plugin error class
 */
export class PluginError extends Error {
  constructor(
    public code: PluginErrorCode,
    message: string,
    public pluginId?: PluginId,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

/**
 * Plugin event types
 */
export type PluginEvent =
  | { type: 'load'; pluginId: PluginId }
  | { type: 'unload'; pluginId: PluginId }
  | { type: 'activate'; pluginId: PluginId }
  | { type: 'deactivate'; pluginId: PluginId }
  | { type: 'error'; pluginId: PluginId; error: Error }
  | {
      type: 'stateChange';
      pluginId: PluginId;
      oldState: PluginState;
      newState: PluginState;
    }
  | { type: 'configChange'; pluginId: PluginId; key: string; value: unknown };

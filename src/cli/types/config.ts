/**
 * Configuration Types for NikCLI
 * Defines types for model configuration, API settings, and session management
 */

// Model Configuration Types
export interface ModelConfig {
  name: string
  provider: 'anthropic' | 'openai' | 'google' | 'ollama' | 'gateway' | 'v0'
  model: string
  apiKey?: string
  baseUrl?: string
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  enabled: boolean
}

export interface ModelPricing {
  input: number // Cost per token for input
  output: number // Cost per token for output
  currency: 'USD'
  unit: 'token' | '1K_tokens' | '1M_tokens'
}

// API Configuration Types
export interface APIConfig {
  anthropic?: APIProviderConfig
  openai?: APIProviderConfig
  google?: APIProviderConfig
  gateway?: APIProviderConfig
  v0?: APIProviderConfig
  ollama?: OllamaConfig
}

export interface APIProviderConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  retries?: number
  rateLimitPerMinute?: number
}

export interface OllamaConfig {
  host: string
  port: number
  timeout?: number
  availableModels: string[]
  defaultModel?: string
}

// Session Configuration Types
export interface SessionConfig {
  id: string
  title: string
  workingDirectory: string
  currentModel: string
  temperature: number
  maxContextTokens: number
  enableTokenOptimization: boolean
  enableCognitiveFunctions: boolean
  systemPrompt?: string
  userPreferences: UserPreferences
}

export interface MermaidRenderingPreferences {
  /** Rendering strategy: auto uses terminal capabilities detection */
  strategy: 'auto' | 'inline-image' | 'ascii-art' | 'fallback'
  /** Enable caching of rendered diagrams for performance */
  enableCache: boolean
  /** Horizontal spacing between nodes in ASCII rendering (default: 5) */
  asciiPaddingX: number
  /** Vertical spacing between nodes in ASCII rendering (default: 5) */
  asciiPaddingY: number
  /** Padding between text and border in ASCII rendering (default: 1) */
  asciiBorderPadding: number
  /** Mermaid diagram theme */
  theme: 'default' | 'dark' | 'neutral' | 'forest'
}

// Default Mermaid rendering preferences
export const DEFAULT_MERMAID_RENDERING_PREFERENCES: MermaidRenderingPreferences = {
  strategy: 'auto',
  enableCache: true,
  asciiPaddingX: 5,
  asciiPaddingY: 5,
  asciiBorderPadding: 1,
  theme: 'dark',
}

export interface UserPreferences {
  autoSave: boolean
  showTokenUsage: boolean
  confirmDestructiveActions: boolean
  preferredOutputFormat: 'json' | 'markdown' | 'plain'
  theme: 'dark' | 'light' | 'auto'
  notifications: NotificationSettings
  mermaidRendering?: MermaidRenderingPreferences
}

export interface NotificationSettings {
  enabled: boolean
  showProgress: boolean
  showErrors: boolean
  showCompletions: boolean
  soundEnabled: boolean
}

// Configuration Manager Types
export interface ConfigManager<T extends Record<string, unknown> = Record<string, unknown>> {
  get<K extends keyof T>(key: K): T[K]
  set<K extends keyof T>(key: K, value: T[K]): void
  has(key: string): boolean
  delete(key: string): boolean
  clear(): void
  getAll(): T
  save(): Promise<void>
  load(): Promise<void>
}

// Configuration Validation Types
export interface ConfigValidationResult {
  valid: boolean
  errors: ConfigValidationError[]
  warnings: ConfigValidationWarning[]
}

export interface ConfigValidationError {
  field: string
  message: string
  value?: unknown
}

export interface ConfigValidationWarning {
  field: string
  message: string
  suggestion?: string
}

// Execution Options Types
export interface ExecutionOptions {
  timeout?: number
  retries?: number
  approval?: 'never' | 'untrusted' | 'on-failure' | 'always'
  sandbox?: 'read-only' | 'workspace-write' | 'system-write' | 'danger-full-access'
  enableLogging?: boolean
  enableMetrics?: boolean
  context?: Record<string, unknown>
}

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
  maxTokens?: number
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

export interface UserPreferences {
  autoSave: boolean
  showTokenUsage: boolean
  confirmDestructiveActions: boolean
  preferredOutputFormat: 'json' | 'markdown' | 'plain'
  theme: 'dark' | 'light' | 'auto'
  notifications: NotificationSettings
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

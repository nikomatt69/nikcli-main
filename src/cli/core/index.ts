// Core system exports - barrel file for cleaner imports

// Original exports
export { agentFactory } from './agent-factory'
export { AgentManager } from './agent-manager'
export { agentStream } from './agent-stream'
export { agentTodoManager } from './agent-todo-manager'
export { agentLearningSystem } from './agent-learning-system'
export { intelligentFeedbackWrapper } from './intelligent-feedback-wrapper'
export { AnalyticsManager } from './analytics-manager'
export { createCloudDocsProvider, getCloudDocsProvider } from './cloud-docs-provider'
export { completionCache, CompletionProtocolCache } from './completion-protocol-cache'
export { configManager, simpleConfigManager } from './config-manager'
export { contextTokenManager } from './context-token-manager'
export { docLibrary } from './documentation-library'
export { enhancedTokenCache } from './enhanced-token-cache'
export { inputQueue } from './input-queue'
export { mcpClient } from './mcp-client'
export { QuietCacheLogger, TokenOptimizer } from './performance-optimizer'
export { tokenCache } from './token-cache'
export { toolRouter } from './tool-router'
export { universalTokenizer } from './universal-tokenizer-service'
export { validatorManager } from './validator-manager'

// New optimized systems
export {
  logger,
  errorHandler,
  CLIError,
  logInfo,
  logError,
  logWarn,
  logDebug
} from './error-handler'

export {
  resourceManager,
  createManagedMap,
  createManagedSet,
  createManagedEventEmitter,
  createManagedInterval,
  createManagedTimeout,
  makeDisposable
} from './resource-manager'

export {
  cacheRegistry,
  createCache,
  getCache,
  UnifiedCache,
  tokenCache as unifiedTokenCache,
  completionCache as unifiedCompletionCache,
  semanticCache
} from './unified-cache'

export {
  AsyncUtils,
  defaultRetryOptions,
  defaultTimeoutOptions,
  defaultRateLimitOptions
} from './async-utils'





export {
  systemInitializer,
  initializeSystem,
  shutdownSystem,
  checkSystemHealth,
  isSystemInitialized,
  getSystemConfig,
  getSystemUptime
} from './system-initializer'

// Type exports
export type { SimpleConfigManager } from './config-manager'
export type { DocumentationEntry } from './documentation-library'
export type { McpServerConfig } from './mcp-client'
export type { Disposable } from './resource-manager'
export type { CacheOptions, CacheStats } from './unified-cache'
export type { ErrorCategory, LogLevel, LogEntry } from './error-handler'
export type { TimeoutOptions, RetryOptions, RateLimitOptions } from './async-utils'


export type { InitializationOptions, SystemHealth } from './system-initializer'
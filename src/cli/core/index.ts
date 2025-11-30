// Core system exports - barrel file for cleaner imports

// Original exports
export { agentFactory } from './agent-factory'
export { agentLearningSystem } from './agent-learning-system'
export { AgentManager } from './agent-manager'
export { agentStream } from './agent-stream'
export { agentTodoManager } from './agent-todo-manager'
export { AnalyticsManager } from './analytics-manager'
export type { RateLimitOptions, RetryOptions, TimeoutOptions } from './async-utils'
export {
  AsyncUtils,
  defaultRateLimitOptions,
  defaultRetryOptions,
  defaultTimeoutOptions,
} from './async-utils'
export { createCloudDocsProvider, getCloudDocsProvider } from './cloud-docs-provider'
export { CompletionProtocolCache, completionCache } from './completion-protocol-cache'
// Type exports
export type { SimpleConfigManager } from './config-manager'
export { configManager, simpleConfigManager } from './config-manager'
export { contextTokenManager } from './context-token-manager'
export type { DocumentationEntry } from './documentation-library'
export { docLibrary } from './documentation-library'
export { enhancedTokenCache } from './enhanced-token-cache'
export type { ErrorCategory, LogEntry, LogLevel } from './error-handler'
// New optimized systems
export {
  CLIError,
  errorHandler,
  logDebug,
  logError,
  logger,
  logInfo,
  logWarn,
} from './error-handler'
export { inputQueue } from './input-queue'
export { intelligentFeedbackWrapper } from './intelligent-feedback-wrapper'
export type { McpServerConfig } from './mcp-client'
export { mcpClient } from './mcp-client'
export { QuietCacheLogger, TokenOptimizer } from './performance-optimizer'
export type { Disposable } from './resource-manager'
export {
  createManagedEventEmitter,
  createManagedInterval,
  createManagedMap,
  createManagedSet,
  createManagedTimeout,
  makeDisposable,
  resourceManager,
} from './resource-manager'
export type { InitializationOptions, SystemHealth } from './system-initializer'
export {
  checkSystemHealth,
  getSystemConfig,
  getSystemUptime,
  initializeSystem,
  isSystemInitialized,
  shutdownSystem,
  systemInitializer,
} from './system-initializer'
export { tokenCache } from './token-cache'
export { toolRouter } from './tool-router'
export type { CacheOptions, CacheStats } from './unified-cache'
export {
  cacheRegistry,
  completionCache as unifiedCompletionCache,
  createCache,
  getCache,
  semanticCache,
  tokenCache as unifiedTokenCache,
  UnifiedCache,
} from './unified-cache'
export { universalTokenizer } from './universal-tokenizer-service'
export { validatorManager } from './validator-manager'

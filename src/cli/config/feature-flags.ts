import { z } from 'zod/v3';

/**
 * Feature flags configuration for NikCLI enhanced features
 * Controls Semantic Caching, Agent Memory, and Debug Dashboard functionality
 */

export interface SemanticCacheConfig {
  enabled: boolean
  minSimilarity: number
  ttl: number
  useVectorDB: boolean
  embeddingProvider?: 'openai' | 'anthropic' | 'google'
  maxCacheSize: number
  cacheBackend: 'redis' | 'memory'
}

export interface AgentMemoryConfig {
  enabled: boolean
  maxMemorySize: number
  retrievalTopK: number
  memoryBackend: 'chromadb' | 'memory'
  embeddingProvider?: 'openai' | 'anthropic' | 'google'
  maxContextLength: number
  autoLearning: boolean
}

export interface DebugDashboardConfig {
  enabled: boolean
  updateInterval: number
  showMetrics: boolean
  maxHistorySize: number
  theme: 'dark' | 'light'
  autoRefresh: boolean
}

export const FeatureFlagsSchema = z.object({
  // Cache Configuration
  semanticCache: z.union([
    z.boolean().default(false),
    z.object({
      enabled: z.boolean().default(false),
      minSimilarity: z.number().min(0).max(1).default(0.85),
      ttl: z.number().min(60).default(3600),
      useVectorDB: z.boolean().default(true),
      embeddingProvider: z.enum(['openai', 'anthropic', 'google']).optional(),
      maxCacheSize: z.number().min(1000).default(100000),
      cacheBackend: z.enum(['redis', 'memory']).default('redis'),
    }),
  ]),

  // Memory Configuration
  agentMemory: z.union([
    z.boolean().default(false),
    z.object({
      enabled: z.boolean().default(false),
      maxMemorySize: z.number().min(1000).default(10000),
      retrievalTopK: z.number().min(1).max(20).default(5),
      memoryBackend: z.enum(['chromadb', 'memory']).default('chromadb'),
      embeddingProvider: z.enum(['openai', 'anthropic', 'google']).optional(),
      maxContextLength: z.number().min(1000).default(8000),
      autoLearning: z.boolean().default(true),
    }),
  ]),

  // Dashboard Configuration
  debugDashboard: z.union([
    z.boolean().default(false),
    z.object({
      enabled: z.boolean().default(false),
      updateInterval: z.number().min(100).max(5000).default(500),
      showMetrics: z.boolean().default(true),
      maxHistorySize: z.number().min(100).default(1000),
      theme: z.enum(['dark', 'light']).default('dark'),
      autoRefresh: z.boolean().default(true),
    }),
  ]),
})

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>

// Type guards for feature configurations
export function isSemanticCacheConfig(config: any): config is SemanticCacheConfig {
  return typeof config === 'object' && 'enabled' in config
}

export function isAgentMemoryConfig(config: any): config is AgentMemoryConfig {
  return typeof config === 'object' && 'enabled' in config
}

export function isDebugDashboardConfig(config: any): config is DebugDashboardConfig {
  return typeof config === 'object' && 'enabled' in config
}

/**
 * Load feature flags from environment variables or config
 * Fallback to default values if not specified
 */
export function loadFeatureFlags(): FeatureFlags {
  const cacheConfig = process.env.NIKCLI_SEMANTIC_CACHE
  const memoryConfig = process.env.NIKCLI_AGENT_MEMORY
  const dashboardConfig = process.env.NIKCLI_DEBUG_DASHBOARD

  return FeatureFlagsSchema.parse({
    semanticCache:
      cacheConfig === 'true'
        ? true
        : cacheConfig === 'false'
          ? false
          : cacheConfig === 'enabled'
            ? {
                enabled: true,
                minSimilarity: 0.85,
                ttl: 3600,
                useVectorDB: true,
                maxCacheSize: 100000,
                cacheBackend: 'redis',
              }
            : undefined,

    agentMemory:
      memoryConfig === 'true'
        ? true
        : memoryConfig === 'false'
          ? false
          : memoryConfig === 'enabled'
            ? {
                enabled: true,
                maxMemorySize: 10000,
                retrievalTopK: 5,
                memoryBackend: 'chromadb',
                maxContextLength: 8000,
                autoLearning: true,
              }
            : undefined,

    debugDashboard:
      dashboardConfig === 'true'
        ? true
        : dashboardConfig === 'false'
          ? false
          : dashboardConfig === 'enabled'
            ? {
                enabled: true,
                updateInterval: 500,
                showMetrics: true,
                maxHistorySize: 1000,
                theme: 'dark',
                autoRefresh: true,
              }
            : undefined,
  })
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(flags: FeatureFlags, feature: keyof FeatureFlags): boolean {
  const config = flags[feature]

  if (typeof config === 'boolean') {
    return config
  }

  if (typeof config === 'object' && config !== null) {
    return (config as any).enabled || false
  }

  return false
}

/**
 * Get feature configuration or defaults
 */
export function getFeatureConfig<T>(flags: FeatureFlags, feature: keyof FeatureFlags, defaults: T): T {
  const config = flags[feature]

  if (typeof config === 'object' && config !== null) {
    return config as T
  }

  if (typeof config === 'boolean' && config) {
    return defaults
  }

  // Return defaults with disabled flag for disabled features
  return { ...defaults, enabled: false } as T
}

/**
 * Environment variable helpers for feature flags
 */
export const FeatureFlagEnvVars = {
  SEMANTIC_CACHE: 'NIKCLI_SEMANTIC_CACHE',
  AGENT_MEMORY: 'NIKCLI_AGENT_MEMORY',
  DEBUG_DASHBOARD: 'NIKCLI_DEBUG_DASHBOARD',
} as const

/**
 * Quick feature flag check utilities
 */
export const FeatureFlags = {
  isSemanticCacheEnabled: (flags: FeatureFlags): boolean => isFeatureEnabled(flags, 'semanticCache'),
  isAgentMemoryEnabled: (flags: FeatureFlags): boolean => isFeatureEnabled(flags, 'agentMemory'),
  isDebugDashboardEnabled: (flags: FeatureFlags): boolean => isFeatureEnabled(flags, 'debugDashboard'),
  getSemanticCacheConfig: (flags: FeatureFlags): SemanticCacheConfig =>
    getFeatureConfig(flags, 'semanticCache', {
      enabled: false,
      minSimilarity: 0.85,
      ttl: 3600,
      useVectorDB: true,
      maxCacheSize: 100000,
      cacheBackend: 'redis',
    }),
  getAgentMemoryConfig: (flags: FeatureFlags): AgentMemoryConfig =>
    getFeatureConfig(flags, 'agentMemory', {
      enabled: false,
      maxMemorySize: 10000,
      retrievalTopK: 5,
      memoryBackend: 'chromadb',
      maxContextLength: 8000,
      autoLearning: true,
    }),
  getDebugDashboardConfig: (flags: FeatureFlags): DebugDashboardConfig =>
    getFeatureConfig(flags, 'debugDashboard', {
      enabled: false,
      updateInterval: 500,
      showMetrics: true,
      maxHistorySize: 1000,
      theme: 'dark',
      autoRefresh: true,
    }),
}

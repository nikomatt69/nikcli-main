import * as crypto from 'node:crypto'
import chalk from 'chalk'
import type {
  LanguageModelV1,
  LanguageModelV1StreamPart,
} from 'ai'
import { simulateReadableStream } from 'ai'
import { simpleConfigManager } from '../core/config-manager'
import { cacheService } from '../services/cache-service'
import { smartCache } from '../core/smart-cache-manager'
import { structuredLogger } from '../utils/structured-logger'

/**
 * AI SDK Caching Middleware
 * 
 * Implements caching for AI SDK language models following the official documentation:
 * https://ai-sdk.dev/docs/advanced/caching
 * 
 * Supports both generateText (via wrapGenerate) and streamText (via wrapStream)
 * operations with intelligent cache key generation and stream replay.
 */

export interface AICacheMiddlewareConfig {
  enabled?: boolean
  ttl?: number // Time to live in seconds
  strategy?: 'redis' | 'smart' | 'both'
  streamReplayDelay?: number // Delay between chunks in ms
  includeToolsInKey?: boolean
  cacheKeyPrefix?: string
}

export interface CacheStats {
  hits: number
  misses: number
  errors: number
}

/**
 * Generate a deterministic cache key from request parameters
 */
function generateCacheKey(params: {
  modelId: string
  messages: any[]
  tools?: any
  temperature?: number
  maxTokens?: number
  system?: string
  includeTools?: boolean
}): string {
  const {
    modelId,
    messages,
    tools,
    temperature,
    maxTokens,
    system,
    includeTools = true,
  } = params

  // Normalize messages for consistent key generation
  const normalizedMessages = messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }
    // Handle array content (multimodal)
    if (Array.isArray(msg.content)) {
      return {
        role: msg.role,
        content: msg.content.map((part: any) => {
          if (part.type === 'text') return { type: 'text', text: part.text }
          // For images and other types, use a stable representation
          if (part.type === 'image') {
            return { type: 'image', image: part.image?.toString().substring(0, 100) }
          }
          return part
        }),
      }
    }
    return msg
  })

  // Create cache key object with sorted keys for consistency
  const keyObject: any = {
    model: modelId,
    messages: normalizedMessages,
  }

  if (system) {
    keyObject.system = system
  }

  if (temperature !== undefined) {
    keyObject.temperature = temperature
  }

  if (maxTokens !== undefined) {
    keyObject.maxTokens = maxTokens
  }

  // Include tools in key if enabled and tools are present
  if (includeTools && tools) {
    // Normalize tools - extract just the names and schemas for key generation
    const normalizedTools: any = {}
    if (typeof tools === 'object' && !Array.isArray(tools)) {
      for (const [toolName, toolDef] of Object.entries(tools)) {
        normalizedTools[toolName] = {
          description: (toolDef as any).description,
          parameters: (toolDef as any).parameters,
        }
      }
    }
    keyObject.tools = normalizedTools
  }

  // Create deterministic JSON string with sorted keys
  const keyString = JSON.stringify(keyObject, Object.keys(keyObject).sort())

  // Hash the key string for storage efficiency (SHA-256)
  const hash = crypto.createHash('sha256').update(keyString).digest('hex')

  return `ai_cache:${hash.substring(0, 32)}`
}

/**
 * Create AI SDK caching middleware
 */
export function createAICacheMiddleware(
  config: AICacheMiddlewareConfig = {}
): {
  wrapGenerate: (options: {
    doGenerate: () => Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>>
    params: Parameters<LanguageModelV1['doGenerate']>[0]
  }) => Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>>
  wrapStream: (options: {
    doStream: () => Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>>
    params: Parameters<LanguageModelV1['doStream']>[0]
  }) => Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>>
} {
  // Get configuration from config manager with defaults
  const cacheConfig = simpleConfigManager.get('aiCache') as AICacheMiddlewareConfig | undefined
  const finalConfig: Required<AICacheMiddlewareConfig> = {
    enabled: config.enabled ?? cacheConfig?.enabled ?? true,
    ttl: config.ttl ?? cacheConfig?.ttl ?? 3600, // 1 hour default
    strategy: config.strategy ?? cacheConfig?.strategy ?? 'smart',
    streamReplayDelay: config.streamReplayDelay ?? cacheConfig?.streamReplayDelay ?? 10,
    includeToolsInKey: config.includeToolsInKey ?? cacheConfig?.includeToolsInKey ?? true,
    cacheKeyPrefix: config.cacheKeyPrefix ?? cacheConfig?.cacheKeyPrefix ?? 'ai_cache',
  }

  // Cache statistics
  const stats: CacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
  }

  // Helper to get cache instance based on strategy
  const getCache = async () => {
    if (finalConfig.strategy === 'redis' || finalConfig.strategy === 'both') {
      return cacheService
    }
    return null // Will use smartCache directly
  }

  // Helper to get from cache
  const getFromCache = async <T>(key: string): Promise<T | null> => {
    try {
      if (finalConfig.strategy === 'redis' || finalConfig.strategy === 'both') {
        const cached = await cacheService.get<T>(key, '', {
          strategy: finalConfig.strategy,
        })
        if (cached) {
          stats.hits++
          return cached
        }
      }

      // Fallback to smartCache
      if (finalConfig.strategy === 'smart' || finalConfig.strategy === 'both') {
        const cached = await smartCache.getCachedResponse(key, '')
        if (cached) {
          try {
            const parsed = JSON.parse(cached.response) as T
            stats.hits++
            return parsed
          } catch {
            // If not JSON, return as-is
            stats.hits++
            return cached.response as any
          }
        }
      }

      stats.misses++
      return null
    } catch (error: any) {
      stats.errors++
      structuredLogger.warning(
        `AI Cache: Failed to get from cache for key ${key}`,
        JSON.stringify({ error: error.message })
      )
      return null
    }
  }

  // Helper to set in cache
  const setInCache = async <T>(key: string, value: T): Promise<void> => {
    try {
      if (finalConfig.strategy === 'redis' || finalConfig.strategy === 'both') {
        await cacheService.set(key, value, 'ai', {
          ttl: finalConfig.ttl,
          strategy: finalConfig.strategy,
        })
      }

      // Also set in smartCache for fallback
      if (finalConfig.strategy === 'smart' || finalConfig.strategy === 'both') {
        await smartCache.setCachedResponse(
          key,
          JSON.stringify(value),
          'ai',
          {
            tokensSaved: 0, // Will be calculated elsewhere if needed
            responseTime: 0,
          }
        )
      }
    } catch (error: any) {
      stats.errors++
      structuredLogger.warning(
        `AI Cache: Failed to set in cache for key ${key}`,
        JSON.stringify({ error: error.message })
      )
      // Fail open - don't throw, just log
    }
  }

  return {
    wrapGenerate: async ({ doGenerate, params }) => {
      if (!finalConfig.enabled) {
        return doGenerate()
      }

      // Generate cache key
      const cacheKey = generateCacheKey({
        modelId: params.modelId,
        messages: params.prompt as any[],
        tools: params.tools,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        system: params.system,
        includeTools: finalConfig.includeToolsInKey,
      })

      // Try to get from cache
      const cached = await getFromCache<Awaited<ReturnType<LanguageModelV1['doGenerate']>>>(
        cacheKey
      )

      if (cached !== null) {
        // Format timestamps in cached response
        if (cached.response?.timestamp) {
          return {
            ...cached,
            response: {
              ...cached.response,
              timestamp:
                cached.response.timestamp instanceof Date
                  ? cached.response.timestamp
                  : new Date(cached.response.timestamp),
            },
          }
        }

        // Log cache hit
        structuredLogger.info(
          'AI Cache: Cache hit',
          JSON.stringify({
            key: cacheKey.substring(0, 16),
            model: params.modelId,
          })
        )

        if (process.env.DEBUG) {
          console.log(chalk.dim(`[AI Cache] Cache hit for key: ${cacheKey.substring(0, 16)}...`))
        }

        return cached
      }

      // Cache miss - generate and cache
      structuredLogger.debug(
        'AI Cache: Cache miss',
        JSON.stringify({
          key: cacheKey.substring(0, 16),
          model: params.modelId,
        })
      )

      if (process.env.DEBUG) {
        console.log(chalk.dim(`[AI Cache] Cache miss for key: ${cacheKey.substring(0, 16)}...`))
      }

      try {
        const result = await doGenerate()

        // Cache the result asynchronously (don't wait)
        setInCache(cacheKey, result).catch((error: any) => {
          structuredLogger.warning(
            'AI Cache: Failed to cache result',
            JSON.stringify({
              key: cacheKey.substring(0, 16),
              error: error.message,
            })
          )
        })

        return result
      } catch (error: any) {
        // Log generation error but don't fail the request
        structuredLogger.error(
          'AI Cache: Generation failed',
          JSON.stringify({
            key: cacheKey.substring(0, 16),
            error: error.message,
          })
        )
        throw error
      }
    },

    wrapStream: async ({ doStream, params }) => {
      if (!finalConfig.enabled) {
        return doStream()
      }

      // Generate cache key
      const cacheKey = generateCacheKey({
        modelId: params.modelId,
        messages: params.prompt as any[],
        tools: params.tools,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        system: params.system,
        includeTools: finalConfig.includeToolsInKey,
      })

      // Try to get from cache
      const cached = await getFromCache<LanguageModelV1StreamPart[]>(cacheKey)

      if (cached !== null && Array.isArray(cached)) {
        // Format timestamps in cached stream parts
        const formattedChunks = cached.map((part: any) => {
          if (part.type === 'response-metadata' && part.timestamp) {
            return {
              ...part,
              timestamp:
                part.timestamp instanceof Date ? part.timestamp : new Date(part.timestamp),
            }
          }
          return part
        })

        // Log cache hit
        structuredLogger.info(
          'AI Cache: Stream cache hit',
          JSON.stringify({
            key: cacheKey.substring(0, 16),
            model: params.modelId,
            chunks: formattedChunks.length,
          })
        )

        if (process.env.DEBUG) {
          console.log(
            chalk.dim(
              `[AI Cache] Stream cache hit for key: ${cacheKey.substring(0, 16)}... (${formattedChunks.length} chunks)`
            )
          )
        }

        // Return simulated stream
        return {
          stream: simulateReadableStream({
            initialDelayInMs: 0,
            chunkDelayInMs: finalConfig.streamReplayDelay,
            chunks: formattedChunks,
          }),
        } as Awaited<ReturnType<LanguageModelV1['doStream']>>
      }

      // Cache miss - stream and collect
      structuredLogger.debug(
        'AI Cache: Stream cache miss',
        JSON.stringify({
          key: cacheKey.substring(0, 16),
          model: params.modelId,
        })
      )

      if (process.env.DEBUG) {
        console.log(chalk.dim(`[AI Cache] Stream cache miss for key: ${cacheKey.substring(0, 16)}...`))
      }

      try {
        const { stream, ...rest } = await doStream()

        // Collect all stream parts
        const fullResponse: LanguageModelV1StreamPart[] = []

        // Create a transform stream that collects chunks
        const transformStream = new TransformStream<LanguageModelV1StreamPart, LanguageModelV1StreamPart>({
          transform(chunk, controller) {
            fullResponse.push(chunk)
            controller.enqueue(chunk)
          },
          flush() {
            // Store the full response in cache after streaming is complete
            setInCache(cacheKey, fullResponse).catch((error: any) => {
              structuredLogger.warning(
                'AI Cache: Failed to cache stream result',
                JSON.stringify({
                  key: cacheKey.substring(0, 16),
                  error: error.message,
                  chunks: fullResponse.length,
                })
              )
            })
          },
        })

        return {
          stream: stream.pipeThrough(transformStream),
          ...rest,
        } as Awaited<ReturnType<LanguageModelV1['doStream']>>
      } catch (error: any) {
        // Log stream error but don't fail the request
        structuredLogger.error(
          'AI Cache: Stream generation failed',
          JSON.stringify({
            key: cacheKey.substring(0, 16),
            error: error.message,
          })
        )
        throw error
      }
    },
  }
}

/**
 * Get cache statistics
 */
export function getAICacheStats(): CacheStats {
  // This would need to be implemented as a singleton or passed through
  // For now, return empty stats
  return {
    hits: 0,
    misses: 0,
    errors: 0,
  }
}

/**
 * Clear AI cache (useful for testing or manual invalidation)
 */
export async function clearAICache(pattern?: string): Promise<void> {
  // Implementation would need to iterate through cache keys
  // This is a placeholder for future implementation
  structuredLogger.info('AI Cache: Clear cache requested', JSON.stringify({ pattern }))
}

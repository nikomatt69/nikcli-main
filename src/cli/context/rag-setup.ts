/**
 * Simple RAG Setup - Quickstart pattern integration
 * Following the exact quickstart pattern from context-interceptor-sdk
 */

import { getAISDKMiddleware, indexFromGlob, initContextInterceptor } from 'context-interceptor-sdk'
import { configManager } from '../core/config-manager'

let isInitialized = false

export async function initializeRAG() {
  if (isInitialized) return

  // Get credentials from env or config
  const openaiApiKey = configManager.getApiKey('current') || process.env.OPENAI_API_KEY
  const upstashVectorUrl = process.env.UPSTASH_VECTOR_URL
  const upstashVectorToken = process.env.UPSTASH_VECTOR_TOKEN
  const upstashRedisUrl = process.env.UPSTASH_REDIS_URL
  const upstashRedisToken = process.env.UPSTASH_REDIS_TOKEN

  if (!upstashVectorUrl || !upstashVectorToken || !upstashRedisUrl || !upstashRedisToken) {
    return // RAG not configured, skip silently
  }

  initContextInterceptor({
    openaiApiKey: openaiApiKey!,
    upstashVectorUrl,
    upstashVectorToken,
    upstashRedisUrl,
    upstashRedisToken,
  })

  // Auto-index workspace docs
  try {
    await indexFromGlob(['**/*.md', 'src/**/*.ts'], {
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      maxSizeBytes: 500_000,
      rootDir: process.cwd(),
    })
  } catch (_error) {
    // Ignore indexing errors
  }

  isInitialized = true
}

export function getRAGMiddleware(conversationId?: string) {
  if (!isInitialized) return null
  try {
    return getAISDKMiddleware({ conversationId })
  } catch {
    return null
  }
}

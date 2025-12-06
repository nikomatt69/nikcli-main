/**
 * Tool Embeddings Cache
 *
 * Persistent cache of tool descriptions + metadata embeddings
 * Pre-computed at startup for ultra-fast semantic similarity
 * Zero latency for lookups (~1-2ms per query)
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ToolInstance } from '../core/tool-registry'

/**
 * Cached embedding entry
 */
export interface EmbeddingCacheEntry {
  toolId: string
  toolName: string
  description: string
  embedding: number[]
  tags: string[]
  category: string
  timestamp: number // For cache invalidation
  hash: string // Hash of tool metadata for change detection
}

/**
 * Tool Embeddings Cache Manager
 */
export class ToolEmbeddingsCacheManager {
  private embeddings: Map<string, EmbeddingCacheEntry> = new Map()
  private cacheFile: string
  private embeddingDimensions: number = 384 // Default for most embedding models

  constructor(
    private cacheDir: string = './.nikcli',
    private embeddingService?: any
  ) {
    this.cacheFile = path.join(cacheDir, 'tool-embeddings-cache.json')
  }

  /**
   * Initialize and load cache from disk
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true })
      const data = await fs.readFile(this.cacheFile, 'utf8')
      const cached = JSON.parse(data) as EmbeddingCacheEntry[]

      for (const entry of cached) {
        this.embeddings.set(entry.toolId, entry)
      }

      console.log(`✓ Loaded ${cached.length} tool embeddings from cache`)
    } catch {
      // Cache doesn't exist or is corrupted, start fresh
      console.log('Starting with empty embeddings cache')
    }
  }

  /**
   * Generate simple TF-IDF-style embedding from text
   * Fallback when embeddingService is not available
   * Much faster than neural models, good enough for semantic similarity
   */
  private generateSimpleEmbedding(text: string): number[] {
    // Simple bag-of-words with TF-IDF like scoring
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
    const embedding = new Array(this.embeddingDimensions).fill(0)

    // Map words to dimensions using simple hash
    for (const word of words) {
      const hash = this.simpleHash(word)
      const dim = Math.abs(hash) % this.embeddingDimensions
      embedding[dim] += 1 / Math.max(1, words.length)
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0))
    if (norm > 0) {
      return embedding.map((v) => v / norm)
    }

    return embedding
  }

  /**
   * Simple hash function for string (deterministic)
   */
  private simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash
  }

  /**
   * Compute hash of tool metadata for change detection
   */
  private computeHash(tool: ToolInstance): string {
    const content = `${tool.metadata.name}|${tool.metadata.description}|${tool.metadata.tags.join(',')}|${tool.metadata.category}`
    return this.simpleHash(content).toString()
  }

  /**
   * Add or update tool embedding
   */
  async addToolEmbedding(tool: ToolInstance): Promise<void> {
    const hash = this.computeHash(tool)
    const existing = this.embeddings.get(tool.metadata.id)

    // Skip if unchanged
    if (existing && existing.hash === hash) {
      return
    }

    // Generate embedding
    const textToEmbed = `${tool.metadata.name} ${tool.metadata.description} ${tool.metadata.tags.join(' ')}`

    let embedding: number[]
    if (this.embeddingService && this.embeddingService.embed) {
      try {
        embedding = await this.embeddingService.embed(textToEmbed)
      } catch {
        embedding = this.generateSimpleEmbedding(textToEmbed)
      }
    } else {
      embedding = this.generateSimpleEmbedding(textToEmbed)
    }

    const entry: EmbeddingCacheEntry = {
      toolId: tool.metadata.id,
      toolName: tool.metadata.name,
      description: tool.metadata.description,
      embedding,
      tags: tool.metadata.tags,
      category: tool.metadata.category,
      timestamp: Date.now(),
      hash,
    }

    this.embeddings.set(tool.metadata.id, entry)
  }

  /**
   * Build cache from all available tools
   * Called once at startup
   */
  async buildFromTools(tools: ToolInstance[]): Promise<void> {
    console.log(`Building embeddings cache for ${tools.length} tools...`)

    for (const tool of tools) {
      await this.addToolEmbedding(tool)
    }

    // Save to disk
    await this.save()
    console.log(`✓ Cached embeddings for ${tools.length} tools`)
  }

  /**
   * Get embedding for a tool
   */
  getEmbedding(toolId: string): number[] | null {
    const entry = this.embeddings.get(toolId)
    return entry ? entry.embedding : null
  }

  /**
   * Get all embeddings
   */
  getAllEmbeddings(): Map<string, EmbeddingCacheEntry> {
    return new Map(this.embeddings)
  }

  /**
   * Clear cache
   */
  async clear(): Promise<void> {
    this.embeddings.clear()
    try {
      await fs.unlink(this.cacheFile)
    } catch {
      // File doesn't exist
    }
  }

  /**
   * Save cache to disk
   */
  async save(): Promise<void> {
    try {
      const entries = Array.from(this.embeddings.values())
      await fs.writeFile(this.cacheFile, JSON.stringify(entries, null, 2))
    } catch (error: any) {
      console.error(`Failed to save embeddings cache: ${error.message}`)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalCached: number
    cacheSize: number
    lastUpdated: number
  } {
    const entries = Array.from(this.embeddings.values())
    const lastUpdated = Math.max(...entries.map((e) => e.timestamp), 0)

    // Rough estimate of cache size in bytes
    const cacheSize = JSON.stringify(Array.from(this.embeddings.values())).length

    return {
      totalCached: entries.length,
      cacheSize,
      lastUpdated,
    }
  }
}

/**
 * Singleton instance
 */
let instance: ToolEmbeddingsCacheManager | null = null

export function initializeToolEmbeddingsCache(cacheDir?: string, embeddingService?: any): ToolEmbeddingsCacheManager {
  if (!instance) {
    instance = new ToolEmbeddingsCacheManager(cacheDir, embeddingService)
  }
  return instance
}

export function getToolEmbeddingsCache(): ToolEmbeddingsCacheManager {
  if (!instance) {
    instance = new ToolEmbeddingsCacheManager()
  }
  return instance
}

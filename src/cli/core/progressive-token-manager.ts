import crypto from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CoreMessage } from 'ai'
import chalk from 'chalk'
import { TOKEN_LIMITS } from '../config/token-limits'

// Type definitions
interface ProgressiveTokenConfig {
  maxTokensPerChunk: number
  maxTokensTotal: number
  compressionRatio: number
  enableCheckpointing: boolean
  checkpointDir: string
  maxRetries: number
  summaryMaxTokens: number
}

interface TokenChunk {
  id: string
  index: number
  messages: CoreMessage[]
  estimatedTokens: number
  compressed: boolean
  summary?: string
  metadata: {
    createdAt: Date
    processedAt?: Date
    retryCount: number
    dependencies?: string[]
  }
}

interface ProcessingCheckpoint {
  id: string
  chunkId: string
  state: 'pending' | 'processing' | 'completed' | 'failed'
  result?: any
  error?: string
  timestamp: Date
  context: any
}

/**
 * ProgressiveTokenManager - Handles token overflow by progressive chunking and checkpointing
 *
 * This manager provides:
 * - Progressive chunking of large message contexts
 * - Checkpoint-based state management for recovery
 * - Memory-efficient processing with compression
 * - Context summarization for token reduction
 * - Async processing with progress tracking
 */
export class ProgressiveTokenManager {
  private config: ProgressiveTokenConfig
  private chunks: Map<string, TokenChunk> = new Map()
  private checkpoints: Map<string, ProcessingCheckpoint> = new Map()
  private summaryCache: Map<string, string> = new Map()

  constructor(config?: Partial<ProgressiveTokenConfig>) {
    this.config = {
      maxTokensPerChunk: TOKEN_LIMITS.PROGRESSIVE?.MAX_TOKENS_PER_CHUNK ?? 15000, // ULTRA reduced
      maxTokensTotal: 120000, // DRASTICALLY reduced to 120k (80k safety margin)
      compressionRatio: TOKEN_LIMITS.PROMPT_CAPS?.TARGET_CONTEXT_COMPRESSION_RATIO ?? 0.2, // ULTRA aggressive compression
      enableCheckpointing: true,
      checkpointDir: './.checkpoints',
      maxRetries: TOKEN_LIMITS.PROGRESSIVE?.MAX_RETRIES ?? 1, // Only 1 retry
      summaryMaxTokens: 150, // DRASTICALLY reduced
      ...config,
    }

    if (this.config.enableCheckpointing && this.config.checkpointDir) {
      this.ensureCheckpointDir()
    }
  }

  private ensureCheckpointDir(): void {
    if (this.config.checkpointDir && !existsSync(this.config.checkpointDir)) {
      mkdirSync(this.config.checkpointDir, { recursive: true })
    }
  }

  /**
   * Estimate token count for content
   */
  private estimateTokens(content: string): number {
    // More accurate token estimation
    const words = content.split(/\s+/).length
    const chars = content.length
    const specialChars = (content.match(/[^a-zA-Z0-9\s]/g) || []).length

    // Average: 1 token ≈ 4 chars, but adjust for complexity
    const charEstimate = chars / 4
    const wordEstimate = words * 1.3
    const specialAdjustment = specialChars * 0.2

    return Math.ceil(Math.max(charEstimate, wordEstimate) + specialAdjustment)
  }

  /**
   * EMERGENCY: Truncate content if it exceeds hard limits
   */
  public emergencyTruncate(content: string, maxTokens: number = 120000): string {
    const estimatedTokens = this.estimateTokens(content)

    if (estimatedTokens <= maxTokens) {
      return content
    }

    console.warn(chalk.yellow(`⚠︎  EMERGENCY TRUNCATION: ${estimatedTokens} tokens > ${maxTokens} limit`))

    // Aggressive truncation - keep first 30% and last 10%
    const lines = content.split('\n')
    const keepStart = Math.floor(lines.length * 0.3)
    const keepEnd = Math.floor(lines.length * 0.1)

    const truncatedContent = [
      ...lines.slice(0, keepStart),
      `\n\n[... EMERGENCY TRUNCATED ${lines.length - keepStart - keepEnd} lines to stay under ${maxTokens} token limit ...]\n\n`,
      ...lines.slice(-keepEnd),
    ].join('\n')

    const finalTokens = this.estimateTokens(truncatedContent)
    console.log(chalk.green(`✓ Truncated from ${estimatedTokens} to ${finalTokens} tokens`))

    return truncatedContent
  }

  /**
   * Create chunks from messages with progressive processing
   */
  async createProgressiveChunks(messages: CoreMessage[]): Promise<TokenChunk[]> {
    const chunks: TokenChunk[] = []
    let currentChunk: CoreMessage[] = []
    let currentTokens = 0
    let chunkIndex = 0

    console.log(chalk.blue(`📦 Creating progressive chunks from ${messages.length} messages...`))

    for (const message of messages) {
      const content =
        typeof message.content === 'string'
          ? message.content
          : Array.isArray(message.content)
            ? message.content
                .map((c: any) => (typeof c === 'object' && c.type === 'text' ? c.text : JSON.stringify(c)))
                .join('\n')
            : JSON.stringify(message.content)
      const messageTokens = this.estimateTokens(content)

      // Check if adding this message would exceed chunk limit
      if (currentTokens + messageTokens > this.config.maxTokensPerChunk && currentChunk.length > 0) {
        // Save current chunk
        const chunkId = this.generateChunkId(chunkIndex)
        const chunk: TokenChunk = {
          id: chunkId,
          index: chunkIndex,
          messages: currentChunk,
          estimatedTokens: currentTokens,
          compressed: false,
          metadata: {
            createdAt: new Date(),
            retryCount: 0,
          },
        }

        chunks.push(chunk)
        this.chunks.set(chunkId, chunk)

        console.log(chalk.green(`✓ Chunk ${chunkIndex}: ${currentChunk.length} messages, ~${currentTokens} tokens`))

        // Start new chunk
        currentChunk = [message]
        currentTokens = messageTokens
        chunkIndex++
      } else {
        currentChunk.push(message)
        currentTokens += messageTokens
      }
    }

    // Add remaining messages as final chunk
    if (currentChunk.length > 0) {
      const chunkId = this.generateChunkId(chunkIndex)
      const chunk: TokenChunk = {
        id: chunkId,
        index: chunkIndex,
        messages: currentChunk,
        estimatedTokens: currentTokens,
        compressed: false,
        metadata: {
          createdAt: new Date(),
          retryCount: 0,
        },
      }
      chunks.push(chunk)
      this.chunks.set(chunkId, chunk)

      console.log(chalk.green(`✓ Final chunk ${chunkIndex}: ${currentChunk.length} messages, ~${currentTokens} tokens`))
    }

    console.log(
      chalk.blue(
        `📊 Created ${chunks.length} chunks, average ${Math.floor(messages.length / chunks.length)} messages per chunk`
      )
    )

    return chunks
  }

  /**
   * Process chunks progressively with checkpointing
   */
  async *processChunksProgressively(
    chunks: TokenChunk[],
    processor: (chunk: TokenChunk, context: any) => Promise<any>
  ): AsyncGenerator<{
    type: 'checkpoint' | 'result' | 'summary' | 'progress'
    chunkId: string
    data: any
    progress: number
  }> {
    const totalChunks = chunks.length
    const accumulatedResults: any[] = []
    let processedCount = 0

    console.log(chalk.cyan(`🚀 Starting progressive processing of ${totalChunks} chunks...`))

    for (const chunk of chunks) {
      // Create checkpoint
      const checkpointId = await this.createCheckpoint(chunk.id, {
        totalChunks,
        processedChunks: processedCount,
        accumulatedResults,
      })

      yield {
        type: 'checkpoint',
        chunkId: chunk.id,
        data: { checkpointId },
        progress: (processedCount / totalChunks) * 100,
      }

      try {
        // Process chunk with context from previous results
        const context = {
          previousResults: accumulatedResults.slice(-3), // Last 3 results for context
          chunkIndex: chunk.index,
          totalChunks,
          summary: await this.generateChunkSummary(chunk),
        }

        console.log(
          chalk.yellow(`🔨 Processing chunk ${chunk.index + 1}/${totalChunks} (${chunk.estimatedTokens} tokens)...`)
        )

        const result = await processor(chunk, context)
        accumulatedResults.push(result)

        // Update checkpoint
        await this.updateCheckpoint(checkpointId, 'completed', result)

        // Mark chunk as processed
        if (!chunk.metadata.processedAt) chunk.metadata.processedAt = new Date()

        processedCount++

        yield {
          type: 'result',
          chunkId: chunk.id,
          data: result,
          progress: (processedCount / totalChunks) * 100,
        }

        console.log(chalk.green(`✓ Chunk ${chunk.index + 1}/${totalChunks} processed successfully`))

        // Generate intermediate summary every 5 chunks
        if (processedCount % 5 === 0 && processedCount < totalChunks) {
          const summary = await this.generateIntermediateSummary(accumulatedResults.slice(-5))
          yield {
            type: 'summary',
            chunkId: chunk.id,
            data: { summary },
            progress: (processedCount / totalChunks) * 100,
          }
        }
      } catch (error) {
        console.error(chalk.red(`✖ Error processing chunk ${chunk.id}:`, error))

        await this.updateCheckpoint(checkpointId, 'failed', null, error)

        // Try to recover or skip
        if (this.canRecover(error)) {
          console.log(chalk.yellow(`⚡︎ Attempting recovery for chunk ${chunk.id}...`))
          // Implement recovery logic here
        } else {
          console.log(chalk.red(`⚠︎ Skipping failed chunk ${chunk.id}`))
        }
      }

      // Yield progress update
      yield {
        type: 'progress',
        chunkId: chunk.id,
        data: {
          processed: processedCount,
          total: totalChunks,
          percentage: Math.round((processedCount / totalChunks) * 100),
        },
        progress: (processedCount / totalChunks) * 100,
      }
    }

    console.log(chalk.green(`✨ Progressive processing completed: ${processedCount}/${totalChunks} chunks`))
  }

  /**
   * Generate summary for a chunk
   */
  private async generateChunkSummary(chunk: TokenChunk): Promise<string> {
    const cacheKey = `summary_${chunk.id}`

    if (this.summaryCache.has(cacheKey)) {
      return this.summaryCache.get(cacheKey)!
    }

    // Extract key information from messages
    const _topics = new Set<string>()
    const actions = new Set<string>()
    let userIntentions = ''

    for (const msg of chunk.messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)

      if (msg.role === 'user') {
        userIntentions = content.substring(0, 200)
      }

      // Extract topics and actions
      if (content.includes('implement') || content.includes('create')) actions.add('implementation')
      if (content.includes('fix') || content.includes('debug')) actions.add('debugging')
      if (content.includes('analyze') || content.includes('review')) actions.add('analysis')
      if (content.includes('optimize') || content.includes('improve')) actions.add('optimization')
    }

    const summary =
      `Chunk ${chunk.index}: ${chunk.messages.length} messages, ${chunk.estimatedTokens} tokens. ` +
      `Actions: ${Array.from(actions).join(', ') || 'general'}. ` +
      `User intent: ${userIntentions.substring(0, 100) || 'not specified'}`

    // Cache the summary
    this.summaryCache.set(cacheKey, summary)

    return summary
  }

  /**
   * Generate intermediate summary of results
   */
  private async generateIntermediateSummary(results: any[]): Promise<string> {
    const summary = results
      .map((r, i) => {
        if (typeof r === 'string') {
          return `[${i}]: ${r.substring(0, 100)}...`
        }
        return `[${i}]: ${JSON.stringify(r).substring(0, 100)}...`
      })
      .join('\n')

    return `Intermediate Summary (${results.length} results):\n${summary}`
  }

  /**
   * Create a processing checkpoint
   */
  private async createCheckpoint(chunkId: string, context: any): Promise<string> {
    const checkpointId = crypto.randomBytes(16).toString('hex')
    const checkpoint: ProcessingCheckpoint = {
      id: checkpointId,
      chunkId,
      state: 'processing',
      context,
      timestamp: new Date(),
    }

    this.checkpoints.set(checkpointId, checkpoint)

    if (this.config.enableCheckpointing && this.config.checkpointDir) {
      const checkpointPath = join(this.config.checkpointDir, `${checkpointId}.json`)
      writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2))
    }

    return checkpointId
  }

  /**
   * Update an existing checkpoint
   */
  private async updateCheckpoint(
    checkpointId: string,
    state: ProcessingCheckpoint['state'],
    result?: any,
    error?: any
  ): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId)
    if (!checkpoint) return

    checkpoint.state = state
    checkpoint.timestamp = new Date()

    if (result !== undefined) {
      checkpoint.result = result
    }

    if (error) {
      checkpoint.error = error instanceof Error ? error.message : String(error)
    }

    if (this.config.enableCheckpointing && this.config.checkpointDir) {
      const checkpointPath = join(this.config.checkpointDir, `${checkpointId}.json`)
      writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2))
    }
  }

  /**
   * Resume from checkpoint
   */
  async resumeFromCheckpoint(checkpointId: string): Promise<ProcessingCheckpoint | null> {
    // Try memory first
    if (this.checkpoints.has(checkpointId)) {
      return this.checkpoints.get(checkpointId)!
    }

    // Try disk
    if (this.config.checkpointDir) {
      const checkpointPath = join(this.config.checkpointDir, `${checkpointId}.json`)
      if (existsSync(checkpointPath)) {
        const data = readFileSync(checkpointPath, 'utf-8')
        const checkpoint = JSON.parse(data) as ProcessingCheckpoint
        this.checkpoints.set(checkpointId, checkpoint)
        return checkpoint
      }
    }

    return null
  }

  /**
   * Compress messages to reduce token count
   */
  async compressMessages(messages: CoreMessage[]): Promise<CoreMessage[]> {
    const compressed: CoreMessage[] = []
    const _targetReduction = 1 - this.config.compressionRatio

    for (const message of messages) {
      if (message.role === 'system') {
        // Keep system messages but truncate if needed
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        compressed.push({
          ...message,
          content: content.length > 1000 ? `${content.substring(0, 1000)}...[truncated]` : content,
        })
      } else if (message.role === 'user') {
        // Keep user messages mostly intact
        compressed.push(message)
      } else if (message.role !== 'tool') {
        // Compress assistant messages more aggressively
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        if (content.length > 500) {
          compressed.push({
            ...message,
            content: `${content.substring(0, 400)}...[compressed]`,
          })
        } else {
          compressed.push(message)
        }
      }
    }

    const originalTokens = this.estimateMessagesTokens(messages)
    const compressedTokens = this.estimateMessagesTokens(compressed)
    const reduction = (originalTokens - compressedTokens) / originalTokens

    console.log(
      chalk.blue(
        `📉 Compression: ${originalTokens} → ${compressedTokens} tokens (${Math.round(reduction * 100)}% reduction)`
      )
    )

    return compressed
  }

  /**
   * Estimate total tokens in messages
   */
  private estimateMessagesTokens(messages: CoreMessage[]): number {
    return messages.reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      return total + this.estimateTokens(content)
    }, 0)
  }

  /**
   * Generate chunk ID
   */
  private generateChunkId(index: number): string {
    return `chunk_${index}_${Date.now()}`
  }

  /**
   * Check if error is recoverable
   */
  private canRecover(error: any): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Recoverable errors
    if (errorMessage.includes('rate limit')) return true
    if (errorMessage.includes('timeout')) return true
    if (errorMessage.includes('temporary')) return true

    return false
  }

  /**
   * Clear all chunks and checkpoints
   */
  clearAll(): void {
    this.chunks.clear()
    this.checkpoints.clear()
    this.summaryCache.clear()

    console.log(chalk.yellow('🧹 Cleared all chunks, checkpoints, and summaries'))
  }

  /**
   * Get processing statistics
   */
  getStatistics(): {
    totalChunks: number
    processedChunks: number
    failedChunks: number
    totalTokens: number
    averageTokensPerChunk: number
  } {
    const chunks = Array.from(this.chunks.values())
    const processed = chunks.filter((c) => !!c.metadata.processedAt).length
    const failed = Array.from(this.checkpoints.values()).filter((c) => c.state === 'failed').length
    const totalTokens = chunks.reduce((sum, c) => sum + c.estimatedTokens, 0)

    return {
      totalChunks: chunks.length,
      processedChunks: processed,
      failedChunks: failed,
      totalTokens,
      averageTokensPerChunk: chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0,
    }
  }
}

// Export singleton instance
export const progressiveTokenManager = new ProgressiveTokenManager()

import { Logger } from '../utils/logger';
import { Embedder } from '../indexer/embedder';
import { VectorStore } from '../storage/vector-store';
import { EmbeddedChunk } from '../types';

export interface EmbeddingPattern {
  id: string;
  type: 'conversation' | 'document' | 'query' | 'response';
  text: string;
  metadata: Record<string, any>;
  frequency: number;
  lastUsed: Date;
}

export class PatternConsolidator {
  private logger: Logger;
  private embedder: Embedder;
  private vectorStore: VectorStore;
  private patterns = new Map<string, EmbeddingPattern>();
  private consolidationQueue: EmbeddingPattern[] = [];
  private isProcessing = false;

  constructor(embedder: Embedder, vectorStore: VectorStore, logger: Logger) {
    this.embedder = embedder;
    this.vectorStore = vectorStore;
    this.logger = logger;
  }

  /**
   * Add pattern to consolidation queue
   */
  async addPattern(pattern: EmbeddingPattern): Promise<void> {
    const existingPattern = this.patterns.get(pattern.id);

    if (existingPattern) {
      existingPattern.frequency++;
      existingPattern.lastUsed = new Date();
    } else {
      this.patterns.set(pattern.id, pattern);
      this.consolidationQueue.push(pattern);
    }

    // Trigger background processing if queue is large enough
    if (this.consolidationQueue.length >= 10 && !this.isProcessing) {
      // Run in background without awaiting
      this.processQueue().catch((error) => {
        this.logger.error('Background processing error', { error });
      });
    }
  }

  /**
   * Process consolidation queue in background
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.logger.debug('Starting pattern consolidation', {
      queueSize: this.consolidationQueue.length,
    });

    try {
      const batchSize = 50;
      const batch = this.consolidationQueue.splice(0, batchSize);

      // Group similar patterns
      const groups = await this.groupSimilarPatterns(batch);

      // Create unified embeddings for each group
      for (const group of groups) {
        await this.createUnifiedEmbedding(group);
      }

      this.logger.info('Pattern consolidation complete', {
        processedPatterns: batch.length,
        createdGroups: groups.length,
      });

      // Continue if more patterns in queue
      if (this.consolidationQueue.length > 0) {
        setTimeout(() => this.processQueue(), 1000);
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      this.logger.error('Pattern consolidation failed', { error });
      this.isProcessing = false;
    }
  }

  /**
   * Group similar patterns using embeddings
   */
  private async groupSimilarPatterns(patterns: EmbeddingPattern[]): Promise<EmbeddingPattern[][]> {
    const groups: EmbeddingPattern[][] = [];
    const processed = new Set<string>();

    for (const pattern of patterns) {
      if (processed.has(pattern.id)) continue;

      const group = [pattern];
      processed.add(pattern.id);

      // Find similar patterns
      const patternEmbedding = await this.embedder.generateEmbedding(pattern.text);

      for (const otherPattern of patterns) {
        if (processed.has(otherPattern.id)) continue;

        const otherEmbedding = await this.embedder.generateEmbedding(otherPattern.text);
        const similarity = this.cosineSimilarity(patternEmbedding, otherEmbedding);

        if (similarity > 0.9) {
          group.push(otherPattern);
          processed.add(otherPattern.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Create unified embedding from pattern group
   */
  private async createUnifiedEmbedding(patterns: EmbeddingPattern[]): Promise<void> {
    // Combine pattern texts with frequency weighting
    const combinedText = patterns.map((p) => `[${p.frequency}x] ${p.text}`).join('\n\n');

    const unifiedEmbedding = await this.embedder.generateEmbedding(combinedText);

    // Store unified embedding with consolidated metadata
    const unifiedMetadata = {
      type: 'unified_pattern',
      patternCount: patterns.length,
      totalFrequency: patterns.reduce((sum, p) => sum + p.frequency, 0),
      patternTypes: [...new Set(patterns.map((p) => p.type))],
      createdAt: new Date(),
    };

    const unifiedChunk: EmbeddedChunk = {
      id: `unified_${patterns[0].id}`,
      text: combinedText,
      vector: unifiedEmbedding,
      metadata: unifiedMetadata,
      position: 0,
      totalChunks: 1,
    };

    await this.vectorStore.upsert(unifiedChunk);

    this.logger.debug('Created unified embedding', {
      patternCount: patterns.length,
      unifiedId: `unified_${patterns[0].id}`,
    });
  }

  /**
   * Calculate cosine similarity between vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPatterns: number;
    queueSize: number;
    isProcessing: boolean;
  } {
    return {
      totalPatterns: this.patterns.size,
      queueSize: this.consolidationQueue.length,
      isProcessing: this.isProcessing,
    };
  }
}

export const createPatternConsolidator = (
  embedder: Embedder,
  vectorStore: VectorStore,
  logger: Logger
): PatternConsolidator => {
  return new PatternConsolidator(embedder, vectorStore, logger);
};


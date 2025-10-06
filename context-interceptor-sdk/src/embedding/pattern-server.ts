import { SearchResult } from '../types';
import { PatternConsolidator, EmbeddingPattern } from './pattern-consolidator';
import { VectorStore } from '../storage/vector-store';
import { Embedder } from '../indexer/embedder';
import { Logger } from '../utils/logger';

export class PatternServer {
  private consolidator: PatternConsolidator;
  private vectorStore: VectorStore;
  private embedder: Embedder;
  private logger: Logger;
  private cache = new Map<string, SearchResult[]>();

  constructor(consolidator: PatternConsolidator, vectorStore: VectorStore, embedder: Embedder, logger: Logger) {
    this.consolidator = consolidator;
    this.vectorStore = vectorStore;
    this.embedder = embedder;
    this.logger = logger;
  }

  /**
   * Serve patterns on-demand for a query
   */
  async servePatterns(
    query: string,
    options: {
      topK?: number;
      includeUnified?: boolean;
      includeRaw?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    const { topK = 5, includeUnified = true, includeRaw = true } = options;

    // Check cache
    const cacheKey = `${query}_${topK}_${includeUnified}_${includeRaw}`;
    if (this.cache.has(cacheKey)) {
      this.logger.debug('Serving patterns from cache');
      return this.cache.get(cacheKey)!;
    }

    const results: SearchResult[] = [];
    const queryEmbedding = await this.generateQueryEmbedding(query);

    // Get unified patterns
    if (includeUnified) {
      try {
        const unifiedResults = await this.vectorStore.query(queryEmbedding, topK, {
          type: 'unified_pattern',
        });

        results.push(...unifiedResults.map((r) => this.toSearchResult(r)));
      } catch (error) {
        this.logger.warn('Failed to get unified patterns', { error });
      }
    }

    // Get raw patterns if needed
    if (includeRaw) {
      try {
        // Note: Upstash doesn't support $ne operator, so we get all and filter
        const rawResults = await this.vectorStore.query(queryEmbedding, topK * 2);

        const filtered = rawResults.filter((r) => r.metadata?.type !== 'unified_pattern');

        results.push(...filtered.map((r) => this.toSearchResult(r)));
      } catch (error) {
        this.logger.warn('Failed to get raw patterns', { error });
      }
    }

    // Sort by score and deduplicate
    const deduplicated = this.deduplicateResults(results);
    const sorted = deduplicated.sort((a, b) => b.score - a.score).slice(0, topK);

    // Cache results
    this.cache.set(cacheKey, sorted);

    // Record pattern usage in background
    for (const result of sorted) {
      this.consolidator
        .addPattern({
          id: result.id,
          type: 'query',
          text: result.text,
          metadata: result.metadata,
          frequency: 1,
          lastUsed: new Date(),
        })
        .catch((error) => {
          this.logger.warn('Failed to add pattern', { error });
        });
    }

    this.logger.debug('Served patterns on-demand', {
      query: query.substring(0, 50),
      resultsCount: sorted.length,
      includeUnified,
      includeRaw,
    });

    return sorted;
  }

  /**
   * Clear pattern cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Pattern cache cleared');
  }

  /**
   * Generate embedding for query
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    return this.embedder.generateEmbedding(query);
  }

  /**
   * Convert vector result to search result
   */
  private toSearchResult(vectorResult: any): SearchResult {
    return {
      id: vectorResult.id,
      text: vectorResult.metadata?.text || '',
      score: vectorResult.score,
      metadata: vectorResult.metadata || {},
    };
  }

  /**
   * Deduplicate results by ID
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }
}

export const createPatternServer = (
  consolidator: PatternConsolidator,
  vectorStore: VectorStore,
  embedder: Embedder,
  logger: Logger
): PatternServer => {
  return new PatternServer(consolidator, vectorStore, embedder, logger);
};


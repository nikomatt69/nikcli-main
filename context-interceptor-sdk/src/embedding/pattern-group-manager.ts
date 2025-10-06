import { Logger } from '../utils/logger';
import { Embedder } from '../indexer/embedder';
import { VectorStore } from '../storage/vector-store';

export interface PatternGroup {
  id: string; // Unique identifier
  cacheKey: string; // Cache key for fast lookup
  patterns: Array<{
    text: string;
    embedding: number[];
    frequency: number;
    lastUsed: Date;
    metadata: Record<string, any>;
  }>;
  unifiedEmbedding: number[];
  characteristics: {
    domain: string; // e.g., 'react', 'nextjs', 'typescript'
    intent: string; // e.g., 'how-to', 'explanation', 'debugging'
    complexity: 'simple' | 'medium' | 'complex';
    avgFrequency: number;
    totalUsage: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class PatternGroupManager {
  private logger: Logger;
  private embedder: Embedder;
  private vectorStore: VectorStore;
  private groups = new Map<string, PatternGroup>();
  private cacheKeyIndex = new Map<string, string>(); // cacheKey -> groupId

  constructor(embedder: Embedder, vectorStore: VectorStore, logger: Logger) {
    this.embedder = embedder;
    this.vectorStore = vectorStore;
    this.logger = logger;
  }

  /**
   * Create a new pattern group from similar patterns
   */
  async createGroup(
    patterns: Array<{
      text: string;
      metadata: Record<string, any>;
      frequency: number;
    }>
  ): Promise<PatternGroup> {
    // Generate embeddings for all patterns
    const embeddedPatterns = await Promise.all(
      patterns.map(async (p) => ({
        text: p.text,
        embedding: await this.embedder.generateEmbedding(p.text),
        frequency: p.frequency,
        lastUsed: new Date(),
        metadata: p.metadata,
      }))
    );

    // Create unified embedding (weighted average)
    const unifiedEmbedding = this.createUnifiedEmbedding(embeddedPatterns);

    // Extract characteristics
    const characteristics = this.extractCharacteristics(embeddedPatterns);

    // Generate IDs
    const groupId = this.generateGroupId(characteristics);
    const cacheKey = this.generateCacheKey(characteristics);

    const group: PatternGroup = {
      id: groupId,
      cacheKey,
      patterns: embeddedPatterns,
      unifiedEmbedding,
      characteristics,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store group
    this.groups.set(groupId, group);
    this.cacheKeyIndex.set(cacheKey, groupId);

    // Store in vector store
    await this.storeGroupInVector(group);

    this.logger.debug('Pattern group created', {
      groupId,
      cacheKey,
      patternCount: patterns.length,
      characteristics,
    });

    return group;
  }

  /**
   * Find best matching group for a query
   */
  async findBestGroup(
    queryText: string,
    queryCharacteristics?: Partial<PatternGroup['characteristics']>
  ): Promise<PatternGroup | null> {
    // First try cache key lookup if characteristics provided
    if (queryCharacteristics) {
      const cacheKey = this.generateCacheKey(queryCharacteristics as any);
      const groupId = this.cacheKeyIndex.get(cacheKey);
      if (groupId) {
        const group = this.groups.get(groupId);
        if (group) {
          this.logger.debug('Found group via cache key', { cacheKey, groupId });
          return group;
        }
      }
    }

    // Generate query embedding
    const queryEmbedding = await this.embedder.generateEmbedding(queryText);

    // Find best matching group
    let bestGroup: PatternGroup | null = null;
    let bestScore = 0;

    for (const group of this.groups.values()) {
      const similarity = this.cosineSimilarity(queryEmbedding, group.unifiedEmbedding);

      // Boost score based on characteristics match
      let score = similarity;
      if (queryCharacteristics) {
        if (queryCharacteristics.domain === group.characteristics.domain) score += 0.1;
        if (queryCharacteristics.intent === group.characteristics.intent) score += 0.1;
        if (queryCharacteristics.complexity === group.characteristics.complexity) score += 0.05;
      }

      // Boost score based on usage frequency
      score += Math.log(group.characteristics.totalUsage + 1) * 0.01;

      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }

    if (bestGroup) {
      this.logger.debug('Found best matching group', {
        groupId: bestGroup.id,
        score: bestScore,
        characteristics: bestGroup.characteristics,
      });
    }

    return bestGroup;
  }

  /**
   * Update group with new pattern usage
   */
  async updateGroupUsage(groupId: string, patternText?: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) return;

    group.characteristics.totalUsage++;
    group.updatedAt = new Date();

    if (patternText) {
      // Find matching pattern and update frequency
      const pattern = group.patterns.find((p) => p.text === patternText);
      if (pattern) {
        pattern.frequency++;
        pattern.lastUsed = new Date();

        // Recalculate avgFrequency
        group.characteristics.avgFrequency =
          group.patterns.reduce((sum, p) => sum + p.frequency, 0) / group.patterns.length;

        // Recompute unified embedding if usage changed significantly
        if (pattern.frequency % 5 === 0) {
          group.unifiedEmbedding = this.createUnifiedEmbedding(group.patterns);
          await this.storeGroupInVector(group);
        }
      }
    }
  }

  /**
   * Get group by ID
   */
  getGroup(groupId: string): PatternGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Get group by cache key
   */
  getGroupByCacheKey(cacheKey: string): PatternGroup | undefined {
    const groupId = this.cacheKeyIndex.get(cacheKey);
    return groupId ? this.groups.get(groupId) : undefined;
  }

  /**
   * List all groups
   */
  listGroups(filter?: {
    domain?: string;
    intent?: string;
    minUsage?: number;
  }): PatternGroup[] {
    let groups = Array.from(this.groups.values());

    if (filter) {
      if (filter.domain) {
        groups = groups.filter((g) => g.characteristics.domain === filter.domain);
      }
      if (filter.intent) {
        groups = groups.filter((g) => g.characteristics.intent === filter.intent);
      }
      if (filter.minUsage !== undefined) {
        groups = groups.filter((g) => g.characteristics.totalUsage >= filter.minUsage!);
      }
    }

    return groups.sort((a, b) => b.characteristics.totalUsage - a.characteristics.totalUsage);
  }

  /**
   * Create unified embedding from patterns (weighted average)
   */
  private createUnifiedEmbedding(
    patterns: Array<{ embedding: number[]; frequency: number }>
  ): number[] {
    const dimensions = patterns[0].embedding.length;
    const totalWeight = patterns.reduce((sum, p) => sum + p.frequency, 0);

    const unified = new Array(dimensions).fill(0);

    for (const pattern of patterns) {
      const weight = pattern.frequency / totalWeight;
      for (let i = 0; i < dimensions; i++) {
        unified[i] += pattern.embedding[i] * weight;
      }
    }

    return unified;
  }

  /**
   * Extract characteristics from patterns
   */
  private extractCharacteristics(
    patterns: Array<{ text: string; metadata: Record<string, any>; frequency: number }>
  ): PatternGroup['characteristics'] {
    // Extract domain from metadata or text
    const domains = patterns.map((p) => p.metadata.domain || this.inferDomain(p.text));
    const domain = this.mostCommon(domains);

    // Extract intent
    const intents = patterns.map((p) => p.metadata.intent || this.inferIntent(p.text));
    const intent = this.mostCommon(intents);

    // Calculate complexity
    const avgLength = patterns.reduce((sum, p) => sum + p.text.length, 0) / patterns.length;
    const complexity = avgLength < 100 ? 'simple' : avgLength < 300 ? 'medium' : 'complex';

    // Calculate statistics
    const avgFrequency = patterns.reduce((sum, p) => sum + p.frequency, 0) / patterns.length;
    const totalUsage = patterns.reduce((sum, p) => sum + p.frequency, 0);

    return {
      domain,
      intent,
      complexity,
      avgFrequency,
      totalUsage,
    };
  }

  /**
   * Generate unique group ID
   */
  private generateGroupId(characteristics: PatternGroup['characteristics']): string {
    const timestamp = Date.now();
    const hash = this.simpleHash(`${characteristics.domain}_${characteristics.intent}_${timestamp}`);
    return `grp_${hash}`;
  }

  /**
   * Generate cache key for fast lookup
   */
  private generateCacheKey(characteristics: PatternGroup['characteristics']): string {
    return `${characteristics.domain}:${characteristics.intent}:${characteristics.complexity}`;
  }

  /**
   * Store group in vector store
   */
  private async storeGroupInVector(group: PatternGroup): Promise<void> {
    await this.vectorStore.upsert({
      id: group.id,
      text: group.patterns.map((p) => p.text).join('\n'),
      vector: group.unifiedEmbedding,
      metadata: {
        type: 'pattern_group',
        cacheKey: group.cacheKey,
        characteristics: group.characteristics,
        patternCount: group.patterns.length,
        createdAt: group.createdAt.toISOString(),
      },
      position: 0,
      totalChunks: 1,
    });
  }

  /**
   * Infer domain from text
   */
  private inferDomain(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('react') || lower.includes('component')) return 'react';
    if (lower.includes('next') || lower.includes('nextjs')) return 'nextjs';
    if (lower.includes('typescript') || lower.includes('type')) return 'typescript';
    if (lower.includes('api') || lower.includes('endpoint')) return 'api';
    if (lower.includes('database') || lower.includes('sql')) return 'database';
    return 'general';
  }

  /**
   * Infer intent from text
   */
  private inferIntent(text: string): string {
    const lower = text.toLowerCase();
    if (lower.startsWith('how to') || lower.includes('how do')) return 'how-to';
    if (lower.startsWith('what is') || lower.startsWith('what are')) return 'explanation';
    if (lower.startsWith('why') || lower.includes('reason')) return 'reasoning';
    if (lower.includes('error') || lower.includes('bug') || lower.includes('fix')) return 'debugging';
    if (lower.includes('best practice') || lower.includes('recommend')) return 'best-practice';
    return 'general';
  }

  /**
   * Most common element in array
   */
  private mostCommon<T>(arr: T[]): T {
    const counts = new Map<T, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    let max = 0;
    let result = arr[0];
    for (const [item, count] of counts) {
      if (count > max) {
        max = count;
        result = item;
      }
    }
    return result;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Cosine similarity
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
    totalGroups: number;
    totalPatterns: number;
    avgPatternsPerGroup: number;
    topDomains: Array<{ domain: string; count: number }>;
    topIntents: Array<{ intent: string; count: number }>;
  } {
    const groups = Array.from(this.groups.values());
    const totalPatterns = groups.reduce((sum, g) => sum + g.patterns.length, 0);

    const domainCounts = new Map<string, number>();
    const intentCounts = new Map<string, number>();

    for (const group of groups) {
      domainCounts.set(group.characteristics.domain, (domainCounts.get(group.characteristics.domain) || 0) + 1);
      intentCounts.set(group.characteristics.intent, (intentCounts.get(group.characteristics.intent) || 0) + 1);
    }

    return {
      totalGroups: groups.length,
      totalPatterns,
      avgPatternsPerGroup: groups.length > 0 ? totalPatterns / groups.length : 0,
      topDomains: Array.from(domainCounts.entries())
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      topIntents: Array.from(intentCounts.entries())
        .map(([intent, count]) => ({ intent, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }
}

export const createPatternGroupManager = (embedder: Embedder, vectorStore: VectorStore, logger: Logger) => {
  return new PatternGroupManager(embedder, vectorStore, logger);
};


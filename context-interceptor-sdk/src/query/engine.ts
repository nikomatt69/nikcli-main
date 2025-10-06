import { SearchResult, QueryOptions, ConversationMessage, VectorQueryResult } from '../types';
import { Embedder } from '../indexer/embedder';
import { VectorStore } from '../storage/vector-store';
import { RedisStore } from '../storage/redis-store';
import { Logger } from '../utils/logger';
import { validateQueryOptions } from '../utils/validation';

export class QueryEngine {
    private embedder: Embedder;
    private vectorStore: VectorStore;
    private redisStore: RedisStore;
    private logger: Logger;
    private defaultTopK: number = 10;
    private defaultScoreThreshold: number = 0.7;

    constructor(
        embedder: Embedder,
        vectorStore: VectorStore,
        redisStore: RedisStore,
        logger: Logger,
        config?: { topK?: number; scoreThreshold?: number }
    ) {
        this.embedder = embedder;
        this.vectorStore = vectorStore;
        this.redisStore = redisStore;
        this.logger = logger;

        if (config?.topK) this.defaultTopK = config.topK;
        if (config?.scoreThreshold) this.defaultScoreThreshold = config.scoreThreshold;
    }

    async search(query: string, options: QueryOptions = {}): Promise<SearchResult[]> {
        validateQueryOptions(options);

        const topK = options.topK || this.defaultTopK;
        const scoreThreshold = options.scoreThreshold || this.defaultScoreThreshold;

        this.logger.debug('Executing semantic search', {
            queryLength: query.length,
            topK,
            scoreThreshold
        });

        const queryEmbedding = await this.embedder.generateEmbedding(query);

        const results = await this.vectorStore.query(
            queryEmbedding,
            topK,
            options.metadataFilter
        );

        const filteredResults = results
            .filter(r => r.score >= scoreThreshold)
            .map(r => this.toSearchResult(r))
            .sort((a, b) => b.score - a.score);

        this.logger.debug(`Search completed: ${filteredResults.length}/${results.length} results above threshold`);

        return filteredResults;
    }

    async multiQuerySearch(queries: string[], options: QueryOptions = {}): Promise<SearchResult[]> {
        this.logger.debug(`Executing multi-query search with ${queries.length} variants`);

        const allResults = await Promise.all(
            queries.map(q => this.search(q, { ...options, topK: (options.topK || this.defaultTopK) * 2 }))
        );

        const mergedResults = this.deduplicateAndMerge(allResults);

        const topK = options.topK || this.defaultTopK;
        return mergedResults.slice(0, topK);
    }

    async getConversationHistory(conversationId: string, limit?: number): Promise<ConversationMessage[]> {
        this.logger.debug('Retrieving conversation history', {
            conversationId,
            limit
        });

        return this.redisStore.getHistory(conversationId, limit);
    }

    private toSearchResult(result: VectorQueryResult): SearchResult {
        const metadata = result.metadata || {};
        const text = metadata.text as string || '';

        delete metadata.text;

        return {
            id: result.id,
            text,
            score: result.score,
            metadata
        };
    }

    private deduplicateAndMerge(resultSets: SearchResult[][]): SearchResult[] {
        const scoreMap = new Map<string, { result: SearchResult; totalScore: number; count: number }>();

        for (const results of resultSets) {
            for (const result of results) {
                const existing = scoreMap.get(result.id);

                if (existing) {
                    existing.totalScore += result.score;
                    existing.count += 1;
                    existing.result.score = existing.totalScore / existing.count;
                } else {
                    scoreMap.set(result.id, {
                        result: { ...result },
                        totalScore: result.score,
                        count: 1
                    });
                }
            }
        }

        const boostFactor = 0.1;
        const mergedResults = Array.from(scoreMap.values())
            .map(({ result, count }) => ({
                ...result,
                score: result.score + (count > 1 ? boostFactor * (count - 1) : 0)
            }))
            .sort((a, b) => b.score - a.score);

        this.logger.debug('Multi-query results merged', {
            totalResults: mergedResults.length,
            originalSets: resultSets.length
        });

        return mergedResults;
    }

    generateQueryVariants(query: string): string[] {
        const variants = [query];

        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who'];
        const hasQuestion = questionWords.some(w => query.toLowerCase().includes(w));

        if (hasQuestion) {
            const statement = query.replace(/\?/g, '').trim();
            variants.push(statement);
        } else {
            if (!query.endsWith('?')) {
                variants.push(`${query}?`);
            }
        }

        const words = query.split(/\s+/);
        if (words.length > 3) {
            const firstHalf = words.slice(0, Math.ceil(words.length / 2)).join(' ');
            const secondHalf = words.slice(Math.floor(words.length / 2)).join(' ');

            if (firstHalf.length > 10) variants.push(firstHalf);
            if (secondHalf.length > 10) variants.push(secondHalf);
        }

        return [...new Set(variants)];
    }
}

export const createQueryEngine = (
    embedder: Embedder,
    vectorStore: VectorStore,
    redisStore: RedisStore,
    logger: Logger,
    config?: { topK?: number; scoreThreshold?: number }
): QueryEngine => {
    return new QueryEngine(embedder, vectorStore, redisStore, logger, config);
};


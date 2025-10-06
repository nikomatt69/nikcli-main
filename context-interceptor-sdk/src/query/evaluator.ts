import { SearchResult, ConversationMessage, ContextPattern, PatternExtractionResult, RerankOptions } from '../types';
import { Logger } from '../utils/logger';

export class PatternEvaluator {
    private logger: Logger;
    private maxContextTokens: number;
    private avgCharsPerToken: number = 4;

    constructor(logger: Logger, maxContextTokens: number = 4000) {
        this.logger = logger;
        this.maxContextTokens = maxContextTokens;
    }

    buildContextPattern(
        chunks: SearchResult[],
        history: ConversationMessage[],
        userQuery: string,
        systemPrompt?: string
    ): ContextPattern {
        this.logger.debug('Building context pattern', {
            chunkCount: chunks.length,
            historyCount: history.length,
            userQueryLength: userQuery.length
        });

        const patterns = this.extractPatterns(userQuery, history);
        const scoredChunks = this.scoreChunks(chunks, userQuery, patterns);
        const diverseChunks = this.selectDiverse(scoredChunks, patterns);
        const weightedHistory = this.weightHistory(history);

        const tokenBudget = {
            system: Math.floor(this.maxContextTokens * 0.1),
            chunks: Math.floor(this.maxContextTokens * 0.6),
            history: Math.floor(this.maxContextTokens * 0.3)
        };

        const selectedChunks = this.fitToBudget(diverseChunks, tokenBudget.chunks);
        const selectedHistory = this.fitToBudget(
            weightedHistory.map(h => ({ 
                id: `msg_${h.timestamp.getTime()}`,
                text: h.content,
                score: 1.0,
                metadata: { role: h.role, timestamp: h.timestamp }
            })),
            tokenBudget.history
        ).map(h => weightedHistory.find(msg => msg.content === h.text)!);

        const formattedContext = this.formatContext(
            selectedChunks,
            selectedHistory,
            systemPrompt
        );

        const totalTokens = this.estimateTokens(formattedContext);

        this.logger.debug('Context pattern built', {
            selectedChunks: selectedChunks.length,
            selectedHistory: selectedHistory.length,
            estimatedTokens: totalTokens
        });

        return {
            retrievedContext: selectedChunks,
            relevantChunks: selectedChunks,
            conversationHistory: selectedHistory,
            systemPrompt,
            totalTokens,
            formattedContext
        };
    }

    rerank(chunks: SearchResult[], query: string, options: RerankOptions = {
        considerPosition: true,
        entityOverlap: true,
        diversityPenalty: 0.1
    }): SearchResult[] {
        this.logger.debug('Reranking chunks', { count: chunks.length });

        const entities = this.extractEntities(query);

        const reranked = chunks.map(chunk => {
            let score = chunk.score;

            if (options.considerPosition && chunk.metadata.chunkIndex !== undefined) {
                const totalChunks = chunk.metadata.totalChunks || 10;
                const position = chunk.metadata.chunkIndex / totalChunks;

                if (position < 0.2 || position > 0.8) {
                    score += 0.05;
                }
            }

            if (options.entityOverlap && entities.length > 0) {
                const chunkEntities = this.extractEntities(chunk.text);
                const overlap = entities.filter(e => chunkEntities.includes(e)).length;
                score += (overlap / entities.length) * 0.1;
            }

            if (chunk.metadata.priority) {
                score += chunk.metadata.priority * 0.05;
            }

            return { ...chunk, score };
        });

        return reranked.sort((a, b) => b.score - a.score);
    }

    extractPatterns(userQuery: string, history: ConversationMessage[]): PatternExtractionResult {
        const queryLower = userQuery.toLowerCase();

        let queryType: PatternExtractionResult['queryType'] = 'conversational';
        if (queryLower.includes('what') || queryLower.includes('define')) {
            queryType = 'factual';
        } else if (queryLower.includes('how') || queryLower.includes('step')) {
            queryType = 'procedural';
        } else if (queryLower.includes('why') || queryLower.includes('explain')) {
            queryType = 'conceptual';
        }

        const entities = this.extractEntities(userQuery);
        const topics = this.extractTopics(userQuery, history);

        const requiresBreadth = queryLower.includes('overview') ||
            queryLower.includes('summary') ||
            queryLower.includes('compare');

        const requiresDepth = queryLower.includes('detail') ||
            queryLower.includes('explain') ||
            queryLower.includes('deep');

        this.logger.debug('Extracted patterns', {
            queryType,
            entities: entities.length,
            topics: topics.length,
            requiresBreadth,
            requiresDepth
        });

        return {
            queryType,
            entities,
            topics,
            requiresBreadth,
            requiresDepth
        };
    }

    private scoreChunks(
        chunks: SearchResult[],
        query: string,
        patterns: PatternExtractionResult
    ): SearchResult[] {
        const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 3));

        return chunks.map(chunk => {
            let score = chunk.score;

            const chunkWords = new Set(chunk.text.toLowerCase().split(/\s+/));
            const keywordOverlap = [...queryWords].filter(w => chunkWords.has(w)).length;
            const keywordBoost = (keywordOverlap / queryWords.size) * 0.15;
            score += keywordBoost;

            if (chunk.metadata.category && patterns.topics.includes(chunk.metadata.category)) {
                score += 0.1;
            }

            if (chunk.metadata.timestamp) {
                const age = Date.now() - new Date(chunk.metadata.timestamp).getTime();
                const daysSinceIndexed = age / (1000 * 60 * 60 * 24);
                const recencyBoost = Math.max(0, 0.05 - (daysSinceIndexed * 0.001));
                score += recencyBoost;
            }

            return { ...chunk, score };
        });
    }

    private selectDiverse(chunks: SearchResult[], patterns: PatternExtractionResult): SearchResult[] {
        if (chunks.length === 0) return [];

        const selected: SearchResult[] = [chunks[0]];
        const diversityThreshold = 0.3;

        for (let i = 1; i < chunks.length; i++) {
            const candidate = chunks[i];

            const isSimilar = selected.some(s => {
                const similarity = this.textSimilarity(s.text, candidate.text);
                return similarity > diversityThreshold;
            });

            if (!isSimilar || (patterns.requiresDepth && candidate.score > 0.8)) {
                selected.push(candidate);
            }

            if (selected.length >= (patterns.requiresBreadth ? 15 : 10)) {
                break;
            }
        }

        return selected;
    }

    private weightHistory(history: ConversationMessage[]): ConversationMessage[] {
        return history.map((msg, index) => {
            const recency = index / Math.max(history.length - 1, 1);
            const weight = Math.exp(-2 * (1 - recency));

            return {
                ...msg,
                metadata: {
                    ...(msg as any).metadata,
                    weight
                }
            };
        }).sort((a, b) => {
            const weightA = (a as any).metadata?.weight || 0;
            const weightB = (b as any).metadata?.weight || 0;
            return weightB - weightA;
        });
    }

    private fitToBudget(items: SearchResult[], tokenBudget: number): SearchResult[] {
        const selected: SearchResult[] = [];
        let currentTokens = 0;

        for (const item of items) {
            const itemTokens = this.estimateTokens(item.text);

            if (currentTokens + itemTokens <= tokenBudget) {
                selected.push(item);
                currentTokens += itemTokens;
            } else if (selected.length === 0) {
                const truncated = this.truncateAtSentence(item.text, tokenBudget * this.avgCharsPerToken);
                selected.push({ ...item, text: truncated });
                break;
            } else {
                break;
            }
        }

        return selected;
    }

    private formatContext(
        chunks: SearchResult[],
        history: ConversationMessage[],
        systemPrompt?: string
    ): string {
        const parts: string[] = [];

        if (systemPrompt) {
            parts.push(`System: ${systemPrompt}\n`);
        }

        if (chunks.length > 0) {
            parts.push('Relevant Context:');
            chunks.forEach((chunk, i) => {
                parts.push(`\n[${i + 1}] ${chunk.text}`);
                if (chunk.metadata.fileName) {
                    parts.push(`   (Source: ${chunk.metadata.fileName})`);
                }
            });
            parts.push('\n');
        }

        if (history.length > 0) {
            parts.push('Recent Conversation:');
            history.forEach(msg => {
                parts.push(`\n${msg.role}: ${msg.content}`);
            });
            parts.push('\n');
        }

        return parts.join('\n');
    }

    private extractEntities(text: string): string[] {
        const words = text.split(/\s+/);
        const entities = words.filter(word =>
            word.length > 3 &&
            /^[A-Z]/.test(word) &&
            !/^(The|This|That|These|Those|What|When|Where|Why|How)$/i.test(word)
        );
        return [...new Set(entities)];
    }

    private extractTopics(query: string, history: ConversationMessage[]): string[] {
        const allText = [query, ...history.map(h => h.content)].join(' ');
        const words = allText.toLowerCase().split(/\s+/);

        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
        const wordFreq = new Map<string, number>();

        words.forEach(word => {
            if (word.length > 4 && !stopWords.has(word)) {
                wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
            }
        });

        return Array.from(wordFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);
    }

    private textSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));

        const intersection = [...words1].filter(w => words2.has(w)).length;
        const union = new Set([...words1, ...words2]).size;

        return union > 0 ? intersection / union : 0;
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / this.avgCharsPerToken);
    }

    private truncateAtSentence(text: string, maxChars: number): string {
        if (text.length <= maxChars) {
            return text;
        }

        const truncated = text.slice(0, maxChars);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?')
        );

        if (lastSentenceEnd > maxChars * 0.7) {
            return truncated.slice(0, lastSentenceEnd + 1);
        }

        return truncated + '...';
    }
}

export const createEvaluator = (logger: Logger, maxContextTokens?: number): PatternEvaluator => {
    return new PatternEvaluator(logger, maxContextTokens);
};


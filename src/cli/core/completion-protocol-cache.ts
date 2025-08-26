import * as fs from 'fs/promises';
import * as path from 'path';
import crypto from 'crypto';
import chalk from 'chalk';
import { QuietCacheLogger } from './performance-optimizer';

export interface CompletionPattern {
    id: string;
    prefix: string;
    suffix: string;
    contextHash: string;
    completionTokens: string[];
    confidence: number;
    frequency: number;
    lastUsed: Date;
    modelSignature: string;
    tags: string[];
}

export interface CompletionRequest {
    prefix: string;
    context: string;
    maxTokens: number;
    temperature: number;
    model: string;
}

export interface CompletionResponse {
    completion: string;
    fromCache: boolean;
    confidence: number;
    tokensSaved: number;
    patternId?: string;
    exactMatch?: boolean;
}

/**
 * Model Completion Protocol Cache
 * Caches completion patterns instead of full responses for maximum efficiency
 */
export class CompletionProtocolCache {
    private patterns: Map<string, CompletionPattern> = new Map();
    private prefixIndex: Map<string, string[]> = new Map(); // prefix -> pattern IDs
    private contextIndex: Map<string, string[]> = new Map(); // context -> pattern IDs
    private cacheFile: string;
    private maxPatterns: number = 1000; // Ridotto da 5000
    private minConfidence: number = 0.6; // Più permissivo
    private prefixMinLength: number = 8; // Ridotto
    private maxAge: number = 7 * 24 * 60 * 60 * 1000; // 7 giorni (ridotto)

    constructor(cacheDir: string = './.nikcli') {
        this.cacheFile = path.join(cacheDir, 'completion-cache.json');
        this.loadCache();
    }

    /**
     * Generate completion from cache using protocol matching
     */
    async getCompletion(request: CompletionRequest): Promise<CompletionResponse | null> {
        const { prefix, context, maxTokens, model } = request;

        // Fast prefix lookup
        const normalizedPrefix = this.normalizePrefix(prefix);
        const prefixKey = this.generatePrefixKey(normalizedPrefix);

        if (!this.prefixIndex.has(prefixKey)) {
            return null;
        }

        // Find matching patterns
        const candidateIds = this.prefixIndex.get(prefixKey) || [];
        const candidates: CompletionPattern[] = [];

        for (const id of candidateIds) {
            const pattern = this.patterns.get(id);
            if (!pattern) continue;

            // Check model compatibility
            if (pattern.modelSignature !== model) continue;

            // Check age
            const age = Date.now() - new Date(pattern.lastUsed).getTime();
            if (age > this.maxAge) continue;

            // Calculate context similarity (molto più restrittivo)
            const contextSimilarity = this.calculateContextSimilarity(context, pattern.contextHash);
            if (contextSimilarity < 0.95) continue; // Molto più restrittivo

            // Calculate prefix match quality (molto più restrittivo)
            const prefixMatch = this.calculatePrefixMatch(prefix, pattern.prefix);
            if (prefixMatch < 0.98) continue; // Molto più restrittivo

            const overallConfidence = (contextSimilarity * 0.4 + prefixMatch * 0.6) * pattern.confidence;

            if (overallConfidence >= this.minConfidence) {
                candidates.push({
                    ...pattern,
                    confidence: overallConfidence
                });
            }
        }

        if (candidates.length === 0) {
            return null;
        }

        // Sort by confidence and frequency
        candidates.sort((a, b) => {
            const scoreA = a.confidence * 0.7 + (a.frequency / 100) * 0.3;
            const scoreB = b.confidence * 0.7 + (b.frequency / 100) * 0.3;
            return scoreB - scoreA;
        });

        const bestPattern = candidates[0];

        // Generate completion from pattern
        const completion = this.generateCompletionFromPattern(bestPattern, prefix, maxTokens);

        // Update usage stats
        bestPattern.frequency++;
        bestPattern.lastUsed = new Date();
        this.patterns.set(bestPattern.id, bestPattern);

        const tokensSaved = this.estimateTokens(prefix + completion);

        QuietCacheLogger.logCacheSave(tokensSaved);

        const exactMatch = bestPattern.confidence >= 0.99;
        
        return {
            completion,
            fromCache: true,
            confidence: bestPattern.confidence,
            tokensSaved,
            patternId: bestPattern.id,
            exactMatch
        };
    }

    /**
     * Store completion pattern for future use
     */
    async storeCompletion(
        request: CompletionRequest,
        completion: string,
        actualTokens?: number
    ): Promise<void> {
        const { prefix, context, model } = request;

        // Don't store very short completions
        if (completion.length < 20) return;

        const normalizedPrefix = this.normalizePrefix(prefix);
        const contextHash = this.generateContextHash(context);

        // Extract meaningful suffix for pattern matching
        const suffix = this.extractSuffix(completion);

        const pattern: CompletionPattern = {
            id: this.generatePatternId(normalizedPrefix, completion),
            prefix: normalizedPrefix,
            suffix,
            contextHash,
            completionTokens: this.tokenizeCompletion(completion),
            confidence: 0.9, // High initial confidence for new patterns
            frequency: 1,
            lastUsed: new Date(),
            modelSignature: model,
            tags: this.extractTags(prefix, completion, context)
        };

        // Store pattern
        this.patterns.set(pattern.id, pattern);

        // Update indexes
        this.updateIndexes(pattern);

        // Cleanup if needed
        await this.cleanupPatterns();

    }

    /**
     * Generate completion from stored pattern
     */
    private generateCompletionFromPattern(
        pattern: CompletionPattern,
        actualPrefix: string,
        maxTokens: number
    ): string {
        const tokens = pattern.completionTokens.slice(0, maxTokens);

        // Apply context-aware adjustments
        let completion = tokens.join('');

        // Smart prefix merging - avoid duplication
        const overlap = this.findPrefixOverlap(actualPrefix, completion);
        if (overlap > 0) {
            completion = completion.substring(overlap);
        }

        return completion;
    }

    /**
     * Normalize prefix for consistent matching
     */
    private normalizePrefix(prefix: string): string {
        return prefix
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
            .substring(Math.max(0, prefix.length - 200)); // Keep last 200 chars
    }

    /**
     * Extract meaningful suffix patterns
     */
    private extractSuffix(completion: string): string {
        // Take first significant chunk
        const lines = completion.split('\n');
        const firstLine = lines[0] || '';
        const suffix = firstLine.length > 50 ? firstLine.substring(0, 50) : completion.substring(0, 100);
        return suffix.trim();
    }

    /**
     * Tokenize completion for pattern storage
     */
    private tokenizeCompletion(completion: string): string[] {
        // Simple word-boundary tokenization
        // In production, use proper tokenizer for the specific model
        return completion
            .split(/(\s+|[.!?;,])/g)
            .filter(token => token.trim().length > 0)
            .slice(0, 100); // Limit token storage
    }

    /**
     * Generate unique pattern ID
     */
    private generatePatternId(prefix: string, completion: string): string {
        return crypto
            .createHash('md5')
            .update(prefix + completion.substring(0, 50))
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Generate prefix key for fast lookup
     */
    private generatePrefixKey(prefix: string): string {
        if (prefix.length < this.prefixMinLength) return '';

        // Use last meaningful chunk
        const words = prefix.split(/\s+/).slice(-5); // Last 5 words
        return crypto
            .createHash('md5')
            .update(words.join(' '))
            .digest('hex')
            .substring(0, 12);
    }

    /**
     * Generate context hash for similarity matching
     */
    private generateContextHash(context: string): string {
        // Normalize and hash key context elements
        const normalized = context
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return crypto
            .createHash('sha256')
            .update(normalized.substring(0, 500))
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Calculate context similarity
     */
    private calculateContextSimilarity(context1: string, contextHash2: string): number {
        const hash1 = this.generateContextHash(context1);

        // Simple hash distance comparison
        let matches = 0;
        for (let i = 0; i < Math.min(hash1.length, contextHash2.length); i++) {
            if (hash1[i] === contextHash2[i]) matches++;
        }

        return matches / Math.max(hash1.length, contextHash2.length);
    }

    /**
     * Calculate prefix match quality
     */
    private calculatePrefixMatch(prefix1: string, prefix2: string): number {
        const norm1 = this.normalizePrefix(prefix1);
        const norm2 = this.normalizePrefix(prefix2);

        // Levenshtein distance similarity
        const distance = this.levenshteinDistance(norm1, norm2);
        const maxLength = Math.max(norm1.length, norm2.length);

        return 1 - (distance / maxLength);
    }

    /**
     * Find overlap between prefix and completion
     */
    private findPrefixOverlap(prefix: string, completion: string): number {
        const prefixEnd = prefix.slice(-20); // Last 20 chars
        const completionStart = completion.substring(0, 20);

        for (let i = Math.min(prefixEnd.length, completionStart.length); i > 0; i--) {
            if (prefixEnd.slice(-i) === completionStart.substring(0, i)) {
                return i;
            }
        }

        return 0;
    }

    /**
     * Extract tags from completion context
     */
    private extractTags(prefix: string, completion: string, context: string): string[] {
        const tags: string[] = [];
        const combined = (prefix + ' ' + completion + ' ' + context).toLowerCase();

        // Programming language detection
        if (combined.includes('function') || combined.includes('const ') || combined.includes('let ')) {
            tags.push('javascript');
        }
        if (combined.includes('def ') || combined.includes('import ') || combined.includes('class ')) {
            tags.push('python');
        }
        if (combined.includes('interface') || combined.includes('type ') || combined.includes('export ')) {
            tags.push('typescript');
        }

        // Content type detection
        if (combined.includes('todo') || combined.includes('plan') || combined.includes('task')) {
            tags.push('planning');
        }
        if (combined.includes('component') || combined.includes('react') || combined.includes('jsx')) {
            tags.push('react');
        }
        if (combined.includes('css') || combined.includes('style') || combined.includes('color')) {
            tags.push('styling');
        }

        return tags.slice(0, 5); // Limit tags
    }

    /**
     * Update search indexes
     */
    private updateIndexes(pattern: CompletionPattern): void {
        const prefixKey = this.generatePrefixKey(pattern.prefix);

        if (prefixKey) {
            if (!this.prefixIndex.has(prefixKey)) {
                this.prefixIndex.set(prefixKey, []);
            }
            this.prefixIndex.get(prefixKey)!.push(pattern.id);
        }

        if (!this.contextIndex.has(pattern.contextHash)) {
            this.contextIndex.set(pattern.contextHash, []);
        }
        this.contextIndex.get(pattern.contextHash)!.push(pattern.id);
    }

    /**
     * Clean up old patterns
     */
    private async cleanupPatterns(): Promise<void> {
        if (this.patterns.size <= this.maxPatterns) return;

        const patterns = Array.from(this.patterns.values());

        // Sort by usage score (frequency + recency)
        patterns.sort((a, b) => {
            const scoreA = a.frequency * 0.7 + (Date.now() - new Date(a.lastUsed).getTime()) * -0.3;
            const scoreB = b.frequency * 0.7 + (Date.now() - new Date(b.lastUsed).getTime()) * -0.3;
            return scoreB - scoreA;
        });

        // Remove least useful patterns
        const toRemove = patterns.slice(this.maxPatterns);
        for (const pattern of toRemove) {
            this.patterns.delete(pattern.id);

            // Clean up indexes
            const prefixKey = this.generatePrefixKey(pattern.prefix);
            if (this.prefixIndex.has(prefixKey)) {
                const ids = this.prefixIndex.get(prefixKey)!;
                const filtered = ids.filter(id => id !== pattern.id);
                if (filtered.length === 0) {
                    this.prefixIndex.delete(prefixKey);
                } else {
                    this.prefixIndex.set(prefixKey, filtered);
                }
            }
        }

        // Silent cleanup
    }

    /**
     * Levenshtein distance calculation
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Estimate token count
     */
    private estimateTokens(text: string): number {
        return Math.round(text.length / 4);
    }

    /**
     * Load cache from disk
     */
    private async loadCache(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
            const data = await fs.readFile(this.cacheFile, 'utf8');
            const parsed = JSON.parse(data);

            // Restore patterns
            if (parsed.patterns) {
                for (const pattern of parsed.patterns) {
                    pattern.lastUsed = new Date(pattern.lastUsed);
                    this.patterns.set(pattern.id, pattern);
                }
            }

            // Rebuild indexes
            this.rebuildIndexes();

            // Silent load
        } catch (error) {
            // Silent start
        }
    }

    /**
     * Save cache to disk
     */
    async saveCache(): Promise<void> {
        try {
            const data = {
                version: '1.0',
                timestamp: new Date(),
                patterns: Array.from(this.patterns.values())
            };

            await fs.writeFile(this.cacheFile, JSON.stringify(data, null, 2));
            // Silent save
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to save completion cache: ${error.message}`));
        }
    }

    /**
     * Rebuild search indexes
     */
    private rebuildIndexes(): void {
        this.prefixIndex.clear();
        this.contextIndex.clear();

        for (const pattern of this.patterns.values()) {
            this.updateIndexes(pattern);
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const patterns = Array.from(this.patterns.values());
        const totalFrequency = patterns.reduce((sum, p) => sum + p.frequency, 0);
        const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;

        return {
            totalPatterns: patterns.length,
            totalHits: totalFrequency,
            averageConfidence: avgConfidence || 0,
            cacheSize: JSON.stringify(patterns).length,
            indexSize: this.prefixIndex.size + this.contextIndex.size
        };
    }

    /**
     * Clear all patterns
     */
    async clearCache(): Promise<void> {
        this.patterns.clear();
        this.prefixIndex.clear();
        this.contextIndex.clear();

        try {
            await fs.unlink(this.cacheFile);
        } catch (error) {
            // File might not exist
        }

        console.log(chalk.yellow('🧹 Cleared all completion patterns'));
    }

    /**
     * Find similar patterns for analysis
     */
    findSimilarPatterns(prefix: string, limit: number = 5): CompletionPattern[] {
        const normalizedPrefix = this.normalizePrefix(prefix);

        return Array.from(this.patterns.values())
            .map(pattern => ({
                ...pattern,
                similarity: this.calculatePrefixMatch(normalizedPrefix, pattern.prefix)
            }))
            .filter(pattern => pattern.similarity > 0.5)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }
}

// Export singleton instance
export const completionCache = new CompletionProtocolCache();
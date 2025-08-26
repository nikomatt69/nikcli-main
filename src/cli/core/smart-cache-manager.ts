import { CoreMessage } from 'ai';
import chalk from 'chalk';
import { randomBytes } from 'crypto';
import { QuietCacheLogger } from './performance-optimizer';

export interface CacheStrategy {
    name: string;
    enabled: boolean;
    maxAge: number; // milliseconds
    maxSize: number;
    similarityThreshold: number;
    tags: string[];
    conditions: CacheCondition[];
}

export interface CacheCondition {
    type: 'request_type' | 'content_length' | 'user_pattern' | 'time_of_day' | 'frequency';
    value: any;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'regex';
}

export interface SmartCacheEntry {
    id: string;
    content: string;
    context: string;
    response: string;
    timestamp: Date;
    lastAccessed: Date;
    accessCount: number;
    strategy: string;
    tags: string[];
    exactMatch?: boolean;
    metadata: {
        tokensSaved: number;
        responseTime: number;
        userSatisfaction?: number; // 0-1 score
    };
}

export class SmartCacheManager {
    private cache: Map<string, SmartCacheEntry> = new Map();
    private strategies: Map<string, CacheStrategy> = new Map();
    private accessPatterns: Map<string, number> = new Map(); // Track access frequency

    constructor() {
        this.initializeDefaultStrategies();
    }

    private initializeDefaultStrategies(): void {
        // STRATEGIA 1: Cache per comandi semplici (alta priorità)
        this.strategies.set('simple_commands', {
            name: 'Simple Commands',
            enabled: true,
            maxAge: 12 * 60 * 60 * 1000, // 12 ore (ridotto)
            maxSize: 50, // Ridotto
            similarityThreshold: 0.98, // Quasi identico
            tags: ['command', 'simple', 'frequent'],
            conditions: [
                { type: 'content_length', value: 100, operator: 'less_than' }, // Più permissivo
                { type: 'request_type', value: ['help', 'status', 'list', 'info'], operator: 'contains' }
            ]
        });

        // STRATEGIA 2: Cache per analisi di codice (media priorità)
        this.strategies.set('code_analysis', {
            name: 'Code Analysis',
            enabled: true,
            maxAge: 60 * 60 * 1000, // 1 ora (ridotto)
            maxSize: 30, // Ridotto
            similarityThreshold: 0.98, // Quasi identico
            tags: ['analysis', 'code', 'review'],
            conditions: [
                { type: 'request_type', value: ['analyze', 'review', 'check'], operator: 'contains' },
                { type: 'content_length', value: 150, operator: 'greater_than' } // Più permissivo
            ]
        });

        // STRATEGIA 3: Cache per generazione codice (bassa priorità)
        this.strategies.set('code_generation', {
            name: 'Code Generation',
            enabled: false, // Disabilitata di default - troppo specifica
            maxAge: 30 * 60 * 1000, // 30 minuti (ridotto)
            maxSize: 10, // Ridotto
            similarityThreshold: 0.98, // Quasi identico
            tags: ['generation', 'code', 'create'],
            conditions: [
                { type: 'request_type', value: ['create', 'generate', 'build'], operator: 'contains' }
            ]
        });

        // STRATEGIA 4: Cache per domande frequenti (alta priorità)
        this.strategies.set('frequent_questions', {
            name: 'Frequent Questions',
            enabled: true,
            maxAge: 3 * 24 * 60 * 60 * 1000, // 3 giorni (ridotto)
            maxSize: 100, // Ridotto
            similarityThreshold: 0.98, // Quasi identico
            tags: ['faq', 'help', 'common'],
            conditions: [
                { type: 'frequency', value: 2, operator: 'greater_than' } // Più permissivo (2 accessi)
            ]
        });

        // STRATEGIA 5: Cache per tool calls (media priorità)
        this.strategies.set('tool_calls', {
            name: 'Tool Calls',
            enabled: true,
            maxAge: 15 * 60 * 1000, // 15 minuti (ridotto)
            maxSize: 50, // Ridotto
            similarityThreshold: 0.98, // Quasi identico
            tags: ['tool', 'execution', 'command'],
            conditions: [
                { type: 'request_type', value: ['run', 'execute', 'tool'], operator: 'contains' }
            ]
        });
    }

    /**
     * Determina se una richiesta dovrebbe essere cachata
     */
    shouldCache(content: string, context: string = ''): { should: boolean; strategy?: string; reason: string } {
        const normalizedContent = this.normalizeContent(content);

        // Controlla ogni strategia
        for (const [strategyId, strategy] of this.strategies) {
            if (!strategy.enabled) continue;

            if (this.matchesStrategy(normalizedContent, context, strategy)) {
                return {
                    should: true,
                    strategy: strategyId,
                    reason: `Matches ${strategy.name} strategy`
                };
            }
        }

        return {
            should: false,
            reason: 'No matching cache strategy'
        };
    }

    /**
     * Verifica se il contenuto corrisponde a una strategia
     */
    private matchesStrategy(content: string, context: string, strategy: CacheStrategy): boolean {
        for (const condition of strategy.conditions) {
            if (!this.evaluateCondition(content, context, condition)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Valuta una singola condizione
     */
    private evaluateCondition(content: string, context: string, condition: CacheCondition): boolean {
        switch (condition.type) {
            case 'content_length':
                const length = content.length;
                return this.compare(length, condition.value, condition.operator);

            case 'request_type':
                const requestTypes = this.detectRequestType(content);
                return this.compare(requestTypes, condition.value, condition.operator);

            case 'user_pattern':
                return this.compare(content, condition.value, condition.operator);

            case 'frequency':
                const frequency = this.accessPatterns.get(content) || 0;
                return this.compare(frequency, condition.value, condition.operator);

            default:
                return false;
        }
    }

    /**
     * Rileva il tipo di richiesta
     */
    private detectRequestType(content: string): string[] {
        const types: string[] = [];
        const lower = content.toLowerCase();

        // Comandi semplici
        if (lower.includes('help') || lower.includes('aiuto')) types.push('help');
        if (lower.includes('status') || lower.includes('stato')) types.push('status');
        if (lower.includes('list') || lower.includes('lista')) types.push('list');
        if (lower.includes('info') || lower.includes('informazioni')) types.push('info');

        // Analisi
        if (lower.includes('analyze') || lower.includes('analizza')) types.push('analyze');
        if (lower.includes('review') || lower.includes('revisiona')) types.push('review');
        if (lower.includes('check') || lower.includes('controlla')) types.push('check');

        // Generazione
        if (lower.includes('create') || lower.includes('crea')) types.push('create');
        if (lower.includes('generate') || lower.includes('genera')) types.push('generate');
        if (lower.includes('build') || lower.includes('costruisci')) types.push('build');

        // Tool calls
        if (lower.includes('run') || lower.includes('esegui')) types.push('run');
        if (lower.includes('execute') || lower.includes('esegui')) types.push('execute');
        if (lower.includes('tool') || lower.includes('strumento')) types.push('tool');

        return types;
    }

    /**
     * Confronta valori con operatori
     */
    private compare(actual: any, expected: any, operator: string): boolean {
        switch (operator) {
            case 'equals':
                return actual === expected;
            case 'contains':
                if (Array.isArray(expected)) {
                    return expected.some(exp => actual.includes(exp));
                }
                return actual.includes(expected);
            case 'greater_than':
                return actual > expected;
            case 'less_than':
                return actual < expected;
            case 'regex':
                return new RegExp(expected).test(actual);
            default:
                return false;
        }
    }

    /**
     * Normalizza il contenuto per il confronto
     */
    private normalizeContent(content: string): string {
        return content
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Cerca una risposta nella cache
     */
    async getCachedResponse(content: string, context: string = ''): Promise<SmartCacheEntry | null> {
        const cacheDecision = this.shouldCache(content, context);

        if (!cacheDecision.should) {
            return null;
        }

        const strategy = this.strategies.get(cacheDecision.strategy!);
        if (!strategy) return null;

        // Cerca match nella cache
        const normalizedContent = this.normalizeContent(content);
        const normalizedContext = this.normalizeContent(context);

        for (const [id, entry] of this.cache) {
            // Verifica età
            const age = Date.now() - entry.timestamp.getTime();
            if (age > strategy.maxAge) continue;

            // Verifica strategia
            if (entry.strategy !== cacheDecision.strategy) continue;

            // Calcola similarità
            const contentSimilarity = this.calculateSimilarity(normalizedContent, this.normalizeContent(entry.content));
            const contextSimilarity = this.calculateSimilarity(normalizedContext, this.normalizeContent(entry.context));

            const overallSimilarity = (contentSimilarity * 0.7 + contextSimilarity * 0.3);

            if (overallSimilarity >= strategy.similarityThreshold) {
                // Aggiorna statistiche
                entry.lastAccessed = new Date();
                entry.accessCount++;
                this.accessPatterns.set(content, (this.accessPatterns.get(content) || 0) + 1);

                // Determina se è un match esatto
                entry.exactMatch = overallSimilarity >= 0.99;

                QuietCacheLogger.logCacheSave(entry.metadata.tokensSaved);
                return entry;
            }
        }

        return null;
    }

    /**
     * Salva una risposta nella cache
     */
    async setCachedResponse(
        content: string,
        response: string,
        context: string = '',
        metadata: Partial<SmartCacheEntry['metadata']> = {}
    ): Promise<void> {
        const cacheDecision = this.shouldCache(content, context);

        if (!cacheDecision.should) {
            return; // Non cachare se non dovrebbe essere cachato
        }

        const strategy = this.strategies.get(cacheDecision.strategy!);
        if (!strategy) return;

        // Verifica dimensione cache
        if (this.cache.size >= strategy.maxSize) {
            this.evictOldEntries(strategy);
        }

        const entry: SmartCacheEntry = {
            id: this.generateId(),
            content,
            context,
            response,
            timestamp: new Date(),
            lastAccessed: new Date(),
            accessCount: 1,
            strategy: cacheDecision.strategy!,
            tags: strategy.tags,
            metadata: {
                tokensSaved: metadata.tokensSaved || 0,
                responseTime: metadata.responseTime || 0,
                userSatisfaction: metadata.userSatisfaction
            }
        };

        this.cache.set(entry.id, entry);
        this.accessPatterns.set(content, (this.accessPatterns.get(content) || 0) + 1);

        QuietCacheLogger.logCacheSave(entry.metadata.tokensSaved);
    }

    /**
     * Rimuove entry vecchie dalla cache
     */
    private evictOldEntries(strategy: CacheStrategy): void {
        const entries = Array.from(this.cache.entries())
            .filter(([_, entry]) => entry.strategy === strategy.name)
            .sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());

        // Rimuovi il 20% più vecchio
        const toRemove = Math.ceil(entries.length * 0.2);
        for (let i = 0; i < toRemove; i++) {
            this.cache.delete(entries[i][0]);
        }
    }

    /**
     * Calcola similarità tra due testi
     */
    private calculateSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.split(/\s+/));
        const words2 = new Set(text2.split(/\s+/));

        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * Genera ID unico
     */
    private generateId(): string {
        return `cache_${Date.now()}_${randomBytes(6).toString('base64url')}`;
    }

    /**
     * Ottieni statistiche della cache
     */
    getCacheStats(): any {
        const stats: any = {};

        for (const [strategyId, strategy] of this.strategies) {
            const entries = Array.from(this.cache.values()).filter(e => e.strategy === strategyId);

            stats[strategyId] = {
                name: strategy.name,
                enabled: strategy.enabled,
                entries: entries.length,
                totalAccesses: entries.reduce((sum, e) => sum + e.accessCount, 0),
                avgTokensSaved: entries.reduce((sum, e) => sum + e.metadata.tokensSaved, 0) / entries.length || 0
            };
        }

        return stats;
    }

    /**
     * Pulisce cache vecchia
     */
    cleanup(): void {
        const now = Date.now();
        let removed = 0;

        for (const [id, entry] of this.cache) {
            const strategy = this.strategies.get(entry.strategy);
            if (!strategy) continue;

            const age = now - entry.timestamp.getTime();
            if (age > strategy.maxAge) {
                this.cache.delete(id);
                removed++;
            }
        }

        // Silent cleanup - no logging needed
    }

    /**
     * Abilita/disabilita strategie
     */
    setStrategyEnabled(strategyId: string, enabled: boolean): void {
        const strategy = this.strategies.get(strategyId);
        if (strategy) {
            strategy.enabled = enabled;
            // Silent strategy changes
        }
    }

    /**
     * Mostra stato cache
     */
    showStatus(): void {
        console.log(chalk.blue('\n📊 Smart Cache Status:'));

        const stats = this.getCacheStats();
        for (const [strategyId, stat] of Object.entries(stats)) {
            const typedStat = stat as any;
            const status = typedStat.enabled ? chalk.green('✅') : chalk.red('❌');
            console.log(`${status} ${typedStat.name}: ${typedStat.entries} entries, ${typedStat.totalAccesses} accesses`);
        }
    }
}

// Singleton instance
export const smartCache = new SmartCacheManager();

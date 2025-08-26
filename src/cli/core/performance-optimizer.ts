import { CoreMessage } from 'ai';
import { performance } from 'perf_hooks';

export interface PerformanceMetrics {
    tokenCount: number;
    processingTime: number;
    cacheHitRate: number;
    toolCallCount: number;
    responseQuality: number;
}

// Quiet logging utility for cache operations
export class QuietCacheLogger {
    private static readonly CACHE_ICON = '💾';
    private static totalSavings: number = 0;
    
    static logCacheSave(tokensSaved?: number): void {
        if (tokensSaved && tokensSaved > 0) {
            this.totalSavings += tokensSaved;
            process.stdout.write(this.CACHE_ICON);
        }
    }
    
    static getTotalSavings(): number {
        return this.totalSavings;
    }
    
    static resetSavings(): void {
        this.totalSavings = 0;
    }
}

// Token optimization interface
export interface TokenOptimizationResult {
    content: string;
    originalTokens: number;
    optimizedTokens: number;
    tokensSaved: number;
    compressionRatio: number;
}

export interface TokenOptimizationConfig {
    level: 'conservative' | 'balanced' | 'aggressive';
    enablePredictive: boolean;
    enableMicroCache: boolean;
    maxCompressionRatio: number;
    // Optional summarization controls for very large prompts
    summarizeEnabled?: boolean; // globally enable summarize-then-truncate
    summarizeThresholdChars?: number; // if content length exceeds, condense first
    summarizeTargetChars?: number; // desired size post-condense
}

// Main token optimizer class
export class TokenOptimizer {
    private config: TokenOptimizationConfig;
    private compressionDictionary: Map<string, string> = new Map();
    private usagePatterns: Map<string, number> = new Map();
    
    constructor(config: TokenOptimizationConfig = {
        level: 'balanced',
        enablePredictive: true,
        enableMicroCache: true,
        maxCompressionRatio: 0.6
    }) {
        this.config = config;
        this.initializeCompressionDictionary();
    }
    
    private initializeCompressionDictionary(): void {
        // Common programming terms compression
        this.compressionDictionary.set('function', 'fn');
        this.compressionDictionary.set('implement', 'impl');
        this.compressionDictionary.set('configuration', 'config');
        this.compressionDictionary.set('component', 'comp');
        this.compressionDictionary.set('interface', 'intfc');
        this.compressionDictionary.set('performance', 'perf');
        this.compressionDictionary.set('optimization', 'opt');
        this.compressionDictionary.set('application', 'app');
        this.compressionDictionary.set('development', 'dev');
        this.compressionDictionary.set('management', 'mgmt');
    }
    
    async optimizePrompt(input: string): Promise<TokenOptimizationResult> {
        const originalTokens = this.estimateTokens(input);
        let optimized = input;
        
        switch (this.config.level) {
            case 'conservative':
                optimized = this.conservativeOptimization(input);
                break;
            case 'balanced':
                optimized = this.balancedOptimization(input);
                break;
            case 'aggressive':
                optimized = this.aggressiveOptimization(input);
                break;
        }
        
        const optimizedTokens = this.estimateTokens(optimized);
        const tokensSaved = originalTokens - optimizedTokens;
        const compressionRatio = optimizedTokens / originalTokens;
        
        // Log cache save if significant savings
        if (tokensSaved > 5) {
            QuietCacheLogger.logCacheSave(tokensSaved);
        }
        
        return {
            content: optimized,
            originalTokens,
            optimizedTokens,
            tokensSaved,
            compressionRatio
        };
    }
    
    private conservativeOptimization(text: string): string {
        return text
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/\b(um|uh|well)\b/gi, '') // Remove obvious filler
            .trim();
    }
    
    private balancedOptimization(text: string): string {
        let optimized = this.conservativeOptimization(text);
        
        // Apply compression dictionary
        this.compressionDictionary.forEach((short, full) => {
            const regex = new RegExp(`\\b${full}\\b`, 'gi');
            optimized = optimized.replace(regex, short);
        });
        
        // Remove redundant phrases
        optimized = optimized
            .replace(/\b(please note that|it should be noted)\b/gi, '')
            .replace(/\b(in my opinion|I think|I believe)\b/gi, '')
            .replace(/\bfor example\b/gi, 'e.g.')
            .replace(/\bthat is\b/gi, 'i.e.');
        
        return optimized.replace(/\s+/g, ' ').trim();
    }
    
    private aggressiveOptimization(text: string): string {
        let optimized = this.balancedOptimization(text);
        
        // More aggressive compression
        optimized = optimized
            .replace(/\b(very|really|quite|extremely)\s+/gi, '')
            .replace(/\b(basically|essentially|fundamentally)\b/gi, '')
            .replace(/\b(you should|you must|you need to)\b/gi, '')
            .replace(/\bin order to\b/gi, 'to')
            .replace(/\band so on\b/gi, 'etc.');
        
        return optimized.replace(/\s+/g, ' ').trim();
    }
    
    private estimateTokens(text: string): number {
        if (!text) return 0;
        const words = text.split(/\s+/).filter(word => word.length > 0);
        const specialChars = (text.match(/[{}[\](),.;:!?'\"]/g) || []).length;
        return Math.ceil((words.length + specialChars * 0.5) * 1.3);
    }

    /**
     * Heuristic condensation to preserve structure while shrinking content size.
     * - Preserves fenced code blocks
     * - Keeps headings and list items
     * - Compresses paragraphs to first sentence
     */
    condense(input: string, targetChars: number): string {
        if (!input || input.length <= targetChars) return input;

        const codeBlocks: string[] = [];
        let text = input;
        // Extract fenced code blocks
        text = text.replace(/```[\s\S]*?```/g, (m) => {
            const idx = codeBlocks.push(m) - 1;
            return `__CODEBLOCK_${idx}__`;
        });

        const lines = text.split(/\n/);
        const kept: string[] = [];
        for (const line of lines) {
            const l = line.trim();
            if (!l) continue;
            const isHeading = /^#{1,6}\s/.test(l);
            const isList = /^(?:[-*+]\s|\d+\.\s)/.test(l);
            if (isHeading || isList) {
                kept.push(line);
                continue;
            }
            // Keep first sentence of normal paragraphs
            const sentenceEnd = l.search(/[.!?](\s|$)/);
            if (sentenceEnd > 0) {
                kept.push(line.slice(0, sentenceEnd + 1));
            } else {
                kept.push(line.slice(0, 180));
            }
        }

        // Re-insert code blocks while under budget
        let condensed = kept.join('\n');
        for (let i = 0; i < codeBlocks.length; i++) {
            const placeholder = new RegExp(`__CODEBLOCK_${i}__`, 'g');
            const next = condensed.replace(placeholder, codeBlocks[i]);
            // If adding code block exceeds target by too much, keep placeholder minimal
            if (next.length <= targetChars * 1.15) {
                condensed = next;
            } else {
                condensed = condensed.replace(placeholder, '```\n// code omitted\n```');
            }
        }

        if (condensed.length > targetChars) {
            condensed = condensed.slice(0, Math.max(0, targetChars - 3)) + '...';
        }
        return condensed;
    }
}

export class PerformanceOptimizer {
    private metrics: Map<string, PerformanceMetrics> = new Map();
    private startTime: number = 0;
    private tokenOptimizer: TokenOptimizer;
    private tokenBudget: UnifiedTokenBudget;

    constructor(optimizationConfig?: TokenOptimizationConfig) {
        this.tokenOptimizer = new TokenOptimizer(optimizationConfig);
        this.tokenBudget = new UnifiedTokenBudget();
    }

    // Start performance monitoring
    startMonitoring(): void {
        this.startTime = performance.now();
    }

    // End monitoring and collect metrics
    endMonitoring(sessionId: string, metrics: Partial<PerformanceMetrics>): PerformanceMetrics {
        const processingTime = performance.now() - this.startTime;

        const fullMetrics: PerformanceMetrics = {
            tokenCount: metrics.tokenCount || 0,
            processingTime,
            cacheHitRate: metrics.cacheHitRate || 0,
            toolCallCount: metrics.toolCallCount || 0,
            responseQuality: metrics.responseQuality || 0
        };

        this.metrics.set(sessionId, fullMetrics);
        return fullMetrics;
    }

    // Optimize messages for better performance with token optimization
    async optimizeMessages(messages: CoreMessage[]): Promise<CoreMessage[]> {
        const optimized = [...messages];

        // Remove redundant system messages
        const systemMessages = optimized.filter(msg => msg.role === 'system');
        if (systemMessages.length > 1) {
            const mergedSystemContent = systemMessages.map(msg => msg.content).join('\n\n');
            optimized.splice(0, systemMessages.length, {
                role: 'system',
                content: mergedSystemContent
            });
        }

        // Apply token optimization to each message
        for (let i = 0; i < optimized.length; i++) {
            if (typeof optimized[i].content === 'string') {
                const result = await this.tokenOptimizer.optimizePrompt(optimized[i].content as string);
                (optimized[i] as any).content = result.content;
            }
        }

        return optimized;
    }

    // Get token optimizer instance
    getTokenOptimizer(): TokenOptimizer {
        return this.tokenOptimizer;
    }

    // Get unified token budget instance
    getTokenBudget(): UnifiedTokenBudget {
        return this.tokenBudget;
    }

    // Optimize single text content
    async optimizeText(text: string): Promise<TokenOptimizationResult> {
        return this.tokenOptimizer.optimizePrompt(text);
    }

    // Get performance recommendations
    getRecommendations(sessionId: string): string[] {
        const metrics = this.metrics.get(sessionId);
        if (!metrics) return [];

        const recommendations: string[] = [];

        if (metrics.processingTime > 10000) {
            recommendations.push('Consider using caching for repeated queries');
        }

        if (metrics.tokenCount > 50000) {
            recommendations.push('Reduce context size to improve response time');
        }

        if (metrics.toolCallCount > 10) {
            recommendations.push('Batch tool calls to reduce overhead');
        }

        if (metrics.cacheHitRate < 0.3) {
            recommendations.push('Enable more aggressive caching strategies');
        }

        return recommendations;
    }

    // Analyze response quality
    analyzeResponseQuality(response: string): number {
        let quality = 0;

        // Check for structured content
        if (response.includes('```') || response.includes('**')) quality += 20;

        // Check for actionable content
        if (response.includes('1.') || response.includes('•') || response.includes('-')) quality += 20;

        // Check for code examples
        if (response.includes('const ') || response.includes('function ') || response.includes('import ')) quality += 20;

        // Check for explanations
        if (response.includes('because') || response.includes('therefore') || response.includes('however')) quality += 20;

        // Check for appropriate length
        if (response.length > 100 && response.length < 2000) quality += 20;

        return Math.min(100, quality);
    }

    // Get performance summary
    getPerformanceSummary(): string {
        const sessions = Array.from(this.metrics.values());
        if (sessions.length === 0) return 'No performance data available';

        const avgProcessingTime = sessions.reduce((sum, m) => sum + m.processingTime, 0) / sessions.length;
        const avgTokenCount = sessions.reduce((sum, m) => sum + m.tokenCount, 0) / sessions.length;
        const avgCacheHitRate = sessions.reduce((sum, m) => sum + m.cacheHitRate, 0) / sessions.length;

        return `Performance Summary:
- Average processing time: ${avgProcessingTime.toFixed(2)}ms
- Average token count: ${avgTokenCount.toFixed(0)}
- Average cache hit rate: ${(avgCacheHitRate * 100).toFixed(1)}%
- Total sessions analyzed: ${sessions.length}`;
    }
}

// ====================== 🎯 UNIFIED TOKEN BUDGET SYSTEM ======================

export interface TokenBudgetEntry {
    agentId: string;
    taskId: string;
    allocated: number;
    used: number;
    remaining: number;
    complexity: number;
    priority: 'low' | 'normal' | 'high' | 'critical';
    timestamp: number;
}

export interface TokenAllocationStrategy {
    baseAllocation: number;
    complexityMultiplier: number;
    priorityBoosts: Record<string, number>;
    maxTokensPerTask: number;
    reservePercentage: number;
}

export class UnifiedTokenBudget {
    private allocations: Map<string, TokenBudgetEntry> = new Map();
    private globalUsage: number = 0;
    private maxGlobalTokens: number = 100000; // Global budget
    private strategy: TokenAllocationStrategy;
    private usageHistory: Array<{ timestamp: number; tokens: number; agentId: string }> = [];

    constructor(strategy?: Partial<TokenAllocationStrategy>) {
        this.strategy = {
            baseAllocation: 2000,
            complexityMultiplier: 1000,
            priorityBoosts: {
                'low': 0.8,
                'normal': 1.0,
                'high': 1.5,
                'critical': 2.0
            },
            maxTokensPerTask: 8000,
            reservePercentage: 0.1,
            ...strategy
        };
    }

    /**
     * Allocate tokens dynamically based on task complexity and priority
     */
    allocateTokens(
        agentId: string, 
        taskId: string, 
        complexity: number = 5, 
        priority: TokenBudgetEntry['priority'] = 'normal'
    ): number {
        // Calculate dynamic allocation
        const baseTokens = this.strategy.baseAllocation;
        const complexityBonus = Math.min(complexity, 10) * this.strategy.complexityMultiplier;
        const priorityMultiplier = this.strategy.priorityBoosts[priority];
        
        let allocation = Math.floor((baseTokens + complexityBonus) * priorityMultiplier);
        
        // Respect max tokens per task
        allocation = Math.min(allocation, this.strategy.maxTokensPerTask);
        
        // Check global budget availability
        const reserved = this.maxGlobalTokens * this.strategy.reservePercentage;
        const available = this.maxGlobalTokens - this.globalUsage - reserved;
        
        if (allocation > available) {
            allocation = Math.max(this.strategy.baseAllocation, Math.floor(available * 0.8));
        }

        // Create budget entry
        const entry: TokenBudgetEntry = {
            agentId,
            taskId,
            allocated: allocation,
            used: 0,
            remaining: allocation,
            complexity,
            priority,
            timestamp: Date.now()
        };

        this.allocations.set(taskId, entry);
        return allocation;
    }

    /**
     * Track token usage in real-time
     */
    trackUsage(taskId: string, tokensUsed: number, agentId?: string): boolean {
        const entry = this.allocations.get(taskId);
        if (!entry) {
            // Create emergency allocation if not found
            if (agentId) {
                this.allocateTokens(agentId, taskId, 3, 'normal');
                return this.trackUsage(taskId, tokensUsed);
            }
            return false;
        }

        if (entry.remaining >= tokensUsed) {
            entry.used += tokensUsed;
            entry.remaining -= tokensUsed;
            this.globalUsage += tokensUsed;
            
            // Record in history
            this.usageHistory.push({
                timestamp: Date.now(),
                tokens: tokensUsed,
                agentId: entry.agentId
            });

            // Cleanup old history (keep last 1000 entries)
            if (this.usageHistory.length > 1000) {
                this.usageHistory = this.usageHistory.slice(-1000);
            }

            return true;
        }

        return false; // Not enough tokens
    }

    /**
     * Get available tokens for a specific task
     */
    getAvailableTokens(taskId: string): number {
        const entry = this.allocations.get(taskId);
        return entry ? entry.remaining : 0;
    }

    /**
     * Get token allocation for a task (for model provider)
     */
    getTokensForTask(taskId: string): number {
        const entry = this.allocations.get(taskId);
        return entry ? entry.allocated : this.strategy.baseAllocation;
    }

    /**
     * Reallocate tokens from completed/failed tasks
     */
    releaseTokens(taskId: string): number {
        const entry = this.allocations.get(taskId);
        if (entry) {
            const released = entry.remaining;
            this.globalUsage -= entry.used; // Only remove used tokens from global count
            this.allocations.delete(taskId);
            return released;
        }
        return 0;
    }

    /**
     * Get global budget statistics
     */
    getBudgetStats(): {
        globalUsage: number;
        globalBudget: number;
        utilizationRate: number;
        activeTasks: number;
        averageTaskUsage: number;
        recentUsageTrend: number;
    } {
        const activeTasks = this.allocations.size;
        const totalAllocated = Array.from(this.allocations.values())
            .reduce((sum, entry) => sum + entry.allocated, 0);
        
        const recentUsage = this.usageHistory
            .filter(h => Date.now() - h.timestamp < 300000) // Last 5 minutes
            .reduce((sum, h) => sum + h.tokens, 0);

        return {
            globalUsage: this.globalUsage,
            globalBudget: this.maxGlobalTokens,
            utilizationRate: this.globalUsage / this.maxGlobalTokens,
            activeTasks,
            averageTaskUsage: activeTasks > 0 ? totalAllocated / activeTasks : 0,
            recentUsageTrend: recentUsage
        };
    }

    /**
     * Optimize token allocation based on historical usage
     */
    optimizeAllocation(): void {
        if (this.usageHistory.length < 10) return;

        // Analyze recent patterns
        const recentHistory = this.usageHistory.slice(-100);
        const avgUsage = recentHistory.reduce((sum, h) => sum + h.tokens, 0) / recentHistory.length;
        
        // Adjust base allocation if consistently over/under using
        if (avgUsage > this.strategy.baseAllocation * 0.8) {
            this.strategy.baseAllocation = Math.min(
                this.strategy.maxTokensPerTask,
                Math.floor(avgUsage * 1.2)
            );
        } else if (avgUsage < this.strategy.baseAllocation * 0.3) {
            this.strategy.baseAllocation = Math.max(
                1000,
                Math.floor(avgUsage * 1.5)
            );
        }
    }

    /**
     * Get token efficiency metrics
     */
    getEfficiencyMetrics(): {
        wastePercentage: number;
        averageUtilization: number;
        peakUsagePeriods: number[];
        recommendations: string[];
    } {
        const completedTasks = Array.from(this.allocations.values())
            .filter(entry => entry.used > 0);
        
        const totalWaste = completedTasks
            .reduce((sum, entry) => sum + entry.remaining, 0);
        
        const totalAllocated = completedTasks
            .reduce((sum, entry) => sum + entry.allocated, 0);
        
        const wastePercentage = totalAllocated > 0 ? (totalWaste / totalAllocated) * 100 : 0;
        const averageUtilization = completedTasks.length > 0 ? 
            completedTasks.reduce((sum, entry) => sum + (entry.used / entry.allocated), 0) / completedTasks.length : 0;

        const recommendations: string[] = [];
        
        if (wastePercentage > 30) {
            recommendations.push('Consider reducing base allocation');
        }
        if (averageUtilization < 0.5) {
            recommendations.push('Tasks are under-utilizing allocated tokens');
        }
        if (this.globalUsage / this.maxGlobalTokens > 0.8) {
            recommendations.push('Consider increasing global token budget');
        }

        return {
            wastePercentage,
            averageUtilization,
            peakUsagePeriods: [], // Could implement time-based analysis
            recommendations
        };
    }
}

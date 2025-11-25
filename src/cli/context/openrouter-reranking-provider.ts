import axios, { AxiosError } from 'axios'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface RerankingProviderConfig {
    provider: 'openrouter'
    model: string
    baseURL?: string
    headers?: Record<string, string>
    maxRetries?: number
    timeout?: number
}

export interface RerankingRequest {
    query: string
    documents: string[]
    topK?: number
}

export interface RerankingResponse {
    results: Array<{
        index: number
        relevance_score: number
    }>
    usage?: {
        total_tokens?: number
    }
}

export interface RerankingProviderResult {
    results: Array<{
        index: number
        score: number
        relevanceScore: number
    }>
    tokensUsed: number
    cost: number
}

/**
 * OpenRouter Reranking Provider
 * Handles API calls to OpenRouter reranking endpoints
 */
export class OpenRouterRerankingProvider {
    private config: RerankingProviderConfig
    private stats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        totalLatency: 0,
    }

    constructor(config: RerankingProviderConfig) {
        this.config = {
            provider: 'openrouter',
            model: config.model,
            baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
            headers: {
                'HTTP-Referer': 'https://nikcli.mintlify.app',
                'X-Title': 'NikCLI',
                ...config.headers,
            },
            maxRetries: config.maxRetries || 3,
            timeout: config.timeout || 30000,
        }
    }

    /**
     * Rerank documents using OpenRouter API
     */
    async rerank(request: RerankingRequest): Promise<RerankingProviderResult> {
        const startTime = Date.now()
        this.stats.totalRequests++

        const apiKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
        if (!apiKey) {
            throw new Error('OpenRouter API key not found for reranking')
        }

        const endpoint = `${this.config.baseURL}/rerank`
        const topK = request.topK || request.documents.length

        const payload = {
            model: this.config.model,
            query: request.query,
            documents: request.documents,
            top_k: topK,
        }

        let lastError: Error | null = null

        // Retry logic
        for (let attempt = 1; attempt <= (this.config.maxRetries || 3); attempt++) {
            try {
                const response = await axios.post<RerankingResponse>(
                    endpoint,
                    payload,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${apiKey}`,
                            ...this.config.headers,
                        },
                        timeout: this.config.timeout,
                    }
                )

                const latency = Date.now() - startTime
                this.updateStats(latency, true)

                // Parse response
                const results = (response.data.results || []).map((r) => ({
                    index: r.index,
                    score: r.relevance_score || 0,
                    relevanceScore: r.relevance_score || 0,
                }))

                const tokensUsed = response.data.usage?.total_tokens || this.estimateTokens(request.query, request.documents)
                const cost = this.estimateCost(request.query, request.documents, tokensUsed)

                return {
                    results,
                    tokensUsed,
                    cost,
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))

                // Check if it's a retryable error
                if (this.isRetryableError(error) && attempt < (this.config.maxRetries || 3)) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000) // Exponential backoff
                    advancedUI.logWarning(`⚠️ Reranking request failed (attempt ${attempt}/${this.config.maxRetries}), retrying in ${delay}ms...`)
                    await new Promise((resolve) => setTimeout(resolve, delay))
                    continue
                }

                // Non-retryable error or max retries reached
                break
            }
        }

        // All retries failed
        const latency = Date.now() - startTime
        this.updateStats(latency, false)

        if (lastError) {
            advancedUI.logError(`❌ Reranking failed after ${this.config.maxRetries} attempts: ${lastError.message}`)
            throw new Error(`OpenRouter reranking failed: ${lastError.message}`)
        }

        throw new Error('OpenRouter reranking failed: Unknown error')
    }

    /**
     * Check if error is retryable
     */
    private isRetryableError(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError
            // Retry on network errors, timeouts, and 5xx errors
            if (!axiosError.response) return true // Network error
            const status = axiosError.response.status
            return status >= 500 || status === 429 // Server error or rate limit
        }
        return false
    }

    /**
     * Estimate cost based on query and documents
     */
    private estimateCost(query: string, documents: string[], tokensUsed?: number): number {
        // OpenRouter reranking costs vary by model
        // Cohere rerank-english-v3.0: ~$0.001 per 1K documents
        // Jina reranker: ~$0.0005 per 1K documents
        // This is a rough estimate - actual costs may vary
        const baseCostPer1K = this.config.model.includes('cohere') ? 0.001 : 0.0005

        if (tokensUsed) {
            return (tokensUsed / 1000) * baseCostPer1K
        }

        const totalChars = query.length + documents.reduce((sum, doc) => sum + doc.length, 0)
        const estimatedTokens = Math.ceil(totalChars / 4)
        return (estimatedTokens / 1000) * baseCostPer1K
    }

    /**
     * Estimate token count
     */
    private estimateTokens(query: string, documents: string[]): number {
        const totalChars = query.length + documents.reduce((sum, doc) => sum + doc.length, 0)
        return Math.ceil(totalChars / 4)
    }

    /**
     * Update provider statistics
     */
    private updateStats(latency: number, success: boolean): void {
        this.stats.totalLatency += latency
        this.stats.averageLatency = this.stats.totalLatency / this.stats.totalRequests

        if (success) {
            this.stats.successfulRequests++
        } else {
            this.stats.failedRequests++
        }
    }

    /**
     * Get provider statistics
     */
    getStats() {
        return { ...this.stats }
    }

    /**
     * Get current configuration
     */
    getConfig(): RerankingProviderConfig {
        return { ...this.config }
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<RerankingProviderConfig>): void {
        this.config = { ...this.config, ...updates }
    }

    /**
     * Health check - test if provider is accessible
     */
    async healthCheck(): Promise<boolean> {
        try {
            const apiKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
            if (!apiKey) {
                return false
            }

            // Try a minimal reranking request
            await this.rerank({
                query: 'test',
                documents: ['test document'],
                topK: 1,
            })

            return true
        } catch {
            return false
        }
    }
}

// Export factory function
export function createOpenRouterRerankingProvider(config: RerankingProviderConfig): OpenRouterRerankingProvider {
    return new OpenRouterRerankingProvider(config)
}

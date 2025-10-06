import { InterceptorConfig } from './types';

export class ConfigManager {
    private config: Required<InterceptorConfig>;

    constructor(config: InterceptorConfig) {
        this.validateConfig(config);
        this.config = this.setDefaults(config);
    }

    private validateConfig(config: InterceptorConfig): void {
        const required = [
            'upstashVectorUrl',
            'upstashVectorToken',
            'upstashRedisUrl',
            'upstashRedisToken',
            'openaiApiKey'
        ];

        for (const field of required) {
            if (!config[field as keyof InterceptorConfig]) {
                throw new Error(`Missing required configuration: ${field}`);
            }
        }

        if (config.upstashVectorUrl && !config.upstashVectorUrl.startsWith('http')) {
            throw new Error('Invalid upstashVectorUrl: must be a valid URL');
        }

        if (config.upstashRedisUrl && !config.upstashRedisUrl.startsWith('http')) {
            throw new Error('Invalid upstashRedisUrl: must be a valid URL');
        }
    }

    private setDefaults(config: InterceptorConfig): Required<InterceptorConfig> {
        return {
            ...config,
            embeddingModel: config.embeddingModel || 'text-embedding-3-small',
            embeddingDimensions: config.embeddingDimensions || 1536,
            topK: config.topK || 10,
            scoreThreshold: config.scoreThreshold || 0.7,
            maxContextTokens: config.maxContextTokens || 4000,
            maxConversationHistory: config.maxConversationHistory || 10,
            enableLogging: config.enableLogging ?? true
        };
    }

    get(): Required<InterceptorConfig> {
        return { ...this.config };
    }

    update(updates: Partial<InterceptorConfig>): void {
        this.config = { ...this.config, ...updates };
    }

    static fromEnv(): ConfigManager {
        const config: InterceptorConfig = {
            upstashVectorUrl: process.env.UPSTASH_VECTOR_URL || '',
            upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN || '',
            upstashRedisUrl: process.env.UPSTASH_REDIS_URL || '',
            upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN || '',
            openaiApiKey: process.env.OPENAI_API_KEY || '',
            embeddingModel: process.env.EMBEDDING_MODEL,
            topK: process.env.TOP_K ? parseInt(process.env.TOP_K) : undefined,
            scoreThreshold: process.env.SCORE_THRESHOLD ? parseFloat(process.env.SCORE_THRESHOLD) : undefined,
            maxContextTokens: process.env.MAX_CONTEXT_TOKENS ? parseInt(process.env.MAX_CONTEXT_TOKENS) : undefined,
            enableLogging: process.env.ENABLE_LOGGING !== 'false'
        };

        return new ConfigManager(config);
    }
}


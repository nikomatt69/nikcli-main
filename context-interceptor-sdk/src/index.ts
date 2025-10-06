import { InterceptorConfig, DocumentInput, QueryOptions, ContextPattern, ConversationMessage } from './types';
import { ConfigManager } from './config';
import { createLogger, Logger } from './utils/logger';
import { createEmbedder, Embedder } from './indexer/embedder';
import { createVectorStore, VectorStore } from './storage/vector-store';
import { createRedisStore, RedisStore } from './storage/redis-store';
import { createIndexer, DocumentIndexer } from './indexer';
import { DocumentSource } from './indexer/sources/document-source';
import { createQueryEngine, QueryEngine } from './query/engine';
import { createEvaluator, PatternEvaluator } from './query/evaluator';
import { createFetchInterceptor } from './interceptors/fetch-interceptor';
import { createContextMiddleware } from './interceptors/middleware-interceptor';
import { createPatternConsolidator, PatternConsolidator } from './embedding/pattern-consolidator';
import { createPatternServer, PatternServer } from './embedding/pattern-server';
import { createProviderRegistry, ProviderRegistry } from './providers/provider-registry';
import { OpenAIProvider } from './providers/openai/openai-provider';
import { createPatternGroupManager, PatternGroupManager } from './embedding/pattern-group-manager';
import { createContextEventSystem, ContextEventSystem } from './embedding/context-event-system';
import { createUnifiedOpenAIInterceptor } from './interceptors/unified-openai-interceptor';
import { createAISDKMiddleware as createEnhancedAISDKMiddleware } from './interceptors/aisdk-middleware';

export class ContextInterceptor {
    private config: ConfigManager;
    private logger: Logger;
    private embedder: Embedder;
    private vectorStore: VectorStore;
    private redisStore: RedisStore;
    private indexer: DocumentIndexer;
    private queryEngine: QueryEngine;
    private evaluator: PatternEvaluator;
    private patternConsolidator: PatternConsolidator;
    private patternServer: PatternServer;
    private providerRegistry: ProviderRegistry;
    private groupManager: PatternGroupManager;
    private eventSystem: ContextEventSystem;

    constructor(config: InterceptorConfig) {
        this.config = new ConfigManager(config);
        const fullConfig = this.config.get();

        this.logger = createLogger({
            level: 'info',
            enabled: fullConfig.enableLogging
        });

        this.logger.info('Initializing Context Interceptor SDK');

        this.embedder = createEmbedder(
            fullConfig.openaiApiKey,
            fullConfig.embeddingModel,
            fullConfig.embeddingDimensions,
            this.logger
        );

        this.vectorStore = createVectorStore(
            fullConfig.upstashVectorUrl,
            fullConfig.upstashVectorToken,
            fullConfig.embeddingDimensions,
            this.logger
        );

        this.redisStore = createRedisStore(
            fullConfig.upstashRedisUrl,
            fullConfig.upstashRedisToken,
            this.logger
        );

        this.indexer = createIndexer(this.embedder, this.vectorStore, this.logger);

        this.queryEngine = createQueryEngine(
            this.embedder,
            this.vectorStore,
            this.redisStore,
            this.logger,
            {
                topK: fullConfig.topK,
                scoreThreshold: fullConfig.scoreThreshold
            }
        );

        this.evaluator = createEvaluator(this.logger, fullConfig.maxContextTokens);

        // Initialize pattern consolidation system
        this.patternConsolidator = createPatternConsolidator(
            this.embedder,
            this.vectorStore,
            this.logger
        );

        this.patternServer = createPatternServer(
            this.patternConsolidator,
            this.vectorStore,
            this.embedder,
            this.logger
        );

        // Initialize provider registry
        this.providerRegistry = createProviderRegistry(this.logger);

        // Register OpenAI provider
        const openaiProvider = new OpenAIProvider(this.logger);
        this.providerRegistry.register(openaiProvider);

        // Initialize pattern group manager
        this.groupManager = createPatternGroupManager(
            this.embedder,
            this.vectorStore,
            this.logger
        );

        // Initialize context event system
        this.eventSystem = createContextEventSystem(this.groupManager, this.logger);

        this.logger.info('Context Interceptor SDK initialized successfully');
    }

    async indexDocuments(documents: DocumentInput[]): Promise<string[]> {
        this.logger.info(`Indexing ${documents.length} documents`);
        return this.indexer.indexDocuments(documents);
    }

    /**
     * Index documents from one or more sources (filesystem/workspace/etc.)
     */
    async indexFromSources(sources: DocumentSource[]): Promise<string[]> {
        this.logger.info(`Indexing from ${sources.length} source(s)`);
        return (this.indexer as any).indexFromSources(sources);
    }

    async indexDocument(document: DocumentInput): Promise<string[]> {
        this.logger.info('Indexing single document');
        return this.indexer.indexDocument(document);
    }

    async updateDocument(id: string, content: string, metadata?: Record<string, any>): Promise<string[]> {
        this.logger.info('Updating document', { documentId: id });
        return this.indexer.updateDocument(id, content, metadata);
    }

    async deleteDocument(id: string): Promise<void> {
        this.logger.info('Deleting document', { documentId: id });
        return this.indexer.deleteDocument(id);
    }

    async query(text: string, options?: QueryOptions): Promise<ContextPattern> {
        this.logger.info('Executing manual query');

        // Use pattern server for enhanced results with unified patterns
        const patterns = await this.patternServer.servePatterns(text, {
            topK: options?.topK ?? this.config.get().topK,
            includeUnified: true,
            includeRaw: true
        });

        const history = options?.conversationId
            ? await this.queryEngine.getConversationHistory(
                options.conversationId,
                this.config.get().maxConversationHistory
            )
            : [];

        return this.evaluator.buildContextPattern(
            patterns,
            history,
            text
        );
    }

    async getHistory(conversationId: string, limit?: number): Promise<ConversationMessage[]> {
        this.logger.info('Retrieving conversation history', { conversationId });
        return this.queryEngine.getConversationHistory(
            conversationId,
            limit || this.config.get().maxConversationHistory
        );
    }

    async saveMessage(
        conversationId: string,
        role: ConversationMessage['role'],
        content: string
    ): Promise<void> {
        this.logger.debug('Saving message to conversation', { conversationId, role });
        return this.redisStore.saveMessage(conversationId, role, content);
    }

    async deleteConversation(conversationId: string): Promise<void> {
        this.logger.info('Deleting conversation', { conversationId });
        return this.redisStore.deleteConversation(conversationId);
    }

    createFetchInterceptor(conversationId?: string, systemPrompt?: string): typeof fetch {
        this.logger.info('Creating fetch interceptor');

        return createFetchInterceptor({
            queryEngine: this.queryEngine,
            evaluator: this.evaluator,
            logger: this.logger,
            conversationId,
            systemPrompt,
            enableAutoContext: true
        });
    }

    createOpenAIFetchInterceptor(conversationId?: string, systemPrompt?: string): typeof fetch {
        this.logger.info('Creating unified OpenAI fetch interceptor');

        return createUnifiedOpenAIInterceptor({
            queryEngine: this.queryEngine,
            evaluator: this.evaluator,
            groupManager: this.groupManager,
            eventSystem: this.eventSystem,
            logger: this.logger,
            conversationId,
            systemPrompt,
            enableAutoContext: true
        });
    }

    createAISDKMiddleware(conversationId?: string, systemPrompt?: string): any {
        this.logger.info('Creating AI SDK middleware');

        return createEnhancedAISDKMiddleware({
            queryEngine: this.queryEngine,
            evaluator: this.evaluator,
            groupManager: this.groupManager,
            eventSystem: this.eventSystem,
            logger: this.logger,
            conversationId,
            systemPrompt
        });
    }

    getLogger(): Logger {
        return this.logger;
    }

    updateConfig(updates: Partial<InterceptorConfig>): void {
        this.logger.info('Updating configuration');
        this.config.update(updates);
    }

    async getVectorStoreInfo(): Promise<any> {
        return this.vectorStore.info();
    }

    async listConversations(): Promise<string[]> {
        return this.redisStore.listConversations();
    }

    /**
     * Get pattern consolidation statistics
     */
    getPatternStats(): {
        totalPatterns: number;
        queueSize: number;
        isProcessing: boolean;
    } {
        return this.patternConsolidator.getStats();
    }

    /**
     * Clear pattern cache
     */
    clearPatternCache(): void {
        this.patternServer.clearCache();
        this.logger.info('Pattern cache cleared');
    }

    /**
     * Get provider registry
     */
    getProviderRegistry(): ProviderRegistry {
        return this.providerRegistry;
    }

    /**
     * Get pattern group manager
     */
    getGroupManager(): PatternGroupManager {
        return this.groupManager;
    }

    /**
     * Get context event system
     */
    getEventSystem(): ContextEventSystem {
        return this.eventSystem;
    }

    /**
     * Stop background processing
     */
    shutdown(): void {
        this.eventSystem.stop();
        this.logger.info('SDK shutdown complete');
    }
}

// Export main class as default
export default ContextInterceptor;

// Export all types
export * from './types';
export { ConfigManager } from './config';
export { createLogger } from './utils/logger';

// Export quick setup helpers
export {
    initContextInterceptor,
    getOpenAIFetch,
    getAISDKMiddleware,
    indexDocs,
    indexFromGlob,
    indexFromWorkspace,
    getInterceptor
} from './quick-setup';

// Export types for TypeScript users
export type { QuickSetupOptions } from './quick-setup';

// Export document sources for advanced usage
export { FilesystemDocSource } from './indexer/sources/filesystem-source';
export { WorkspaceDocSource } from './indexer/sources/workspace-source';
export type { DocumentSource, FilesystemDocSourceOptions, WorkspaceDocProvider } from './types';

// Export vector store adapter for custom implementations
export type { VectorStoreAdapter } from './types';
export { VectorStore } from './storage/vector-store';

// Export pattern system components
export { PatternConsolidator } from './embedding/pattern-consolidator';
export { PatternServer } from './embedding/pattern-server';
export { PatternGroupManager } from './embedding/pattern-group-manager';
export { ContextEventSystem } from './embedding/context-event-system';

// Export provider system
export { ProviderRegistry } from './providers/provider-registry';
export { OpenAIProvider } from './providers/openai/openai-provider';

// Export core components for advanced usage
export { Embedder } from './indexer/embedder';
export { DocumentIndexer } from './indexer';
export { QueryEngine } from './query/engine';
export { PatternEvaluator } from './query/evaluator';
export { RedisStore } from './storage/redis-store';

// Export interceptor implementations for advanced usage
export { createUnifiedOpenAIInterceptor } from './interceptors/unified-openai-interceptor';
export { createAISDKMiddleware as createEnhancedAISDKMiddleware } from './interceptors/aisdk-middleware';

// Export utility functions
export { validateDocumentInput, validateVector, sanitizeMetadata } from './utils/validation';
export { TextChunker } from './indexer/chunker';

// Export interceptor types for advanced usage
export type { UnifiedInterceptorConfig } from './interceptors/unified-openai-interceptor';
export type { AISDKMiddlewareConfig } from './interceptors/aisdk-middleware';

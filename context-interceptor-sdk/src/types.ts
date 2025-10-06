export interface InterceptorConfig {
    upstashVectorUrl: string;
    upstashVectorToken: string;
    upstashRedisUrl: string;
    upstashRedisToken: string;
    openaiApiKey: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
    topK?: number;
    scoreThreshold?: number;
    maxContextTokens?: number;
    maxConversationHistory?: number;
    enableLogging?: boolean;
}

export interface DocumentInput {
    id?: string;
    content: string;
    metadata?: ChunkMetadata;
    chunkSize?: number;
    chunkOverlap?: number;
}

export interface ChunkMetadata {
    fileName?: string;
    category?: string;
    priority?: number;
    timestamp?: Date;
    [key: string]: any;
}

export interface Chunk {
    id: string;
    text: string;
    metadata: ChunkMetadata;
    position: number;
    totalChunks: number;
}

export interface EmbeddedChunk extends Chunk {
    vector: number[];
}

export interface SearchResult {
    id: string;
    text: string;
    score: number;
    metadata: ChunkMetadata;
}

export interface ContextPattern {
    retrievedContext: SearchResult[];
    relevantChunks: SearchResult[]; // Alias for backward compatibility
    conversationHistory: ConversationMessage[];
    systemPrompt?: string;
    totalTokens: number;
    formattedContext: string;
}

export interface ConversationMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface QueryOptions {
    topK?: number;
    scoreThreshold?: number;
    metadataFilter?: Record<string, any>;
    includeHistory?: boolean;
    conversationId?: string;
    maxTokens?: number;
}

export interface VectorQueryResult {
    id: string;
    score: number;
    vector?: number[];
    metadata?: Record<string, any>;
}

/**
 * Minimal interface required by the indexer for vector store operations.
 * Existing Upstash-backed VectorStore implements these methods.
 */
export interface VectorStoreAdapter {
    upsert(chunk: EmbeddedChunk): Promise<string>;
    upsertBatch(chunks: EmbeddedChunk[]): Promise<string[]>;
    query(vector: number[], topK?: number, filter?: Record<string, any>): Promise<VectorQueryResult[]>;
    delete(id: string): Promise<void>;
    deleteBatch(ids: string[]): Promise<void>;
    reset(): Promise<void>;
    info(): Promise<any>;
}

/** Document ingestion types */
export interface DocumentSource {
    list(): AsyncIterable<DocumentInput> | Promise<DocumentInput[]>;
    watch?(onChange: (doc: DocumentInput | { id: string; delete?: true }) => void): void;
}

export interface FilesystemDocSourceOptions {
    globs: string[];
    ignore?: string[];
    extensions?: string[];
    maxSizeBytes?: number;
    textOnly?: boolean;
    rootDir?: string;
}

export type WorkspaceDocProvider = () => AsyncIterable<DocumentInput> | Promise<DocumentInput[]>;

export interface ChunkingOptions {
    chunkSize: number;
    chunkOverlap: number;
    respectBoundaries: boolean;
}

export interface RerankOptions {
    considerPosition: boolean;
    entityOverlap: boolean;
    diversityPenalty: number;
}

export interface PatternExtractionResult {
    queryType: 'factual' | 'procedural' | 'conceptual' | 'conversational';
    entities: string[];
    topics: string[];
    requiresBreadth: boolean;
    requiresDepth: boolean;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
    level: LogLevel;
    enabled: boolean;
}


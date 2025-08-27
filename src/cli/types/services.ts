/**
 * Services Types for NikCLI
 * Defines types for service integration, API clients, and external systems
 */

import { z } from 'zod';

// Service Status Types
export const ServiceStatusSchema = z.enum([
    'starting',
    'running',
    'stopping',
    'stopped',
    'error',
    'unknown'
]);

export const ServiceHealthSchema = z.object({
    status: ServiceStatusSchema,
    uptime: z.number().optional(),
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional(),
    responseTime: z.number().optional(),
    lastHealthCheck: z.date().optional(),
    errorCount: z.number().optional(),
    successRate: z.number().min(0).max(100).optional()
});

// API Client Types
export const APIClientConfigSchema = z.object({
    baseUrl: z.string().url(),
    timeout: z.number().positive(),
    retries: z.number().min(0),
    headers: z.record(z.string()).optional(),
    auth: z.object({
        type: z.enum(['bearer', 'basic', 'api-key', 'none']),
        token: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        apiKey: z.string().optional(),
        apiKeyHeader: z.string().optional()
    }).optional()
});

export const APIRequestSchema = z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
    path: z.string(),
    headers: z.record(z.string()).optional(),
    params: z.record(z.string()).optional(),
    body: z.unknown().optional(),
    timeout: z.number().optional()
});

export const APIResponseSchema = z.object({
    status: z.number(),
    statusText: z.string(),
    headers: z.record(z.string()),
    data: z.unknown(),
    responseTime: z.number(),
    request: APIRequestSchema
});

// Cache Types
export const CacheEntrySchema = z.object({
    key: z.string(),
    value: z.unknown(),
    expiresAt: z.date().optional(),
    createdAt: z.date(),
    hits: z.number().optional(),
    size: z.number().optional()
});

export const CacheConfigSchema = z.object({
    ttl: z.number().positive(),
    maxSize: z.number().positive(),
    compression: z.boolean().optional(),
    encryption: z.boolean().optional(),
    namespace: z.string().optional()
});

// Queue Types
export const QueueMessageSchema = z.object({
    id: z.string(),
    type: z.string(),
    priority: z.number().min(0).max(10),
    data: z.unknown(),
    createdAt: z.date(),
    expiresAt: z.date().optional(),
    retryCount: z.number().optional(),
    maxRetries: z.number().optional()
});

export const QueueConfigSchema = z.object({
    name: z.string(),
    maxSize: z.number().positive(),
    defaultTtl: z.number().positive(),
    retryPolicy: z.object({
        maxRetries: z.number().min(0),
        backoffMultiplier: z.number().positive(),
        initialDelay: z.number().positive()
    }).optional()
});

// Database Types
export const DatabaseConnectionSchema = z.object({
    host: z.string(),
    port: z.number().positive(),
    database: z.string(),
    username: z.string(),
    password: z.string(),
    ssl: z.boolean().optional(),
    connectionTimeout: z.number().optional(),
    queryTimeout: z.number().optional()
});

export const DatabaseQuerySchema = z.object({
    sql: z.string(),
    params: z.array(z.unknown()).optional(),
    timeout: z.number().optional(),
    readOnly: z.boolean().optional()
});

export const DatabaseResultSchema = z.object({
    rows: z.array(z.record(z.unknown())),
    rowCount: z.number(),
    executionTime: z.number(),
    affectedRows: z.number().optional(),
    lastInsertId: z.unknown().optional()
});

// Message Queue Types
export const MessageSchema = z.object({
    id: z.string(),
    topic: z.string(),
    partition: z.string().optional(),
    key: z.string().optional(),
    value: z.unknown(),
    headers: z.record(z.string()).optional(),
    timestamp: z.date(),
    offset: z.number().optional()
});

export const MessageHandlerSchema = z.object({
    topic: z.string(),
    handler: z.function(),
    options: z.object({
        autoCommit: z.boolean().optional(),
        fromBeginning: z.boolean().optional(),
        groupId: z.string().optional()
    }).optional()
});

// File Storage Types
export const FileMetadataSchema = z.object({
    name: z.string(),
    path: z.string(),
    size: z.number(),
    mimeType: z.string(),
    encoding: z.string().optional(),
    hash: z.string().optional(),
    uploadedAt: z.date(),
    lastModified: z.date(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional()
});

export const UploadOptionsSchema = z.object({
    contentType: z.string().optional(),
    acl: z.string().optional(),
    tags: z.record(z.string()).optional(),
    metadata: z.record(z.string()).optional(),
    expires: z.date().optional()
});

// Exported Types
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;
export type APIClientConfig = z.infer<typeof APIClientConfigSchema>;
export type APIRequest = z.infer<typeof APIRequestSchema>;
export type APIResponse<T = unknown> = Omit<z.infer<typeof APIResponseSchema>, 'data'> & { data: T };
export type CacheEntry<T = unknown> = Omit<z.infer<typeof CacheEntrySchema>, 'value'> & { value: T };
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
export type QueueMessage<T = unknown> = Omit<z.infer<typeof QueueMessageSchema>, 'data'> & { data: T };
export type QueueConfig = z.infer<typeof QueueConfigSchema>;
export type DatabaseConnection = z.infer<typeof DatabaseConnectionSchema>;
export type DatabaseQuery = z.infer<typeof DatabaseQuerySchema>;
export type DatabaseResult<T = Record<string, unknown>> = Omit<z.infer<typeof DatabaseResultSchema>, 'rows'> & { rows: T[] };
export type Message<T = unknown> = Omit<z.infer<typeof MessageSchema>, 'value'> & { value: T };
export type MessageHandler<T = unknown> = Omit<z.infer<typeof MessageHandlerSchema>, 'handler'> & {
    handler: (message: Message<T>) => void | Promise<void>
};
export type FileMetadata = z.infer<typeof FileMetadataSchema>;
export type UploadOptions = z.infer<typeof UploadOptionsSchema>;

// Service Interfaces
export interface Service<TConfig = unknown> {
    getName(): string;
    getVersion(): string;
    getStatus(): ServiceStatus;
    getHealth(): Promise<ServiceHealth>;
    configure(config: TConfig): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
}

export interface APIClient {
    request<T = unknown>(request: APIRequest): Promise<APIResponse<T>>;
    get<T = unknown>(path: string, params?: Record<string, string>): Promise<APIResponse<T>>;
    post<T = unknown>(path: string, body?: unknown): Promise<APIResponse<T>>;
    put<T = unknown>(path: string, body?: unknown): Promise<APIResponse<T>>;
    delete<T = unknown>(path: string): Promise<APIResponse<T>>;
}

export interface Cache<T = unknown> {
    get<K extends keyof T>(key: K): Promise<T[K] | null>;
    set<K extends keyof T>(key: K, value: T[K], ttl?: number): Promise<void>;
    delete<K extends keyof T>(key: K): Promise<boolean>;
    clear(): Promise<void>;
    has<K extends keyof T>(key: K): Promise<boolean>;
    size(): Promise<number>;
}

export interface Queue<T = unknown> {
    enqueue(message: QueueMessage<T>): Promise<void>;
    dequeue(): Promise<QueueMessage<T> | null>;
    peek(): Promise<QueueMessage<T> | null>;
    size(): Promise<number>;
    clear(): Promise<void>;
}

export interface DatabaseClient {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query<T = Record<string, unknown>>(query: DatabaseQuery): Promise<DatabaseResult<T>>;
    transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
    isConnected(): boolean;
}

export interface MessageQueue<T = unknown> {
    publish(message: Message<T>): Promise<void>;
    subscribe(handler: MessageHandler<T>): Promise<void>;
    unsubscribe(handler: MessageHandler<T>): Promise<void>;
    createTopic(topic: string, partitions?: number): Promise<void>;
    deleteTopic(topic: string): Promise<void>;
}

export interface FileStorage {
    upload(file: Buffer, filename: string, options?: UploadOptions): Promise<FileMetadata>;
    download(path: string): Promise<Buffer>;
    delete(path: string): Promise<void>;
    list(prefix?: string): Promise<FileMetadata[]>;
    exists(path: string): Promise<boolean>;
    getMetadata(path: string): Promise<FileMetadata>;
}

// Utility Types
export type ServiceConstructor<T extends Service = Service> = new (...args: unknown[]) => T;
export type APIResponseData<T> = T extends APIResponse<infer U> ? U : unknown;
export type CacheValue<T> = T extends Cache<infer U> ? U[keyof U] : unknown;
export type QueueData<T> = T extends Queue<infer U> ? U : unknown;
export type MessageData<T> = T extends Message<infer U> ? U : unknown;
export type DatabaseRow<T> = T extends DatabaseResult<infer U> ? U : Record<string, unknown>;

// Configuration Types
export interface ServiceRegistryConfig {
    discovery: {
        enabled: boolean;
        interval: number;
        timeout: number;
    };
    healthCheck: {
        enabled: boolean;
        interval: number;
        timeout: number;
    };
    loadBalancing: {
        strategy: 'round-robin' | 'least-connections' | 'weighted';
        enabled: boolean;
    };
}

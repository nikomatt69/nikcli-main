import { DocumentInput, QueryOptions } from '../types';

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export function validateDocumentInput(doc: DocumentInput): void {
    if (!doc.content || typeof doc.content !== 'string') {
        throw new ValidationError('Document content must be a non-empty string');
    }

    if (doc.content.trim().length === 0) {
        throw new ValidationError('Document content cannot be empty');
    }

    if (doc.chunkSize && (doc.chunkSize < 100 || doc.chunkSize > 5000)) {
        throw new ValidationError('Chunk size must be between 100 and 5000 characters');
    }

    if (doc.chunkOverlap && doc.chunkOverlap < 0) {
        throw new ValidationError('Chunk overlap cannot be negative');
    }

    if (doc.chunkSize && doc.chunkOverlap && doc.chunkOverlap >= doc.chunkSize) {
        throw new ValidationError('Chunk overlap must be less than chunk size');
    }
}

export function validateQueryOptions(options: QueryOptions): void {
    if (options.topK !== undefined && (options.topK < 1 || options.topK > 100)) {
        throw new ValidationError('topK must be between 1 and 100');
    }

    if (options.scoreThreshold !== undefined && (options.scoreThreshold < 0 || options.scoreThreshold > 1)) {
        throw new ValidationError('scoreThreshold must be between 0 and 1');
    }

    if (options.maxTokens !== undefined && options.maxTokens < 0) {
        throw new ValidationError('maxTokens cannot be negative');
    }
}

export function validateVector(vector: number[], expectedDimension: number): void {
    if (!Array.isArray(vector)) {
        throw new ValidationError('Vector must be an array');
    }

    if (vector.length !== expectedDimension) {
        throw new ValidationError(`Vector dimension mismatch: expected ${expectedDimension}, got ${vector.length}`);
    }

    if (!vector.every(n => typeof n === 'number' && !isNaN(n))) {
        throw new ValidationError('Vector must contain only valid numbers');
    }
}

export function sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
        if (value === null || value === undefined) {
            continue;
        }

        if (typeof value === 'object' && !(value instanceof Date)) {
            sanitized[key] = JSON.stringify(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

export function validateConversationId(conversationId: string): void {
    if (!conversationId || typeof conversationId !== 'string') {
        throw new ValidationError('Conversation ID must be a non-empty string');
    }

    if (conversationId.length > 256) {
        throw new ValidationError('Conversation ID must be less than 256 characters');
    }
}


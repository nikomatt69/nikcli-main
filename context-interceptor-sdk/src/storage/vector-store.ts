import { Index } from '@upstash/vector';
import { EmbeddedChunk, VectorQueryResult } from '../types';
import { Logger } from '../utils/logger';
import { validateVector, sanitizeMetadata } from '../utils/validation';

export class VectorStore {
    private index: Index;
    private dimensions: number;
    private logger: Logger;

    constructor(url: string, token: string, dimensions: number, logger: Logger) {
        this.index = new Index({
            url,
            token
        });
        this.dimensions = dimensions;
        this.logger = logger;
    }

    async upsert(chunk: EmbeddedChunk): Promise<string> {
        validateVector(chunk.vector, this.dimensions);

        try {
            this.logger.debug('Upserting chunk to vector store', {
                chunkId: chunk.id,
                dimensions: chunk.vector.length
            });

            await this.index.upsert({
                id: chunk.id,
                vector: chunk.vector,
                metadata: {
                    text: chunk.text,
                    ...sanitizeMetadata(chunk.metadata)
                }
            });

            this.logger.debug('Chunk upserted successfully', { chunkId: chunk.id });
            return chunk.id;
        } catch (error) {
            this.logger.error('Failed to upsert chunk', {
                chunkId: chunk.id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to upsert chunk: ${error}`);
        }
    }

    async upsertBatch(chunks: EmbeddedChunk[]): Promise<string[]> {
        if (chunks.length === 0) {
            return [];
        }

        try {
            this.logger.debug(`Batch upserting ${chunks.length} chunks`);

            const upsertData = chunks.map(chunk => {
                validateVector(chunk.vector, this.dimensions);

                return {
                    id: chunk.id,
                    vector: chunk.vector,
                    metadata: {
                        text: chunk.text,
                        ...sanitizeMetadata(chunk.metadata)
                    }
                };
            });

            await this.index.upsert(upsertData);

            this.logger.debug(`Successfully upserted ${chunks.length} chunks`);
            return chunks.map(c => c.id);
        } catch (error) {
            this.logger.error('Failed to batch upsert chunks', {
                count: chunks.length,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to batch upsert: ${error}`);
        }
    }

    async query(
        vector: number[],
        topK: number = 10,
        filter?: Record<string, any>
    ): Promise<VectorQueryResult[]> {
        validateVector(vector, this.dimensions);

        try {
            this.logger.debug('Querying vector store', {
                topK,
                hasFilter: !!filter
            });

            const sanitizedFilter = filter ? sanitizeMetadata(filter) : undefined;
            const results = await this.index.query({
                vector,
                topK,
                includeMetadata: true,
                filter: sanitizedFilter as any
            });

            this.logger.debug(`Query returned ${results.length} results`);

            return results.map(result => ({
                id: String(result.id),
                score: result.score,
                metadata: result.metadata as Record<string, any>
            }));
        } catch (error) {
            this.logger.error('Failed to query vector store', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to query vectors: ${error}`);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            this.logger.debug('Deleting chunk from vector store', { chunkId: id });
            await this.index.delete(id);
            this.logger.debug('Chunk deleted successfully', { chunkId: id });
        } catch (error) {
            this.logger.error('Failed to delete chunk', {
                chunkId: id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to delete chunk: ${error}`);
        }
    }

    async deleteBatch(ids: string[]): Promise<void> {
        if (ids.length === 0) {
            return;
        }

        try {
            this.logger.debug(`Batch deleting ${ids.length} chunks`);
            await this.index.delete(ids);
            this.logger.debug(`Successfully deleted ${ids.length} chunks`);
        } catch (error) {
            this.logger.error('Failed to batch delete chunks', {
                count: ids.length,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to batch delete: ${error}`);
        }
    }

    async reset(): Promise<void> {
        this.logger.warn('Resetting vector store (deleting all data)');
        try {
            await this.index.reset();
            this.logger.info('Vector store reset successfully');
        } catch (error) {
            this.logger.error('Failed to reset vector store', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to reset vector store: ${error}`);
        }
    }

    async info(): Promise<any> {
        try {
            const info = await this.index.info();
            return info;
        } catch (error) {
            this.logger.error('Failed to get vector store info', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to get info: ${error}`);
        }
    }
}

export const createVectorStore = (url: string, token: string, dimensions: number, logger: Logger): VectorStore => {
    return new VectorStore(url, token, dimensions, logger);
};


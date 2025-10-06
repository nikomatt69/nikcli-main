import OpenAI from 'openai';
import { Logger } from '../utils/logger';

export class Embedder {
    private client: OpenAI;
    private model: string;
    private dimensions: number;
    private logger: Logger;
    private batchSize: number = 100;

    constructor(apiKey: string, model: string, dimensions: number, logger: Logger) {
        this.client = new OpenAI({ apiKey });
        this.model = model;
        this.dimensions = dimensions;
        this.logger = logger;
    }

    async generateEmbedding(text: string, retries: number = 3): Promise<number[]> {
        if (!text || text.trim().length === 0) {
            throw new Error('Cannot generate embedding for empty text');
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                this.logger.debug(`Generating embedding (attempt ${attempt}/${retries})`, {
                    textLength: text.length,
                    model: this.model
                });

                const response = await this.client.embeddings.create({
                    model: this.model,
                    input: text.trim(),
                    dimensions: this.dimensions
                });

                if (!response.data || response.data.length === 0) {
                    throw new Error('Empty embedding response');
                }

                const embedding = response.data[0].embedding;

                if (embedding.length !== this.dimensions) {
                    throw new Error(`Embedding dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`);
                }

                this.logger.debug('Embedding generated successfully', {
                    dimensions: embedding.length,
                    usage: response.usage
                });

                return embedding;
            } catch (error) {
                this.logger.warn(`Embedding generation failed (attempt ${attempt}/${retries})`, {
                    error: error instanceof Error ? error.message : String(error)
                });

                if (attempt === retries) {
                    throw new Error(`Failed to generate embedding after ${retries} attempts: ${error}`);
                }

                await this.sleep(Math.pow(2, attempt) * 1000);
            }
        }

        throw new Error('Failed to generate embedding');
    }

    async batchEmbeddings(texts: string[], retries: number = 3): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            return [];
        }

        const results: number[][] = [];
        const validTexts = texts.filter(t => t && t.trim().length > 0);

        for (let i = 0; i < validTexts.length; i += this.batchSize) {
            const batch = validTexts.slice(i, i + this.batchSize);

            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    this.logger.debug(`Generating batch embeddings (${i + 1}-${i + batch.length}/${validTexts.length})`, {
                        batchSize: batch.length,
                        model: this.model
                    });

                    const response = await this.client.embeddings.create({
                        model: this.model,
                        input: batch.map(t => t.trim()),
                        dimensions: this.dimensions
                    });

                    if (!response.data || response.data.length !== batch.length) {
                        throw new Error('Batch embedding count mismatch');
                    }

                    const batchResults = response.data.map(item => {
                        if (item.embedding.length !== this.dimensions) {
                            throw new Error(`Embedding dimension mismatch in batch`);
                        }
                        return item.embedding;
                    });

                    results.push(...batchResults);

                    this.logger.debug('Batch embeddings generated successfully', {
                        count: batchResults.length,
                        usage: response.usage
                    });

                    break;
                } catch (error) {
                    this.logger.warn(`Batch embedding generation failed (attempt ${attempt}/${retries})`, {
                        batchIndex: i,
                        error: error instanceof Error ? error.message : String(error)
                    });

                    if (attempt === retries) {
                        throw new Error(`Failed to generate batch embeddings after ${retries} attempts: ${error}`);
                    }

                    await this.sleep(Math.pow(2, attempt) * 1000);
                }
            }
        }

        return results;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    setBatchSize(size: number): void {
        if (size < 1 || size > 2048) {
            throw new Error('Batch size must be between 1 and 2048');
        }
        this.batchSize = size;
    }
}

export const createEmbedder = (apiKey: string, model: string, dimensions: number, logger: Logger): Embedder => {
    return new Embedder(apiKey, model, dimensions, logger);
};


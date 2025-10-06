import { DocumentInput, EmbeddedChunk, VectorStoreAdapter } from '../types';
import { DocumentSource } from './sources/document-source';
import { TextChunker } from './chunker';
import { Embedder } from './embedder';
import { Logger } from '../utils/logger';
import { validateDocumentInput } from '../utils/validation';

export class DocumentIndexer {
    private chunker: TextChunker;
    private embedder: Embedder;
    private vectorStore: VectorStoreAdapter;
    private logger: Logger;

    constructor(embedder: Embedder, vectorStore: VectorStoreAdapter, logger: Logger) {
        this.chunker = new TextChunker();
        this.embedder = embedder;
        this.vectorStore = vectorStore;
        this.logger = logger;
    }

    async indexDocuments(documents: DocumentInput[]): Promise<string[]> {
        this.logger.info(`Starting indexing of ${documents.length} documents`);
        const indexedIds: string[] = [];

        for (const doc of documents) {
            try {
                validateDocumentInput(doc);
                const ids = await this.indexDocument(doc);
                indexedIds.push(...ids);
            } catch (error) {
                this.logger.error('Failed to index document', {
                    documentId: doc.id,
                    error: error instanceof Error ? error.message : String(error)
                });
                throw error;
            }
        }

        this.logger.info(`Successfully indexed ${indexedIds.length} chunks from ${documents.length} documents`);
        return indexedIds;
    }

    async indexDocument(document: DocumentInput): Promise<string[]> {
        this.logger.debug('Indexing document', {
            documentId: document.id,
            contentLength: document.content.length
        });

        const chunks = this.chunker.chunk(document.content, document.metadata, {
            chunkSize: document.chunkSize,
            chunkOverlap: document.chunkOverlap,
            respectBoundaries: true
        });

        this.logger.debug(`Document chunked into ${chunks.length} pieces`);

        const texts = chunks.map(chunk => chunk.text);
        const embeddings = await this.embedder.batchEmbeddings(texts);

        if (embeddings.length !== chunks.length) {
            throw new Error('Embedding count mismatch with chunk count');
        }

        const embeddedChunks: EmbeddedChunk[] = chunks.map((chunk, i) => ({
            ...chunk,
            vector: embeddings[i],
            metadata: {
                ...chunk.metadata,
                documentId: document.id,
                indexed: new Date()
            }
        }));

        const chunkIds = await this.vectorStore.upsertBatch(embeddedChunks);

        this.logger.debug(`Indexed ${chunkIds.length} chunks for document`, {
            documentId: document.id
        });

        return chunkIds;
    }

    async updateDocument(id: string, content: string, metadata?: Record<string, any>): Promise<string[]> {
        this.logger.info('Updating document', { documentId: id });

        await this.deleteDocument(id);

        return this.indexDocument({
            id,
            content,
            metadata
        });
    }

    async deleteDocument(documentId: string): Promise<void> {
        this.logger.info('Deleting document', { documentId });

        const searchResults = await this.vectorStore.query(
            new Array(1536).fill(0),
            1000,
            { documentId }
        );

        const idsToDelete = searchResults.map(r => r.id);

        if (idsToDelete.length > 0) {
            await this.vectorStore.deleteBatch(idsToDelete);
            this.logger.debug(`Deleted ${idsToDelete.length} chunks for document`, { documentId });
        }
    }

    async deleteChunk(chunkId: string): Promise<void> {
        this.logger.debug('Deleting chunk', { chunkId });
        await this.vectorStore.delete(chunkId);
    }

    /** Index from one or more document sources */
    async indexFromSources(sources: DocumentSource[]): Promise<string[]> {
        const collected: DocumentInput[] = [];
        for (const src of sources) {
            const listed = await src.list();
            if (Symbol.asyncIterator in Object(listed)) {
                for await (const d of listed as AsyncIterable<DocumentInput>) collected.push(d);
            } else {
                collected.push(...(listed as DocumentInput[]));
            }
        }
        return this.indexDocuments(collected);
    }
}

export const createIndexer = (embedder: Embedder, vectorStore: VectorStoreAdapter, logger: Logger): DocumentIndexer => {
    return new DocumentIndexer(embedder, vectorStore, logger);
};


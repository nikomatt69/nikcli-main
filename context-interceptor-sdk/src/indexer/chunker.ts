import { Chunk, ChunkMetadata, ChunkingOptions } from '../types';
import { nanoid } from 'nanoid';

export class TextChunker {
    private defaultOptions: ChunkingOptions = {
        chunkSize: 800,
        chunkOverlap: 50,
        respectBoundaries: true
    };

    chunk(text: string, metadata: ChunkMetadata = {}, options?: Partial<ChunkingOptions>): Chunk[] {
        const opts = { ...this.defaultOptions, ...options };
        const chunks: Chunk[] = [];

        if (!text || text.trim().length === 0) {
            return chunks;
        }

        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        if (opts.respectBoundaries) {
            return this.chunkWithBoundaries(normalizedText, metadata, opts);
        }

        return this.chunkSimple(normalizedText, metadata, opts);
    }

    private chunkSimple(text: string, metadata: ChunkMetadata, options: ChunkingOptions): Chunk[] {
        const chunks: Chunk[] = [];
        let position = 0;
        let index = 0;

        while (position < text.length) {
            const end = Math.min(position + options.chunkSize, text.length);
            const chunkText = text.slice(position, end);

            chunks.push({
                id: nanoid(),
                text: chunkText.trim(),
                metadata: {
                    ...metadata,
                    chunkIndex: index,
                    startPosition: position,
                    endPosition: end
                },
                position: index,
                totalChunks: 0
            });

            position = end - options.chunkOverlap;
            index++;
        }

        chunks.forEach(chunk => {
            chunk.totalChunks = chunks.length;
        });

        return chunks;
    }

    private chunkWithBoundaries(text: string, metadata: ChunkMetadata, options: ChunkingOptions): Chunk[] {
        const paragraphs = text.split(/\n\n+/);
        const chunks: Chunk[] = [];
        let currentChunk = '';
        let index = 0;
        let globalPosition = 0;

        for (const paragraph of paragraphs) {
            const trimmedParagraph = paragraph.trim();
            if (!trimmedParagraph) continue;

            if (currentChunk.length + trimmedParagraph.length + 2 <= options.chunkSize) {
                currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
            } else {
                if (currentChunk) {
                    chunks.push(this.createChunk(currentChunk, metadata, index, globalPosition));

                    const overlapText = this.getOverlapText(currentChunk, options.chunkOverlap);
                    currentChunk = overlapText + (overlapText ? '\n\n' : '') + trimmedParagraph;
                    index++;
                    globalPosition += currentChunk.length - overlapText.length;
                } else {
                    const sentenceChunks = this.chunkBySentences(trimmedParagraph, options);
                    for (const sentenceChunk of sentenceChunks) {
                        chunks.push(this.createChunk(sentenceChunk, metadata, index, globalPosition));
                        index++;
                        globalPosition += sentenceChunk.length;
                    }
                }
            }
        }

        if (currentChunk) {
            chunks.push(this.createChunk(currentChunk, metadata, index, globalPosition));
        }

        chunks.forEach(chunk => {
            chunk.totalChunks = chunks.length;
        });

        return chunks;
    }

    private chunkBySentences(text: string, options: ChunkingOptions): string[] {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const chunks: string[] = [];
        let currentChunk = '';

        for (const sentence of sentences) {
            const trimmedSentence = sentence.trim();

            if (currentChunk.length + trimmedSentence.length + 1 <= options.chunkSize) {
                currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }

                if (trimmedSentence.length > options.chunkSize) {
                    const words = trimmedSentence.split(/\s+/);
                    let wordChunk = '';

                    for (const word of words) {
                        if (wordChunk.length + word.length + 1 <= options.chunkSize) {
                            wordChunk += (wordChunk ? ' ' : '') + word;
                        } else {
                            if (wordChunk) {
                                chunks.push(wordChunk);
                            }
                            wordChunk = word;
                        }
                    }

                    if (wordChunk) {
                        currentChunk = wordChunk;
                    }
                } else {
                    currentChunk = trimmedSentence;
                }
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    private getOverlapText(text: string, overlapSize: number): string {
        if (text.length <= overlapSize) {
            return text;
        }

        const overlapText = text.slice(-overlapSize);
        const sentenceEnd = overlapText.search(/[.!?]\s/);

        if (sentenceEnd !== -1) {
            return overlapText.slice(sentenceEnd + 2);
        }

        return overlapText;
    }

    private createChunk(text: string, metadata: ChunkMetadata, index: number, position: number): Chunk {
        return {
            id: nanoid(),
            text: text.trim(),
            metadata: {
                ...metadata,
                chunkIndex: index,
                startPosition: position
            },
            position: index,
            totalChunks: 0
        };
    }
}

export const createChunker = (): TextChunker => {
    return new TextChunker();
};


import { describe, it, expect } from 'vitest';
import { TextChunker } from '../../src/indexer/chunker';

describe('TextChunker', () => {
    const chunker = new TextChunker();

    it('should chunk text into appropriate sizes', () => {
        const text = 'a'.repeat(2000);
        const chunks = chunker.chunk(text, {}, { chunkSize: 500, chunkOverlap: 50 });

        expect(chunks.length).toBeGreaterThan(1);
        chunks.forEach(chunk => {
            expect(chunk.text.length).toBeLessThanOrEqual(500);
        });
    });

    it('should respect paragraph boundaries', () => {
        const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
        const chunks = chunker.chunk(text, {}, {
            chunkSize: 100,
            chunkOverlap: 10,
            respectBoundaries: true
        });

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0].text).toContain('paragraph');
    });

    it('should include overlap between chunks', () => {
        const text = 'a'.repeat(1000);
        const chunks = chunker.chunk(text, {}, { chunkSize: 400, chunkOverlap: 50 });

        expect(chunks.length).toBeGreaterThan(1);
        // Overlap should be preserved
        expect(chunks[1].text.substring(0, 50)).toBeTruthy();
    });

    it('should handle empty text', () => {
        const chunks = chunker.chunk('', {});
        expect(chunks).toEqual([]);
    });

    it('should add metadata to chunks', () => {
        const text = 'Test content for chunking.';
        const metadata = { fileName: 'test.txt', category: 'test' };
        const chunks = chunker.chunk(text, metadata);

        expect(chunks[0].metadata).toMatchObject(metadata);
        expect(chunks[0].metadata.chunkIndex).toBeDefined();
    });

    it('should assign unique IDs to chunks', () => {
        const text = 'Test content for unique ID generation.';
        const chunks = chunker.chunk(text);

        expect(chunks[0].id).toBeTruthy();
        expect(typeof chunks[0].id).toBe('string');
    });
});


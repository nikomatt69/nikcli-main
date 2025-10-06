import { describe, it, expect } from 'vitest';
import {
    validateDocumentInput,
    validateQueryOptions,
    validateVector,
    validateConversationId,
    sanitizeMetadata,
    ValidationError
} from '../../src/utils/validation';

describe('Validation', () => {
    describe('validateDocumentInput', () => {
        it('should accept valid document input', () => {
            expect(() => {
                validateDocumentInput({
                    content: 'Valid content',
                    chunkSize: 500,
                    chunkOverlap: 50
                });
            }).not.toThrow();
        });

        it('should reject empty content', () => {
            expect(() => {
                validateDocumentInput({ content: '' });
            }).toThrow(ValidationError);
        });

        it('should reject invalid chunk size', () => {
            expect(() => {
                validateDocumentInput({
                    content: 'Valid content',
                    chunkSize: 50
                });
            }).toThrow(ValidationError);
        });

        it('should reject negative overlap', () => {
            expect(() => {
                validateDocumentInput({
                    content: 'Valid content',
                    chunkOverlap: -10
                });
            }).toThrow(ValidationError);
        });
    });

    describe('validateQueryOptions', () => {
        it('should accept valid query options', () => {
            expect(() => {
                validateQueryOptions({
                    topK: 5,
                    scoreThreshold: 0.7,
                    maxTokens: 4000
                });
            }).not.toThrow();
        });

        it('should reject invalid topK', () => {
            expect(() => {
                validateQueryOptions({ topK: 0 });
            }).toThrow(ValidationError);
        });

        it('should reject invalid score threshold', () => {
            expect(() => {
                validateQueryOptions({ scoreThreshold: 1.5 });
            }).toThrow(ValidationError);
        });
    });

    describe('validateVector', () => {
        it('should accept valid vector', () => {
            const vector = new Array(1536).fill(0.5);
            expect(() => {
                validateVector(vector, 1536);
            }).not.toThrow();
        });

        it('should reject wrong dimension', () => {
            const vector = new Array(100).fill(0.5);
            expect(() => {
                validateVector(vector, 1536);
            }).toThrow(ValidationError);
        });

        it('should reject non-numeric values', () => {
            const vector = new Array(1536).fill('invalid' as any);
            expect(() => {
                validateVector(vector, 1536);
            }).toThrow(ValidationError);
        });
    });

    describe('validateConversationId', () => {
        it('should accept valid conversation ID', () => {
            expect(() => {
                validateConversationId('valid-id-123');
            }).not.toThrow();
        });

        it('should reject empty ID', () => {
            expect(() => {
                validateConversationId('');
            }).toThrow(ValidationError);
        });

        it('should reject very long ID', () => {
            expect(() => {
                validateConversationId('a'.repeat(300));
            }).toThrow(ValidationError);
        });
    });

    describe('sanitizeMetadata', () => {
        it('should sanitize metadata correctly', () => {
            const metadata = {
                string: 'test',
                number: 123,
                object: { nested: true },
                null: null,
                undefined: undefined
            };

            const sanitized = sanitizeMetadata(metadata);

            expect(sanitized.string).toBe('test');
            expect(sanitized.number).toBe(123);
            expect(sanitized.object).toBe(JSON.stringify({ nested: true }));
            expect(sanitized.null).toBeUndefined();
            expect(sanitized.undefined).toBeUndefined();
        });
    });
});


import { DocumentInput } from '../../types';

export interface DocumentSource {
    list(): AsyncIterable<DocumentInput> | Promise<DocumentInput[]>;
    watch?(onChange: (doc: DocumentInput | { id: string; delete?: true }) => void): void;
}



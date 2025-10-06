import { DocumentInput, WorkspaceDocProvider } from '../../types';

export class WorkspaceDocSource {
    private provider: WorkspaceDocProvider;

    constructor(provider: WorkspaceDocProvider) {
        this.provider = provider;
    }

    async list(): Promise<DocumentInput[]> {
        const out: DocumentInput[] = [];
        const res = await this.provider();

        if (Symbol.asyncIterator in Object(res)) {
            for await (const doc of res as AsyncIterable<DocumentInput>) out.push(doc);
            return out;
        }
        return res as DocumentInput[];
    }
}



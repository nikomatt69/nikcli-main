import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { DocumentInput, FilesystemDocSourceOptions } from '../../types';

// Note: This source is Node-only; guard usage in edge runtimes
export class FilesystemDocSource {
    private options: FilesystemDocSourceOptions;

    constructor(options: FilesystemDocSourceOptions) {
        this.options = { ...options, globs: Array.isArray(options.globs) ? options.globs : [options.globs] } as any;
    }

    async *list(): AsyncIterable<DocumentInput> {
        const root = this.options.rootDir || process.cwd();
        const entries = await fg(this.options.globs, {
            cwd: root,
            ignore: this.options.ignore,
            dot: false,
            onlyFiles: true,
        });

        for (const rel of entries) {
            const full = path.join(root, rel);
            const stat = await fs.stat(full);
            if (this.options.maxSizeBytes && stat.size > this.options.maxSizeBytes) continue;

            const extOk = !this.options.extensions || this.options.extensions.some(e => rel.endsWith(e));
            if (!extOk) continue;

            const content = await fs.readFile(full, 'utf8');
            yield {
                id: rel,
                content,
                metadata: { fileName: rel, source: 'filesystem' },
            };
        }
    }
}



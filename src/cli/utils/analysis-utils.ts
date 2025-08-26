import chalk from 'chalk';

export interface CompactOptions {
  maxDirs?: number;
  maxFiles?: number;
  maxChars?: number;
}

export function truncateForPrompt(s: string, maxChars: number = 60000): string {
  if (!s) return '';
  return s.length > maxChars ? s.slice(0, maxChars) + '…[truncated]' : s;
}

export function safeStringifyContext(ctx: any, maxChars: number = 32000): string {
  if (!ctx) return '{}';
  try {
    const str = JSON.stringify(ctx, (key, value) => {
      if (typeof value === 'string') {
        return value.length > 4000 ? value.slice(0, 4000) + '…[truncated]' : value;
      }
      if (Array.isArray(value)) {
        const limited = value.slice(0, 100);
        if (value.length > 100) limited.push(`…[+${value.length - 100} more]`);
        return limited;
      }
      return value;
    });
    return str.length > maxChars ? str.slice(0, maxChars) + '…[truncated]' : str;
  } catch {
    return '[unstringifiable context]';
  }
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Compact a potentially large analysis object into a safe, chunkable summary
export function compactAnalysis(analysis: any, opts: CompactOptions = {}) {
  const maxDirs = opts.maxDirs ?? 500;
  const maxFiles = opts.maxFiles ?? 1000;
  const maxChars = opts.maxChars ?? 80000;

  const header: any = {
    name: analysis?.name,
    version: analysis?.version,
    framework: analysis?.framework,
    languages: analysis?.languages,
    fileCount: analysis?.fileCount,
    dependencies: analysis?.dependencies ? {
      production: analysis.dependencies.production?.length ?? 0,
      development: analysis.dependencies.development?.length ?? 0,
      total: analysis.dependencies.total ?? 0,
    } : undefined,
    directory: analysis?.directory,
    timestamp: analysis?.timestamp,
  };

  // Flatten limited directory and file entries
  const dirEntries: any[] = [];
  const fileEntries: any[] = [];

  const walk = (node: any) => {
    if (!node) return;
    // Files
    if (Array.isArray(node.files)) {
      for (const f of node.files) {
        if (fileEntries.length >= maxFiles) break;
        fileEntries.push({ name: f.name, path: f.path, ext: f.extension, size: f.size });
      }
    }
    // Directories
    if (Array.isArray(node.directories)) {
      for (const d of node.directories) {
        if (dirEntries.length < maxDirs) {
          dirEntries.push({ name: d.name, path: d.path, files: (d.files?.length ?? 0) });
        }
        if (dirEntries.length >= maxDirs && fileEntries.length >= maxFiles) return;
        walk(d);
        if (dirEntries.length >= maxDirs && fileEntries.length >= maxFiles) return;
      }
    }
  };

  if (analysis?.structure) {
    walk(analysis.structure);
  }

  const moreDirs = Math.max(0, (countDirs(analysis?.structure) - dirEntries.length));
  const moreFiles = Math.max(0, (analysis?.fileCount ?? 0) - fileEntries.length);

  const summaryObj = {
    ...header,
    sampleDirectories: dirEntries,
    sampleFiles: fileEntries,
    note: `Truncated for safety${moreDirs ? `, +${moreDirs} more dirs` : ''}${moreFiles ? `, +${moreFiles} more files` : ''}`,
  };

  // Ensure the returned payload stays under maxChars
  let json = JSON.stringify(summaryObj);
  if (json.length > maxChars) {
    // If still too large, progressively trim samples
    while (json.length > maxChars && (fileEntries.length > 50 || dirEntries.length > 20)) {
      if (fileEntries.length > 50) fileEntries.length = Math.floor(fileEntries.length * 0.8);
      if (dirEntries.length > 20) dirEntries.length = Math.floor(dirEntries.length * 0.8);
      json = JSON.stringify({ ...header, sampleDirectories: dirEntries, sampleFiles: fileEntries, note: summaryObj.note });
    }
    if (json.length > maxChars) {
      // Final hard cap
      json = json.slice(0, maxChars) + '…[truncated]';
      return json; // already stringified
    }
  }

  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

function countDirs(node: any): number {
  if (!node || !Array.isArray(node.directories)) return 0;
  let count = node.directories.length;
  for (const d of node.directories) count += countDirs(d);
  return count;
}

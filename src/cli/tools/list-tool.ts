import { BaseTool, ToolExecutionResult } from './base-tool';
import { PromptManager } from '../prompts/prompt-manager';
import { CliUI } from '../utils/cli-ui';
import { readdir, stat } from 'fs/promises';
import { join, relative, dirname, basename } from 'path';
import { existsSync } from 'fs';

/**
 * Enhanced ListTool - Lista file e directory con ignore patterns intelligenti
 * Basato su esempi avanzati con logica di filtering dinamica
 */

export interface ListToolParams {
  path?: string;
  ignore?: string[];
  maxDepth?: number;
  includeHidden?: boolean;
  sortBy?: 'name' | 'size' | 'modified';
  limit?: number;
}

// Pattern intelligenti da ignorare automaticamente
export const IGNORE_PATTERNS = [
  'node_modules/',
  '__pycache__/',
  '.git/',
  'dist/',
  'build/',
  'target/',
  'vendor/',
  'bin/',
  'obj/',
  '.idea/',
  '.vscode/',
  '.zig-cache/',
  'zig-out',
  '.coverage',
  'coverage/',
  'tmp/',
  'temp/',
  '.cache/',
  'cache/',
  'logs/',
  '.venv/',
  'venv/',
  'env/',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '*.tmp',
  '.env.local',
  '.env.*.local'
];

const DEFAULT_LIMIT = 100;
const MAX_DEPTH = 10;

export class ListTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('list-tool', workingDirectory);
  }

  async execute(params: ListToolParams): Promise<ToolExecutionResult> {
    try {
      // Carica prompt specifico per questo tool
      const promptManager = PromptManager.getInstance();
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'list-tool',
        parameters: params
      });

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`);

      const searchPath = params.path || this.workingDirectory;
      const limit = params.limit || DEFAULT_LIMIT;
      const maxDepth = Math.min(params.maxDepth || 5, MAX_DEPTH);

      // Validazione sicurezza percorso
      if (!this.isPathSafe(searchPath)) {
        throw new Error(`Path not safe or outside working directory: ${searchPath}`);
      }

      if (!existsSync(searchPath)) {
        throw new Error(`Directory does not exist: ${searchPath}`);
      }

      CliUI.logInfo(`📁 Listing directory: ${relative(this.workingDirectory, searchPath)}`);

      // Scansione intelligente con limiti
      const results = await this.scanDirectory(searchPath, {
        maxDepth,
        includeHidden: params.includeHidden || false,
        ignorePatterns: [...IGNORE_PATTERNS, ...(params.ignore || [])],
        limit
      });

      // Ordinamento risultati
      const sortedResults = this.sortResults(results, params.sortBy || 'name');

      // Costruzione struttura directory per output
      const directoryStructure = this.buildDirectoryStructure(sortedResults, searchPath);

      return {
        success: true,
        data: {
          searchPath,
          totalFound: results.length,
          results: sortedResults.slice(0, limit),
          directoryStructure,
          limitReached: results.length >= limit,
          searchStats: {
            directoriesScanned: results.filter(r => r.type === 'directory').length,
            filesScanned: results.filter(r => r.type === 'file').length,
            maxDepth,
            ignorePatterns: IGNORE_PATTERNS.length + (params.ignore?.length || 0)
          }
        },
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params
        }
      };

    } catch (error: any) {
      CliUI.logError(`List tool failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params
        }
      };
    }
  }

  /**
   * Scansione intelligente directory con pattern ignore
   */
  private async scanDirectory(
    searchPath: string,
    options: {
      maxDepth: number;
      includeHidden: boolean;
      ignorePatterns: string[];
      limit: number;
    }
  ): Promise<FileEntry[]> {
    const results: FileEntry[] = [];
    const visited = new Set<string>();

    const scanRecursive = async (currentPath: string, depth: number): Promise<void> => {
      if (depth > options.maxDepth || results.length >= options.limit) {
        return;
      }

      const realPath = require('fs').realpathSync(currentPath);
      if (visited.has(realPath)) {
        return; // Evita loop infiniti con symlink
      }
      visited.add(realPath);

      try {
        const entries = await readdir(currentPath);

        for (const entry of entries) {
          if (results.length >= options.limit) break;

          const fullPath = join(currentPath, entry);
          const relativePath = relative(searchPath, fullPath);

          // Skip hidden files se non richiesti
          if (!options.includeHidden && entry.startsWith('.')) {
            continue;
          }

          // Applica ignore patterns
          if (this.shouldIgnore(relativePath, options.ignorePatterns)) {
            continue;
          }

          try {
            const stats = await stat(fullPath);
            const fileEntry: FileEntry = {
              name: entry,
              path: fullPath,
              relativePath,
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime,
              extension: stats.isFile() ? this.getFileExtension(entry) : undefined
            };

            results.push(fileEntry);

            // Ricorsione per directory
            if (stats.isDirectory() && depth < options.maxDepth) {
              await scanRecursive(fullPath, depth + 1);
            }

          } catch (statError) {
            // Skip file con errori di accesso
            CliUI.logDebug(`Skipping ${fullPath}: ${statError}`);
          }
        }

      } catch (readdirError) {
        CliUI.logDebug(`Cannot read directory ${currentPath}: ${readdirError}`);
      }
    };

    await scanRecursive(searchPath, 0);
    return results;
  }

  /**
   * Verifica se un file/directory deve essere ignorato
   */
  private shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
    const pathLower = relativePath.toLowerCase();
    
    return ignorePatterns.some(pattern => {
      // Pattern directory (terminano con /)
      if (pattern.endsWith('/')) {
        return pathLower.includes(pattern.toLowerCase());
      }
      
      // Pattern file specifici
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(pathLower);
      }
      
      // Pattern esatti
      return pathLower.includes(pattern.toLowerCase());
    });
  }

  /**
   * Ordina risultati per criterio specificato
   */
  private sortResults(results: FileEntry[], sortBy: string): FileEntry[] {
    return results.sort((a, b) => {
      switch (sortBy) {
        case 'size':
          return b.size - a.size;
        case 'modified':
          return b.modified.getTime() - a.modified.getTime();
        case 'name':
        default:
          // Directory prima, poi file, entrambi alfabetici
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
      }
    });
  }

  /**
   * Costruisce struttura directory per output user-friendly
   */
  private buildDirectoryStructure(results: FileEntry[], basePath: string): DirectoryNode {
    const root: DirectoryNode = {
      name: basename(basePath),
      type: 'directory',
      children: [],
      path: basePath
    };

    const nodeMap = new Map<string, DirectoryNode>();
    nodeMap.set('', root);

    // Ordina per depth per costruire struttura corretta
    const sortedResults = results.sort((a, b) => 
      a.relativePath.split('/').length - b.relativePath.split('/').length
    );

    for (const entry of sortedResults) {
      const pathParts = entry.relativePath.split('/');
      let currentNode = root;

      // Naviga/crea path fino al parent
      for (let i = 0; i < pathParts.length - 1; i++) {
        const partialPath = pathParts.slice(0, i + 1).join('/');
        
        if (!nodeMap.has(partialPath)) {
          const newNode: DirectoryNode = {
            name: pathParts[i],
            type: 'directory',
            children: [],
            path: join(basePath, partialPath)
          };
          currentNode.children?.push(newNode);
          nodeMap.set(partialPath, newNode);
        }
        
        currentNode = nodeMap.get(partialPath)!;
      }

      // Aggiungi il file/directory finale
      const finalNode: DirectoryNode = {
        name: entry.name,
        type: entry.type,
        children: entry.type === 'directory' ? [] : undefined,
        path: entry.path,
        size: entry.size,
        modified: entry.modified,
        extension: entry.extension
      };

      currentNode.children?.push(finalNode);
      if (entry.type === 'directory') {
        nodeMap.set(entry.relativePath, finalNode);
      }
    }

    return root;
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(lastDot + 1) : '';
  }
}

interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  size: number;
  modified: Date;
  extension?: string;
}

interface DirectoryNode {
  name: string;
  type: 'file' | 'directory';
  children?: DirectoryNode[];
  path: string;
  size?: number;
  modified?: Date;
  extension?: string;
}

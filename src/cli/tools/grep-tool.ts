import { BaseTool, ToolExecutionResult } from './base-tool';
import { PromptManager } from '../prompts/prompt-manager';
import { CliUI } from '../utils/cli-ui';
import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, extname } from 'path';
import { existsSync } from 'fs';
import { IGNORE_PATTERNS } from './list-tool';
import { advancedUI } from '../ui/advanced-cli-ui';

/**
 * Enhanced GrepTool - Ricerca avanzata con pattern matching intelligente
 * Basato su esempi con ripgrep-like functionality e ignore patterns
 */

export interface GrepToolParams {
  pattern: string;
  path?: string;
  include?: string;
  exclude?: string[];
  caseSensitive?: boolean;
  wholeWord?: boolean;
  maxResults?: number;
  contextLines?: number;
  useRegex?: boolean;
}

export interface GrepMatch {
  file: string;
  lineNumber: number;
  line: string;
  match: string;
  beforeContext?: string[];
  afterContext?: string[];
  column?: number;
}

export interface GrepResult {
  pattern: string;
  searchPath: string;
  totalMatches: number;
  filesWithMatches: number;
  matches: GrepMatch[];
  truncated: boolean;
  searchStats: {
    filesScanned: number;
    directoriesScanned: number;
    executionTime: number;
  };
}

const DEFAULT_MAX_RESULTS = 100;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BINARY_FILE_PATTERNS = ['.jpg', '.png', '.gif', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so'];

export class GrepTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('grep-tool', workingDirectory);
  }

  async execute(params: GrepToolParams): Promise<ToolExecutionResult> {
    try {
      // Carica prompt specifico per questo tool
      const promptManager = PromptManager.getInstance();
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'grep-tool',
        parameters: params
      });

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`);

      if (!params.pattern) {
        throw new Error('Pattern is required for grep search');
      }

      const searchPath = params.path || this.workingDirectory;
      const maxResults = params.maxResults || DEFAULT_MAX_RESULTS;
      const contextLines = params.contextLines || 0;

      // Validazione sicurezza percorso
      if (!this.isPathSafe(searchPath)) {
        throw new Error(`Path not safe or outside working directory: ${searchPath}`);
      }

      if (!existsSync(searchPath)) {
        throw new Error(`Search path does not exist: ${searchPath}`);
      }

      CliUI.logInfo(`🔍 Searching for pattern: ${CliUI.highlight(params.pattern)}`);

      const startTime = Date.now();

      // Preparazione regex pattern
      const regex = this.buildRegexPattern(params);

      // Scansione file
      const filesToSearch = await this.findFilesToSearch(searchPath, params);
      CliUI.logDebug(`Found ${filesToSearch.length} files to search`);

      // Ricerca pattern nei file
      const matches: GrepMatch[] = [];
      let filesScanned = 0;
      let filesWithMatches = 0;

      for (const filePath of filesToSearch) {
        if (matches.length >= maxResults) break;

        try {
          const fileMatches = await this.searchInFile(filePath, regex, contextLines, params);
          if (fileMatches.length > 0) {
            matches.push(...fileMatches);
            filesWithMatches++;
          }
          filesScanned++;

          // Limita risultati per performance
          if (matches.length >= maxResults) {
            matches.splice(maxResults);
            break;
          }

        } catch (error: any) {
          CliUI.logDebug(`Skipping file ${filePath}: ${error.message}`);
        }
      }

      const executionTime = Date.now() - startTime;

      const result: GrepResult = {
        pattern: params.pattern,
        searchPath,
        totalMatches: matches.length,
        filesWithMatches,
        matches: matches.slice(0, maxResults),
        truncated: matches.length >= maxResults,
        searchStats: {
          filesScanned,
          directoriesScanned: 1,
          executionTime
        }
      };

      CliUI.logSuccess(`✅ Found ${result.totalMatches} matches in ${filesWithMatches} files`);

      // Show grep results in structured UI
      if (result.matches.length > 0) {
        advancedUI.showGrepResults(params.pattern, result.matches);
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime,
          toolName: this.name,
          parameters: params
        }
      };

    } catch (error: any) {
      CliUI.logError(`Grep tool failed: ${error.message}`);
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
   * Costruisce regex pattern basato sui parametri
   */
  private buildRegexPattern(params: GrepToolParams): RegExp {
    let pattern = params.pattern;

    // Escape special regex characters se non usando regex mode
    if (!params.useRegex) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Whole word matching
    if (params.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    const flags = params.caseSensitive ? 'g' : 'gi';

    try {
      return new RegExp(pattern, flags);
    } catch (error) {
      throw new Error(`Invalid regex pattern: ${pattern}. ${error}`);
    }
  }

  /**
   * Trova file da cercare applicando filtri intelligenti
   */
  private async findFilesToSearch(searchPath: string, params: GrepToolParams): Promise<string[]> {
    const files: string[] = [];
    const visited = new Set<string>();

    const scanRecursive = async (currentPath: string, depth: number): Promise<void> => {
      if (depth > 10 || files.length > 1000) return; // Limiti di sicurezza

      const realPath = require('fs').realpathSync(currentPath);
      if (visited.has(realPath)) return;
      visited.add(realPath);

      try {
        const entries = await readdir(currentPath);

        for (const entry of entries) {
          const fullPath = join(currentPath, entry);
          const relativePath = relative(searchPath, fullPath);

          // Applica ignore patterns
          if (this.shouldIgnoreForGrep(relativePath, params.exclude || [])) {
            continue;
          }

          try {
            const stats = await stat(fullPath);

            if (stats.isDirectory()) {
              await scanRecursive(fullPath, depth + 1);
            } else if (stats.isFile()) {
              // Verifica dimensione file
              if (stats.size > MAX_FILE_SIZE) {
                CliUI.logDebug(`Skipping large file: ${relativePath} (${stats.size} bytes)`);
                continue;
              }

              // Verifica se è file binario
              if (this.isBinaryFile(entry)) {
                continue;
              }

              // Applica filtro include se specificato
              if (params.include && !this.matchesIncludePattern(entry, params.include)) {
                continue;
              }

              files.push(fullPath);
            }

          } catch (statError) {
            CliUI.logDebug(`Skipping ${fullPath}: ${statError}`);
          }
        }

      } catch (readdirError) {
        CliUI.logDebug(`Cannot read directory ${currentPath}: ${readdirError}`);
      }
    };

    const stats = await stat(searchPath);
    if (stats.isFile()) {
      files.push(searchPath);
    } else {
      await scanRecursive(searchPath, 0);
    }

    return files;
  }

  /**
   * Cerca pattern in un singolo file
   */
  private async searchInFile(
    filePath: string,
    regex: RegExp,
    contextLines: number,
    params: GrepToolParams
  ): Promise<GrepMatch[]> {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const matches: GrepMatch[] = [];
    const relativePath = relative(this.workingDirectory, filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = regex.exec(line);

      if (match) {
        const grepMatch: GrepMatch = {
          file: relativePath,
          lineNumber: i + 1,
          line: line,
          match: match[0],
          column: match.index
        };

        // Aggiungi contesto se richiesto
        if (contextLines > 0) {
          grepMatch.beforeContext = lines.slice(
            Math.max(0, i - contextLines),
            i
          );
          grepMatch.afterContext = lines.slice(
            i + 1,
            Math.min(lines.length, i + 1 + contextLines)
          );
        }

        matches.push(grepMatch);

        // Reset regex per global flag
        regex.lastIndex = 0;
      }
    }

    return matches;
  }

  /**
   * Verifica se un file/directory deve essere ignorato per grep
   */
  private shouldIgnoreForGrep(relativePath: string, excludePatterns: string[]): boolean {
    const pathLower = relativePath.toLowerCase();

    // Applica ignore patterns standard
    if (IGNORE_PATTERNS.some(pattern => {
      if (pattern.endsWith('/')) {
        return pathLower.includes(pattern.toLowerCase());
      }
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(pathLower);
      }
      return pathLower.includes(pattern.toLowerCase());
    })) {
      return true;
    }

    // Applica exclude patterns personalizzati
    return excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(pathLower);
      }
      return pathLower.includes(pattern.toLowerCase());
    });
  }

  /**
   * Verifica se un file è binario
   */
  private isBinaryFile(filename: string): boolean {
    const ext = extname(filename).toLowerCase();
    return BINARY_FILE_PATTERNS.includes(ext);
  }

  /**
   * Verifica se un file corrisponde al pattern include
   */
  private matchesIncludePattern(filename: string, includePattern: string): boolean {
    // Supporta pattern come "*.js", "*.{ts,tsx}", etc.
    if (includePattern.includes('{') && includePattern.includes('}')) {
      // Pattern con multiple estensioni: *.{js,ts,tsx}
      const basePattern = includePattern.split('{')[0];
      const extensions = includePattern.match(/\{([^}]+)\}/)?.[1].split(',') || [];

      return extensions.some(ext => {
        const fullPattern = basePattern + ext.trim();
        return this.matchesGlobPattern(filename, fullPattern);
      });
    }

    return this.matchesGlobPattern(filename, includePattern);
  }

  /**
   * Verifica match con pattern glob semplice
   */
  private matchesGlobPattern(filename: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return regex.test(filename);
  }
}

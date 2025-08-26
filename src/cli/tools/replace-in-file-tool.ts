import { readFile, writeFile } from 'fs/promises';
import { BaseTool, ToolExecutionResult } from './base-tool';
import { sanitizePath } from './secure-file-tools';
import { CliUI } from '../utils/cli-ui';

/**
 * Production-ready Replace In File Tool
 * Safely performs content replacements with validation and rollback
 */
export class ReplaceInFileTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('replace-in-file-tool', workingDirectory);
  }

  async execute(
    filePath: string,
    searchPattern: string | RegExp,
    replacement: string,
    options: ReplaceOptions = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    let backupContent: string | undefined;

    try {
      // Sanitize and validate file path
      const sanitizedPath = sanitizePath(filePath, this.workingDirectory);

      // Read original content
      const originalContent = await readFile(sanitizedPath, 'utf8');
      backupContent = originalContent;

      // Perform replacement
      const replaceResult = this.performReplacement(
        originalContent,
        searchPattern,
        replacement,
        options
      );

      // Validate replacement if validators provided
      if (options.validators) {
        for (const validator of options.validators) {
          const validation = await validator(
            originalContent,
            replaceResult.newContent,
            replaceResult.matches
          );
          if (!validation.isValid) {
            throw new Error(`Replacement validation failed: ${validation.errors.join(', ')}`);
          }
        }
      }

      // Check if any changes were made
      if (replaceResult.matchCount === 0 && options.requireMatch) {
        throw new Error('No matches found for the search pattern');
      }

      // Write modified content if changes were made
      if (replaceResult.matchCount > 0) {
        await writeFile(sanitizedPath, replaceResult.newContent, 'utf8');
      }

      const duration = Date.now() - startTime;
      const replaceResult_: ReplaceResult = {
        success: true,
        filePath: sanitizedPath,
        matchCount: replaceResult.matchCount,
        replacementsMade: replaceResult.matchCount,
        originalSize: Buffer.byteLength(originalContent, 'utf8'),
        newSize: Buffer.byteLength(replaceResult.newContent, 'utf8'),
        duration,
        preview: this.generatePreview(originalContent, replaceResult.newContent, options.previewLines),
        metadata: {
          searchPattern: searchPattern.toString(),
          replacement,
          encoding: 'utf8',
          hasChanges: replaceResult.matchCount > 0
        }
      };

      if (replaceResult.matchCount > 0) {
        CliUI.logSuccess(`Replaced ${replaceResult.matchCount} occurrence(s) in ${filePath}`);
      } else {
        CliUI.logInfo(`No matches found in ${filePath}`);
      }

      return {
        success: true,
        data: replaceResult_,
        metadata: {
          executionTime: duration,
          toolName: this.name,
          parameters: { filePath, searchPattern: searchPattern.toString(), replacement, options }
        }
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorResult: ReplaceResult = {
        success: false,
        filePath,
        matchCount: 0,
        replacementsMade: 0,
        originalSize: backupContent ? Buffer.byteLength(backupContent, 'utf8') : 0,
        newSize: 0,
        duration,
        error: error.message,
        metadata: {
          searchPattern: searchPattern.toString(),
          replacement,
          encoding: 'utf8',
          hasChanges: false
        }
      };

      CliUI.logError(`Failed to replace in file ${filePath}: ${error.message}`);
      return {
        success: false,
        data: errorResult,
        error: error.message,
        metadata: {
          executionTime: duration,
          toolName: this.name,
          parameters: { filePath, searchPattern: searchPattern.toString(), replacement, options }
        }
      };
    }
  }

  /**
   * Replace in multiple files
   */
  async replaceInMultiple(
    filePaths: string[],
    searchPattern: string | RegExp,
    replacement: string,
    options: ReplaceOptions = {}
  ): Promise<ReplaceMultipleResult> {
    const results: ReplaceResult[] = [];
    let totalReplacements = 0;
    let successCount = 0;

    for (const filePath of filePaths) {
      try {
        const result = await this.execute(filePath, searchPattern, replacement, options);
        results.push(result.data);

        if (result.success) {
          successCount++;
          totalReplacements += result.data.replacementsMade;
        } else if (options.stopOnFirstError) {
          break;
        }
      } catch (error: any) {
        results.push({
          success: false,
          filePath,
          matchCount: 0,
          replacementsMade: 0,
          originalSize: 0,
          newSize: 0,
          duration: 0,
          error: error.message,
          metadata: {
            searchPattern: searchPattern.toString(),
            replacement,
            encoding: 'utf8',
            hasChanges: false
          }
        });

        if (options.stopOnFirstError) {
          break;
        }
      }
    }

    return {
      success: successCount === filePaths.length,
      results,
      totalFiles: filePaths.length,
      successfulFiles: successCount,
      totalReplacements,
      summary: this.generateSummary(results)
    };
  }

  /**
   * Replace with context-aware matching
   */
  async replaceWithContext(
    filePath: string,
    searchPattern: string | RegExp,
    replacement: string,
    context: ContextOptions
  ): Promise<ReplaceResult> {
    try {
      const sanitizedPath = sanitizePath(filePath, this.workingDirectory);
      const content = await readFile(sanitizedPath, 'utf8');
      const lines = content.split('\n');

      let matchCount = 0;
      const modifiedLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let shouldReplace = false;

        // Check if line matches the pattern
        const hasMatch = typeof searchPattern === 'string'
          ? line.includes(searchPattern)
          : searchPattern.test(line);

        if (hasMatch) {
          // Check context conditions
          shouldReplace = this.checkContext(lines, i, context);
        }

        if (shouldReplace) {
          const newLine = typeof searchPattern === 'string'
            ? line.replace(new RegExp(this.escapeRegex(searchPattern), 'g'), replacement)
            : line.replace(searchPattern, replacement);

          modifiedLines.push(newLine);
          matchCount++;
        } else {
          modifiedLines.push(line);
        }
      }

      const newContent = modifiedLines.join('\n');

      if (matchCount > 0) {
        await writeFile(sanitizedPath, newContent, 'utf8');
      }

      return {
        success: true,
        filePath: sanitizedPath,
        matchCount,
        replacementsMade: matchCount,
        originalSize: Buffer.byteLength(content, 'utf8'),
        newSize: Buffer.byteLength(newContent, 'utf8'),
        duration: 0,
        preview: this.generatePreview(content, newContent),
        metadata: {
          searchPattern: searchPattern.toString(),
          replacement,
          encoding: 'utf8',
          hasChanges: matchCount > 0,
          contextUsed: true
        }
      };

    } catch (error: any) {
      throw new Error(`Context-aware replacement failed: ${error.message}`);
    }
  }

  /**
   * Perform the actual replacement operation
   */
  private performReplacement(
    content: string,
    searchPattern: string | RegExp,
    replacement: string,
    options: ReplaceOptions
  ): ReplacementOperation {
    let newContent: string;
    let matchCount = 0;
    const matches: RegExpMatchArray[] = [];

    if (typeof searchPattern === 'string') {
      // String replacement
      const regex = new RegExp(
        this.escapeRegex(searchPattern),
        options.caseSensitive === false ? 'gi' : 'g'
      );

      newContent = content.replace(regex, (match, ...args) => {
        matchCount++;
        matches.push(match as any);

        // Apply max replacements limit
        if (options.maxReplacements && matchCount > options.maxReplacements) {
          return match; // Don't replace beyond limit
        }

        return replacement;
      });
    } else {
      // RegExp replacement
      const globalRegex = new RegExp(
        searchPattern.source,
        searchPattern.flags.includes('g') ? searchPattern.flags : searchPattern.flags + 'g'
      );

      newContent = content.replace(globalRegex, (match, ...args) => {
        matchCount++;
        matches.push(match as any);

        if (options.maxReplacements && matchCount > options.maxReplacements) {
          return match;
        }

        return replacement;
      });
    }

    return {
      newContent,
      matchCount: Math.min(matchCount, options.maxReplacements || matchCount),
      matches
    };
  }

  /**
   * Check if replacement should occur based on context
   */
  private checkContext(lines: string[], lineIndex: number, context: ContextOptions): boolean {
    // Check preceding lines
    if (context.beforeLines) {
      for (let i = 1; i <= context.beforeLines.length; i++) {
        const beforeIndex = lineIndex - i;
        if (beforeIndex >= 0) {
          const beforeLine = lines[beforeIndex];
          const expectedPattern = context.beforeLines[i - 1];

          if (typeof expectedPattern === 'string') {
            if (!beforeLine.includes(expectedPattern)) return false;
          } else {
            if (!expectedPattern.test(beforeLine)) return false;
          }
        }
      }
    }

    // Check following lines
    if (context.afterLines) {
      for (let i = 1; i <= context.afterLines.length; i++) {
        const afterIndex = lineIndex + i;
        if (afterIndex < lines.length) {
          const afterLine = lines[afterIndex];
          const expectedPattern = context.afterLines[i - 1];

          if (typeof expectedPattern === 'string') {
            if (!afterLine.includes(expectedPattern)) return false;
          } else {
            if (!expectedPattern.test(afterLine)) return false;
          }
        }
      }
    }

    // Check exclusion patterns
    if (context.excludeIfContains) {
      const currentLine = lines[lineIndex];
      for (const excludePattern of context.excludeIfContains) {
        if (typeof excludePattern === 'string') {
          if (currentLine.includes(excludePattern)) return false;
        } else {
          if (excludePattern.test(currentLine)) return false;
        }
      }
    }

    return true;
  }

  /**
   * Generate a preview of changes
   */
  private generatePreview(
    originalContent: string,
    newContent: string,
    maxLines: number = 10
  ): ChangePreview {
    const originalLines = originalContent.split('\n');
    const newLines = newContent.split('\n');
    const changes: LineChange[] = [];

    const maxLength = Math.max(originalLines.length, newLines.length);

    for (let i = 0; i < maxLength && changes.length < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const newLine = newLines[i] || '';

      if (originalLine !== newLine) {
        changes.push({
          lineNumber: i + 1,
          original: originalLine,
          modified: newLine,
          type: originalLine === '' ? 'added' : newLine === '' ? 'removed' : 'modified'
        });
      }
    }

    return {
      changes,
      totalChanges: changes.length,
      hasMoreChanges: changes.length === maxLines && originalContent !== newContent
    };
  }

  /**
   * Generate summary for multiple file operations
   */
  private generateSummary(results: ReplaceResult[]): ReplaceSummary {
    const filesWithChanges = results.filter(r => r.success && r.replacementsMade > 0);
    const filesWithErrors = results.filter(r => !r.success);

    return {
      totalFiles: results.length,
      filesModified: filesWithChanges.length,
      filesWithErrors: filesWithErrors.length,
      totalReplacements: results.reduce((sum, r) => sum + r.replacementsMade, 0),
      averageReplacementsPerFile: filesWithChanges.length > 0
        ? Math.round(filesWithChanges.reduce((sum, r) => sum + r.replacementsMade, 0) / filesWithChanges.length)
        : 0
    };
  }

  /**
   * Escape special regex characters in string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export interface ReplaceOptions {
  caseSensitive?: boolean;
  maxReplacements?: number;
  requireMatch?: boolean;
  stopOnFirstError?: boolean;
  previewLines?: number;
  validators?: ReplacementValidator[];
}

export interface ContextOptions {
  beforeLines?: (string | RegExp)[];
  afterLines?: (string | RegExp)[];
  excludeIfContains?: (string | RegExp)[];
}

export interface ReplaceResult {
  success: boolean;
  filePath: string;
  matchCount: number;
  replacementsMade: number;
  originalSize: number;
  newSize: number;
  duration: number;
  preview?: ChangePreview;
  error?: string;
  metadata: {
    searchPattern: string;
    replacement: string;
    encoding: string;
    hasChanges: boolean;
    contextUsed?: boolean;
  };
}

export interface ReplaceMultipleResult {
  success: boolean;
  results: ReplaceResult[];
  totalFiles: number;
  successfulFiles: number;
  totalReplacements: number;
  summary: ReplaceSummary;
}

export interface ReplacementOperation {
  newContent: string;
  matchCount: number;
  matches: RegExpMatchArray[];
}

export interface ChangePreview {
  changes: LineChange[];
  totalChanges: number;
  hasMoreChanges: boolean;
}

export interface LineChange {
  lineNumber: number;
  original: string;
  modified: string;
  type: 'added' | 'removed' | 'modified';
}

export interface ReplaceSummary {
  totalFiles: number;
  filesModified: number;
  filesWithErrors: number;
  totalReplacements: number;
  averageReplacementsPerFile: number;
}

export type ReplacementValidator = (
  originalContent: string,
  newContent: string,
  matches: RegExpMatchArray[]
) => Promise<ValidationResult>;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

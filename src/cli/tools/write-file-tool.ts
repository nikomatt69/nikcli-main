import { writeFile, mkdir, copyFile, unlink, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { BaseTool, ToolExecutionResult } from './base-tool';
import { sanitizePath } from './secure-file-tools';
import { CliUI } from '../utils/cli-ui';
import { DiffViewer, FileDiff } from '../ui/diff-viewer';
import { diffManager } from '../ui/diff-manager';
import { lspManager } from '../lsp/lsp-manager';
import { ContextAwareRAGSystem } from '../context/context-aware-rag';
import { z } from 'zod';
import {
    WriteFileOptionsSchema,
    WriteFileResultSchema,
    AppendOptionsSchema,
    WriteMultipleResultSchema,
    FileWriteSchema,
    VerificationResultSchema,
    ValidationResultSchema,
    type WriteFileOptions,
    type WriteFileResult,
    type AppendOptions,
    type WriteMultipleResult,
    type FileWrite,
    type VerificationResult,
    type ValidationResult,
    type ContentValidator,
    type ContentTransformer
} from '../schemas/tool-schemas';

/**
 * Production-ready Write File Tool
 * Safely writes files with backup, validation, and rollback capabilities
 */
export class WriteFileTool extends BaseTool {
    private backupDirectory: string;
    private contextSystem: ContextAwareRAGSystem;

    constructor(workingDirectory: string) {
        super('write-file-tool', workingDirectory);
        this.backupDirectory = join(workingDirectory, '.ai-backups');
        this.contextSystem = new ContextAwareRAGSystem(workingDirectory);
    }

    async execute(filePath: string, content: string, options: WriteFileOptions = {}): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        let backupPath: string | undefined;

        try {
            // Zod validation for input parameters
            const validatedOptions = WriteFileOptionsSchema.parse(options);

            if (typeof filePath !== 'string' || filePath.trim().length === 0) {
                throw new Error('filePath must be a non-empty string');
            }

            if (typeof content !== 'string') {
                throw new Error('content must be a string');
            }

            // Sanitize and validate file path
            const sanitizedPath = sanitizePath(filePath, this.workingDirectory);

            // Validate content if validators are provided
            if (options.validators) {
                for (const validator of options.validators) {
                    const validation = await validator(content, sanitizedPath);
                    if (!validation.isValid) {
                        throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
                    }
                }
            }

            // LSP + Context Analysis
            await this.performLSPContextAnalysis(sanitizedPath, content);

            // Read existing content for diff display
            let existingContent = '';
            let isNewFile = false;
            try {
                existingContent = await readFile(sanitizedPath, 'utf8');
            } catch (error) {
                // File doesn't exist, it's a new file
                isNewFile = true;
            }

            // Create backup if file exists and backup is enabled
            if (options.createBackup !== false) {
                backupPath = await this.createBackup(sanitizedPath);
            }

            // Ensure directory exists
            const dir = dirname(sanitizedPath);
            await mkdir(dir, { recursive: true });

            // Apply content transformations
            let processedContent = content;
            if (options.transformers) {
                for (const transformer of options.transformers) {
                    processedContent = await transformer(processedContent, sanitizedPath);
                }
            }

            // Show diff before writing (unless disabled)
            if (options.showDiff !== false && !isNewFile && existingContent !== processedContent) {
                const fileDiff: FileDiff = {
                    filePath: sanitizedPath,
                    originalContent: existingContent,
                    newContent: processedContent,
                    isNew: false,
                    isDeleted: false
                };

                console.log('\n');
                DiffViewer.showFileDiff(fileDiff, { compact: true });

                // Also add to diff manager for approval system
                diffManager.addFileDiff(sanitizedPath, existingContent, processedContent);
            } else if (isNewFile) {
                const fileDiff: FileDiff = {
                    filePath: sanitizedPath,
                    originalContent: '',
                    newContent: processedContent,
                    isNew: true,
                    isDeleted: false
                };

                console.log('\n');
                DiffViewer.showFileDiff(fileDiff, { compact: true });
            }

            // Write file with specified encoding
            const encoding = options.encoding || 'utf8';
            await writeFile(sanitizedPath, processedContent, {
                encoding: encoding as BufferEncoding,
                mode: options.mode || 0o644
            });

            // Verify write if requested
            if (options.verifyWrite) {
                const verification = await this.verifyWrite(sanitizedPath, processedContent, encoding);
                if (!verification.success) {
                    throw new Error(`Write verification failed: ${verification.error}`);
                }
            }

            const duration = Date.now() - startTime;
            const writeFileResult: WriteFileResult = {
                success: true,
                filePath: sanitizedPath,
                bytesWritten: Buffer.byteLength(processedContent, encoding as BufferEncoding),
                backupPath,
                duration,
                metadata: {
                    encoding,
                    lines: processedContent.split('\n').length,
                    created: !backupPath, // New file if no backup was created
                    mode: validatedOptions.mode || 0o644
                }
            };

            // Zod validation for result
            const validatedResult = WriteFileResultSchema.parse(writeFileResult);

            // Show relative path in logs for cleaner output
            const relativePath = sanitizedPath.replace(this.workingDirectory, '').replace(/^\//, '') || sanitizedPath;
            CliUI.logSuccess(`File written: ${relativePath} (${writeFileResult.bytesWritten} bytes)`);
            return {
                success: true,
                data: validatedResult,
                metadata: {
                    executionTime: duration,
                    toolName: this.name,
                    parameters: { filePath, contentLength: content.length, options }
                }
            };

        } catch (error: any) {
            // Rollback if backup exists
            if (backupPath && options.autoRollback !== false) {
                try {
                    await this.rollback(filePath, backupPath);
                    CliUI.logInfo('Rolled back to backup due to error');
                } catch (rollbackError: any) {
                    CliUI.logWarning(`Rollback failed: ${rollbackError.message}`);
                }
            }

            const duration = Date.now() - startTime;
            const errorResult: WriteFileResult = {
                success: false,
                filePath,
                bytesWritten: 0,
                backupPath,
                duration,
                error: error.message,
                metadata: {
                    encoding: options.encoding || 'utf8',
                    lines: 0,
                    created: false,
                    mode: options.mode || 0o644
                }
            };

            const relativePath = filePath.replace(this.workingDirectory, '').replace(/^\//, '') || filePath;
            CliUI.logError(`Failed to write file ${relativePath}: ${error.message}`);
            return {
                success: false,
                data: errorResult,
                error: error.message,
                metadata: {
                    executionTime: duration,
                    toolName: this.name,
                    parameters: { filePath, contentLength: content.length, options }
                }
            };
        }
    }

    /**
     * Write multiple files in a transaction-like manner
     */
    async writeMultiple(files: FileWrite[], options: WriteFileOptions = {}): Promise<WriteMultipleResult> {
        const results: WriteFileResult[] = [];
        const backups: string[] = [];
        let successCount = 0;

        try {
            // Phase 1: Create backups for all existing files
            for (const file of files) {
                const sanitizedPath = sanitizePath(file.path, this.workingDirectory);
                if (options.createBackup !== false) {
                    try {
                        const backupPath = await this.createBackup(sanitizedPath);
                        if (backupPath) backups.push(backupPath);
                    } catch {
                        // File doesn't exist, no backup needed
                    }
                }
            }

            // Phase 2: Write all files
            for (const file of files) {
                const toolResult = await this.execute(file.path, file.content, {
                    ...options,
                    createBackup: false // Already handled above
                });
                const result = toolResult.data as WriteFileResult;
                results.push(result);

                if (result.success) {
                    successCount++;
                } else if (options.stopOnFirstError) {
                    break;
                }
            }

            // Phase 3: Handle partial failures
            if (successCount < files.length && options.rollbackOnPartialFailure) {
                await this.rollbackMultiple(backups);
                CliUI.logWarning('Rolled back all changes due to partial failure');
            }

            return {
                success: successCount === files.length,
                results,
                successCount,
                totalFiles: files.length,
                backupPaths: backups
            };

        } catch (error: any) {
            // Rollback all changes
            if (options.autoRollback !== false) {
                await this.rollbackMultiple(backups);
            }

            return {
                success: false,
                results,
                successCount,
                totalFiles: files.length,
                backupPaths: backups,
                error: error.message
            };
        }
    }

    /**
     * Append content to an existing file
     */
    async append(filePath: string, content: string, options: AppendOptions = {}): Promise<WriteFileResult> {
        try {
            const sanitizedPath = sanitizePath(filePath, this.workingDirectory);

            // Read existing content if file exists
            let existingContent = '';
            try {
                const fs = await import('fs/promises');
                existingContent = await fs.readFile(sanitizedPath, 'utf8');
            } catch {
                // File doesn't exist, will be created
            }

            // Prepare new content
            const separator = options.separator || '\n';
            const newContent = existingContent + (existingContent ? separator : '') + content;

            const toolResult = await this.execute(filePath, newContent, {
                encoding: options.encoding,
                createBackup: options.createBackup,
                verifyWrite: options.verifyWrite
            });
            return toolResult.data as WriteFileResult;

        } catch (error: any) {
            throw new Error(`Failed to append to file: ${error.message}`);
        }
    }

    /**
     * Create a backup of an existing file
     */
    private async createBackup(filePath: string): Promise<string | undefined> {
        try {
            const fs = await import('fs/promises');
            await fs.access(filePath); // Check if file exists

            // Ensure backup directory exists
            await mkdir(this.backupDirectory, { recursive: true });

            // Generate backup filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = filePath.replace(this.workingDirectory, '').replace(/^\//, '');
            const backupPath = join(this.backupDirectory, `${fileName}.${timestamp}.backup`);

            // Ensure backup subdirectories exist
            await mkdir(dirname(backupPath), { recursive: true });

            // Copy file to backup location
            await copyFile(filePath, backupPath);

            CliUI.logInfo(`Backup created: ${backupPath}`);
            return backupPath;

        } catch {
            // File doesn't exist or can't be backed up
            return undefined;
        }
    }

    /**
     * Rollback a file from backup
     */
    private async rollback(filePath: string, backupPath: string): Promise<void> {
        try {
            const sanitizedPath = sanitizePath(filePath, this.workingDirectory);
            await copyFile(backupPath, sanitizedPath);
            await unlink(backupPath); // Clean up backup
        } catch (error: any) {
            throw new Error(`Rollback failed: ${error.message}`);
        }
    }

    /**
     * Rollback multiple files from backups
     */
    private async rollbackMultiple(backupPaths: string[]): Promise<void> {
        for (const backupPath of backupPaths) {
            try {
                // Extract original path from backup path
                const originalPath = backupPath
                    .replace(this.backupDirectory, this.workingDirectory)
                    .replace(/\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.backup$/, '');

                await this.rollback(originalPath, backupPath);
            } catch (error: any) {
                CliUI.logWarning(`Failed to rollback ${backupPath}: ${error.message}`);
            }
        }
    }

    /**
     * Verify that file was written correctly
     */
    private async verifyWrite(filePath: string, expectedContent: string, encoding: string): Promise<VerificationResult> {
        try {
            const fs = await import('fs/promises');
            const actualContent = await fs.readFile(filePath, encoding as BufferEncoding);

            if (actualContent === expectedContent) {
                return { success: true };
            } else {
                return {
                    success: false,
                    error: 'Content mismatch after write'
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: `Verification read failed: ${error.message}`
            };
        }
    }

    /**
     * Clean old backups
     */
    async cleanBackups(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
        try {
            const fs = await import('fs/promises');
            const files = await fs.readdir(this.backupDirectory, { recursive: true });
            const now = Date.now();
            let deletedCount = 0;

            for (const file of files) {
                if (typeof file === 'string' && file.endsWith('.backup')) {
                    const filePath = join(this.backupDirectory, file);
                    const stats = await fs.stat(filePath);

                    if (now - stats.mtime.getTime() > maxAge) {
                        await unlink(filePath);
                        deletedCount++;
                    }
                }
            }

            CliUI.logInfo(`Cleaned ${deletedCount} old backup files`);
            return deletedCount;

        } catch (error: any) {
            CliUI.logWarning(`Failed to clean backups: ${error.message}`);
            return 0;
        }
    }

    private async performLSPContextAnalysis(filePath: string, content: string): Promise<void> {
        try {
            // LSP Analysis
            const lspContext = await lspManager.analyzeFile(filePath);

            if (lspContext.diagnostics.length > 0) {
                const errors = lspContext.diagnostics.filter(d => d.severity === 1);
                const warnings = lspContext.diagnostics.filter(d => d.severity === 2);

                if (errors.length > 0) {
                    CliUI.logWarning(`LSP found ${errors.length} errors in ${filePath}`);
                    errors.slice(0, 3).forEach(error => {
                        CliUI.logError(`  Line ${error.range.start.line + 1}: ${error.message}`);
                    });
                }

                if (warnings.length > 0) {
                    CliUI.logInfo(`LSP found ${warnings.length} warnings in ${filePath}`);
                }
            }

            // Context Analysis & Memory Update
            this.contextSystem.recordInteraction(
                `Writing file: ${filePath}`,
                `File write operation with LSP validation`,
                [{
                    type: 'write_file',
                    target: filePath,
                    params: { contentLength: content.length },
                    result: 'pending',
                    duration: 0
                }]
            );

            // Update workspace context with new file
            await this.contextSystem.analyzeFile(filePath);

        } catch (error: any) {
            CliUI.logWarning(`LSP/Context analysis failed: ${error.message}`);
        }
    }
}

/**
 * Built-in validators for common code quality issues
 */
export class ContentValidators {
    /**
     * Validates that content doesn't contain absolute paths (Claude Code best practice)
     */
    static noAbsolutePaths: ContentValidator = async (content: string, _filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for absolute paths in import/require statements
        const absolutePathRegex = /(?:import|require|from)\s+['"`]([^'"`]*\/Users\/[^'"`]*|[^'"`]*\/home\/[^'"`]*|[^'"`]*C:\\[^'"`]*)/g;
        const matches = content.match(absolutePathRegex);

        if (matches) {
            errors.push(`Found absolute paths in imports: ${matches.join(', ')}`);
        }

        // Check for absolute paths in general (more permissive warning)
        const generalAbsoluteRegex = /(\/Users\/\w+|\/home\/\w+|C:\\[^\\]*\\)/g;
        const generalMatches = content.match(generalAbsoluteRegex);

        if (generalMatches) {
            const uniquePaths = [...new Set(generalMatches)];
            warnings.push(`Consider using relative paths instead of: ${uniquePaths.join(', ')}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    };

    /**
     * Validates that package.json doesn't use "latest" versions
     */
    static noLatestVersions: ContentValidator = async (content: string, filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (filePath.endsWith('package.json')) {
            try {
                const packageObj = JSON.parse(content);

                const checkDependencies = (deps: any, section: string) => {
                    if (deps) {
                        Object.entries(deps).forEach(([name, version]) => {
                            if (version === 'latest') {
                                warnings.push(`${section}.${name} uses "latest" - consider pinning to specific version`);
                            }
                        });
                    }
                };

                checkDependencies(packageObj.dependencies, 'dependencies');
                checkDependencies(packageObj.devDependencies, 'devDependencies');
                checkDependencies(packageObj.peerDependencies, 'peerDependencies');

            } catch (parseError) {
                warnings.push('Could not parse package.json to validate versions');
            }
        }

        return {
            isValid: true, // This is a warning-only validator
            errors,
            warnings
        };
    };

    /**
     * Validates TypeScript/JavaScript code quality
     */
    static codeQuality: ContentValidator = async (content: string, filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
            // Check for console.log in production code
            if (content.includes('console.log(') && !filePath.includes('test')) {
                warnings.push('Consider using proper logging instead of console.log');
            }

            // Check for missing exports in index files
            if (filePath.endsWith('index.ts') || filePath.endsWith('index.js')) {
                if (!content.includes('export') && content.trim().length > 0) {
                    warnings.push('Index file should typically export something');
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    };

    /**
     * Validates TypeScript syntax and compilation using LSP
     */
    static lspTypeScriptValidator: ContentValidator = async (content: string, filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (filePath.match(/\.(ts|tsx)$/)) {
            try {
                // Use LSP for TypeScript validation
                const { writeFile, unlink } = await import('fs/promises');
                const tempFilePath = `${filePath}.temp`;

                // Write content to temp file for LSP analysis
                await writeFile(tempFilePath, content, 'utf8');

                // Get LSP diagnostics for the temp file
                const { mcp__ide__getDiagnostics } = require('../../core/lsp-client');
                const diagnostics = await mcp__ide__getDiagnostics({ uri: tempFilePath });

                // Process LSP diagnostics
                if (diagnostics && diagnostics.length > 0) {
                    for (const diagnostic of diagnostics) {
                        const message = `Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}`;

                        if (diagnostic.severity === 1) { // Error
                            errors.push(message);
                        } else if (diagnostic.severity === 2) { // Warning
                            warnings.push(message);
                        }
                    }
                }

                // Clean up temp file
                await unlink(tempFilePath).catch(() => { });

            } catch (lspError: any) {
                warnings.push(`LSP validation unavailable: ${lspError.message}`);

                // Fallback to basic syntax validation
                return ContentValidators.typeScriptSyntax(content, filePath);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    };

    /**
     * Validates React/JSX using LSP
     */
    static lspReactValidator: ContentValidator = async (content: string, filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (filePath.match(/\.(jsx|tsx)$/)) {
            // First run LSP TypeScript validation
            const lspResult = await ContentValidators.lspTypeScriptValidator(content, filePath);
            errors.push(...(lspResult.errors || []));
            warnings.push(...(lspResult.warnings || []));

            // Additional React-specific validation
            const reactResult = await ContentValidators.reactSyntax(content, filePath);
            errors.push(...(reactResult.errors || []));
            warnings.push(...(reactResult.warnings || []));
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    };

    /**
     * Auto-selects appropriate validator based on file extension
     */
    static autoValidator: ContentValidator = async (content: string, filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Select validator based on file type
        if (filePath.match(/\.(tsx)$/)) {
            const result = await ContentValidators.lspReactValidator(content, filePath);
            errors.push(...result.errors);
            warnings.push(...(result.warnings || []));
        } else if (filePath.match(/\.(ts)$/)) {
            const result = await ContentValidators.lspTypeScriptValidator(content, filePath);
            errors.push(...result.errors);
            warnings.push(...(result.warnings || []));
        } else if (filePath.match(/\.(jsx)$/)) {
            const result = await ContentValidators.reactSyntax(content, filePath);
            errors.push(...result.errors);
            warnings.push(...(result.warnings || []));
        } else if (filePath.endsWith('.json')) {
            const result = await ContentValidators.jsonSyntax(content, filePath);
            errors.push(...result.errors);
            warnings.push(...(result.warnings || []));
        }

        // Always run general code quality checks
        const qualityResult = await ContentValidators.codeQuality(content, filePath);
        if (qualityResult.warnings) {
            warnings.push(...qualityResult.warnings);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    };

    /**
     * Validates TypeScript syntax and compilation
     */
    static typeScriptSyntax: ContentValidator = async (content: string, filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (filePath.match(/\.(ts|tsx)$/)) {
            try {
                // Basic TypeScript syntax checks

                // Check for basic syntax errors
                const syntaxIssues = [
                    { pattern: /interface\s+\w+\s*{\s*$/, message: 'Interface appears to be incomplete' },
                    { pattern: /function\s+\w+\s*\(\s*\)\s*{\s*$/, message: 'Function appears to be incomplete' },
                    { pattern: /class\s+\w+\s*{\s*$/, message: 'Class appears to be incomplete' },
                    { pattern: /import\s+.*from\s+['"][^'"]*['"](?!\s*;)/, message: 'Missing semicolon after import statement' },
                    { pattern: /export\s+(?:default\s+)?(?:function|class|interface|const|let|var)\s+\w+.*(?<![;}])\s*$/, message: 'Missing semicolon after export' }
                ];

                for (const issue of syntaxIssues) {
                    if (issue.pattern.test(content)) {
                        warnings.push(issue.message);
                    }
                }

                // Check for missing type annotations
                const functionRegex = /function\s+\w+\s*\([^)]*\)\s*{/g;
                const functions = content.match(functionRegex);
                if (functions) {
                    functions.forEach(func => {
                        if (!func.includes(':') && !func.includes('void')) {
                            warnings.push(`Function missing return type: ${func.split('(')[0].trim()}`);
                        }
                    });
                }

                // Check for proper React component structure
                if (filePath.endsWith('.tsx') && content.includes('React')) {
                    if (!content.includes('import React') && !content.includes('import * as React')) {
                        errors.push('React import missing in .tsx file');
                    }

                    const componentMatch = content.match(/(?:export\s+(?:default\s+)?(?:function|const)\s+)([A-Z][a-zA-Z0-9]*)/);
                    if (componentMatch) {
                        const componentName = componentMatch[1];
                        if (!content.includes(`${componentName}Props`) && !content.includes('React.FC')) {
                            warnings.push(`Component ${componentName} missing props interface`);
                        }
                    }
                }

            } catch (parseError: any) {
                errors.push(`TypeScript validation error: ${parseError.message}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    };

    /**
     * Validates React/JSX syntax and best practices
     */
    static reactSyntax: ContentValidator = async (content: string, filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (filePath.match(/\.(jsx|tsx)$/)) {
            // Check for React import when using JSX
            if (content.includes('<') && content.includes('>') && !content.includes('React')) {
                errors.push('JSX syntax detected but React not imported');
            }

            // Check for component naming convention
            const componentMatch = content.match(/(?:export\s+(?:default\s+)?(?:function|const)\s+)([a-z][a-zA-Z0-9]*)/);
            if (componentMatch) {
                errors.push(`Component name '${componentMatch[1]}' should start with uppercase letter`);
            }

            // Check for missing key prop in lists
            if (content.includes('.map(') && content.includes('<') && !content.includes('key=')) {
                warnings.push('Consider adding key prop to list items');
            }

            // Check for proper JSX return
            const returnMatches = content.match(/return\s*\(/g);
            if (returnMatches && content.includes('<')) {
                if (!content.includes('return (') && !content.includes('return<')) {
                    warnings.push('Consider wrapping JSX return in parentheses');
                }
            }

            // Check for unused variables
            const importMatches = content.match(/import\s+.*\s+from/g);
            if (importMatches) {
                importMatches.forEach(importLine => {
                    const varMatch = importLine.match(/import\s+(?:{([^}]+)}|(\w+))/);
                    if (varMatch) {
                        const vars = varMatch[1] ? varMatch[1].split(',').map(v => v.trim()) : [varMatch[2]];
                        vars.forEach(varName => {
                            const cleanVar = varName.replace(/\s+as\s+\w+/, '').trim();
                            if (cleanVar && !content.includes(cleanVar.split(' ')[0])) {
                                warnings.push(`Imported '${cleanVar}' appears to be unused`);
                            }
                        });
                    }
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    };

    /**
     * Validates JSON syntax
     */
    static jsonSyntax: ContentValidator = async (content: string, filePath: string) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (filePath.endsWith('.json')) {
            try {
                JSON.parse(content);

                // Check for trailing commas (not valid in JSON)
                if (content.includes(',}') || content.includes(',]')) {
                    errors.push('JSON contains trailing commas');
                }

            } catch (parseError: any) {
                errors.push(`Invalid JSON syntax: ${parseError.message}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    };
}

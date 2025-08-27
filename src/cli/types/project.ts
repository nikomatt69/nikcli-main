/**
 * Project Types for NikCLI
 * Defines types for project analysis, file operations, and system integration
 */

import { z } from 'zod';

// File System Types
export const FileInfoSchema = z.object({
    path: z.string(),
    name: z.string(),
    extension: z.string(),
    size: z.number(),
    modified: z.date(),
    isDirectory: z.boolean(),
    permissions: z.string().optional()
});

export const DirectoryInfoSchema = z.object({
    path: z.string(),
    name: z.string(),
    files: z.array(FileInfoSchema),
    subdirectories: z.array(z.string()),
    totalSize: z.number(),
    fileCount: z.number()
});

// Project Analysis Types
export const ProjectTypeSchema = z.enum([
    'node',
    'react',
    'nextjs',
    'vue',
    'angular',
    'python',
    'java',
    'csharp',
    'go',
    'rust',
    'php',
    'ruby',
    'other'
]);

export const DependencyInfoSchema = z.object({
    name: z.string(),
    version: z.string(),
    type: z.enum(['dependency', 'devDependency', 'peerDependency']),
    isInstalled: z.boolean(),
    latestVersion: z.string().optional(),
    vulnerabilities: z.array(z.string()).optional()
});

export const ProjectAnalysisSchema = z.object({
    type: ProjectTypeSchema,
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    dependencies: z.array(DependencyInfoSchema),
    scripts: z.record(z.string()),
    configFiles: z.array(z.string()),
    sourceFiles: z.array(FileInfoSchema),
    testFiles: z.array(FileInfoSchema),
    buildOutput: z.string().optional(),
    hasTests: z.boolean(),
    hasLinting: z.boolean(),
    hasFormatting: z.boolean(),
    gitRepository: z.boolean(),
    packageManager: z.enum(['npm', 'yarn', 'pnpm', 'bun']).optional()
});

// System Health Types
export const SystemComponentSchema = z.object({
    name: z.string(),
    status: z.enum(['healthy', 'warning', 'error', 'unknown']),
    version: z.string().optional(),
    uptime: z.number().optional(),
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional(),
    lastCheck: z.date(),
    details: z.record(z.unknown()).optional()
});

export const SystemHealthSchema = z.object({
    overall: z.enum(['healthy', 'warning', 'error', 'unknown']),
    components: z.array(SystemComponentSchema),
    recommendations: z.array(z.string()),
    lastUpdated: z.date()
});

// File Change Types
export const FileChangeTypeSchema = z.enum([
    'created',
    'modified',
    'deleted',
    'renamed'
]);

export const FileChangeSchema = z.object({
    path: z.string(),
    type: FileChangeTypeSchema,
    oldContent: z.string().optional(),
    newContent: z.string().optional(),
    timestamp: z.date(),
    author: z.string().optional(),
    size: z.number().optional()
});

// Git Integration Types
export const GitStatusSchema = z.object({
    isGitRepository: z.boolean(),
    branch: z.string().optional(),
    ahead: z.number().optional(),
    behind: z.number().optional(),
    staged: z.array(z.string()),
    unstaged: z.array(z.string()),
    untracked: z.array(z.string()),
    lastCommit: z.object({
        hash: z.string(),
        message: z.string(),
        author: z.string(),
        date: z.date()
    }).optional()
});

// Tool Execution Types
export const ToolExecutionResultSchema = z.object({
    success: z.boolean(),
    output: z.string().optional(),
    error: z.string().optional(),
    exitCode: z.number().optional(),
    executionTime: z.number(),
    toolName: z.string(),
    args: z.array(z.string()).optional(),
    workingDirectory: z.string().optional()
});

// Search and Analysis Types
export const SearchResultSchema = z.object({
    file: z.string(),
    line: z.number(),
    column: z.number(),
    content: z.string(),
    context: z.array(z.string()).optional(),
    score: z.number().optional()
});

export const CodeAnalysisResultSchema = z.object({
    file: z.string(),
    issues: z.array(z.object({
        type: z.enum(['error', 'warning', 'info']),
        message: z.string(),
        line: z.number().optional(),
        column: z.number().optional(),
        rule: z.string().optional(),
        severity: z.number().min(1).max(10).optional()
    })),
    metrics: z.record(z.unknown()).optional(),
    suggestions: z.array(z.string()).optional()
});

// Package Manager Types
export const PackageManagerCommandSchema = z.object({
    command: z.string(),
    args: z.array(z.string()),
    workingDirectory: z.string().optional(),
    timeout: z.number().optional()
});

export const PackageInstallationResultSchema = z.object({
    success: z.boolean(),
    installed: z.array(z.string()),
    failed: z.array(z.string()),
    warnings: z.array(z.string()),
    executionTime: z.number()
});

// Exported Types
export type FileInfo = z.infer<typeof FileInfoSchema>;
export type DirectoryInfo = z.infer<typeof DirectoryInfoSchema>;
export type ProjectType = z.infer<typeof ProjectTypeSchema>;
export type DependencyInfo = z.infer<typeof DependencyInfoSchema>;
export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>;
export type SystemComponent = z.infer<typeof SystemComponentSchema>;
export type SystemHealth = z.infer<typeof SystemHealthSchema>;
export type FileChangeType = z.infer<typeof FileChangeTypeSchema>;
export type FileChange = z.infer<typeof FileChangeSchema>;
export type GitStatus = z.infer<typeof GitStatusSchema>;
export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type CodeAnalysisResult = z.infer<typeof CodeAnalysisResultSchema>;
export type PackageManagerCommand = z.infer<typeof PackageManagerCommandSchema>;
export type PackageInstallationResult = z.infer<typeof PackageInstallationResultSchema>;

// Utility Types for Generic Operations
export type OperationResult<T = unknown> = {
    success: boolean;
    data?: T;
    error?: string;
    executionTime: number;
    metadata?: Record<string, unknown>;
};

export type ValidationResult<T = unknown> = {
    valid: boolean;
    value?: T;
    errors: string[];
    warnings: string[];
};

// File Watcher Types
export interface FileWatcher {
    watch(paths: string[]): Promise<void>;
    unwatch(paths: string[]): Promise<void>;
    onChange(callback: (changes: FileChange[]) => void): void;
    close(): Promise<void>;
}

// Project Context Types
export interface ProjectContext {
    rootPath: string;
    analysis: ProjectAnalysis;
    gitStatus: GitStatus;
    health: SystemHealth;
    lastUpdated: Date;
}

export interface ContextQuery {
    type: 'file' | 'symbol' | 'type' | 'text';
    query: string;
    filters?: {
        extensions?: string[];
        paths?: string[];
        excludePatterns?: string[];
    };
    limit?: number;
}

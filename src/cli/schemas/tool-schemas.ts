import { z } from 'zod';

export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()).optional()
});

export const ToolExecutionResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  metadata: z.object({
    executionTime: z.number().min(0),
    toolName: z.string(),
    parameters: z.record(z.any()).optional()
  }).optional()
});

export const WriteFileOptionsSchema = z.object({
  encoding: z.string().optional(),
  mode: z.number().int().optional(),
  createBackup: z.boolean().optional(),
  autoRollback: z.boolean().optional(),
  verifyWrite: z.boolean().optional(),
  stopOnFirstError: z.boolean().optional(),
  rollbackOnPartialFailure: z.boolean().optional(),
  showDiff: z.boolean().optional(),
  validators: z.array(z.function().returns(z.promise(ValidationResultSchema))).optional(),
  transformers: z.array(z.function().returns(z.promise(z.string()))).optional()
});

export const WriteFileResultSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  bytesWritten: z.number().int().min(0),
  backupPath: z.string().optional(),
  duration: z.number().min(0),
  error: z.string().optional(),
  metadata: z.object({
    encoding: z.string(),
    lines: z.number().int().min(0),
    created: z.boolean(),
    mode: z.number().int()
  })
});

export const AppendOptionsSchema = z.object({
  encoding: z.string().optional(),
  separator: z.string().optional(),
  createBackup: z.boolean().optional(),
  verifyWrite: z.boolean().optional()
});

export const WriteMultipleResultSchema = z.object({
  success: z.boolean(),
  results: z.array(WriteFileResultSchema),
  successCount: z.number().int().min(0),
  totalFiles: z.number().int().min(0),
  backupPaths: z.array(z.string()),
  error: z.string().optional()
});

export const FileWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

export const VerificationResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional()
});

export const ReadFileOptionsSchema = z.object({
  encoding: z.string().optional(),
  maxSize: z.number().int().min(1).optional(),
  maxLines: z.number().int().min(1).optional(),
  stripComments: z.boolean().optional(),
  parseJson: z.boolean().optional()
});

export const ReadFileResultSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  content: z.union([z.string(), z.instanceof(Buffer)]),
  size: z.number().int().min(0),
  encoding: z.string(),
  error: z.string().optional(),
  metadata: z.object({
    lines: z.number().int().min(0).optional(),
    isEmpty: z.boolean(),
    isBinary: z.boolean(),
    extension: z.string()
  })
});

export const CommandOptionsSchema = z.object({
  cwd: z.string().optional(),
  timeout: z.number().int().min(100).optional(),
  skipConfirmation: z.boolean().optional(),
  env: z.record(z.string()).optional(),
  shell: z.string().optional()
});

export const CommandResultSchema = z.object({
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
  command: z.string(),
  duration: z.number().min(0),
  workingDirectory: z.string()
});

export const EditOperationSchema = z.object({
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional()
});

export const MultiEditOptionsSchema = z.object({
  createBackup: z.boolean().optional(),
  showDiff: z.boolean().optional(),
  validateSyntax: z.boolean().optional(),
  autoFormat: z.boolean().optional()
});

export const MultiEditResultSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  operationsApplied: z.number().int().min(0),
  backupPath: z.string().optional(),
  linesChanged: z.number().int().min(0),
  errors: z.array(z.string()).optional()
});

export const FileSearchOptionsSchema = z.object({
  maxResults: z.number().int().min(1).max(1000).optional(),
  includeHidden: z.boolean().optional(),
  extensions: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  caseSensitive: z.boolean().optional()
});

export const FileSearchResultSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    name: z.string(),
    size: z.number().int().min(0),
    modified: z.date(),
    type: z.enum(['file', 'directory', 'symlink']),
    extension: z.string().optional()
  })),
  totalFound: z.number().int().min(0),
  searchTime: z.number().min(0)
});

export const LSPDiagnosticSchema = z.object({
  range: z.object({
    start: z.object({
      line: z.number().int().min(0),
      character: z.number().int().min(0)
    }),
    end: z.object({
      line: z.number().int().min(0),
      character: z.number().int().min(0)
    })
  }),
  severity: z.number().int().min(1).max(4),
  message: z.string().min(1),
  source: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional()
});

export const CodeContextSchema = z.object({
  file: z.string(),
  language: z.string(),
  symbols: z.array(z.any()),
  diagnostics: z.array(LSPDiagnosticSchema),
  hover: z.any().optional(),
  definitions: z.array(z.any()).optional(),
  references: z.array(z.any()).optional(),
  workspaceRoot: z.string()
});

export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;
export type WriteFileOptions = z.infer<typeof WriteFileOptionsSchema>;
export type WriteFileResult = z.infer<typeof WriteFileResultSchema>;
export type AppendOptions = z.infer<typeof AppendOptionsSchema>;
export type WriteMultipleResult = z.infer<typeof WriteMultipleResultSchema>;
export type FileWrite = z.infer<typeof FileWriteSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
export type ReadFileOptions = z.infer<typeof ReadFileOptionsSchema>;
export type ReadFileResult = z.infer<typeof ReadFileResultSchema>;
export type CommandOptions = z.infer<typeof CommandOptionsSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
export type EditOperation = z.infer<typeof EditOperationSchema>;
export type MultiEditOptions = z.infer<typeof MultiEditOptionsSchema>;
export type MultiEditResult = z.infer<typeof MultiEditResultSchema>;
export type FileSearchOptions = z.infer<typeof FileSearchOptionsSchema>;
export type FileSearchResult = z.infer<typeof FileSearchResultSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type LSPDiagnostic = z.infer<typeof LSPDiagnosticSchema>;
export type CodeContext = z.infer<typeof CodeContextSchema>;

export type ContentValidator = (content: string, filePath: string) => Promise<ValidationResult>;
export type ContentTransformer = (content: string, filePath: string) => Promise<string>;
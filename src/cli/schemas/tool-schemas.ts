import { z } from 'zod'
import { SUPPORTED_SHELL_NAMES } from '../tools/shell-support'

export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
})

export const ToolExecutionResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  metadata: z
    .object({
      executionTime: z.number().min(0),
      toolName: z.string(),
      parameters: z.record(z.any()).optional(),
    })
    .optional(),
})

export const WriteFileOptionsSchema = z.object({
  encoding: z.string().optional().describe('Character encoding for the file (e.g., "utf8", "ascii", "base64")'),
  mode: z.number().int().optional().describe('Unix file permissions as octal number (e.g., 0o644)'),
  createBackup: z.boolean().optional().describe('Create a backup of existing file before overwriting'),
  autoRollback: z.boolean().optional().describe('Automatically rollback changes if write fails'),
  verifyWrite: z.boolean().optional().describe('Verify file contents after writing'),
  stopOnFirstError: z.boolean().optional().describe('Stop batch writes on first error'),
  rollbackOnPartialFailure: z.boolean().optional().describe('Rollback all changes if any write fails'),
  showDiff: z.boolean().optional().describe('Display diff of changes before writing'),
  skipFormatting: z.boolean().optional().describe('Skip automatic code formatting'),
  validators: z.array(z.function().returns(z.promise(ValidationResultSchema))).optional().describe('Custom validation functions to run before writing'),
  transformers: z.array(z.function().returns(z.promise(z.string()))).optional().describe('Content transformation functions to apply before writing'),
})

export const WriteFileResultSchema = z.object({
  success: z.boolean().describe('Whether the file was successfully written'),
  filePath: z.string().describe('Absolute path to the written file'),
  bytesWritten: z.number().int().min(0).describe('Number of bytes written to the file'),
  backupPath: z.string().optional().describe('Path to backup file if backup was created'),
  duration: z.number().min(0).describe('Time taken to write the file in milliseconds'),
  error: z.string().optional().describe('Error message if write failed'),
  metadata: z.object({
    encoding: z.string().describe('Character encoding used'),
    lines: z.number().int().min(0).describe('Number of lines in the file'),
    created: z.boolean().describe('Whether a new file was created'),
    mode: z.number().int().describe('Unix file permissions'),
  }),
})

export const AppendOptionsSchema = z.object({
  encoding: z.string().optional().describe('Character encoding for the file'),
  separator: z.string().optional().describe('Separator to add before appended content (e.g., newline)'),
  createBackup: z.boolean().optional().describe('Create backup before appending'),
  verifyWrite: z.boolean().optional().describe('Verify content was appended correctly'),
})

export const WriteMultipleResultSchema = z.object({
  success: z.boolean(),
  results: z.array(WriteFileResultSchema),
  successCount: z.number().int().min(0),
  totalFiles: z.number().int().min(0),
  backupPaths: z.array(z.string()),
  error: z.string().optional(),
})

export const FileWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

export const VerificationResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
})

export const ReadFileOptionsSchema = z.object({
  encoding: z.string().optional().describe('Character encoding to use when reading (e.g., "utf8", "latin1")'),
  maxSize: z.number().int().min(1).optional().describe('Maximum file size in bytes to read'),
  maxLines: z.number().int().min(1).optional().describe('Maximum number of lines to read'),
  stripComments: z.boolean().optional().describe('Remove code comments from output'),
  parseJson: z.boolean().optional().describe('Parse file content as JSON and return object'),
  startLine: z.number().int().min(1).optional().describe('Line number to start reading from (1-indexed)'),
  maxTokens: z.number().int().min(512).optional().describe('Maximum tokens to return for LLM context management'),
  disableChunking: z.boolean().optional().describe('Disable automatic chunking for large files'),
})

export const ReadFileResultSchema = z.object({
  success: z.boolean().describe('Whether the file was successfully read'),
  filePath: z.string().describe('Absolute path to the file that was read'),
  content: z.union([z.string(), z.instanceof(Buffer)]).describe('File content as string or binary buffer'),
  size: z.number().int().min(0).describe('File size in bytes'),
  encoding: z.string().describe('Character encoding used to read the file'),
  error: z.string().optional().describe('Error message if read failed'),
  metadata: z.object({
    lines: z.number().int().min(0).optional().describe('Total number of lines in the file'),
    isEmpty: z.boolean().describe('Whether the file is empty'),
    isBinary: z.boolean().describe('Whether the file contains binary data'),
    extension: z.string().describe('File extension without the dot'),
    truncated: z.boolean().optional().describe('Whether content was truncated due to size limits'),
    chunked: z.boolean().optional().describe('Whether content was automatically chunked'),
    startLine: z.number().int().min(1).optional().describe('Starting line number of returned content'),
    endLine: z.number().int().min(0).optional().describe('Ending line number of returned content'),
    totalLines: z.number().int().min(0).optional().describe('Total lines in the original file'),
    nextStartLine: z.number().int().min(1).nullable().optional().describe('Next line to read for continuation'),
    remainingLines: z.number().int().min(0).optional().describe('Lines remaining to be read'),
    approxTokens: z.number().int().min(0).optional().describe('Approximate token count of returned content'),
    totalApproxTokens: z.number().int().min(0).optional().describe('Approximate total tokens in file'),
    chunkReason: z.string().optional().describe('Reason for chunking (e.g., "token_limit", "line_limit")'),
    hasMore: z.boolean().optional().describe('Whether there is more content to read'),
  }),
  truncated: z.boolean().optional().describe('Whether content was truncated'),
})

export const CommandOptionsSchema = z.object({
  cwd: z.string().optional().describe('Working directory to execute the command in'),
  timeout: z.number().int().min(100).optional().describe('Command timeout in milliseconds'),
  skipConfirmation: z.boolean().optional().describe('Skip user confirmation for potentially dangerous commands'),
  env: z.record(z.string()).optional().describe('Environment variables to set for the command'),
  shell: z.enum(SUPPORTED_SHELL_NAMES).optional().describe('Shell to use for command execution'),
})

export const CommandResultSchema = z.object({
  success: z.boolean().describe('Whether the command executed successfully (exit code 0)'),
  stdout: z.string().describe('Standard output from the command'),
  stderr: z.string().describe('Standard error output from the command'),
  exitCode: z.number().int().describe('Command exit code (0 = success)'),
  command: z.string().describe('The command that was executed'),
  duration: z.number().min(0).describe('Execution time in milliseconds'),
  workingDirectory: z.string().describe('Directory where command was executed'),
  shell: z.enum(SUPPORTED_SHELL_NAMES).optional().describe('Shell used for execution'),
})

export const EditOperationSchema = z.object({
  oldString: z.string().min(1).describe('The exact text to search for and replace'),
  newString: z.string().describe('The text to replace oldString with'),
  replaceAll: z.boolean().optional().describe('Replace all occurrences instead of just the first'),
})

export const MultiEditOptionsSchema = z.object({
  createBackup: z.boolean().optional().describe('Create backup of original file before editing'),
  showDiff: z.boolean().optional().describe('Display diff of all changes'),
  validateSyntax: z.boolean().optional().describe('Validate syntax after edits (language-specific)'),
  autoFormat: z.boolean().optional().describe('Auto-format code after edits'),
})

export const MultiEditResultSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  operationsApplied: z.number().int().min(0),
  backupPath: z.string().optional(),
  linesChanged: z.number().int().min(0),
  errors: z.array(z.string()).optional(),
})

export const FileSearchOptionsSchema = z.object({
  maxResults: z.number().int().min(1).max(1000).optional().describe('Maximum number of results to return'),
  includeHidden: z.boolean().optional().describe('Include hidden files and directories (starting with .)'),
  extensions: z.array(z.string()).optional().describe('File extensions to include (e.g., [".ts", ".js"])'),
  excludePatterns: z.array(z.string()).optional().describe('Glob patterns to exclude from search'),
  caseSensitive: z.boolean().optional().describe('Whether search pattern is case-sensitive'),
})

export const FileSearchResultSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      size: z.number().int().min(0),
      modified: z.date(),
      type: z.enum(['file', 'directory', 'symlink']),
      extension: z.string().optional(),
    })
  ),
  totalFound: z.number().int().min(0),
  searchTime: z.number().min(0),
})

export const LSPDiagnosticSchema = z.object({
  range: z.object({
    start: z.object({
      line: z.number().int().min(0),
      character: z.number().int().min(0),
    }),
    end: z.object({
      line: z.number().int().min(0),
      character: z.number().int().min(0),
    }),
  }),
  severity: z.number().int().min(1).max(4),
  message: z.string().min(1),
  source: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
})

export const CodeContextSchema = z.object({
  file: z.string(),
  language: z.string(),
  symbols: z.array(z.any()),
  diagnostics: z.array(LSPDiagnosticSchema),
  hover: z.any().optional(),
  definitions: z.array(z.any()).optional(),
  references: z.array(z.any()).optional(),
  workspaceRoot: z.string(),
})

export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>
export type WriteFileOptions = z.infer<typeof WriteFileOptionsSchema>
export type WriteFileResult = z.infer<typeof WriteFileResultSchema>
export type AppendOptions = z.infer<typeof AppendOptionsSchema>
export type WriteMultipleResult = z.infer<typeof WriteMultipleResultSchema>
export type FileWrite = z.infer<typeof FileWriteSchema>
export type VerificationResult = z.infer<typeof VerificationResultSchema>
export type ReadFileOptions = z.infer<typeof ReadFileOptionsSchema>
export type ReadFileResult = z.infer<typeof ReadFileResultSchema>
export type CommandOptions = z.infer<typeof CommandOptionsSchema>
export type CommandResult = z.infer<typeof CommandResultSchema>
export type EditOperation = z.infer<typeof EditOperationSchema>
export type MultiEditOptions = z.infer<typeof MultiEditOptionsSchema>
export type MultiEditResult = z.infer<typeof MultiEditResultSchema>
export type FileSearchOptions = z.infer<typeof FileSearchOptionsSchema>
export type FileSearchResult = z.infer<typeof FileSearchResultSchema>
export type ValidationResult = z.infer<typeof ValidationResultSchema>
export type LSPDiagnostic = z.infer<typeof LSPDiagnosticSchema>
export type CodeContext = z.infer<typeof CodeContextSchema>

export type ContentValidator = (content: string, filePath: string) => Promise<ValidationResult>
export type ContentTransformer = (content: string, filePath: string) => Promise<string>

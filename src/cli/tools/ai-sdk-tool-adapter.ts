/**
 * AI SDK Tool Adapter
 * Converts NikCLI BaseTool instances to AI SDK v4 tool format
 * Reference: https://v4.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
 */

import { tool, type CoreTool } from 'ai'
import { z } from 'zod'
import {
  ReadFileOptionsSchema,
  WriteFileOptionsSchema,
  CommandOptionsSchema,
  EditOperationSchema,
  MultiEditOptionsSchema,
} from '../schemas/tool-schemas'
import type { BaseTool, ToolExecutionResult } from './base-tool'
import type { ToolMetadata, ToolRegistry } from './tool-registry'

// Import tool-specific schemas (re-define if not exported)
// Note: Some schemas are not exported, so we define them here
import { VisionAnalysisOptionsSchema } from './vision-analysis-tool'
import { ImageGenerationOptionsSchema } from './image-generation-tool'
import { SUPPORTED_SHELL_NAMES } from './shell-support'

// Re-define schemas that are not exported from their modules
const WebSearchOptionsSchema = z.object({
  query: z.string().min(1).describe('Search query to execute'),
  maxResults: z.number().int().min(1).max(10).default(5).optional().describe('Maximum number of results to return'),
  searchType: z
    .enum(['general', 'technical', 'documentation', 'stackoverflow'])
    .default('general')
    .optional()
    .describe('Specialized search flavor'),
  mode: z.enum(['results', 'answer']).default('results').optional().describe('Return raw results or a synthesized answer'),
  includeContent: z.boolean().default(false).optional().describe('Fetch page content to improve synthesis quality'),
})

const BashToolParamsSchema = z.object({
  command: z.string().trim().min(1).describe('The shell command to execute'),
  timeout: z.number().int().positive().max(600000).optional().describe('Command timeout in milliseconds'),
  description: z.string().trim().max(500).optional().describe('Human-readable description of what this command does'),
  workingDirectory: z.string().trim().min(1).optional().describe('Working directory for command execution'),
  environment: z.record(z.string()).optional().describe('Environment variables to set for this command'),
  allowDangerous: z.boolean().optional().describe('Allow execution of potentially dangerous commands'),
  shell: z.enum(SUPPORTED_SHELL_NAMES).optional().describe('Shell to use'),
})

/**
 * Schema registry for tool parameters
 * Tools can export their parameter schemas here for type safety
 */
export interface ToolParameterSchema {
  [toolName: string]: z.ZodTypeAny
}

/**
 * Default parameter schemas for tools that don't have explicit schemas
 * Uses existing schemas from tool-schemas.ts when available
 */
const DEFAULT_PARAMETER_SCHEMAS: Partial<ToolParameterSchema> = {
  'find-files-tool': z.object({
    pattern: z.string().describe('Glob pattern to search for files'),
    options: z
      .object({
        cwd: z.string().optional().describe('Working directory for search'),
      })
      .optional(),
  }),
  'glob-tool': z.object({
    pattern: z.union([z.string(), z.array(z.string())]).describe('Glob pattern(s) to match files'),
    path: z.string().optional().describe('Base path for search (defaults to working directory)'),
    ignorePatterns: z.array(z.string()).optional().describe('Patterns to ignore'),
    onlyFiles: z.boolean().optional().describe('Only return files (not directories)'),
    onlyDirectories: z.boolean().optional().describe('Only return directories'),
    followSymlinks: z.boolean().optional().describe('Follow symbolic links'),
    caseSensitive: z.boolean().optional().describe('Case-sensitive matching'),
    maxDepth: z.number().int().min(1).max(20).optional().describe('Maximum directory depth'),
    sortBy: z.enum(['name', 'size', 'mtime', 'atime']).optional().describe('Sort results by'),
    sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order'),
    maxResults: z.number().int().min(1).max(10000).optional().describe('Maximum number of results'),
    minSize: z.number().int().min(0).optional().describe('Minimum file size in bytes'),
    maxSize: z.number().int().min(0).optional().describe('Maximum file size in bytes'),
    modifiedAfter: z.string().optional().describe('Modified after date (ISO string)'),
    modifiedBefore: z.string().optional().describe('Modified before date (ISO string)'),
  }),
  'grep-tool': z.object({
    pattern: z.string().min(1).describe('Search pattern (regex or literal)'),
    path: z.string().optional().describe('Path to search in (file or directory)'),
    include: z.string().optional().describe('File pattern to include (e.g., "*.ts")'),
    exclude: z.array(z.string()).optional().describe('Patterns to exclude'),
    caseSensitive: z.boolean().optional().describe('Case-sensitive search'),
    wholeWord: z.boolean().optional().describe('Match whole words only'),
    maxResults: z.number().int().min(1).max(1000).default(100).optional().describe('Maximum number of matches'),
    contextLines: z.number().int().min(0).max(10).default(0).optional().describe('Lines of context around matches'),
    useRegex: z.boolean().optional().describe('Treat pattern as regex'),
  }),
  'tree-tool': z.object({
    path: z.string().optional().describe('Directory path to visualize'),
    maxDepth: z.number().int().min(1).max(20).default(5).optional().describe('Maximum tree depth'),
    showHidden: z.boolean().optional().describe('Show hidden files and directories'),
    showSize: z.boolean().optional().describe('Show file sizes'),
    showFullPath: z.boolean().optional().describe('Show full paths'),
    ignorePatterns: z.array(z.string()).optional().describe('Patterns to ignore'),
    onlyDirectories: z.boolean().optional().describe('Only show directories'),
    sortBy: z.enum(['name', 'size', 'type']).optional().describe('Sort nodes by'),
    useIcons: z.boolean().optional().describe('Use file type icons'),
  }),
  'read-file-tool': z.object({
    filePath: z.string().describe('Path to the file to read'),
    options: ReadFileOptionsSchema.optional().describe('Reading options'),
  }),
  'write-file-tool': z.object({
    filePath: z.string().describe('Path to the file to write'),
    content: z.string().describe('Content to write to the file'),
    options: WriteFileOptionsSchema.optional().describe('Writing options'),
  }),
  'web-search-tool': WebSearchOptionsSchema,
  'bash-tool': BashToolParamsSchema,
  'run-command-tool': z.object({
    command: z.string().describe('Command to execute'),
    options: CommandOptionsSchema.optional().describe('Command execution options'),
  }),
  'edit': z.object({
    filePath: z.string().describe('Path to the file to edit'),
    oldString: z.string().describe('Exact text to replace'),
    newString: z.string().describe('New text to replace with'),
    replaceAll: z.boolean().optional().describe('Replace all occurrences'),
    createBackup: z.boolean().optional().describe('Create backup before editing'),
    validateSyntax: z.boolean().optional().describe('Validate syntax after edit'),
    previewOnly: z.boolean().optional().describe('Preview changes without applying'),
  }),
  'multi-edit-tool': z.object({
    filePath: z.string().describe('Path to the file to edit'),
    operations: z.array(EditOperationSchema).describe('List of edit operations'),
    options: MultiEditOptionsSchema.optional().describe('Multi-edit options'),
  }),
  'vision-analysis-tool': VisionAnalysisOptionsSchema,
  'image-generation-tool': ImageGenerationOptionsSchema,
  'replace': z.object({
    filePath: z.string().describe('Path to the file'),
    oldString: z.string().describe('Text to replace'),
    newString: z.string().describe('Replacement text'),
    replaceAll: z.boolean().optional().describe('Replace all occurrences'),
  }),
}

/**
 * Converts a BaseTool to an AI SDK CoreTool
 * @param baseTool The BaseTool instance to convert
 * @param metadata Optional metadata from ToolRegistry
 * @param parameterSchema Optional Zod schema for tool parameters
 * @returns AI SDK CoreTool
 */
export function convertBaseToolToAISDKTool(
  baseTool: BaseTool,
  metadata?: ToolMetadata,
  parameterSchema?: z.ZodTypeAny
): CoreTool {
  const toolName = baseTool.getName()
  const description = metadata?.description || `${toolName} tool`

  // Determine parameter schema
  let paramsSchema: z.ZodTypeAny

  if (parameterSchema) {
    // Use provided schema
    paramsSchema = parameterSchema
  } else if (DEFAULT_PARAMETER_SCHEMAS[toolName]) {
    // Use default schema if available
    paramsSchema = DEFAULT_PARAMETER_SCHEMAS[toolName]!
  } else {
    // Infer schema from tool's execute signature
    // For tools with no parameters, use empty object
    paramsSchema = inferParameterSchema(baseTool, metadata)
  }

  // Create AI SDK tool
  return tool({
    description: enhanceDescription(description, metadata),
    parameters: paramsSchema,
    execute: async (args: any, options?: { toolCallId?: string; messages?: any[]; abortSignal?: AbortSignal }) => {
      try {
        // Convert AI SDK args to BaseTool execute format
        const toolArgs = convertAISDKArgsToBaseToolArgs(baseTool, args)

        // Execute the tool
        const result: ToolExecutionResult = await baseTool.execute(...toolArgs)

        // Convert result to AI SDK format
        return convertBaseToolResultToAISDKResult(result)
      } catch (error: any) {
        // Handle errors gracefully
        return {
          success: false,
          error: error.message || String(error),
          data: null,
        }
      }
    },
  })
}

/**
 * Infers parameter schema from tool metadata or uses empty object
 */
function inferParameterSchema(baseTool: BaseTool, metadata?: ToolMetadata): z.ZodTypeAny {
  // Try to infer from tool name patterns
  const toolName = baseTool.getName()

  // Tools that typically take a file path
  if (toolName.includes('read') || toolName.includes('write') || toolName.includes('file')) {
    return z.object({
      filePath: z.string().describe('Path to the file'),
      options: z.record(z.any()).optional().describe('Additional options'),
    })
  }

  // Tools that take a pattern
  if (toolName.includes('find') || toolName.includes('glob') || toolName.includes('search')) {
    return z.object({
      pattern: z.string().describe('Search pattern'),
      options: z.record(z.any()).optional().describe('Additional options'),
    })
  }

  // Default: empty object for tools with no parameters
  return z.object({})
}

/**
 * Converts AI SDK tool call arguments to BaseTool execute arguments
 */
function convertAISDKArgsToBaseToolArgs(baseTool: BaseTool, args: any): any[] {
  const toolName = baseTool.getName()

  // Handle different tool argument patterns based on their schemas
  if (toolName === 'find-files-tool') {
    // Pattern-based tool with options
    return [args.pattern, args.options || {}]
  }

  if (toolName === 'glob-tool') {
    // GlobTool takes params object directly
    return [args]
  }

  if (toolName === 'grep-tool') {
    // GrepTool takes params object directly
    return [args]
  }

  if (toolName === 'tree-tool') {
    // TreeTool takes params object directly
    return [args]
  }

  if (toolName === 'read-file-tool') {
    // File path + options
    return [args.filePath, args.options || {}]
  }

  if (toolName === 'write-file-tool') {
    // File path + content + options
    return [args.filePath, args.content, args.options || {}]
  }

  if (toolName === 'web-search-tool') {
    // WebSearchOptionsSchema - can be query string or full options
    if (typeof args === 'string') {
      return [{ query: args }]
    }
    return [args]
  }

  if (toolName === 'bash-tool' || toolName === 'run-command-tool') {
    // Command tools
    if (toolName === 'bash-tool') {
      // bash-tool takes params object directly
      return [args]
    } else {
      // run-command-tool takes command + options
      return [args.command, args.options || {}]
    }
  }

  if (toolName === 'edit') {
    // EditTool takes params object
    return [args]
  }

  if (toolName === 'multi-edit-tool') {
    // MultiEditTool takes filePath, operations, options
    return [args.filePath, args.operations, args.options || {}]
  }

  if (toolName === 'replace') {
    // ReplaceInFileTool takes filePath, oldString, newString, replaceAll
    return [args.filePath, args.oldString, args.newString, args.replaceAll || false]
  }

  if (toolName === 'vision-analysis-tool' || toolName === 'image-generation-tool') {
    // These tools take options object directly
    return [args]
  }

  // Default: pass args as single object or spread
  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    // If it's an object, try to extract common patterns
    if ('filePath' in args && 'content' in args) {
      // Write pattern
      return [args.filePath, args.content, args.options || {}]
    }
    if ('filePath' in args) {
      // Read/edit pattern
      return [args.filePath, args.options || {}]
    }
    if ('pattern' in args) {
      // Search pattern
      return [args.pattern, args.options || {}]
    }
    // Pass as single argument
    return [args]
  }

  // Pass as-is
  return [args]
}

/**
 * Converts BaseTool result to AI SDK tool result format
 */
function convertBaseToolResultToAISDKResult(result: ToolExecutionResult): any {
  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Tool execution failed',
      data: null,
    }
  }

  // Return serializable data
  return {
    success: true,
    data: serializeResultData(result.data),
    metadata: result.metadata,
  }
}

/**
 * Serializes result data to ensure it's JSON-serializable
 */
function serializeResultData(data: any): any {
  if (data === null || data === undefined) {
    return null
  }

  // Handle primitives
  if (typeof data !== 'object') {
    return data
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(serializeResultData)
  }

  // Handle objects
  if (data instanceof Error) {
    return {
      error: true,
      message: data.message,
      name: data.name,
    }
  }

  // Handle Buffer
  if (Buffer.isBuffer(data)) {
    return {
      type: 'buffer',
      data: data.toString('base64'),
      encoding: 'base64',
    }
  }

  // Handle Date
  if (data instanceof Date) {
    return data.toISOString()
  }

  // Recursively serialize object
  const serialized: Record<string, any> = {}
  for (const [key, value] of Object.entries(data)) {
    try {
      serialized[key] = serializeResultData(value)
    } catch {
      // Skip non-serializable properties
      serialized[key] = '[Non-serializable]'
    }
  }

  return serialized
}

/**
 * Enhances tool description with metadata information
 */
function enhanceDescription(description: string, metadata?: ToolMetadata): string {
  let enhanced = description

  if (metadata) {
    // Add risk level info
    if (metadata.riskLevel === 'high') {
      enhanced += ' [HIGH RISK]'
    } else if (metadata.riskLevel === 'medium') {
      enhanced += ' [MEDIUM RISK]'
    }

    // Add category info
    if (metadata.category) {
      enhanced += ` (Category: ${metadata.category})`
    }

    // Add tags
    if (metadata.tags && metadata.tags.length > 0) {
      enhanced += ` [Tags: ${metadata.tags.join(', ')}]`
    }
  }

  return enhanced
}

/**
 * Converts all tools from a ToolRegistry to AI SDK tools
 * @param registry The ToolRegistry instance
 * @param parameterSchemas Optional map of tool names to their Zod parameter schemas
 * @returns Record of tool names to AI SDK CoreTool instances
 */
export function convertToolRegistryToAISDKTools(
  registry: ToolRegistry,
  parameterSchemas?: ToolParameterSchema
): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {}
  const toolNames = registry.listTools()

  for (const toolName of toolNames) {
    const baseTool = registry.getTool(toolName)
    if (!baseTool) continue

    const metadata = registry.getToolMetadata(toolName)
    const schema = parameterSchemas?.[toolName]

    tools[toolName] = convertBaseToolToAISDKTool(baseTool, metadata, schema)
  }

  return tools
}

/**
 * Filters tools by risk level, category, or tags
 */
export function filterToolsByCriteria(
  tools: Record<string, CoreTool>,
  registry: ToolRegistry,
  criteria: {
    maxRiskLevel?: 'low' | 'medium' | 'high'
    categories?: string[]
    excludeCategories?: string[]
    tags?: string[]
    excludeTags?: string[]
  }
): Record<string, CoreTool> {
  const filtered: Record<string, CoreTool> = {}

  for (const [toolName, tool] of Object.entries(tools)) {
    const metadata = registry.getToolMetadata(toolName)
    if (!metadata) continue

    // Filter by risk level
    if (criteria.maxRiskLevel) {
      const riskLevels = ['low', 'medium', 'high']
      const toolRiskIndex = riskLevels.indexOf(metadata.riskLevel)
      const maxRiskIndex = riskLevels.indexOf(criteria.maxRiskLevel)
      if (toolRiskIndex > maxRiskIndex) continue
    }

    // Filter by category
    if (criteria.categories && !criteria.categories.includes(metadata.category)) {
      continue
    }

    if (criteria.excludeCategories && criteria.excludeCategories.includes(metadata.category)) {
      continue
    }

    // Filter by tags
    if (criteria.tags && !criteria.tags.some((tag) => metadata.tags.includes(tag))) {
      continue
    }

    if (criteria.excludeTags && criteria.excludeTags.some((tag) => metadata.tags.includes(tag))) {
      continue
    }

    filtered[toolName] = tool
  }

  return filtered
}

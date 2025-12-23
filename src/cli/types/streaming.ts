/**
 * Streaming Types for NikCLI with Zod validation
 * Defines types and schemas for AI streaming, chat processing, and real-time data flow
 */

import { z } from 'zod/v3';

// Stream Event Schemas
export const StreamEventTypeSchema = z.enum([
  'text_delta',
  'tool_call',
  'tool_result',
  'error',
  'complete',
  'start',
  'thinking',
])

export const BackgroundAgentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  task: z.string(),
  status: z.enum(['starting', 'running', 'completed', 'failed']),
})

export const FileChangeSchema = z.object({
  path: z.string(),
  before: z.string(),
  after: z.string(),
  changeType: z.enum(['created', 'modified', 'deleted']),
})

export const BackgroundResultSchema = z.object({
  agentName: z.string(),
  summary: z.string(),
  fileChanges: z.array(FileChangeSchema).optional(),
  executionTime: z.number().optional(),
  success: z.boolean(),
})

export const StreamEventMetadataSchema = z
  .object({
    model: z.string().optional(),
    tokenCount: z.number().optional(),
    executionTime: z.number().optional(),
    toolName: z.string().optional(),
    backgroundAgents: z.array(BackgroundAgentInfoSchema).optional(),
    backgroundResults: z.array(BackgroundResultSchema).optional(),
    filePath: z.string().optional(),
    fileContent: z.string().optional(),
  })
  .catchall(z.unknown())

export const StreamEventSchema = z.object({
  type: StreamEventTypeSchema,
  content: z.string().optional(),
  metadata: StreamEventMetadataSchema.optional(),
  timestamp: z.date().optional(),
})

// Chat Stream Schemas
export const ChatStreamDataSchema = z.object({
  assistantText: z.string(),
  hasToolCalls: z.boolean(),
  totalTokensUsed: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  model: z.string(),
})

export const StreamProgressSchema = z.object({
  step: z.string(),
  progress: z.number().min(0).max(100),
  details: z.string().optional(),
  estimatedTimeRemaining: z.number().optional(),
})

// Token Usage Schemas
export const TokenUsageSchema = z.object({
  totalTokens: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  inputTokenDetails: z.object({
    noCacheTokens: z.number().optional(),
    cacheReadTokens: z.number().optional(),
    cacheWriteTokens: z.number().optional(),
  }).optional(),
  outputTokenDetails: z.object({
    textTokens: z.number().optional(),
    reasoningTokens: z.number().optional(),
  }).optional(),
})

export const TokenTrackingInfoSchema = z.object({
  sessionTokenUsage: z.number(),
  contextTokens: z.number(),
  realTimeCost: z.number(),
  sessionStartTime: z.date(),
  currentModel: z.string(),
})

// Streaming Configuration Schema
export const StreamingConfigSchema = z.object({
  enableRealTimeUpdates: z.boolean(),
  tokenTrackingEnabled: z.boolean(),
  maxStreamDuration: z.number().positive(),
  bufferSize: z.number().positive(),
  enableBackgroundAgents: z.boolean(),
})

// Tool Call Schema
export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
  result: z.unknown().optional(),
  executionTime: z.number().optional(),
  success: z.boolean().optional(),
})

// AI Response Schema
export const AIStreamResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  content: z.string(),
  usage: TokenUsageSchema.optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  finishReason: z.enum(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

// Stream Handler Schema (for configuration validation)
export const StreamHandlerConfigSchema = z.object({
  enableOnStart: z.boolean().default(true),
  enableOnProgress: z.boolean().default(true),
  enableOnData: z.boolean().default(true),
  enableOnError: z.boolean().default(true),
  enableOnComplete: z.boolean().default(true),
})

// Exported Types (inferred from schemas)
export type StreamEventType = z.infer<typeof StreamEventTypeSchema>
export type StreamEvent = z.infer<typeof StreamEventSchema>
export type StreamEventMetadata = z.infer<typeof StreamEventMetadataSchema>
export type BackgroundAgentInfo = z.infer<typeof BackgroundAgentInfoSchema>
export type BackgroundResult = z.infer<typeof BackgroundResultSchema>
export type FileChange = z.infer<typeof FileChangeSchema>
export type ChatStreamData = z.infer<typeof ChatStreamDataSchema>
export type StreamProgress = z.infer<typeof StreamProgressSchema>
export type TokenUsage = z.infer<typeof TokenUsageSchema>
export type TokenTrackingInfo = z.infer<typeof TokenTrackingInfoSchema>
export type StreamingConfig = z.infer<typeof StreamingConfigSchema>
export type ToolCall = z.infer<typeof ToolCallSchema>
export type AIStreamResponse = z.infer<typeof AIStreamResponseSchema>

// Stream Handler Types (kept as interfaces for function signatures)
export interface StreamHandler<TData = unknown, TResult = unknown> {
  onStart?: (data: TData) => void
  onProgress?: (progress: StreamProgress) => void
  onData?: (chunk: string, data: TData) => void
  onError?: (error: Error, data: TData) => void
  onComplete?: (result: TResult, data: TData) => void
}

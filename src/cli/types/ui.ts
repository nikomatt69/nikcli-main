/**
 * UI Types for NikCLI with Zod validation
 * Defines types and schemas for user interface events, status updates, and streaming
 */

import { z } from 'zod/v3';

// UI Event Schemas
export const UIEventTypeSchema = z.enum([
  'status_update',
  'progress_update',
  'message_received',
  'command_executed',
  'error_occurred',
  'file_changed',
  'agent_status_changed',
  'stream_started',
  'stream_ended',
])

export const UIEventSchema = z.object({
  type: UIEventTypeSchema,
  timestamp: z.date(),
  data: z.unknown(),
  source: z.string(),
})

// Status Update Schemas
export const StatusUpdateSchema = z.object({
  status: z.enum(['ready', 'processing', 'error', 'offline']),
  message: z.string().optional(),
  details: z.record(z.unknown()).optional(),
})

export const ProgressUpdateSchema = z.object({
  percentage: z.number().min(0).max(100),
  step: z.string(),
  total: z.number().optional(),
  current: z.number().optional(),
  estimatedTimeRemaining: z.number().optional(),
})

// Live Update Schemas
export const LiveUpdateTypeSchema = z.enum(['info', 'success', 'warning', 'error', 'progress'])

export const LiveUpdateSchema = z.object({
  id: z.string().optional(),
  type: LiveUpdateTypeSchema,
  content: z.string(),
  source: z.string(),
  timestamp: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
})

// Status Indicator Schemas
export const StatusIndicatorStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'warning'])

export const StatusIndicatorSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: StatusIndicatorStatusSchema,
  details: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  subItems: z.array(z.unknown()).optional(),
})

// Chat UI Schemas
export const ChatAreaConfigSchema = z.object({
  height: z.number().positive(),
  width: z.number().positive(),
  buffer: z.array(z.string()),
})

export const PromptAreaConfigSchema = z.object({
  position: z.enum(['top', 'bottom']),
  height: z.number().positive(),
  showStatusBar: z.boolean(),
})

// Terminal UI Schemas
export const TerminalDimensionsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  chatAreaHeight: z.number().positive(),
  statusBarHeight: z.number().positive(),
})

// File Selection Schemas
export const FileSelectionDataSchema = z.object({
  files: z.array(z.string()),
  timestamp: z.date(),
  pattern: z.string(),
  metadata: z.record(z.unknown()).optional(),
})

// Exported Types (inferred from schemas)
export type UIEventType = z.infer<typeof UIEventTypeSchema>
export type UIEvent<T = unknown> = Omit<z.infer<typeof UIEventSchema>, 'data'> & { data: T }
export type StatusUpdate = z.infer<typeof StatusUpdateSchema>
export type ProgressUpdate = z.infer<typeof ProgressUpdateSchema>
export type LiveUpdateType = z.infer<typeof LiveUpdateTypeSchema>
export type LiveUpdate = z.infer<typeof LiveUpdateSchema>
export type StatusIndicatorStatus = z.infer<typeof StatusIndicatorStatusSchema>
export type StatusIndicator = z.infer<typeof StatusIndicatorSchema>
export type ChatAreaConfig = z.infer<typeof ChatAreaConfigSchema>
export type PromptAreaConfig = z.infer<typeof PromptAreaConfigSchema>
export type TerminalDimensions = z.infer<typeof TerminalDimensionsSchema>
export type FileSelectionData = z.infer<typeof FileSelectionDataSchema>

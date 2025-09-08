import { z } from 'zod';
import {
  BasePropsSchema,
  ComponentVariantSchema,
  ComponentSizeSchema,
} from '@tui-kit-ai/core';

// Message schema for chat components
export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'function', 'tool']),
  content: z.string(),
  createdAt: z.union([z.date(), z.number(), z.string()]).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Chat layout props schema
export const ChatLayoutPropsSchema = BasePropsSchema.extend({
  messages: z.array(MessageSchema),
  onSubmit: z.function().args(z.string()).returns(z.void()),
  onClear: z.function().args().returns(z.void()).optional(),
  onExport: z.function().args().returns(z.void()).optional(),
  showTimestamp: z.boolean().optional(),
  showRole: z.boolean().optional(),
  maxMessages: z.number().optional(),
  autoScroll: z.boolean().optional(),
});

// Message list props schema
export const MessageListPropsSchema = BasePropsSchema.extend({
  messages: z.array(MessageSchema),
  currentStreamingMessage: z.string().optional(),
  streaming: z.boolean().optional(),
  maxMessageLength: z.number().optional(),
  groupSimilarRoles: z.boolean().optional(),
  showTimestamps: z.boolean().optional(),
  timestampFormat: z.enum(['short', 'long', 'none']).optional(),
  avatars: z.record(z.string(), z.string()).optional(),
  onMessageClick: z.function().args(MessageSchema).returns(z.void()).optional(),
});

// Prompt editor props schema
export const PromptEditorPropsSchema = BasePropsSchema.extend({
  value: z.string().optional(),
  placeholder: z.string().optional(),
  multiline: z.boolean().optional(),
  maxLength: z.number().optional(),
  submitOnEnter: z.boolean().optional(),
  enableVariables: z.boolean().optional(),
  enableSnippets: z.boolean().optional(),
  showCharCount: z.boolean().optional(),
  showLineNumbers: z.boolean().optional(),
  onChange: z.function().args(z.string()).returns(z.void()).optional(),
  onSubmit: z.function().args(z.string()).returns(z.void()).optional(),
  onFocus: z.function().args().returns(z.void()).optional(),
  onBlur: z.function().args(z.string()).returns(z.void()).optional(),
  onVariableDetected: z
    .function()
    .args(z.array(z.string()))
    .returns(z.void())
    .optional(),
});

// Snippet schema
export const SnippetSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
  trigger: z.string().optional(),
});

// Streaming text props schema
export const StreamingTextPropsSchema = BasePropsSchema.extend({
  text: z.string(),
  speed: z.number().optional(),
  onComplete: z.function().args().returns(z.void()).optional(),
  showCursor: z.boolean().optional(),
  cursorChar: z.string().optional(),
});

// Tool call view props schema
export const ToolCallViewPropsSchema = BasePropsSchema.extend({
  toolCalls: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      arguments: z.record(z.string(), z.any()),
      status: z.enum(['pending', 'running', 'completed', 'failed']),
      result: z.any().optional(),
      error: z.string().optional(),
    }),
  ),
  onToolCallClick: z.function().args(z.string()).returns(z.void()).optional(),
  showDetails: z.boolean().optional(),
  expandable: z.boolean().optional(),
});

// Model picker props schema
export const ModelPickerPropsSchema = BasePropsSchema.extend({
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      provider: z.string(),
      capabilities: z.array(z.string()),
      maxTokens: z.number().optional(),
      costPerToken: z.number().optional(),
    }),
  ),
  selectedModel: z.string().optional(),
  onModelSelect: z.function().args(z.string()).returns(z.void()),
  showCapabilities: z.boolean().optional(),
  showCosts: z.boolean().optional(),
});

// AI service configuration schema
export const AIServiceConfigSchema = z.object({
  model: z.string(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
});

// Chat TUI hook options schema
export const ChatTUIOptionsSchema = z.object({
  model: z.any(), // AI model instance
  tools: z.array(z.any()).optional(), // Tool definitions
  initialMessages: z.array(MessageSchema).optional(),
  maxMessages: z.number().optional(),
  onMessage: z.function().args(MessageSchema).returns(z.void()).optional(),
  onError: z.function().args(z.string()).returns(z.void()).optional(),
  onFinish: z.function().args(MessageSchema).returns(z.void()).optional(),
  streaming: z.boolean().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

// Export all AI schemas
export const AISchemas = {
  message: MessageSchema,
  chatLayout: ChatLayoutPropsSchema,
  messageList: MessageListPropsSchema,
  promptEditor: PromptEditorPropsSchema,
  snippet: SnippetSchema,
  streamingText: StreamingTextPropsSchema,
  toolCallView: ToolCallViewPropsSchema,
  modelPicker: ModelPickerPropsSchema,
  aiServiceConfig: AIServiceConfigSchema,
  chatTUIOptions: ChatTUIOptionsSchema,
} as const;

// Type exports derived from schemas
export type Message = z.infer<typeof MessageSchema>;
export type ChatLayoutProps = z.infer<typeof ChatLayoutPropsSchema>;
export type MessageListProps = z.infer<typeof MessageListPropsSchema>;
export type PromptEditorProps = z.infer<typeof PromptEditorPropsSchema>;
export type Snippet = z.infer<typeof SnippetSchema>;
export type StreamingTextProps = z.infer<typeof StreamingTextPropsSchema>;
export type ToolCallViewProps = z.infer<typeof ToolCallViewPropsSchema>;
export type ModelPickerProps = z.infer<typeof ModelPickerPropsSchema>;
export type AIServiceConfig = z.infer<typeof AIServiceConfigSchema>;
export type ChatTUIOptions = z.infer<typeof ChatTUIOptionsSchema>;

// Utility types for AI components
export type MessageRole = Message['role'];
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TimestampFormat = 'short' | 'long' | 'none';

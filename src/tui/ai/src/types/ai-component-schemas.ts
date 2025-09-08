import { BasePropsSchema } from '@tui-kit-ai/core';
import { z } from 'zod';

// ===== AI CHAT COMPONENTS =====

// ChatLayout Component Schema
export const ChatLayoutSchema = BasePropsSchema.extend({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant', 'system', 'function', 'tool']),
      content: z.string(),
      createdAt: z.union([z.date(), z.number(), z.string()]).optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    }),
  ),
  onSubmit: z.function().args(z.string()).returns(z.void()),
  onClear: z.function().args().returns(z.void()).optional(),
  onExport: z.function().args().returns(z.void()).optional(),
  showTimestamp: z.boolean().optional(),
  showRole: z.boolean().optional(),
  maxMessages: z.number().optional(),
  autoScroll: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  compact: z.boolean().optional(),
  showTypingIndicator: z.boolean().optional(),
});

// MessageList Component Schema
export const MessageListSchema = BasePropsSchema.extend({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant', 'system', 'function', 'tool']),
      content: z.string(),
      createdAt: z.union([z.date(), z.number(), z.string()]).optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    }),
  ),
  currentStreamingMessage: z.string().optional(),
  streaming: z.boolean().optional(),
  maxMessageLength: z.number().optional(),
  groupSimilarRoles: z.boolean().optional(),
  showTimestamps: z.boolean().optional(),
  timestampFormat: z.enum(['short', 'long', 'none']).optional(),
  avatars: z.record(z.string(), z.string()).optional(),
  onMessageClick: z.function().args(z.any()).returns(z.void()).optional(),
  onMessageHover: z.function().args(z.any()).returns(z.void()).optional(),
  messageSpacing: z.number().optional(),
  roleColors: z.record(z.string(), z.string()).optional(),
});

// PromptEditor Component Schema
export const PromptEditorSchema = BasePropsSchema.extend({
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
  onSnippetInsert: z.function().args(z.string()).returns(z.void()).optional(),
  autoResize: z.boolean().optional(),
  minHeight: z.number().optional(),
  maxHeight: z.number().optional(),
  syntaxHighlighting: z.boolean().optional(),
  language: z.string().optional(),
});

// ===== AI STREAMING COMPONENTS =====

// StreamingText Component Schema
export const StreamingTextSchema = BasePropsSchema.extend({
  text: z.string(),
  speed: z.number().optional(),
  onComplete: z.function().args().returns(z.void()).optional(),
  showCursor: z.boolean().optional(),
  cursorChar: z.string().optional(),
  streaming: z.boolean().optional(),
  pauseOnComplete: z.boolean().optional(),
  repeat: z.boolean().optional(),
  onStreamStart: z.function().args().returns(z.void()).optional(),
  onStreamUpdate: z.function().args(z.string()).returns(z.void()).optional(),
  onStreamEnd: z.function().args().returns(z.void()).optional(),
  bufferSize: z.number().optional(),
  smoothScrolling: z.boolean().optional(),
});

// ===== AI TOOL COMPONENTS =====

// ToolCallView Component Schema
export const ToolCallViewSchema = BasePropsSchema.extend({
  toolCalls: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      arguments: z.record(z.string(), z.any()),
      status: z.enum(['pending', 'running', 'completed', 'failed']),
      result: z.any().optional(),
      error: z.string().optional(),
      startTime: z.union([z.date(), z.number(), z.string()]).optional(),
      endTime: z.union([z.date(), z.number(), z.string()]).optional(),
      duration: z.number().optional(),
      progress: z.number().optional(),
    }),
  ),
  onToolCallClick: z.function().args(z.string()).returns(z.void()).optional(),
  showDetails: z.boolean().optional(),
  expandable: z.boolean().optional(),
  collapsible: z.boolean().optional(),
  defaultExpanded: z.boolean().optional(),
  showTimestamps: z.boolean().optional(),
  showProgress: z.boolean().optional(),
  onToolCallRetry: z.function().args(z.string()).returns(z.void()).optional(),
  onToolCallCancel: z.function().args(z.string()).returns(z.void()).optional(),
});

// ===== AI MODEL COMPONENTS =====

// ModelPicker Component Schema
export const ModelPickerSchema = BasePropsSchema.extend({
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      provider: z.string(),
      capabilities: z.array(z.string()),
      maxTokens: z.number().optional(),
      costPerToken: z.number().optional(),
      contextLength: z.number().optional(),
      supportedFeatures: z.array(z.string()).optional(),
      modelType: z
        .enum(['chat', 'completion', 'embedding', 'vision'])
        .optional(),
      lastUpdated: z.union([z.date(), z.number(), z.string()]).optional(),
    }),
  ),
  selectedModel: z.string().optional(),
  onModelSelect: z.function().args(z.string()).returns(z.void()),
  showCapabilities: z.boolean().optional(),
  showCosts: z.boolean().optional(),
  showProvider: z.boolean().optional(),
  searchable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  groupByProvider: z.boolean().optional(),
  onModelCompare: z
    .function()
    .args(z.array(z.string()))
    .returns(z.void())
    .optional(),
  onModelFavorite: z.function().args(z.string()).returns(z.void()).optional(),
});

// ===== AI SERVICE COMPONENTS =====

// AIService Component Schema
export const AIServiceSchema = BasePropsSchema.extend({
  model: z.string(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(-2).optional(),
  presencePenalty: z.number().min(-2).max(-2).optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
  onConnect: z.function().args().returns(z.void()).optional(),
  onDisconnect: z.function().args().returns(z.void()).optional(),
  onError: z.function().args(z.string()).returns(z.void()).optional(),
  onRateLimit: z.function().args(z.number()).returns(z.void()).optional(),
  autoReconnect: z.boolean().optional(),
  connectionStatus: z
    .enum(['connected', 'connecting', 'disconnected', 'error'])
    .optional(),
});

// ===== AI CHAT HOOK COMPONENTS =====

// ChatTUI Hook Options Schema
export const ChatTUIOptionsSchema = BasePropsSchema.extend({
  model: z.any(), // AI model instance
  tools: z.array(z.any()).optional(), // Tool definitions
  initialMessages: z.array(z.any()).optional(),
  maxMessages: z.number().optional(),
  onMessage: z.function().args(z.any()).returns(z.void()).optional(),
  onError: z.function().args(z.string()).returns(z.void()).optional(),
  onFinish: z.function().args(z.any()).returns(z.void()).optional(),
  streaming: z.boolean().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  onStreamStart: z.function().args().returns(z.void()).optional(),
  onStreamUpdate: z.function().args(z.string()).returns(z.void()).optional(),
  onStreamEnd: z.function().args().returns(z.void()).optional(),
  onToolCall: z.function().args(z.any()).returns(z.void()).optional(),
  onToolResult: z.function().args(z.any()).returns(z.void()).optional(),
  memory: z.boolean().optional(),
  memorySize: z.number().optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
});

// ===== AI UTILITY COMPONENTS =====

// Snippet Component Schema
export const SnippetSchema = BasePropsSchema.extend({
  name: z.string(),
  description: z.string(),
  content: z.string(),
  trigger: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  usage: z.number().optional(),
  lastUsed: z.union([z.date(), z.number(), z.string()]).optional(),
  onInsert: z.function().args(z.string()).returns(z.void()).optional(),
  onEdit: z.function().args(z.string()).returns(z.void()).optional(),
  onDelete: z.function().args(z.string()).returns(z.void()).optional(),
});

// VariableSuggestions Component Schema
export const VariableSuggestionsSchema = BasePropsSchema.extend({
  variables: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      type: z
        .enum(['string', 'number', 'boolean', 'array', 'object'])
        .optional(),
      defaultValue: z.any().optional(),
      required: z.boolean().optional(),
    }),
  ),
  onVariableSelect: z.function().args(z.string()).returns(z.void()).optional(),
  onVariableInsert: z.function().args(z.string()).returns(z.void()).optional(),
  showDescriptions: z.boolean().optional(),
  searchable: z.boolean().optional(),
  maxSuggestions: z.number().optional(),
});

// AIStatusBar Component Schema
export const AIStatusBarSchema = BasePropsSchema.extend({
  status: z.enum([
    'idle',
    'thinking',
    'streaming',
    'error',
    'connected',
    'disconnected',
  ]),
  model: z.string().optional(),
  tokensUsed: z.number().optional(),
  cost: z.number().optional(),
  responseTime: z.number().optional(),
  showDetails: z.boolean().optional(),
  onStatusClick: z.function().args().returns(z.void()).optional(),
  onModelClick: z.function().args().returns(z.void()).optional(),
  onCostClick: z.function().args().returns(z.void()).optional(),
});

// Export all AI component schemas
export const AIComponentSchemas = {
  // Chat Components
  chatLayout: ChatLayoutSchema,
  messageList: MessageListSchema,
  promptEditor: PromptEditorSchema,

  // Streaming Components
  streamingText: StreamingTextSchema,

  // Tool Components
  toolCallView: ToolCallViewSchema,

  // Model Components
  modelPicker: ModelPickerSchema,

  // Service Components
  aiService: AIServiceSchema,

  // Hook Components
  chatTUIOptions: ChatTUIOptionsSchema,

  // Utility Components
  snippet: SnippetSchema,
  variableSuggestions: VariableSuggestionsSchema,
  aiStatusBar: AIStatusBarSchema,
} as const;

// Export all types derived from schemas
export type ZodChatLayoutProps = z.infer<typeof ChatLayoutSchema>;
export type ZodMessageListProps = z.infer<typeof MessageListSchema>;
export type ZodPromptEditorProps = z.infer<typeof PromptEditorSchema>;
export type ZodStreamingTextProps = z.infer<typeof StreamingTextSchema>;
export type ZodToolCallViewProps = z.infer<typeof ToolCallViewSchema>;
export type ZodModelPickerProps = z.infer<typeof ModelPickerSchema>;
export type ZodAIServiceProps = z.infer<typeof AIServiceSchema>;
export type ZodChatTUIOptions = z.infer<typeof ChatTUIOptionsSchema>;
export type ZodSnippetProps = z.infer<typeof SnippetSchema>;
export type ZodVariableSuggestionsProps = z.infer<
  typeof VariableSuggestionsSchema
>;
export type ZodAIStatusBarProps = z.infer<typeof AIStatusBarSchema>;

// Utility types for AI components
export type MessageRole = 'user' | 'assistant' | 'system' | 'function' | 'tool';
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TimestampFormat = 'short' | 'long' | 'none';
export type AIStatus =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'error'
  | 'connected'
  | 'disconnected';
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';
export type ModelType = 'chat' | 'completion' | 'embedding' | 'vision';

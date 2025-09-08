// Core AI hooks
export { ChatTUI, useChatTUI } from './hooks/useChatTUI';
export type { UseChatTUIOptions } from './hooks/useChatTUI';

// AI Components
export { MessageList } from './components/MessageList';
export type { MessageListProps } from './components/MessageList';

export { PromptEditor } from './components/PromptEditor';
export type { PromptEditorProps, Snippet } from './components/PromptEditor';

export { ChatLayout } from './components/ChatLayout';
export type { ChatLayoutProps, Conversation } from './components/ChatLayout';

// Legacy exports from existing structure
export { ChatContainer } from './chat/ChatContainer';
export { MessageBubble } from './chat/MessageBubble';
export { MessageHistory } from './chat/MessageHistory';

export { AIService } from './streaming/AIService';
export type {
  ProviderClient,
  StreamResult,
  AIServiceConfig,
} from './streaming/AIService';
export { StreamingText } from './streaming/StreamingText';

// Provider validation utilities
export { ProviderValidator } from './validation/ProviderValidator';
export type {
  ValidationResult,
  ValidationOptions,
} from './validation/ProviderValidator';

// Environment configuration utilities
export { EnvironmentConfig } from './config/EnvironmentConfig';
export type {
  EnvironmentVariables,
  ProviderConfigValidation,
} from './config/EnvironmentConfig';

export { ToolOutput } from './tools/ToolOutput';
export { ToolProgress } from './tools/ToolProgress';
export { ToolSelector } from './tools/ToolSelector';

// Type exports
export type { Message } from './streaming/AIService';

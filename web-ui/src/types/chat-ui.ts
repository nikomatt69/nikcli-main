// Core message types
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';
export type MessageType =
  | 'text'
  | 'image'
  | 'file'
  | 'tool'
  | 'code'
  | 'markdown';

// User interface
export interface ChatUser {
  id: string;
  name: string;
  avatar?: string;
  isOnline?: boolean;
  lastSeen?: Date | string;
  email?: string;
}

// Attachment interface
export interface MessageAttachment {
  id: string;
  type: 'image' | 'file' | 'audio' | 'video';
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
}

// Reaction interface
export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  isUserReacted: boolean;
}

// Core message interface
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date | string;
  user?: ChatUser;
  status?: MessageStatus;
  type?: MessageType;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  replyTo?: string | null;
  isEdited?: boolean;
  isDeleted?: boolean;
  metadata?: Record<string, unknown>;
}

// Streaming state interface
export interface StreamingState {
  isStreaming: boolean;
  accumulatedContent: string;
  streamId: string | null;
  startTime: Date | null;
  chunkCount: number;
  lastChunkTime: Date | null;
}

// UI State interfaces
export interface UIState {
  isTyping: boolean;
  isConnected: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  isSending: boolean;
  hasMoreMessages: boolean;
  isLoadingHistory: boolean;
  scrollPosition: number;
  viewportHeight: number;
  contentHeight: number;
}

// Input state interface
export interface InputState {
  text: string;
  attachments: MessageAttachment[];
  isRecording: boolean;
  recordingDuration: number;
  replyTo: string | null;
  mentionedUsers: string[];
  isTypingDetected: boolean;
  lastTypedAt: Date | null;
}

// Typing indicator interface
export interface TypingIndicator {
  userId: string;
  userName: string;
  isTyping: boolean;
  timestamp: Date;
  conversationId: string;
}

// Conversation/session interface
export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  participants: ChatUser[];
  createdAt: Date | string;
  updatedAt: Date | string;
  lastMessage?: ChatMessage;
  unreadCount: number;
  isGroup: boolean;
  metadata?: Record<string, unknown>;
}

// Error state interface
export interface ChatError {
  id: string;
  message: string;
  code?: string;
  type: 'network' | 'validation' | 'server' | 'client';
  recoverable: boolean;
  timestamp: Date;
  context?: Record<string, unknown>;
}

// Action types for state management
export type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: Partial<ChatMessage> & { id: string } }
  | { type: 'DELETE_MESSAGE'; payload: { id: string } }
  | {
      type: 'ADD_REACTION';
      payload: { messageId: string; reaction: MessageReaction };
    }
  | { type: 'REMOVE_REACTION'; payload: { messageId: string; emoji: string } }
  | { type: 'SET_TYPING'; payload: { userId: string; isTyping: boolean } }
  | { type: 'SET_CONNECTION_STATUS'; payload: UIState['connectionStatus'] }
  | { type: 'SET_STREAMING'; payload: Partial<StreamingState> }
  | { type: 'ADD_ERROR'; payload: ChatError }
  | { type: 'CLEAR_ERROR'; payload: { id: string } }
  | { type: 'SET_INPUT'; payload: Partial<InputState> }
  | { type: 'SET_UI_STATE'; payload: Partial<UIState> }
  | { type: 'LOAD_MESSAGES'; payload: ChatMessage[] }
  | { type: 'CLEAR_CHAT' };

// Context value interface
export interface ChatContextValue {
  messages: ChatMessage[];
  conversation: ChatConversation | null;
  currentUser: ChatUser;
  streaming: StreamingState;
  uiState: UIState;
  inputState: InputState;
  typingIndicators: TypingIndicator[];
  errors: ChatError[];

  // Actions
  sendMessage: (
    content: string,
    attachments?: MessageAttachment[],
  ) => Promise<void>;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;
  deleteMessage: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  removeReaction: (messageId: string, emoji: string) => void;
  setTyping: (isTyping: boolean) => void;
  setInput: (updates: Partial<InputState>) => void;
  clearChat: () => void;
  loadHistory: (before: Date) => Promise<void>;
  scrollToMessage: (messageId: string) => void;

  // Derived state
  isLoading: boolean;
  hasMessages: boolean;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  onlineParticipants: ChatUser[];
}

// Component props interfaces
export interface ChatContainerProps {
  conversationId?: string;
  className?: string;
  theme?: 'light' | 'dark' | 'auto';
  onMessageSend?: (message: ChatMessage) => void;
  onMessageReceive?: (message: ChatMessage) => void;
  onError?: (error: ChatError) => void;
  children?: React.ReactNode;
}

export interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  className?: string;
  onScroll?: (position: number) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  scrollToMessageId?: string | null;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  currentUserId: string;
  isGrouped?: boolean;
  isLastInGroup?: boolean;
  onReaction?: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showAvatar?: boolean;
  showTimestamp?: boolean;
}

export interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttach?: (files: File[]) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  attachments?: MessageAttachment[];
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  mentionedUsers?: string[];
  onMention?: (userId: string) => void;
}

export interface TypingIndicatorProps {
  typingUsers: Array<{
    userId: string;
    userName: string;
  }>;
  className?: string;
  showDots?: boolean;
  duration?: number;
}

export interface MessageGroupProps {
  messages: ChatMessage[];
  currentUserId: string;
  sender: ChatUser;
  showAvatar: boolean;
}

// Animation variants interfaces
export interface AnimationVariants {
  initial: Record<string, any>;
  animate: Record<string, any>;
  exit: Record<string, any>;
  transition?: Record<string, any>;
}

type ComponentAnimationVariants = {
  container: AnimationVariants;
  item: AnimationVariants;
};

export interface ChatAnimations {
  container: ComponentAnimationVariants;
  message: {
    container: AnimationVariants;
    bubble: AnimationVariants;
    avatar: AnimationVariants;
    content: AnimationVariants;
  };
  input: ComponentAnimationVariants;
  typingIndicator: AnimationVariants;
}

// Utility types
export type MessageUpdateCallback = (message: ChatMessage) => void;
export type ErrorCallback = (error: ChatError) => void;
export type ConnectionStatusCallback = (
  status: UIState['connectionStatus'],
) => void;

// Webhook/PubSub event types
export interface ChatWebhookEvent {
  type: 'message' | 'reaction' | 'typing' | 'status' | 'error';
  data: unknown;
  timestamp: Date;
  conversationId: string;
}

// Performance metrics interface
export interface ChatMetrics {
  messagesSent: number;
  messagesReceived: number;
  averageResponseTime: number;
  connectionUptime: number;
  errors: number;
  lastUpdated: Date;
}

/**
 * NikCLI Mobile - Chat Store
 * Manages chat messages and conversation state
 */

import { create } from 'zustand'
import type { ChatMessage, MessageType, MessageStatus, StreamContext } from '@/types'

interface ChatState {
  // Messages
  messages: ChatMessage[]
  isProcessing: boolean
  
  // Context (aligned with streaming-orchestrator)
  context: StreamContext
  
  // Input
  inputText: string
  inputQueue: ChatMessage[]
  
  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  appendToMessage: (id: string, content: string) => void
  removeMessage: (id: string) => void
  clearMessages: () => void
  
  // Context actions
  setContext: (updates: Partial<StreamContext>) => void
  togglePlanMode: () => void
  toggleAutoAccept: () => void
  toggleVmMode: () => void
  
  // Input actions
  setInputText: (text: string) => void
  queueInput: (message: ChatMessage) => void
  processNextQueued: () => ChatMessage | undefined
  
  // Processing
  setProcessing: (isProcessing: boolean) => void
}

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const initialContext: StreamContext = {
  workingDirectory: '',
  autonomous: true,
  planMode: false,
  autoAcceptEdits: true,
  vmMode: false,
  contextLeft: 100,
  maxContext: 100,
  adaptiveSupervision: false,
  intelligentPrioritization: false,
  cognitiveFiltering: false,
  orchestrationAwareness: false,
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  messages: [],
  isProcessing: false,
  context: initialContext,
  inputText: '',
  inputQueue: [],
  
  // Message actions
  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: new Date(),
    }
    set((state) => ({
      messages: [...state.messages, newMessage],
    }))
    return newMessage
  },
  
  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    }))
  },
  
  appendToMessage: (id, content) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id
          ? { ...msg, content: msg.content + content }
          : msg
      ),
    }))
  },
  
  removeMessage: (id) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== id),
    }))
  },
  
  clearMessages: () => {
    set({ messages: [], inputQueue: [] })
  },
  
  // Context actions
  setContext: (updates) => {
    set((state) => ({
      context: { ...state.context, ...updates },
    }))
  },
  
  togglePlanMode: () => {
    set((state) => ({
      context: {
        ...state.context,
        planMode: !state.context.planMode,
        // Reset other modes when enabling plan mode
        autoAcceptEdits: state.context.planMode ? state.context.autoAcceptEdits : false,
        vmMode: state.context.planMode ? state.context.vmMode : false,
      },
    }))
  },
  
  toggleAutoAccept: () => {
    set((state) => ({
      context: {
        ...state.context,
        autoAcceptEdits: !state.context.autoAcceptEdits,
      },
    }))
  },
  
  toggleVmMode: () => {
    set((state) => ({
      context: {
        ...state.context,
        vmMode: !state.context.vmMode,
      },
    }))
  },
  
  // Input actions
  setInputText: (text) => {
    set({ inputText: text })
  },
  
  queueInput: (message) => {
    set((state) => ({
      inputQueue: [...state.inputQueue, message],
    }))
  },
  
  processNextQueued: () => {
    const { inputQueue } = get()
    if (inputQueue.length === 0) return undefined
    
    const [next, ...rest] = inputQueue
    set({ inputQueue: rest })
    return next
  },
  
  // Processing
  setProcessing: (isProcessing) => {
    set({ isProcessing })
  },
}))

// Selectors
export const selectMessages = (state: ChatState) => state.messages
export const selectContext = (state: ChatState) => state.context
export const selectIsProcessing = (state: ChatState) => state.isProcessing
export const selectInputQueue = (state: ChatState) => state.inputQueue
export const selectQueueLength = (state: ChatState) => state.inputQueue.length

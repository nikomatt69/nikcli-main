export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agent?: string;
  streaming?: boolean;
  metadata?: {
    tokens?: number;
    model?: string;
    executionTime?: number;
    tools?: string[];
  };
}

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error';

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: AgentStatus;
  currentTask?: string;
}

export interface CodeBlock {
  language: string;
  code: string;
  fileName?: string;
  startLine?: number;
  endLine?: number;
}

export interface DiffResult {
  original: string;
  modified: string;
  fileName: string;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number;
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastActivity: Date;
  workingDirectory: string;
  selectedFiles: string[];
}

export interface CommandSuggestion {
  command: string;
  description: string;
  args?: string[];
  category: 'file' | 'chat' | 'ai' | 'system';
}
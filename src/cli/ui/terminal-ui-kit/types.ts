import { ReactNode } from 'react';

export interface TerminalState {
  currentMode: 'default' | 'auto' | 'plan' | 'vm';
  currentAgent?: string;
  isProcessing: boolean;
  userInputActive: boolean;
  shouldInterrupt: boolean;
  structuredUIEnabled: boolean;
  cognitiveMode: boolean;
  orchestrationLevel: number;
}

export interface CommandContext {
  cliInstance: any;
  agentManager: any;
  configManager: any;
  workingDirectory: string;
  sessionContext: Map<string, any>;
}

export interface StreamData {
  type: 'status' | 'progress' | 'log' | 'error' | 'warning' | 'info' | 'chat';
  content: string;
  timestamp: Date;
  source?: string;
  metadata?: any;
}

export interface PanelProps {
  title: string;
  visible?: boolean;
  borderColor?: string;
  width?: number;
  height?: number;
  children?: ReactNode;
}

export interface CommandPanelProps extends PanelProps {
  args: string[];
  context: CommandContext;
  onComplete?: (result: CommandResult) => void;
  onError?: (error: Error) => void;
}

export interface CommandResult {
  shouldExit: boolean;
  shouldUpdatePrompt: boolean;
  data?: any;
}

export interface StatusIndicator {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'warning';
  details?: string;
  progress?: number;
  startTime?: Date;
  endTime?: Date;
  subItems?: StatusIndicator[];
}

export interface BackgroundAgentInfo {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'completed' | 'error';
  currentTask?: string;
  progress?: number;
  startTime?: Date;
  lastUpdate?: Date;
}

export interface TodoItem {
  content: string;
  title?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  priority?: 'critical' | 'high' | 'medium' | 'low';
  category?: string;
  progress?: number;
}

export interface FileInfo {
  path: string;
  content?: string;
  language?: string;
  size?: number;
  modified?: Date;
}

export interface DiffInfo {
  filePath: string;
  oldContent: string;
  newContent: string;
  language?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

export interface ApprovalRequest {
  id: string;
  title: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  actions: any[];
  timeout?: number;
  type?: 'general' | 'plan' | 'file' | 'command' | 'package';
}

export interface UITheme {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  muted: string;
  background: string;
  foreground: string;
  border: string;
}

export interface LayoutConfig {
  mode: 'single' | 'dual' | 'triple' | 'quad';
  panels: string[];
  focusedPanel?: string;
  terminalWidth: number;
  terminalHeight: number;
}
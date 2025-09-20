/**
 * TaskMaster AI Types and Declarations
 * Type definitions for TaskMaster AI integration
 */

// Internal type exports for NikCLI integration
export interface TaskMasterIntegrationConfig {
  aiProvider: 'anthropic' | 'openai' | 'google' | 'openrouter' | 'azure' | 'bedrock' | 'groq' | 'perplexity' | 'xai' | 'ollama' | 'claude-code' | 'gemini-cli'
  model: string
  workspacePath: string
  persistStorage: boolean
  enableAdvancedPlanning: boolean
  maxConcurrentTasks: number
  apiKey?: string
  baseURL?: string
}

export type TaskStatus = 'pending' | 'done' | 'in-progress' | 'review' | 'deferred' | 'cancelled'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface TaskMasterTask {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  tags?: string[]
  dependencies?: string[]
  estimatedHours?: number
  actualHours?: number
  assignee?: string
  dueDate?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  context?: Record<string, any>
}

export interface TaskMasterPlan {
  id: string
  title: string
  description?: string
  tasks: TaskMasterTask[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  currentTask: string | null
  completedTasks: number
  totalTasks: number
  createdAt: string
  updatedAt: string
  estimatedDuration?: number
  actualDuration?: number
}

export interface TaskMasterConfig {
  aiProvider: string
  model: string
  apiKey?: string
  baseURL?: string
  maxTokens?: number
  temperature?: number
  topP?: number
  profiles?: Record<string, any>
  rules?: Record<string, any>
  preferences?: Record<string, any>
  taskMasterDir?: string
  useNikCLIStructure?: boolean
}

export interface TaskMasterState {
  currentPlan?: string
  activeTasks: string[]
  completedTasks: string[]
  lastUpdated: string
  statistics: {
    totalTasks: number
    completedTasks: number
    pendingTasks: number
    averageCompletionTime: number
  }
}

export interface TaskMasterPaths {
  projectRoot: string | null
  taskMasterDir: string | null
  tasksPath: string | null
  configPath: string | null
  statePath: string | null
  prdPath: string | null
  complexityReportPath: string | null
}

export interface InitProjectOptions {
  projectPath?: string
  apiKey?: string
  yes?: boolean
  name?: string
  description?: string
  version?: string
  author?: string
  skipInstall?: boolean
  dryRun?: boolean
  aliases?: boolean
  git?: boolean
  gitTasks?: boolean
  taskMasterDir?: string
  [key: string]: any
}

export interface TaskMasterModule {
  initProject: (options?: InitProjectOptions) => Promise<any>
  runInitCLI: (options?: InitProjectOptions) => Promise<any>
  devScriptPath: string
  version: string
}

export interface TaskMasterStepResult {
  taskId: string
  status: 'success' | 'failed' | 'skipped'
  output?: string
  error?: string
  duration: number
  timestamp: string
}

export interface TaskMasterProgressTracker {
  start: () => void
  update: (progress: number, message?: string) => void
  complete: () => void
  fail: (error: string) => void
}
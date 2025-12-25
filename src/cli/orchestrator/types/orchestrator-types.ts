import type { AgentTodo } from '../../core/agent-todo-manager'

export interface UserPreferences {
  preferredAgentCount: number
  preferredPlanSize: number
  contextVerbosity: 'minimal' | 'standard' | 'detailed'
  maxContextTokens: number
  sharedContextRatio: number
  toolSelectionPreference: string[]
  autoToolSelection: boolean
  parallelExecution: boolean
  maxParallelAgents: number
  lastUpdated: string
  version: string
  learningStats: {
    totalDecisions: number
    successfulDecisions: number
    successRate: number
  }
}

export interface ExecutionOutcome {
  taskId: string
  agentId: string
  timestamp: Date
  duration: number
  success: boolean
  contextTokensUsed: number
  contextBudget: number
  efficiencyRatio: number
  complexityScore: number
  userFeedback?: 'positive' | 'negative' | 'neutral'
}

export interface AgentContextSlice {
  agentId: string
  taskId: string
  sharedContext: string
  agentSpecificContext: string
  taskContext: string
  allocatedTokens: number
  usedTokens: number
  priority: number
  dependencies: string[]
  generatedAt: Date
}

export interface ContextBudget {
  totalBudget: number
  sharedAllocation: number
  perAgentAllocation: number
  reservedForOutput: number
  currentUsage: number
  agents: Map<string, AgentBudgetUsage>
}

export interface AgentBudgetUsage {
  agentId: string
  allocated: number
  used: number
  efficiency: number
}

export interface TaskComplexityMetrics {
  score: number
  factors: {
    codeComplexity: number
    dependencyComplexity: number
    scopeComplexity: number
    interdependencyComplexity: number
  }
  estimatedTokens: {
    minimum: number
    optimal: number
    maximum: number
  }
  recommendedAgentCount: number
}

export interface TaskChainContext {
  chainId: string
  rootTaskId: string
  agentSlices: Map<string, AgentContextSlice>
  sharedContext: string
  budget: ContextBudget
  todos: AgentTodo[]
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export interface ExecutionPlan {
  id: string
  chains: TaskChainContext[]
  totalAgents: number
  estimatedTokens: number
  strategy: 'sequential' | 'parallel' | 'hybrid'
}

export interface OptimizationResult {
  optimalSlice: AgentContextSlice
  budget: ContextBudget
  complexity: TaskComplexityMetrics
  recommendations: string[]
}

export interface OrchestrationResult {
  success: boolean
  contextSlices: Map<string, AgentContextSlice>
  budget: ContextBudget
  complexity: TaskComplexityMetrics
  executionPlan: 'sequential' | 'parallel' | 'hybrid'
  warnings: string[]
}

export interface PatternInsight {
  patternType: string
  successRate: number
  averageEfficiency: number
  sampleSize: number
  recommendations: string[]
}

export interface SuccessPrediction {
  predictedSuccess: number
  confidence: number
  recommendations: string[]
}

export interface OrchestrationConfig {
  maxAgents?: number
  enforceBudget?: boolean
  enableLearning?: boolean
  verbosity?: 'minimal' | 'standard' | 'detailed'
}

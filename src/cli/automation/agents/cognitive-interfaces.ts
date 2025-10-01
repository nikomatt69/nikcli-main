/**
 * 🧠 Cognitive Interfaces for Enhanced Agent Intelligence
 * Shared cognitive capabilities extracted from UniversalAgent for all agents
 */

// ⚡︎ COGNITIVE ORCHESTRATION INTERFACES
export interface TaskCognition {
  id: string
  originalTask: string
  normalizedTask: string
  intent: {
    primary: 'create' | 'read' | 'update' | 'delete' | 'analyze' | 'optimize' | 'deploy' | 'test' | 'debug' | 'refactor'
    secondary: string[]
    confidence: number
    complexity: 'low' | 'medium' | 'high' | 'extreme'
    urgency: 'low' | 'normal' | 'high' | 'critical'
  }
  entities: Array<{
    type: 'file' | 'directory' | 'function' | 'class' | 'component' | 'api' | 'database'
    name: string
    confidence: number
    location?: string
  }>
  dependencies: string[]
  contexts: string[]
  estimatedComplexity: number
  requiredCapabilities: string[]
  suggestedAgents: string[]
  riskLevel: 'low' | 'medium' | 'high'
  orchestrationPlan?: OrchestrationPlan
}

export interface OrchestrationPlan {
  id: string
  strategy: 'sequential' | 'parallel' | 'hybrid' | 'adaptive'
  phases: OrchestrationPhase[]
  estimatedDuration: number
  resourceRequirements: {
    agents: number
    tools: string[]
    memory: number
    complexity: number
  }
  fallbackStrategies: string[]
  monitoringPoints: string[]
}

export interface OrchestrationPhase {
  id: string
  name: string
  type: 'preparation' | 'analysis' | 'execution' | 'validation' | 'cleanup'
  agents: string[]
  tools: string[]
  dependencies: string[]
  estimatedDuration: number
  successCriteria: string[]
  fallbackActions: string[]
}

export interface AgentPerformanceMetrics {
  agentId: string
  taskCount: number
  successRate: number
  averageDuration: number
  complexityHandled: number
  resourceEfficiency: number
  userSatisfaction: number
  lastActive: Date
  specializations: string[]
  strengths: string[]
  weaknesses: string[]
}

export interface CognitiveMemory {
  taskPatterns: Map<string, TaskCognition[]>
  successfulStrategies: Map<string, OrchestrationPlan[]>
  learningDatabase: Map<string, number>
  performanceHistory: Array<{
    id: string
    cognition: TaskCognition
    plan: OrchestrationPlan
    result: any
    duration: number
    success: boolean
    timestamp: Date
  }>
}

export interface CognitiveCapabilities {
  /**
   * Parse and understand task intent and complexity
   */
  parseTaskCognition(taskDescription: string): Promise<TaskCognition>

  /**
   * Create intelligent orchestration plan
   */
  createOrchestrationPlan(cognition: TaskCognition): Promise<OrchestrationPlan>

  /**
   * Learn from task execution results
   */
  updateCognitiveMemory(cognition: TaskCognition, result: any, success: boolean): void

  /**
   * Get performance insights for specialization
   */
  getPerformanceMetrics(): AgentPerformanceMetrics

  /**
   * Suggest optimization strategies
   */
  suggestOptimizations(taskHistory: TaskCognition[]): string[]
}

// Specialization-specific cognitive enhancements
export interface ReactCognition extends TaskCognition {
  componentAnalysis?: {
    componentType: 'functional' | 'class' | 'hook' | 'hoc'
    propsComplexity: 'simple' | 'medium' | 'complex'
    stateManagement: 'none' | 'useState' | 'useReducer' | 'context' | 'external'
    performanceOptimizations: string[]
    testingStrategy: string[]
  }
}

export interface BackendCognition extends TaskCognition {
  apiAnalysis?: {
    endpointType: 'rest' | 'graphql' | 'websocket' | 'grpc'
    dataComplexity: 'simple' | 'relational' | 'complex'
    scalabilityNeeds: 'low' | 'medium' | 'high'
    securityRequirements: string[]
    performanceRequirements: string[]
  }
}

export interface DevOpsCognition extends TaskCognition {
  infrastructureAnalysis?: {
    deploymentTarget: 'development' | 'staging' | 'production'
    scalingNeeds: 'static' | 'auto' | 'predictive'
    securityCompliance: string[]
    costOptimization: string[]
    monitoringNeeds: string[]
  }
}

export interface SystemAdminCognition extends TaskCognition {
  systemAnalysis?: {
    resourceType: 'cpu' | 'memory' | 'disk' | 'network' | 'process'
    criticalityLevel: 'low' | 'medium' | 'high' | 'critical'
    automationPotential: 'none' | 'partial' | 'full'
    securityImplications: string[]
    maintenanceRequirements: string[]
  }
}

export interface CodingCognition extends TaskCognition {
  codingAnalysis?: {
    taskType:
      | 'create'
      | 'read'
      | 'update'
      | 'delete'
      | 'analyze'
      | 'optimize'
      | 'deploy'
      | 'test'
      | 'debug'
      | 'refactor'
    complexity: 'low' | 'medium' | 'high' | 'extreme'
    targetFiles: string[]
    targetFunctions: string[]
    targetClasses: string[]
    language?: string
    framework?: string
    testingStrategy?: string[]
  }
}

// ⚡ OPTIMIZATION AGENT COGNITIVE INTERFACES
export interface OptimizationCognition extends TaskCognition {
  optimizationAnalysis?: {
    optimizationType: 'performance' | 'memory' | 'readability' | 'type-safety' | 'comprehensive'
    priority: 'low' | 'medium' | 'high' | 'critical'
    targetAreas: string[]
    constraints: string[]
  }
}

// 🔍 CODE REVIEW AGENT COGNITIVE INTERFACES
export interface CodeReviewCognition extends TaskCognition {
  reviewAnalysis?: {
    reviewType: 'comprehensive' | 'security' | 'performance' | 'quality' | 'compliance'
    depth: 'low' | 'medium' | 'high' | 'critical'
    focusAreas: string[]
    standards: string[]
  }
}

// 🚀 CODE GENERATOR AGENT COGNITIVE INTERFACES
export interface CodeGeneratorCognition extends TaskCognition {
  generationAnalysis?: {
    generationType: 'function' | 'class' | 'component' | 'api' | 'project' | 'utility'
    language: 'typescript' | 'javascript' | 'python' | 'java' | 'csharp' | 'auto'
    framework: string
    testingFramework: string
    documentationStyle: string
  }
}

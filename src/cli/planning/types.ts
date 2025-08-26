/**
 * Execution Planning System Types
 * Production-ready interfaces for step-by-step plan generation and execution
 */

import { ToolCapability } from '../services/tool-service';

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high';
  destructiveOperations: number;
  fileModifications: number;
  externalCalls: number;
}

export interface PlanningToolCapability {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  reversible: boolean;
  estimatedDuration: number;
  requiredArgs: string[];
  optionalArgs: string[];
}

export interface ExecutionStep {
  id: string;
  type: 'tool' | 'validation' | 'user_input' | 'decision';
  title: string;
  description: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  dependencies?: string[]; // IDs of steps that must complete first
  estimatedDuration?: number; // in milliseconds
  riskLevel: 'low' | 'medium' | 'high';
  reversible: boolean;
  metadata?: Record<string, any>;
}

export interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  steps: ExecutionStep[];
  todos: PlanTodo[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  estimatedTotalDuration: number;
  actualDuration?: number;
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high';
    destructiveOperations: number;
    fileModifications: number;
    externalCalls: number;
  };
  createdAt: Date;
  createdBy: string; // agent name
  context: {
    userRequest: string;
    projectPath: string;
    relevantFiles?: string[];
    reasoning?: string;
    simple?: boolean;
  };
}

export interface StepExecutionResult {
  stepId: string;
  status: 'success' | 'failure' | 'skipped' | 'cancelled';
  output?: any;
  error?: Error;
  duration: number;
  timestamp: Date;
  logs?: string[];
}

export interface PlanExecutionResult {
  planId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'partial';
  startTime: Date;
  endTime?: Date;
  stepResults: StepExecutionResult[];
  summary: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    skippedSteps: number;
  };
}

export interface PlanApprovalRequest {
  plan: ExecutionPlan;
  timestamp: Date;
  requiresConfirmation: boolean;
  warningMessages?: string[];
}

export interface PlanApprovalResponse {
  approved: boolean;
  modifiedSteps?: string[]; // IDs of steps to skip
  userComments?: string;
  timestamp: Date;
}

export interface PlannerConfig {
  maxStepsPerPlan: number;
  requireApprovalForRisk: 'medium' | 'high';
  enableRollback: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  timeoutPerStep: number; // milliseconds
  autoApproveReadonly?: boolean; // Auto-approve readonly operations
}



export interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface PlannerContext {
  userRequest: string;
  projectPath: string;
  availableTools: PlanningToolCapability[];
  projectAnalysis?: {
    fileCount: number;
    languages: string[];
    frameworks: string[];
    hasTests: boolean;
    hasDocumentation: boolean;
  };
  userPreferences?: {
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
    preferredTools: string[];
    excludedOperations: string[];
  };
}

export interface PlanTodo {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  assignedAgent?: string;
  dependencies?: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  progress: number; // 0-100
  reasoning?: string;
  tools?: string[];
}

export interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  sessionId: string;
  workspaceAnalysis?: any;
  activeFiles?: string[];
  lastModified?: Date;
}

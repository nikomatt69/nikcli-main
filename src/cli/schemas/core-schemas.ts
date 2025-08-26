import { z } from 'zod';

export const AgentStatusSchema = z.enum(['initializing', 'ready', 'busy', 'error', 'offline']);
export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']);
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const AgentMetricsSchema = z.object({
  tasksExecuted: z.number().int().min(0),
  tasksSucceeded: z.number().int().min(0),
  tasksFailed: z.number().int().min(0),
  tasksInProgress: z.number().int().min(0),
  averageExecutionTime: z.number().min(0),
  totalExecutionTime: z.number().min(0),
  successRate: z.number().min(0).max(1),
  tokensConsumed: z.number().int().min(0),
  apiCallsTotal: z.number().int().min(0),
  memoryUsage: z.number().min(0),
  efficiency: z.number().min(0).max(1),
  productivity: z.number().min(0).max(1),
  accuracy: z.number().min(0).max(1)
});

export const AgentConfigSchema = z.object({
  autonomyLevel: z.enum(['autonomous', 'semi-autonomous', 'supervised']),
  maxConcurrentTasks: z.number().int().min(1).max(50),
  defaultTimeout: z.number().int().min(1000),
  retryPolicy: z.object({
    maxAttempts: z.number().int().min(1).max(10),
    backoffMs: z.number().int().min(100),
    backoffMultiplier: z.number().min(1).max(10),
    retryableErrors: z.array(z.string()).optional()
  }),
  permissions: z.object({
    fileSystem: z.object({
      read: z.boolean(),
      write: z.boolean(),
      execute: z.boolean()
    }),
    network: z.object({
      enabled: z.boolean(),
      allowedHosts: z.array(z.string()).optional()
    }),
    commands: z.object({
      enabled: z.boolean(),
      whitelist: z.array(z.string()).optional(),
      blacklist: z.array(z.string()).optional()
    })
  }).optional()
});

export const AgentContextSchema = z.object({
  workingDirectory: z.string().min(1),
  projectInfo: z.object({
    name: z.string(),
    type: z.string(),
    framework: z.string().optional(),
    language: z.string().optional()
  }).optional(),
  environment: z.record(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional()
});

export const AgentTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  requiredCapabilities: z.array(z.string()),
  parameters: z.record(z.any()).optional(),
  constraints: z.object({
    timeout: z.number().int().min(1000).optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
    requiresApproval: z.boolean().optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).optional()
  }).optional(),
  createdAt: z.date().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  createdBy: z.string().optional(),
  assignedTo: z.string().optional()
});

export const AgentTaskResultSchema = z.object({
  taskId: z.string().min(1),
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
  metadata: z.object({
    executionTime: z.number().min(0),
    tokensUsed: z.number().int().min(0).optional(),
    apiCalls: z.number().int().min(0).optional(),
    filesModified: z.array(z.string()).optional(),
    commandsExecuted: z.array(z.string()).optional()
  }).optional(),
  artifacts: z.array(z.object({
    type: z.string(),
    path: z.string(),
    size: z.number().int().min(0).optional(),
    checksum: z.string().optional()
  })).optional(),
  warnings: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional()
});

export const AgentTodoSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  priority: TaskPrioritySchema,
  assignedAgent: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date().optional(),
  completedAt: z.date().optional(),
  tags: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  estimatedTime: z.number().int().min(0).optional()
});

export const AgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  specialization: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
  version: z.string().min(1),
  status: AgentStatusSchema,
  currentTasks: z.number().int().min(0),
  maxConcurrentTasks: z.number().int().min(1)
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type AgentMetrics = z.infer<typeof AgentMetricsSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentContext = z.infer<typeof AgentContextSchema>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type AgentTaskResult = z.infer<typeof AgentTaskResultSchema>;
export type AgentTodo = z.infer<typeof AgentTodoSchema>;
export type Agent = z.infer<typeof AgentSchema>;
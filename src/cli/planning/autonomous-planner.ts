import { EventEmitter } from 'node:events'
import type { CoreMessage } from 'ai'
import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { advancedAIProvider } from '../ai/advanced-ai-provider'
import { getLightweightInference } from '../ai/lightweight-inference-layer'
import { WorkspaceRAG } from '../context/workspace-rag'
import { advancedUI } from '../ui/advanced-cli-ui'
import type { ExecutionPlan, MutableExecutionPlan, PlanTodo } from './types'

export interface PlanningEvent {
  type:
    | 'plan_start'
    | 'plan_created'
    | 'todo_start'
    | 'todo_progress'
    | 'todo_complete'
    | 'plan_complete'
    | 'plan_failed'
  planId?: string
  todoId?: string
  content?: string
  progress?: number
  result?: any
  error?: string
  metadata?: any
}

export interface ToolchainExecution {
  id: string
  name: string
  tools: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  currentStep: number
  totalSteps: number
  results: any[]
  startTime: Date
  endTime?: Date
}

export class AutonomousPlanner extends EventEmitter {
  private workspaceRAG: WorkspaceRAG
  private activePlans: Map<string, ExecutionPlan> = new Map()
  private executionHistory: PlanningEvent[] = []
  private toolchainRegistry: Map<string, any> = new Map()

  constructor(workspacePath: string) {
    super()
    this.workspaceRAG = new WorkspaceRAG(workspacePath)
    this.initializeToolchains()
  }

  private initializeToolchains(): void {
    // Register common toolchains
    this.toolchainRegistry.set('create-react-component', {
      name: 'Create React Component',
      description: 'Create a React component with TypeScript and styling',
      tools: ['analyze_project', 'grep_tool', 'write_file', 'execute_command'],
      pattern: 'sequential',
    })

    this.toolchainRegistry.set('setup-api-endpoint', {
      name: 'Setup API Endpoint',
      description: 'Create API endpoint with validation and error handling',
      tools: ['read_file', 'analyze_project', 'grep_tool', 'write_file', 'manage_packages'],
      pattern: 'sequential',
    })

    this.toolchainRegistry.set('add-testing', {
      name: 'Add Testing Suite',
      description: 'Set up comprehensive testing for the project',
      tools: ['analyze_project', 'manage_packages', 'grep_tool', 'write_file', 'execute_command'],
      pattern: 'parallel-then-sequential',
    })

    this.toolchainRegistry.set('optimize-performance', {
      name: 'Optimize Performance',
      description: 'Analyze and optimize application performance',
      tools: ['analyze_project', 'read_file', 'execute_command', 'grep_toolwrite_file'],
      pattern: 'analyze-then-fix',
    })

    this.toolchainRegistry.set('fix-errors', {
      name: 'Fix Errors',
      description: 'Analyze and fix TypeScript/ESLint errors',
      tools: ['execute_command', 'read_file', 'grep_tool', 'write_file', 'execute_command'],
      pattern: 'iterative',
    })
  }

  // Main planning method - like Claude's internal planning
  // 🚀 OPTIMIZED: Uses lightweight inference to estimate complexity before full AI planning
  async *createAndExecutePlan(userGoal: string, _context?: any): AsyncGenerator<PlanningEvent> {
    const planId = nanoid()

    yield {
      type: 'plan_start',
      planId,
      content: `🎯 Creating autonomous plan for: ${userGoal}`,
    }

    try {
      // 🚀 OPTIMIZATION: Estimate goal complexity in ~5-8ms
      const lightweightEngine = getLightweightInference()
      const complexity = await lightweightEngine.estimateComplexity(userGoal)

      yield {
        type: 'todo_progress',
        planId,
        progress: 25,
        content: `📊 Goal complexity: ${complexity.level} (confidence: ${Math.round(complexity.confidence * 100)}%)`,
      }

      // For simple goals, use template-based planning instead of expensive LLM
      if (complexity.level === 'simple' && complexity.template) {
        yield {
          type: 'todo_progress',
          planId,
          progress: 50,
          content: `✨ Using template: ${complexity.template} for faster execution`,
        }

        // Use predefined template instead of AI planning
        const plan = this.createTemplateBasedPlan(planId, userGoal, complexity.template)
        this.activePlans.set(planId, plan)

        yield {
          type: 'plan_created',
          planId,
          content: `📋 Quick plan created (template-based) with ${plan.todos.length} steps`,
          metadata: { todos: plan.todos.length, estimatedDuration: plan.estimatedTotalDuration, method: 'template' },
        }

        // 3. Execute the plan autonomously
        yield* this.executePlan(plan)
        return
      }

      // For complex goals, use full AI planning
      // 1. Analyze the goal and workspace context
      const workspaceContext = this.workspaceRAG.getContextForTask(userGoal)

      // 2. Generate execution plan using AI
      const plan = await this.generateExecutionPlan(planId, userGoal, workspaceContext)
      this.activePlans.set(planId, plan)

      yield {
        type: 'plan_created',
        planId,
        content: `📋 Plan created with ${plan.todos.length} steps`,
        metadata: { todos: plan.todos.length, estimatedDuration: plan.estimatedTotalDuration },
      }

      // 3. Execute the plan autonomously
      yield* this.executePlan(plan)
    } catch (error: any) {
      yield {
        type: 'plan_failed',
        planId,
        error: error.message,
        content: `✖ Planning failed: ${error.message}`,
      }
    }
  }

  private async generateExecutionPlan(planId: string, goal: string, workspaceContext: any): Promise<ExecutionPlan> {
    advancedUI.addLiveUpdate({
      type: 'info',
      content: 'AI Planning: Analyzing goal and creating execution plan...',
      source: 'ai_planning',
    })

    // Use AI to break down the goal into actionable todos
    const planningMessages: CoreMessage[] = [
      {
        role: 'system',
        content: `You are an expert autonomous planner that breaks down development goals into executable todos.

WORKSPACE CONTEXT:
${JSON.stringify(workspaceContext.projectInfo, null, 2)}

RELEVANT FILES:
${workspaceContext.relevantFiles.map((f: { path: any; summary: any }) => `- ${f.path}: ${f.summary}`).join('\n')}

AVAILABLE TOOLCHAINS:
${Array.from(this.toolchainRegistry.entries())
  .map(([key, chain]) => `- ${key}: ${chain.description} (tools: ${chain.tools.join(', ')})`)
  .join('\n')}

AVAILABLE TOOLS:
- read_file: Read and analyze file contents
- write_file: Create or modify files
- explore_directory: Explore project structure
- execute_command: Run terminal commands
- analyze_project: Comprehensive project analysis
- manage_packages: Install/manage dependencies


Your task: Create a detailed execution plan for the goal "${goal}".

Response format (JSON):
{
  "reasoning": "Why this plan will achieve the goal",
  "todos": [
    {
      "id": "todo-1",
      "title": "Clear, actionable title",
      "description": "Detailed description of what to do",
      "tools": ["tool1", "tool2"],
      "dependencies": [],
      "reasoning": "Why this step is needed",
      "priority": "high|medium|low",
      "estimatedDuration": 30000
    }
  ],
  "toolchains": ["toolchain-name"],
  "estimatedDuration": 180000
}

Create a plan that is:
1. Specific and actionable
2. Uses appropriate tools for each task
3. Considers project context and existing patterns
4. Has proper step dependencies
5. Is realistic in timing estimates

IMPORTANT: Only use tools that are actually available. Be specific about file paths and commands.`,
      },
      {
        role: 'user',
        content: goal,
      },
    ]

    // Execute planning task and collect response (pass messages to avoid huge prompt)
    let fullResponse = ''
    for await (const event of advancedAIProvider.executeAutonomousTask('Planning', { messages: planningMessages })) {
      if (event.type === 'text_delta' && event.content) {
        fullResponse += event.content
      }
    }

    // Parse AI response into execution plan
    let planData
    try {
      // Extract JSON from AI response
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('AI did not return valid JSON plan')
      }
      planData = JSON.parse(jsonMatch[0])
    } catch (error) {
      throw new Error(`Failed to parse AI plan: ${error}`)
    }

    // Convert to ExecutionPlan format
    const todos: PlanTodo[] = planData.todos.map((todo: any) => ({
      id: todo.id || nanoid(),
      title: todo.title,
      description: todo.description,
      tools: todo.tools || [],
      dependencies: todo.dependencies || [],
      status: 'pending' as const,
      reasoning: todo.reasoning || '',
      priority: todo.priority || 'medium',
    }))

    const plan: ExecutionPlan = {
      id: planId,
      title: goal,
      description: goal,
      steps: [],
      status: 'pending',
      todos,
      estimatedTotalDuration: planData.estimatedDuration || 60000,
      riskAssessment: {
        overallRisk: planData.riskLevel || 'medium',
        destructiveOperations: 0,
        fileModifications: todos.length,
        externalCalls: 0,
      },
      createdAt: new Date(),
      createdBy: 'autonomous-planner',
      context: {
        userRequest: goal,
        projectPath: workspaceContext.projectPath || process.cwd(),
        reasoning: planData.reasoning,
      },
    }

    return plan
  }

  public async *executePlan(plan: ExecutionPlan): AsyncGenerator<PlanningEvent> {
    // Convert to mutable for internal modifications
    const mutablePlan: MutableExecutionPlan = {
      ...plan,
      status: 'running',
      steps: [...plan.steps],
      todos: plan.todos.map((todo) => ({
        ...todo,
        status: todo.status,
        progress: todo.progress,
        updatedAt: todo.updatedAt,
        completedAt: todo.completedAt,
        actualDuration: todo.actualDuration,
        dependencies: todo.dependencies ? [...todo.dependencies] : undefined,
        metadata: todo.metadata ? { ...todo.metadata } : undefined,
        tools: todo.tools ? [...todo.tools] : undefined,
      })),
      context: {
        ...plan.context,
        relevantFiles: plan.context.relevantFiles ? [...plan.context.relevantFiles] : undefined,
      },
    }
    let completedTodos = 0

    try {
      // Execute todos based on dependencies
      const todoQueue = [...mutablePlan.todos]
      const completed = new Set<string>()

      while (todoQueue.length > 0) {
        // Check for interruption to prevent infinite loops
        const shouldInterrupt = (global as any).__shouldInterrupt
        if (shouldInterrupt?.()) {
          yield {
            type: 'plan_failed',
            planId: mutablePlan.id,
            content: '🛑 Plan execution interrupted by user',
            error: 'User interrupted',
          }
          break
        }

        // Find todos ready to execute (dependencies satisfied)
        const readyTodos = todoQueue.filter((todo) => todo?.dependencies?.every((dep) => completed.has(dep)))

        if (readyTodos.length === 0) {
          // Check if we're stuck due to failed dependencies
          const remainingTodos = todoQueue.filter((todo) => todo.status !== 'completed')
          if (remainingTodos.length > 0) {
            throw new Error('Circular dependencies or failed dependencies detected')
          }
          break
        }

        // Execute ready todos (can be parallel if no inter-dependencies)
        for (const todo of readyTodos) {
          yield {
            type: 'todo_start',
            planId: mutablePlan.id,
            todoId: todo.id,
            content: `🔧 Executing: ${todo.title}`,
          }

          try {
            // Execute the todo using toolchain
            const result = await this.executeTodo(todo, mutablePlan.context)

            todo.status = 'completed'
            todo.completedAt = new Date()
            completed.add(todo.id)
            completedTodos++

            yield {
              type: 'todo_complete',
              planId: mutablePlan.id,
              todoId: todo.id,
              content: `✓ Completed: ${todo.title}`,
              result,
              progress: (completedTodos / mutablePlan.todos.length) * 100,
            }

            // Remove from queue
            const index = todoQueue.findIndex((t) => t.id === todo.id)
            if (index > -1) todoQueue.splice(index, 1)
          } catch (error: any) {
            todo.status = 'failed'

            yield {
              type: 'todo_complete',
              planId: mutablePlan.id,
              todoId: todo.id,
              content: `✖ Failed: ${todo.title} - ${error.message}`,
              error: error.message,
            }

            // Decide whether to continue or fail the entire plan
            if (todo.priority === 'high') {
              throw new Error(`Critical todo failed: ${todo.title}`)
            }
          }
        }
      }

      // Plan completed
      mutablePlan.status = 'completed'
      mutablePlan.actualDuration = Date.now() - mutablePlan.createdAt.getTime()

      yield {
        type: 'plan_complete',
        planId: mutablePlan.id,
        content: `🎉 Plan completed successfully! (${completedTodos}/${mutablePlan.todos.length} todos)`,
        metadata: {
          completed: completedTodos,
          total: mutablePlan.todos.length,
          duration: mutablePlan.actualDuration,
        },
      }
    } catch (error: any) {
      mutablePlan.status = 'failed'
      yield {
        type: 'plan_failed',
        planId: mutablePlan.id,
        content: `✖ Plan failed: ${error.message}`,
        error: error.message,
      }
    } finally {
      // Ensure default mode after autonomous execution ends
      try {
        const nik = (global as any).__nikCLI
        if (nik) {
          nik.currentMode = 'default'
          // Restore prompt after plan execution completes
          if (typeof nik.renderPromptAfterOutput === 'function') {
            nik.renderPromptAfterOutput()
          }
        }
        const orchestrator = (global as any).__streamingOrchestrator
        if (orchestrator?.context) {
          orchestrator.context.planMode = false
          orchestrator.context.autoAcceptEdits = false
        }
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Create plan from predefined templates for simple goals
   * ~50-100ms vs 500-2000ms for AI-generated plans
   */
  private createTemplateBasedPlan(planId: string, goal: string, template: string): ExecutionPlan {
    const templates: Record<string, PlanTodo[]> = {
      'template-simple-file-read': [
        {
          id: nanoid(),
          title: 'Locate and read file',
          description: goal,
          reasoning: 'Extract relevant file path from user goal',
          tools: ['read_file'],
          estimatedDuration: 5,
          status: 'pending' as const,
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
          dependencies: [],
          metadata: {
            method: 'template',
            template,
            simple: true,
          },
        },
      ],
      'template-simple-search': [
        {
          id: nanoid(),
          title: 'Search for content',
          description: goal,
          reasoning: 'Find matching content using search/grep',
          tools: ['grep'],
          estimatedDuration: 10,
          status: 'pending' as const,
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
          dependencies: [],
          metadata: {
            method: 'template',
            template,
            simple: true,
          },
        },
      ],
      'template-simple-info': [
        {
          id: nanoid(),
          title: 'Gather information',
          description: goal,
          reasoning: 'Retrieve requested information using available tools',
          tools: ['read_file', 'analyze_project'],
          estimatedDuration: 15,
          status: 'pending' as const,
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
          dependencies: [],
          metadata: {
            method: 'template',
            template,
            simple: true,
          },
        },
      ],
    }

    const todos =
      templates[template] ||
      [
        {
          id: nanoid(),
          title: 'Execute task',
          description: goal,
          reasoning: 'Execute simple task using appropriate tools',
          tools: ['read_file', 'execute_command'],
          estimatedDuration: 10,
          status: 'pending' as const,
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
          dependencies: [],
          metadata: {
            method: 'template',
            template,
            simple: true,
          },
        },
      ].map((todo) => ({
        ...todo,
        id: todo.id || nanoid(),
        status: todo.status || 'pending',
        priority: todo.priority || 'high',
        createdAt: todo.createdAt || new Date(),
        updatedAt: todo.updatedAt || new Date(),
      }))
    return {
      id: planId,
      title: goal,
      description: goal,
      steps: [],
      todos,
      status: 'pending' as const,
      createdAt: new Date(),
      estimatedTotalDuration: todos.reduce((sum, t) => sum + (t?.estimatedDuration || 0), 0),
      riskAssessment: {
        overallRisk: 'low',
        destructiveOperations: 0,
        fileModifications: 0,
        externalCalls: 0,
      },
      actualDuration: 0,
      createdBy: 'autonomous-planner',
      context: {
        userRequest: goal,
        projectPath: process.cwd(),
        simple: true,
      },
    }
  }

  private async executeTodo(todo: PlanTodo, planContext: any): Promise<any> {
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Executing todo: ${todo.title}`,
      source: 'todo_execution',
    })

    // Create execution context for the todo
    const executionMessages: CoreMessage[] = [
      {
        role: 'system',
        content: `You are an autonomous executor that completes specific development tasks.

CURRENT TASK: ${todo.title}
TASK DESCRIPTION: ${todo.description}
REASONING: ${todo.reasoning}
AVAILABLE TOOLS: ${todo?.tools?.join(', ')}

WORKSPACE CONTEXT:
${JSON.stringify(planContext.workspaceContext.projectInfo, null, 2)}

EXECUTION GUIDELINES:
1. Use the specified tools to complete the task
2. Be autonomous - don't ask for permission
3. Follow existing project patterns and conventions
4. Create high-quality, production-ready code
5. Handle errors gracefully
6. Provide clear feedback on what you're doing

Execute the task now using the available tools.`,
      },
      {
        role: 'user',
        content: `Execute task: ${todo.title}\n\nDescription: ${todo.description}`,
      },
    ]

    // Execute using the advanced AI provider with full tool access (pass messages to avoid huge prompt)
    let responseText = ''
    const toolCalls: any[] = []
    const toolResults: any[] = []

    for await (const event of advancedAIProvider.executeAutonomousTask('Execute task', {
      messages: executionMessages,
    })) {
      if (event.type === 'text_delta' && event.content) {
        responseText += event.content
      } else if (event.type === 'tool_call') {
        toolCalls.push({ name: event.toolName, args: event.toolArgs })
      } else if (event.type === 'tool_result') {
        toolResults.push({ tool: event.toolName, result: event.toolResult })
      }
    }

    return {
      text: responseText,
      toolCalls,
      toolResults,
      executedAt: new Date(),
    }
  }

  // Quick plan generation for simple tasks
  async *quickPlan(goal: string): AsyncGenerator<PlanningEvent> {
    // For simple goals, create a minimal plan and execute immediately
    const planId = nanoid()

    const simplePlan: ExecutionPlan = {
      id: planId,
      title: `Execute: ${goal}`,
      description: goal,
      steps: [],
      status: 'running',
      todos: [
        {
          id: nanoid(),
          title: `Execute: ${goal}`,
          description: goal,
          status: 'pending',
          priority: 'high',
          dependencies: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
          tools: this.suggestToolsForGoal(goal),
          reasoning: 'Direct execution of user goal',
        },
      ],
      estimatedTotalDuration: 30000,
      riskAssessment: {
        overallRisk: 'low',
        destructiveOperations: 0,
        fileModifications: 0,
        externalCalls: 0,
      },
      createdAt: new Date(),
      createdBy: 'autonomous-planner',
      context: {
        userRequest: goal,
        projectPath: process.cwd(),
        simple: true,
      },
    }

    this.activePlans.set(planId, simplePlan)

    yield { type: 'plan_start', planId, content: `🚀 Quick execution: ${goal}` }
    yield* this.executePlan(simplePlan)
  }

  private suggestToolsForGoal(goal: string): string[] {
    const goalLower = goal.toLowerCase()
    const tools: string[] = []

    // Smart tool suggestion based on goal
    if (goalLower.includes('read') || goalLower.includes('analyze')) {
      tools.push('read_file', 'analyze_project')
    }

    if (goalLower.includes('create') || goalLower.includes('generate')) {
      tools.push('analyze_project', 'write_file', 'rag_search')
    }

    if (goalLower.includes('install') || goalLower.includes('package')) {
      tools.push('manage_packages')
    }

    if (goalLower.includes('run') || goalLower.includes('command') || goalLower.includes('test')) {
      tools.push('execute_command')
    }

    if (goalLower.includes('fix') || goalLower.includes('error')) {
      tools.push('read_file', 'execute_command', 'write_file')
    }

    // Default tools if no specific match
    if (tools.length === 0) {
      tools.push('analyze_project', 'read_file', 'grep_tool', 'write_file')
    }

    return [...new Set(tools)]
  }

  // Get planning insights for the chat
  getPlanningInsights(goal: string): {
    suggestedToolchains: string[]
    estimatedComplexity: 'simple' | 'medium' | 'complex'
    recommendedApproach: string
  } {
    const goalLower = goal.toLowerCase()
    const suggestedToolchains: string[] = []
    let complexity: 'simple' | 'medium' | 'complex' = 'simple'

    // Analyze goal complexity
    const complexityIndicators = ['full-stack', 'complete', 'comprehensive', 'entire', 'whole', 'all']

    const mediumComplexityIndicators = ['component', 'api', 'endpoint', 'feature', 'page', 'service']

    if (complexityIndicators.some((indicator) => goalLower.includes(indicator))) {
      complexity = 'complex'
    } else if (mediumComplexityIndicators.some((indicator) => goalLower.includes(indicator))) {
      complexity = 'medium'
    }

    // Suggest toolchains
    if (goalLower.includes('component') || goalLower.includes('react')) {
      suggestedToolchains.push('create-react-component')
    }

    if (goalLower.includes('api') || goalLower.includes('endpoint')) {
      suggestedToolchains.push('setup-api-endpoint')
    }

    if (goalLower.includes('test') || goalLower.includes('testing')) {
      suggestedToolchains.push('add-testing')
    }

    if (goalLower.includes('fix') || goalLower.includes('error')) {
      suggestedToolchains.push('fix-errors')
    }

    if (goalLower.includes('optimize') || goalLower.includes('performance')) {
      suggestedToolchains.push('optimize-performance')
    }

    const recommendedApproach = this.getRecommendedApproach(complexity, suggestedToolchains.length)

    return { suggestedToolchains, estimatedComplexity: complexity, recommendedApproach }
  }

  private getRecommendedApproach(complexity: string, toolchainCount: number): string {
    switch (complexity) {
      case 'simple':
        return 'Quick autonomous execution with minimal planning'
      case 'medium':
        return `Structured plan with ${toolchainCount > 0 ? 'specialized toolchains' : 'step-by-step execution'}`
      case 'complex':
        return 'Comprehensive planning with multiple phases and toolchain orchestration'
      default:
        return 'Autonomous execution with adaptive planning'
    }
  }

  // Utility methods
  getActivePlans(): ExecutionPlan[] {
    return Array.from(this.activePlans.values())
  }

  getPlan(planId: string): ExecutionPlan | undefined {
    return this.activePlans.get(planId)
  }

  getExecutionHistory(): PlanningEvent[] {
    return [...this.executionHistory]
  }

  // Update workspace context
  updateWorkspace(): void {
    this.workspaceRAG.analyzeWorkspace()
  }
}

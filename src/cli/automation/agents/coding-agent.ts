import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { type ChatMessage, modelProvider } from '../../ai/model-provider'
import { CliUI } from '../../utils/cli-ui'
import type { AgentTask } from './agent-router'
import type { AgentTaskResult } from './base-agent'
import { CognitiveAgentBase } from './cognitive-agent-base'
import type { CodingCognition, OrchestrationPlan, TaskCognition } from './cognitive-interfaces'
import { advancedUI } from '../../ui/advanced-cli-ui'

const CodeAnalysisSchema = z.object({
  language: z.string(),
  complexity: z.enum(['low', 'medium', 'high']),
  issues: z.array(
    z.object({
      type: z.enum(['bug', 'performance', 'security', 'style', 'maintainability']),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      message: z.string(),
      line: z.number().optional(),
      suggestion: z.string().optional(),
    })
  ),
  metrics: z.object({
    linesOfCode: z.number(),
    functions: z.number(),
    complexity: z.number(),
  }),
})

const CodeGenerationSchema = z.object({
  code: z.string(),
  language: z.string(),
  explanation: z.string(),
  dependencies: z.array(z.string()).optional(),
  usage: z.string().optional(),
  tests: z.string().optional(),
})

/**
 * 💻 Enhanced Coding Agent with Cognitive Intelligence
 * Specialized in general coding assistance with advanced analysis intelligence,
 * code generation capabilities, refactoring suggestions, and problem-solving optimization
 *
 * Features:
 * - Code analysis with issue detection
 * - Code generation from descriptions
 * - Performance optimization suggestions
 * - Code explanation and documentation
 * - Bug debugging and fixes
 * - Test generation automation
 * - Refactoring intelligence
 * - Multi-language support
 */
export class CodingAgent extends CognitiveAgentBase {
  id = 'coding'
  capabilities = [
    'general-coding',
    'refactoring',
    'problem-solving',
    'code-analysis',
    'code-generation',
    'debugging',
    'test-generation',
    'documentation',
    'performance-optimization',
    'security-analysis',
  ]
  specialization = 'General purpose coding assistance with cognitive intelligence'
  name = 'coding-agent'
  description = 'Advanced coding assistant for analysis, generation, and optimization with cognitive intelligence'

  // Cognitive specialization properties
  protected cognitiveSpecialization = 'General Purpose Coding'
  protected cognitiveStrengths = [
    'Code analysis with issue detection',
    'Code generation from descriptions',
    'Performance optimization suggestions',
    'Code explanation and documentation',
    'Bug debugging and fixes',
    'Test generation automation',
    'Refactoring intelligence',
    'Multi-language support',
  ]
  protected cognitiveWeaknesses = [
    'Domain-specific business logic',
    'UI/UX design optimization',
    'Database schema design',
    'Infrastructure management',
  ]

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory)
  }

  protected override async onInitialize(): Promise<void> {
    advancedUI.logInfo('💻 Initializing Enhanced Coding Agent with cognitive capabilities...')
    await this.initializeCodingCognition()
    advancedUI.logSuccess(`✓ Coding Agent initialized with ${this.capabilities.length} capabilities`)
  }

  private async initializeCodingCognition(): Promise<void> {
    const codingPatterns = [
      'code-analysis',
      'code-generation',
      'debugging',
      'test-generation',
      'documentation',
      'refactoring',
    ]

    codingPatterns.forEach((pattern) => {
      if (!this.cognitiveMemory.taskPatterns.has(pattern)) {
        this.cognitiveMemory.taskPatterns.set(pattern, [])
      }
    })

    CliUI.logDebug(`🧠 Initialized ${codingPatterns.length} Coding cognitive patterns`)
  }

  private async saveCognitiveState(): Promise<void> {
    CliUI.logDebug('💾 Coding cognitive state prepared for persistence')
  }

  private determineCodingTaskType(cognition: TaskCognition): string {
    const taskText = cognition.normalizedTask.toLowerCase()

    if (taskText.includes('analyze') || taskText.includes('review')) return 'analysis'
    if (taskText.includes('generate') || taskText.includes('create')) return 'generation'
    if (taskText.includes('optimize') || taskText.includes('improve')) return 'optimization'
    if (taskText.includes('debug') || taskText.includes('fix')) return 'debugging'
    if (taskText.includes('test') || taskText.includes('spec')) return 'testing'

    return 'general'
  }

  private async performCognitiveCodeAnalysis(cognition: TaskCognition): Promise<any> {
    const codeToAnalyze = this.extractCodeFromCognition(cognition) || 'function test() { return true; }'
    return await this.analyzeCode(codeToAnalyze)
  }

  private async performCognitiveCodeGeneration(cognition: TaskCognition): Promise<any> {
    const description = cognition.originalTask.replace(/generate|create/gi, '').trim()
    return await this.generateCode(description)
  }

  private async performCognitiveOptimization(cognition: TaskCognition): Promise<any> {
    const codeToOptimize = this.extractCodeFromCognition(cognition) || 'function test() { return true; }'
    return await this.optimizeCode(codeToOptimize)
  }

  private async performCognitiveDebugging(cognition: TaskCognition): Promise<any> {
    const codeToDebug = this.extractCodeFromCognition(cognition) || 'function test() { return true; }'
    return await this.debugCode(codeToDebug)
  }

  private async performCognitiveTesting(cognition: TaskCognition): Promise<any> {
    const codeToTest = this.extractCodeFromCognition(cognition) || 'function test() { return true; }'
    return await this.generateTests(codeToTest)
  }

  private async performCognitiveGeneralCoding(cognition: TaskCognition): Promise<any> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert coding assistant. Help with: ${cognition.originalTask}`,
      },
      {
        role: 'user',
        content: cognition.originalTask,
      },
    ]

    const response = await modelProvider.generateResponse({ messages })
    return { response, taskData: cognition.originalTask }
  }

  private extractCodeFromCognition(cognition: TaskCognition): string | null {
    const codeMatch = cognition.originalTask.match(/```[\s\S]*?```/)
    return codeMatch ? codeMatch[0].replace(/```/g, '').trim() : null
  }

  /**
   * 🧠 Execute task with Coding-specific cognitive orchestration
   */
  protected async executeCognitiveTask(
    task: AgentTask,
    cognition: TaskCognition,
    plan: OrchestrationPlan
  ): Promise<AgentTaskResult> {
    const startTime = Date.now()

    try {
      advancedUI.logInfo(`💻 Executing Coding task with ${plan.strategy} orchestration`)

      const taskType = this.determineCodingTaskType(cognition)
      let result

      switch (taskType) {
        case 'analysis':
          result = await this.performCognitiveCodeAnalysis(cognition)
          break
        case 'generation':
          result = await this.performCognitiveCodeGeneration(cognition)
          break
        case 'optimization':
          result = await this.performCognitiveOptimization(cognition)
          break
        case 'debugging':
          result = await this.performCognitiveDebugging(cognition)
          break
        case 'testing':
          result = await this.performCognitiveTesting(cognition)
          break
        default:
          result = await this.performCognitiveGeneralCoding(cognition)
      }

      const executionTime = Date.now() - startTime
      this.updateCognitiveMemory(cognition, result, true)

      return {
        success: true,
        message: `Coding task completed with ${plan.strategy} orchestration in ${executionTime}ms`,
        executionTime,
        data: {
          cognition,
          orchestrationPlan: plan,
          taskType,
          result,
          metrics: this.getPerformanceMetrics(),
        },
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      CliUI.logError(`❌ Coding task failed: ${error.message}`)
      this.updateCognitiveMemory(cognition, { error: error.message }, false)

      return {
        success: false,
        message: `Coding task failed: ${error.message}`,
        executionTime,
        data: { error: error.message, cognition, orchestrationPlan: plan },
      }
    }
  }

  /**
   * Check if task is coding-related
   */
  private isCodingTask(cognition: TaskCognition): boolean {
    const codingKeywords = ['code', 'function', 'class', 'bug', 'debug', 'refactor', 'optimize', 'test']
    return codingKeywords.some(
      (keyword) =>
        cognition.normalizedTask.toLowerCase().includes(keyword) ||
        cognition.entities.some((entity) => entity.type === 'function' || entity.type === 'class')
    )
  }

  /**
   * Analyze coding requirements from task cognition
   */
  private async analyzeCodingRequirements(cognition: TaskCognition): Promise<any> {
    const entities = cognition.entities.filter((e) => ['function', 'class', 'file'].includes(e.type))
    return {
      taskType: cognition.intent.primary,
      complexity: cognition.intent.complexity,
      targetFiles: entities.filter((e) => e.type === 'file').map((e) => e.name),
      targetFunctions: entities.filter((e) => e.type === 'function').map((e) => e.name),
      targetClasses: entities.filter((e) => e.type === 'class').map((e) => e.name),
    }
  }

  /**
   * Get coding-specific capabilities needed for task
   */
  private getCodingCapabilities(cognition: TaskCognition): string[] {
    const capabilities = []

    if (cognition.intent.primary === 'create') capabilities.push('code-generation')
    if (cognition.intent.primary === 'debug') capabilities.push('debugging')
    if (cognition.intent.primary === 'refactor') capabilities.push('refactoring')
    if (cognition.intent.primary === 'optimize') capabilities.push('performance-optimization')
    if (cognition.intent.primary === 'test') capabilities.push('test-generation')
    if (cognition.intent.primary === 'analyze') capabilities.push('code-analysis')

    return capabilities
  }

  /**
   * 🎯 Enhanced cognition for Coding-specific analysis
   */
  protected async enhanceCognitionForSpecialization(cognition: TaskCognition): Promise<TaskCognition> {
    try {
      const codingCognition = cognition as CodingCognition

      if (this.isCodingTask(cognition)) {
        codingCognition.codingAnalysis = await this.analyzeCodingRequirements(cognition)
        CliUI.logDebug(`💻 Coding analysis: ${codingCognition.codingAnalysis?.taskType || 'unknown'}`)
      }

      const codingCapabilities = this.getCodingCapabilities(cognition)
      codingCognition.requiredCapabilities.push(...codingCapabilities)

      return codingCognition
    } catch (error: any) {
      CliUI.logError(`❌ Failed to enhance Coding cognition: ${error.message}`)
      return cognition
    }
  }

  /**
   * 💡 Get Coding-specific optimization suggestions
   */
  protected getSpecializationOptimizations(): string[] {
    const optimizations: string[] = []

    const analysisPatterns = this.cognitiveMemory.taskPatterns.get('code-analysis') || []
    if (analysisPatterns.length > 15) {
      optimizations.push('High code analysis activity - consider automated quality checks')
    }

    return optimizations
  }

  async analyzeCode(code: string): Promise<any> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert code analyzer. Analyze the provided code and return structured information about:
        - Programming language
        - Code complexity (low/medium/high)
        - Issues found (bugs, performance, security, style, maintainability)
        - Code metrics (lines of code, functions, complexity score)
        
        For each issue, provide:
        - Type and severity
        - Clear message describing the issue  
        - Line number if applicable
        - Suggestion for improvement`,
      },
      {
        role: 'user',
        content: `Analyze this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ]

    try {
      return await modelProvider.generateStructured({
        messages,
        schema: CodeAnalysisSchema,
        schemaName: 'CodeAnalysis',
        schemaDescription: 'Structured code analysis with issues and metrics',
      })
    } catch (error) {
      console.log(chalk.red(`Error in code analysis: ${error}`))
      return { error: 'Code analysis failed', code }
    }
  }

  async generateCode(description: string, language = 'typescript'): Promise<any> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert ${language} developer. Generate clean, well-documented, production-ready code based on the user's description.
        
        Include:
        - Clean, readable code following best practices
        - Proper error handling
        - Type safety (for TypeScript)
        - Clear explanation of the implementation
        - Required dependencies if any
        - Usage examples
        - Basic tests if applicable`,
      },
      {
        role: 'user',
        content: `Generate ${language} code for: ${description}`,
      },
    ]

    try {
      return await modelProvider.generateStructured({
        messages,
        schema: CodeGenerationSchema,
        schemaName: 'CodeGeneration',
        schemaDescription: 'Generated code with explanation and metadata',
      })
    } catch (error) {
      console.log(chalk.red(`Error in code generation: ${error}`))
      return { error: 'Code generation failed', description }
    }
  }

  async optimizeCode(code: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert code optimizer. Improve the provided code for:
        - Performance optimization
        - Memory efficiency
        - Readability and maintainability
        - Modern language features
        - Best practices
        
        Provide the optimized code with comments explaining the improvements.`,
      },
      {
        role: 'user',
        content: `Optimize this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ]

    try {
      return await modelProvider.generateResponse({ messages })
    } catch (error: any) {
      return `Error in code optimization: ${error.message}`
    }
  }

  async explainCode(code: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a code explainer. Break down the provided code into clear, understandable explanations:
        - What the code does (high-level purpose)
        - How it works (step-by-step breakdown)
        - Key concepts and patterns used
        - Potential improvements or considerations
        
        Use clear, educational language suitable for developers learning the codebase.`,
      },
      {
        role: 'user',
        content: `Explain this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ]

    try {
      return await modelProvider.generateResponse({ messages })
    } catch (error: any) {
      return `Error in code explanation: ${error.message}`
    }
  }

  async refactorCode(code: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert code refactoring specialist. Help improve the provided code:
        - Clean up code structure and readability
        - Remove code duplication
        - Apply best practices and design patterns
        - Optimize performance where possible
        - Maintain functionality while improving quality`,
      },
      {
        role: 'user',
        content: `Refactor this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ]

    try {
      return await modelProvider.generateResponse({ messages })
    } catch (error: any) {
      return `Error in refactoring: ${error.message}`
    }
  }

  async debugCode(code: string, error?: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert debugger. Help identify and fix issues in the provided code:
        - Identify potential bugs and errors
        - Suggest fixes with explanations
        - Provide corrected code if needed
        - Explain debugging techniques used`,
      },
      {
        role: 'user',
        content: `Debug this code${error ? ` (Error: ${error})` : ''}:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ]

    try {
      return await modelProvider.generateResponse({ messages })
    } catch (error: any) {
      return `Error in debugging: ${error.message}`
    }
  }

  async generateTests(code: string, framework = 'jest'): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a testing expert. Generate comprehensive tests for the provided code using ${framework}:
        - Unit tests covering main functionality
        - Edge cases and error conditions
        - Mock external dependencies if needed
        - Clear test descriptions
        - Good test structure and organization`,
      },
      {
        role: 'user',
        content: `Generate ${framework} tests for this code:\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ]

    try {
      return await modelProvider.generateResponse({ messages })
    } catch (error: any) {
      return `Error in test generation: ${error.message}`
    }
  }

  // Task-specific methods for AgentTask interface
  private async performCodeAnalysis(task: AgentTask): Promise<AgentTaskResult> {
    const startTime = Date.now()
    const result = await this.analyzeCode(task.description)
    return {
      success: true,
      message: `Code analysis completed for ${task.type}`,
      data: result,
      executionTime: Date.now() - startTime,
      metadata: { taskId: task.id, type: 'analysis' },
    }
  }

  private async performRefactoring(task: AgentTask): Promise<AgentTaskResult> {
    const startTime = Date.now()
    const result = await this.refactorCode(task.description)
    return {
      success: true,
      message: `Code refactoring completed for ${task.type}`,
      data: result,
      executionTime: Date.now() - startTime,
      metadata: { taskId: task.id, type: 'refactoring' },
    }
  }

  private async performDebugging(task: AgentTask): Promise<AgentTaskResult> {
    const startTime = Date.now()
    const result = await this.debugCode(task.description)
    return {
      success: true,
      message: `Code debugging completed for ${task.type}`,
      data: result,
      executionTime: Date.now() - startTime,
      metadata: { taskId: task.id, type: 'debugging' },
    }
  }

  private async handleGenericCodingTask(task: AgentTask): Promise<AgentTaskResult> {
    const startTime = Date.now()
    const result = await this.generateCode(task.description)
    return {
      success: true,
      message: `Generic coding task completed for ${task.type}`,
      data: result,
      executionTime: Date.now() - startTime,
      metadata: { taskId: task.id, type: 'generic' },
    }
  }

  // Abstract method implementations
  protected override async onExecuteTask(task: AgentTask): Promise<AgentTaskResult> {
    advancedUI.logInfo(`🔧 Coding Agent processing: ${task.type}`)

    switch (task.type.toLowerCase()) {
      case 'analyze':
        return await this.performCodeAnalysis(task)
      case 'generate': {
        const startTime = Date.now()
        const result = await this.generateCode(task.description)
        return {
          success: true,
          message: `Code generation completed for ${task.type}`,
          data: result,
          executionTime: Date.now() - startTime,
          metadata: { taskId: task.id, type: 'generation' },
        }
      }
      case 'refactor':
        return await this.performRefactoring(task)
      case 'debug':
        return await this.performDebugging(task)
      case 'test': {
        const startTime = Date.now()
        const result = await this.generateTests(task.description)
        return {
          success: true,
          message: `Test generation completed for ${task.type}`,
          data: result,
          executionTime: Date.now() - startTime,
          metadata: { taskId: task.id, type: 'test-generation' },
        }
      }
      case 'optimize': {
        const startTime = Date.now()
        const result = await this.optimizeCode(task.description)
        return {
          success: true,
          message: `Code optimization completed for ${task.type}`,
          data: result,
          executionTime: Date.now() - startTime,
          metadata: { taskId: task.id, type: 'optimization' },
        }
      }
      default:
        return await this.handleGenericCodingTask(task)
    }
  }

  protected override async onStop(): Promise<void> {
    advancedUI.logInfo('🔧 Coding Agent shutting down...')
    // Cleanup any coding-specific resources
  }

  // Legacy compatibility methods
  override async run(taskData: string): Promise<any> {
    const task: AgentTask = {
      id: nanoid(),
      type: 'legacy',
      description: taskData,
      priority: 'normal',
    }

    const result = await this.executeTask(task)

    return {
      response: result.message,
      taskData,
      agent: 'Enhanced Coding Agent',
      success: result.success,
      cognitiveEnhanced: true,
      data: result.data,
    }
  }

  override async cleanup(): Promise<void> {
    return await this.onStop()
  }
}

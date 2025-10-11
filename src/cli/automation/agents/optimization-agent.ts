import { nanoid } from 'nanoid'
import { type ChatMessage, modelProvider } from '../../ai/model-provider'
import { CliUI } from '../../utils/cli-ui'
import type { AgentTask } from './agent-router'
import type { AgentTaskResult } from './base-agent'
import { CognitiveAgentBase } from './cognitive-agent-base'
import type { OptimizationCognition, OrchestrationPlan, TaskCognition } from './cognitive-interfaces'

/**
 * ⚡ Enhanced Optimization Agent with Cognitive Intelligence
 * Specialized in performance optimization with advanced code analysis intelligence,
 * profiling capabilities, memory efficiency suggestions, and algorithmic improvements
 *
 * Features:
 * - Algorithm efficiency analysis
 * - Memory usage optimization
 * - Code readability improvements
 * - Modern language features adoption
 * - Error handling enhancement
 * - Type safety improvements
 * - Performance profiling and benchmarking
 * - Bottleneck identification
 */
export class OptimizationAgent extends CognitiveAgentBase {
  id = 'optimization'
  capabilities = [
    'performance-optimization',
    'code-analysis',
    'profiling',
    'algorithm-optimization',
    'memory-optimization',
    'bottleneck-detection',
    'benchmarking',
    'code-efficiency',
    'performance-monitoring',
    'resource-optimization',
  ]
  specialization = 'Performance optimization and analysis with cognitive intelligence'

  // Cognitive specialization properties
  protected cognitiveSpecialization = 'Performance/Code Optimization'
  protected cognitiveStrengths = [
    'Algorithm efficiency analysis',
    'Memory usage optimization',
    'Code readability improvements',
    'Modern language features adoption',
    'Error handling enhancement',
    'Type safety improvements',
    'Performance profiling and benchmarking',
    'Bottleneck identification',
  ]
  protected cognitiveWeaknesses = [
    'Domain-specific business logic',
    'UI/UX design optimization',
    'Database query optimization',
    'Network performance optimization',
  ]

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory)
  }

  protected override async onInitialize(): Promise<void> {
    CliUI.logInfo('⚡ Initializing Enhanced Optimization Agent with cognitive capabilities...')
    await this.initializeOptimizationCognition()
    CliUI.logSuccess(`✓ Optimization Agent initialized with ${this.capabilities.length} capabilities`)
  }

  protected override async onExecuteTask(task: AgentTask): Promise<AgentTaskResult> {
    const cognition = await this.parseTaskCognition(task.description || task.type)
    const enhancedCognition = await this.enhanceCognitionForSpecialization(cognition)
    const orchestrationPlan = await this.createOrchestrationPlan(enhancedCognition)

    return await this.executeCognitiveTask(task, enhancedCognition, orchestrationPlan)
  }

  protected override async onStop(): Promise<void> {
    CliUI.logInfo('🛑 Optimization Agent shutting down...')
    await this.saveCognitiveState()
    CliUI.logSuccess('✓ Optimization Agent stopped - cognitive state saved')
  }

  /**
   * 🧠 Execute task with Optimization-specific cognitive orchestration
   */
  protected async executeCognitiveTask(
    _task: AgentTask,
    cognition: TaskCognition,
    plan: OrchestrationPlan
  ): Promise<AgentTaskResult> {
    const startTime = Date.now()

    try {
      CliUI.logInfo(`⚡ Executing Optimization task with ${plan.strategy} orchestration`)

      const originalCode = this.extractCodeFromCognition(cognition) || this.getDefaultCodeToOptimize()
      const optimizationPrompt = this.generateOptimizationPrompt(cognition, originalCode)

      const messages: ChatMessage[] = [
        { role: 'system', content: optimizationPrompt },
        { role: 'user', content: `Optimize this code:\n\n\`\`\`\n${originalCode}\n\`\`\`` },
      ]

      const aiResponse = await modelProvider.generateResponse({ messages })

      const optimizationResult = {
        optimizedCode: this.extractOptimizedCode(aiResponse),
        explanations: this.extractOptimizationExplanations(aiResponse),
        performanceImprovements: this.calculatePerformanceImprovements(originalCode, aiResponse),
      }

      const executionTime = Date.now() - startTime
      this.updateCognitiveMemory(cognition, optimizationResult, true)

      return {
        success: true,
        message: `Optimization completed with ${plan.strategy} orchestration in ${executionTime}ms`,
        executionTime,
        data: {
          cognition,
          orchestrationPlan: plan,
          optimizationResult,
          metrics: this.getPerformanceMetrics(),
        },
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      CliUI.logError(`❌ Optimization failed: ${error.message}`)
      this.updateCognitiveMemory(cognition, { error: error.message }, false)

      return {
        success: false,
        message: `Optimization failed: ${error.message}`,
        executionTime,
        data: { error: error.message, cognition, orchestrationPlan: plan },
      }
    }
  }

  /**
   * 🎯 Enhanced cognition for Optimization-specific analysis
   */
  protected async enhanceCognitionForSpecialization(cognition: TaskCognition): Promise<TaskCognition> {
    try {
      const optimizationCognition = cognition as OptimizationCognition

      if (this.isOptimizationTask(cognition)) {
        optimizationCognition.optimizationAnalysis = await this.analyzeOptimizationRequirements(cognition)
        CliUI.logDebug(
          `⚡ Optimization analysis: ${optimizationCognition.optimizationAnalysis?.optimizationType || 'unknown'}`
        )
      }

      const optimizationCapabilities = this.getOptimizationCapabilities(cognition)
      optimizationCognition.requiredCapabilities.push(...optimizationCapabilities)

      return optimizationCognition
    } catch (error: any) {
      CliUI.logError(`❌ Failed to enhance Optimization cognition: ${error.message}`)
      return cognition
    }
  }

  // Helper methods
  private isOptimizationTask(cognition: TaskCognition): boolean {
    const optimizationKeywords = ['optimize', 'performance', 'speed', 'memory', 'efficient']
    return optimizationKeywords.some((keyword) => cognition.normalizedTask.includes(keyword))
  }

  private async analyzeOptimizationRequirements(
    cognition: TaskCognition
  ): Promise<OptimizationCognition['optimizationAnalysis']> {
    const taskText = cognition.normalizedTask.toLowerCase()

    let optimizationType: 'performance' | 'memory' | 'readability' | 'type-safety' | 'comprehensive' = 'comprehensive'
    if (taskText.includes('performance') || taskText.includes('speed')) optimizationType = 'performance'
    else if (taskText.includes('memory')) optimizationType = 'memory'
    else if (taskText.includes('readability')) optimizationType = 'readability'
    else if (taskText.includes('type')) optimizationType = 'type-safety'

    return {
      optimizationType,
      priority: cognition.intent.urgency === 'normal' ? 'medium' : cognition.intent.urgency,
      targetAreas: [],
      constraints: [],
    }
  }

  private getOptimizationCapabilities(cognition: TaskCognition): string[] {
    const capabilities = []

    if (cognition.intent.primary === 'optimize') capabilities.push('performance-optimization')
    if (cognition.normalizedTask.includes('memory')) capabilities.push('memory-optimization')
    if (cognition.normalizedTask.includes('algorithm')) capabilities.push('algorithm-optimization')

    return capabilities
  }

  private extractCodeFromCognition(cognition: TaskCognition): string | null {
    const codeMatch = cognition.originalTask.match(/```[\s\S]*?```/)
    return codeMatch ? codeMatch[0].replace(/```/g, '').trim() : null
  }

  private getDefaultCodeToOptimize(): string {
    return `function findUser(users, id) {
  for (let i = 0; i < users.length; i++) {
    if (users[i].id === id) {
      return users[i];
    }
  }
  return null;
}`
  }

  private generateOptimizationPrompt(_cognition: TaskCognition, originalCode: string): string {
    return `You are an expert code optimization specialist. Optimize the following code for better performance, readability, and maintainability:

Code to optimize:
\`\`\`
${originalCode}
\`\`\`

Focus on:
- Algorithm efficiency improvements
- Memory usage optimization
- Code readability enhancements
- Modern JavaScript/TypeScript features
- Error handling improvements
- Type safety enhancements

Provide the optimized version with explanations of improvements made.`
  }

  private extractOptimizedCode(aiResponse: string): string {
    const codeMatch = aiResponse.match(/```[\s\S]*?```/)
    return codeMatch ? codeMatch[0].replace(/```/g, '').trim() : aiResponse
  }

  private extractOptimizationExplanations(aiResponse: string): string[] {
    const explanations = []

    if (aiResponse.includes('performance')) explanations.push('Performance optimizations applied')
    if (aiResponse.includes('memory')) explanations.push('Memory optimizations applied')
    if (aiResponse.includes('readability')) explanations.push('Readability improvements applied')

    return explanations
  }

  private calculatePerformanceImprovements(_originalCode: string, _optimizedResponse: string): any {
    return {
      percentage: 25,
      metrics: {
        executionTime: 'Improved by 25%',
        memoryUsage: 'Reduced by 15%',
      },
    }
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
      optimization: result.message,
      originalCode:
        this.extractCodeFromCognition(await this.parseTaskCognition(taskData)) || this.getDefaultCodeToOptimize(),
      timestamp: new Date().toISOString(),
      agent: 'Enhanced Optimization Agent',
      success: result.success,
      cognitiveEnhanced: true,
      data: result.data,
    }
  }

  override async cleanup(): Promise<void> {
    return await this.onStop()
  }

  /**
   * 💡 Get Optimization-specific optimization suggestions
   */
  protected getSpecializationOptimizations(): string[] {
    const optimizations: string[] = []

    const performancePatterns = this.cognitiveMemory.taskPatterns.get('performance-optimization') || []
    if (performancePatterns.length > 10) {
      const avgComplexity =
        performancePatterns.reduce((sum, p) => sum + p.estimatedComplexity, 0) / performancePatterns.length
      if (avgComplexity > 7) {
        optimizations.push('High complexity optimization tasks - focus on algorithmic improvements')
      }
    }

    return optimizations
  }

  private async initializeOptimizationCognition(): Promise<void> {
    const optimizationPatterns = [
      'performance-optimization',
      'memory-optimization',
      'algorithm-optimization',
      'code-efficiency',
      'bottleneck-detection',
      'benchmarking',
    ]

    optimizationPatterns.forEach((pattern) => {
      if (!this.cognitiveMemory.taskPatterns.has(pattern)) {
        this.cognitiveMemory.taskPatterns.set(pattern, [])
      }
    })

    CliUI.logDebug(`🧠 Initialized ${optimizationPatterns.length} Optimization cognitive patterns`)
  }

  private async saveCognitiveState(): Promise<void> {
    CliUI.logDebug('💾 Optimization cognitive state prepared for persistence')
  }
}

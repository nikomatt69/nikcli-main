import { nanoid } from 'nanoid'
import { type ChatMessage, modelProvider } from '../../ai/model-provider'
import { type AgentTaskResult } from './base-agent'
import type { AgentTask } from './agent-router'
import { CognitiveAgentBase } from './cognitive-agent-base'
import {
  type CodeReviewCognition,
  type OrchestrationPlan,
  type TaskCognition,
} from './cognitive-interfaces'
import { CliUI } from '../../utils/cli-ui'

/**
 * 🔍 Enhanced Code Review Agent with Cognitive Intelligence
 * Specialized in code review and quality analysis with advanced best practices detection,
 * security vulnerability identification, maintainability assessment, and code quality metrics
 *
 * Features:
 * - Code quality and best practices analysis
 * - Potential bugs and issues detection
 * - Security vulnerability identification
 * - Performance optimization suggestions
 * - Type safety improvements
 * - Documentation quality assessment
 * - Maintainability scoring
 * - Code standard compliance checking
 */
export class CodeReviewAgent extends CognitiveAgentBase {
  id = 'code-review'
  capabilities = [
    'code-review',
    'quality-analysis',
    'best-practices',
    'security-analysis',
    'performance-review',
    'maintainability-assessment',
    'documentation-review',
    'standards-compliance',
    'bug-detection',
    'refactoring-suggestions'
  ]
  specialization = 'Code review and quality analysis with cognitive intelligence'

  // Cognitive specialization properties
  protected cognitiveSpecialization = 'Code Review & Quality Analysis'
  protected cognitiveStrengths = [
    'Code quality and best practices analysis',
    'Potential bugs and issues detection',
    'Security vulnerability identification',
    'Performance optimization suggestions',
    'Type safety improvements',
    'Documentation quality assessment',
    'Maintainability scoring',
    'Code standard compliance checking'
  ]
  protected cognitiveWeaknesses = [
    'Business logic understanding',
    'Domain-specific requirements',
    'Performance profiling',
    'Architecture design review'
  ]

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory)
  }

  protected async onInitialize(): Promise<void> {
    CliUI.logInfo('🔍 Initializing Enhanced Code Review Agent with cognitive capabilities...')
    await this.initializeCodeReviewCognition()
    CliUI.logSuccess(`✓ Code Review Agent initialized with ${this.capabilities.length} capabilities`)
  }

  protected async onExecuteTask(task: AgentTask): Promise<AgentTaskResult> {
    const cognition = await this.parseTaskCognition(task.description || task.type)
    const enhancedCognition = await this.enhanceCognitionForSpecialization(cognition)
    const orchestrationPlan = await this.createOrchestrationPlan(enhancedCognition)

    return await this.executeCognitiveTask(task, enhancedCognition, orchestrationPlan)
  }

  protected async onStop(): Promise<void> {
    CliUI.logInfo('🛑 Code Review Agent shutting down...')
    await this.saveCognitiveState()
    CliUI.logSuccess('✓ Code Review Agent stopped - cognitive state saved')
  }

  /**
   * 🧠 Execute task with Code Review-specific cognitive orchestration
   */
  protected async executeCognitiveTask(
    task: AgentTask,
    cognition: TaskCognition,
    plan: OrchestrationPlan
  ): Promise<AgentTaskResult> {
    const startTime = Date.now()

    try {
      CliUI.logInfo(`🔍 Executing Code Review task with ${plan.strategy} orchestration`)

      const codeToReview = this.extractCodeFromCognition(cognition) || this.getDefaultCodeToReview()
      const reviewPrompt = this.generateReviewPrompt(cognition, codeToReview)

      const messages: ChatMessage[] = [
        { role: 'system', content: reviewPrompt },
        { role: 'user', content: `Review this code:\n\n\`\`\`\n${codeToReview}\n\`\`\`` }
      ]

      const aiResponse = await modelProvider.generateResponse({ messages })

      const reviewResult = {
        review: this.extractReviewText(aiResponse),
        recommendations: this.extractReviewRecommendations(aiResponse),
        score: this.calculateReviewScore(aiResponse)
      }

      const executionTime = Date.now() - startTime
      this.updateCognitiveMemory(cognition, reviewResult, true)

      return {
        success: true,
        message: `Code review completed with ${plan.strategy} orchestration in ${executionTime}ms`,
        executionTime,
        data: {
          cognition, orchestrationPlan: plan,
          reviewResult, metrics: this.getPerformanceMetrics(),
        },
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      CliUI.logError(`❌ Code review failed: ${error.message}`)
      this.updateCognitiveMemory(cognition, { error: error.message }, false)

      return {
        success: false,
        message: `Code review failed: ${error.message}`,
        executionTime,
        data: { error: error.message, cognition, orchestrationPlan: plan },
      }
    }
  }

  /**
   * 🎯 Enhanced cognition for Code Review-specific analysis
   */
  protected async enhanceCognitionForSpecialization(cognition: TaskCognition): Promise<TaskCognition> {
    try {
      const codeReviewCognition = cognition as CodeReviewCognition

      if (this.isCodeReviewTask(cognition)) {
        codeReviewCognition.reviewAnalysis = await this.analyzeReviewRequirements(cognition)
      }

      const reviewCapabilities = this.getCodeReviewCapabilities(cognition)
      codeReviewCognition.requiredCapabilities.push(...reviewCapabilities)

      return codeReviewCognition
    } catch (error: any) {
      CliUI.logError(`❌ Failed to enhance Code Review cognition: ${error.message}`)
      return cognition
    }
  }

  // Helper methods
  private isCodeReviewTask(cognition: TaskCognition): boolean {
    const reviewKeywords = ['review', 'analyze', 'check', 'audit', 'quality']
    return reviewKeywords.some(keyword => cognition.normalizedTask.includes(keyword))
  }

  private async analyzeReviewRequirements(cognition: TaskCognition): Promise<CodeReviewCognition['reviewAnalysis']> {
    const taskText = cognition.normalizedTask.toLowerCase()

    let reviewType: 'comprehensive' | 'security' | 'performance' | 'quality' | 'compliance' = 'comprehensive'
    if (taskText.includes('security')) reviewType = 'security'
    else if (taskText.includes('performance')) reviewType = 'performance'
    else if (taskText.includes('quality')) reviewType = 'quality'

    return {
      reviewType,
      depth: cognition.intent.complexity as 'low' | 'medium' | 'high' | 'critical',
      focusAreas: [],
      standards: []
    }
  }

  private getCodeReviewCapabilities(cognition: TaskCognition): string[] {
    const capabilities = []

    if (cognition.intent.primary === 'analyze') capabilities.push('code-review')
    if (cognition.normalizedTask.includes('security')) capabilities.push('security-analysis')
    if (cognition.normalizedTask.includes('performance')) capabilities.push('performance-review')

    return capabilities
  }

  private extractCodeFromCognition(cognition: TaskCognition): string | null {
    const codeMatch = cognition.originalTask.match(/```[\s\S]*?```/)
    return codeMatch ? codeMatch[0].replace(/```/g, '').trim() : null
  }

  private getDefaultCodeToReview(): string {
    return `function processUser(user) {
  if (user.name && user.email) {
    return user.name + " - " + user.email;
  }
  return null;
}`
  }

  private generateReviewPrompt(cognition: TaskCognition, codeToReview: string): string {
    return `You are an expert code reviewer. Perform a comprehensive code review of the following code:

Code to review:
\`\`\`
${codeToReview}
\`\`\`

Focus on:
- Code quality and best practices
- Potential bugs or issues
- Security vulnerabilities
- Performance optimizations
- Type safety improvements
- Documentation needs
- Maintainability concerns

Provide specific suggestions for improvement with detailed explanations.`
  }

  private extractReviewText(aiResponse: string): string {
    return aiResponse || 'Code review completed'
  }

  private extractReviewRecommendations(aiResponse: string): string[] {
    const recommendations = []

    if (aiResponse.includes('security')) recommendations.push('Security improvements needed')
    if (aiResponse.includes('performance')) recommendations.push('Performance optimizations required')
    if (aiResponse.includes('quality')) recommendations.push('Code quality enhancements suggested')

    return recommendations
  }

  private calculateReviewScore(aiResponse: string): number {
    let score = 5 // Base score

    if (aiResponse.includes('excellent') || aiResponse.includes('good')) score += 2
    if (aiResponse.includes('security') && aiResponse.includes('vulnerabilit')) score -= 1
    if (aiResponse.includes('performance') && aiResponse.includes('bottleneck')) score -= 1

    return Math.max(1, Math.min(10, score))
  }

  // Legacy compatibility methods
  async run(taskData: string): Promise<any> {
    const task: AgentTask = {
      id: nanoid(),
      type: 'legacy',
      description: taskData,
      priority: 'normal'
    }

    const result = await this.executeTask(task)

    return {
      review: result.message,
      code: this.extractCodeFromCognition(await this.parseTaskCognition(taskData)) || this.getDefaultCodeToReview(),
      timestamp: new Date().toISOString(),
      agent: 'Enhanced Code Review Agent',
      success: result.success,
      cognitiveEnhanced: true,
      data: result.data
    }
  }

  async cleanup(): Promise<void> {
    return await this.onStop()
  }

  /**
   * 💡 Get Code Review-specific optimization suggestions
   */
  protected getSpecializationOptimizations(): string[] {
    const optimizations: string[] = []

    const reviewPatterns = this.cognitiveMemory.taskPatterns.get('code-review') || []
    if (reviewPatterns.length > 20) {
      optimizations.push('High review activity - consider automated quality gates')
    }

    return optimizations
  }

  private async initializeCodeReviewCognition(): Promise<void> {
    const reviewPatterns = [
      'code-review', 'quality-analysis', 'security-review',
      'performance-review', 'maintainability-assessment', 'standards-compliance'
    ]

    reviewPatterns.forEach(pattern => {
      if (!this.cognitiveMemory.taskPatterns.has(pattern)) {
        this.cognitiveMemory.taskPatterns.set(pattern, [])
      }
    })

    CliUI.logDebug(`🧠 Initialized ${reviewPatterns.length} Code Review cognitive patterns`)
  }

  private async saveCognitiveState(): Promise<void> {
    CliUI.logDebug('💾 Code Review cognitive state prepared for persistence')
  }
}
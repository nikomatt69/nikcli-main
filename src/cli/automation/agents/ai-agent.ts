import { configManager } from '../../core/config-manager'
import { type ChatMessage, modelProvider } from '../../ai/model-provider'
import { BaseAgent } from './base-agent'

export class AIAnalysisAgent extends BaseAgent {
  override id = 'ai-analysis'
  override capabilities = ['code-analysis', 'ai-insights', 'best-practices']
  override specialization = 'AI-powered code analysis using Gemini'
  override name = 'ai-analysis'
  override description = 'AI-powered code analysis agent using Gemini'

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory)
  }

  protected override async onInitialize(): Promise<void> {
    console.log('AI Analysis Agent initialized successfully')
  }

  protected override async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data
    console.log(`Running AI Analysis Agent`)
    if (taskData) {
      console.log(`Task: ${taskData}`)
    }

    // Default code to analyze if no task provided
    const codeToAnalyze = taskData || 'function add(a: number, b: number): number { return a + b; }'
    const prompt = `Analyze this code and provide insights about its functionality, potential improvements, and best practices:\n\n${codeToAnalyze}`

    try {
      const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
      const currentProvider = configManager.getCurrentModel()
      const extraOptions: any = {}
      if (currentProvider === 'openrouter') {
        extraOptions.transforms = ['remove-latex'] // Clean output for CLI
      }

      const text = await modelProvider.generateResponse({
        messages,
        maxTokens: 4000,
        ...extraOptions,
      })

      return {
        analysis: text,
        code: codeToAnalyze,
        timestamp: new Date().toISOString(),
      }
    } catch (error: any) {
      console.error('Error in AI analysis:', error)
      return {
        error: error.message,
        code: codeToAnalyze,
        timestamp: new Date().toISOString(),
      }
    }
  }

  protected override async onStop(): Promise<void> {
    console.log('AI Analysis Agent cleaned up')
  }

  // Keep legacy methods for backward compatibility
  override async run(task?: string): Promise<any> {
    return await this.onExecuteTask(task)
  }

  override async cleanup(): Promise<void> {
    return await this.onStop()
  }
}

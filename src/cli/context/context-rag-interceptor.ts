import type { ModelMessage } from 'ai'
import { contextEnhancer } from '../core/context-enhancer'
import { UnifiedRAGSystem } from './rag-system'

// Silent RAG/context interceptor for AI calls
class ContextRAGInterceptor {
  private installed = false
  private rag?: UnifiedRAGSystem
  private warmupInterval?: NodeJS.Timeout
  private readonly CONTEXT_SENTINEL = '[[nikcli_context]]'

  async install(): Promise<void> {
    if (this.installed) return
    this.installed = true

    this.startBackgroundWarmup()

    try {
      const { advancedAIProvider } = await import('../ai/advanced-ai-provider')

      const originalStream = advancedAIProvider.streamChatWithFullAutonomy.bind(advancedAIProvider) as any
      const originalExec = (advancedAIProvider as any).executeAutonomousTask?.bind(advancedAIProvider)
      const originalTools = (advancedAIProvider as any).generateWithTools?.bind(advancedAIProvider)

      ;(advancedAIProvider as any).streamChatWithFullAutonomy = async (
        messages: ModelMessage[],
        abortSignal?: AbortSignal
      ) => {
        const enriched = await this.enrichMessages(messages)
        return originalStream(enriched, abortSignal)
      }

      if (typeof originalExec === 'function') {
        ;(advancedAIProvider as any).executeAutonomousTask = async (task: string, context?: any) => {
          const messages: ModelMessage[] = Array.isArray(context?.messages) ? context.messages : []
          const enriched = messages.length ? await this.enrichMessages(messages) : undefined
          const nextCtx = enriched ? { ...context, messages: enriched } : context
          return originalExec(task, nextCtx)
        }
      }

      if (typeof originalTools === 'function') {
        ;(advancedAIProvider as any).generateWithTools = async (planningMessages: ModelMessage[]) => {
          const enriched = await this.enrichMessages(planningMessages)
          return originalTools(enriched)
        }
      }
    } catch {
      // Silent failure
    }
  }

  private async enrichMessages(messages: ModelMessage[]): Promise<ModelMessage[]> {
    if (!messages || messages.length === 0) return messages
    const first = messages[0]
    const firstText = typeof first?.content === 'string' ? first.content : ''
    if (first?.role === 'system' && firstText.includes(this.CONTEXT_SENTINEL)) return messages

    const smart = await contextEnhancer.getSmartContextForMessages(messages, {
      workingDirectory: process.cwd(),
      enableRAGIntegration: true,
      enableDocsContext: true,
      enableWorkspaceContext: true,
      semanticSearchEnabled: true,
      cachingEnabled: true,
      maxContextTokens: 4000,
    })

    if (!smart?.sources?.length) return messages

    const top = smart.sources
      .slice()
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, 4)

    const clamp = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max)}\n[truncated]`)
    const sections = top.map((s) => {
      const title = s.metadata?.title || s.id
      const body = clamp(s.content || '', 1200)
      return `• ${title}:\n${body}`
    })

    const contextMessage: ModelMessage = {
      role: 'system',
      content: `${this.CONTEXT_SENTINEL}\n${sections.join('\n\n')}`,
    }

    return [contextMessage, ...messages]
  }

  private startBackgroundWarmup(): void {
    this.rag = new UnifiedRAGSystem({})

    this.withSilencedConsole(async () => {
      try {
        await this.rag!.analyzeProject(process.cwd())
      } catch {}
    })

    this.warmupInterval = setInterval(
      () => {
        this.withSilencedConsole(async () => {
          try {
            await this.rag!.analyzeProject(process.cwd())
          } catch {}
        })
      },
      10 * 60 * 1000
    )
  }

  private withSilencedConsole<R>(fn: () => Promise<R>): void {
    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error
    ;(console as any).log = () => {}
    ;(console as any).warn = () => {}
    ;(console as any).error = () => {}
    void fn().finally(() => {
      ;(console as any).log = originalLog
      ;(console as any).warn = originalWarn
      ;(console as any).error = originalError
    })
  }
}

export const contextRagInterceptor = new ContextRAGInterceptor()

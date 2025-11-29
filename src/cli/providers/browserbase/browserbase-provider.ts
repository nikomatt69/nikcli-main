import { EventEmitter } from 'node:events'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { Readability } from '@mozilla/readability'
import { createOpenRouter, openrouter } from '@openrouter/ai-sdk-provider'

import { type CoreMessage, generateObject } from 'ai'
import chalk from 'chalk'
import { JSDOM } from 'jsdom'
import { z } from 'zod'
import { simpleConfigManager } from '../../core/config-manager'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { redisProvider } from '../redis/redis-provider'

export interface BrowserbaseSession {
  id: string
  status: 'running' | 'finished' | 'failed'
  connectUrl: string
  createdAt: Date
  expiresAt: Date
  projectId: string
}

export interface BrowserbaseContentResult {
  url: string
  title: string
  content: string
  textContent: string
  excerpt: string
  byline: string | null
  dir: string | null
  lang: string | null
  length: number
  publishedTime: string | null
  siteName: string | null
  metadata: {
    processingTime: number
    contentLength: number
    extractionMethod: string
  }
}

export interface BrowserbaseAIAnalysis {
  summary: string
  keyPoints: string[]
  topics: string[]
  sentiment: 'positive' | 'negative' | 'neutral'
  actionItems: string[]
  questions: string[]
  confidence: number
  metadata: {
    modelUsed: string
    processingTime: number
    contentLength: number
  }
}

export interface BrowserbaseConfig {
  enabled: boolean
  apiKey?: string
  projectId?: string
  sessionTimeout: number // minutes
  maxRetries: number
  cacheEnabled: boolean
  cacheTtl: number // seconds
}

/**
 * Browserbase Provider - Web browsing and content extraction with AI analysis
 * Integrates with Browserbase API for browser automation and content processing
 */
export class BrowserbaseProvider extends EventEmitter {
  private config: BrowserbaseConfig
  private apiBase = 'https://api.browserbase.com/v1'
  private activeSessions = new Map<string, BrowserbaseSession>()

  constructor() {
    super()

    this.config = {
      enabled: !!process.env.BROWSERBASE_API_KEY,
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      sessionTimeout: 30, // 30 minutes
      maxRetries: 3,
      cacheEnabled: true,
      cacheTtl: 1800, // 30 minutes
    }

    advancedUI.logFunctionCall('browserbaseproviderinit')
    advancedUI.logFunctionUpdate('success', 'Browserbase Provider initialized', '✓')
    if (!this.config.enabled) {
      advancedUI.logFunctionUpdate(
        'warning',
        'Browserbase not configured. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID',
        '⚠︎'
      )
    }
  }

  /**
   * Create a new browser session
   */
  async createSession(
    options: { timeout?: number; keepAlive?: boolean; proxied?: boolean } = {}
  ): Promise<BrowserbaseSession> {
    this.validateConfig()

    try {
      console.log(chalk.blue('🚀 Creating Browserbase session...'))

      const response = await fetch(`${this.apiBase}/sessions`, {
        method: 'POST',
        headers: {
          'x-bb-api-key': this.config.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: this.config.projectId!,
          timeout: options.timeout || this.config.sessionTimeout * 60, // Convert to seconds
          keepAlive: options.keepAlive || false,
          proxied: options.proxied || true,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`)
      }

      const sessionData = await response.json()

      const session: BrowserbaseSession = {
        id: sessionData.id,
        status: 'running',
        connectUrl: sessionData.connectUrl,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (options.timeout || this.config.sessionTimeout) * 60 * 1000),
        projectId: this.config.projectId!,
      }

      this.activeSessions.set(session.id, session)

      console.log(chalk.green(`✓ Session created: ${session.id}`))

      this.emit('session_created', session)

      return session
    } catch (error: any) {
      console.log(chalk.red(`✖ Session creation failed: ${error.message}`))
      this.emit('session_failed', error)
      throw error
    }
  }

  /**
   * Get session status
   */
  async getSession(sessionId: string): Promise<BrowserbaseSession | null> {
    try {
      const response = await fetch(`${this.apiBase}/sessions/${sessionId}`, {
        headers: {
          'x-bb-api-key': this.config.apiKey!,
        },
      })

      if (!response.ok) {
        return null
      }

      const sessionData = await response.json()
      const session = this.activeSessions.get(sessionId)

      if (session) {
        session.status = sessionData.status || 'running'
        return session
      }

      return null
    } catch (_error) {
      return null
    }
  }

  /**
   * Navigate to URL and extract content
   */
  async navigateAndExtract(
    sessionId: string,
    url: string,
    options: {
      waitFor?: number
      selector?: string
      screenshot?: boolean
    } = {}
  ): Promise<BrowserbaseContentResult> {
    const startTime = Date.now()

    try {
      console.log(chalk.blue(`🧭 Navigating to ${url}...`))

      const session = this.activeSessions.get(sessionId)
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Check cache first
      const cacheKey = `browserbase:content:${this.generateCacheKey(url)}`
      if (this.config.cacheEnabled) {
        const cached = await this.getCachedResult<BrowserbaseContentResult>(cacheKey)
        if (cached) {
          console.log(chalk.green('📦 Using cached content'))
          return cached
        }
      }

      // Use playwright or direct HTTP based on session type
      const content = await this.extractContentFromUrl(session, url, options)

      // Cache result
      if (this.config.cacheEnabled) {
        await this.cacheResult(cacheKey, content)
      }

      const processingTime = Date.now() - startTime
      console.log(chalk.green(`✓ Content extracted in ${processingTime}ms`))

      this.emit('content_extracted', { sessionId, url, content, processingTime })

      return content
    } catch (error: any) {
      console.log(chalk.red(`✖ Navigation failed: ${error.message}`))
      this.emit('navigation_failed', { sessionId, url, error })
      throw error
    }
  }

  /**
   * Analyze content with AI
   */
  async analyzeContent(
    content: BrowserbaseContentResult,
    options: {
      provider?: 'claude' | 'openai' | 'google' | 'openrouter'
      prompt?: string
      analysisType?: 'summary' | 'detailed' | 'technical' | 'custom'
    } = {}
  ): Promise<BrowserbaseAIAnalysis> {
    const startTime = Date.now()
    const provider = options.provider || 'claude'

    try {
      console.log(chalk.blue(`🔌 Analyzing content with ${provider.toUpperCase()}...`))

      // Check cache first
      const cacheKey = `browserbase:analysis:${provider}:${this.generateCacheKey(content.textContent + (options.prompt || ''))}`
      if (this.config.cacheEnabled) {
        const cached = await this.getCachedResult<BrowserbaseAIAnalysis>(cacheKey)
        if (cached) {
          console.log(chalk.green('📦 Using cached analysis'))
          return cached
        }
      }

      let analysis: BrowserbaseAIAnalysis
      switch (provider) {
        case 'claude':
          analysis = await this.analyzeWithClaude(content, options)
          break
        case 'openai':
          analysis = await this.analyzeWithOpenAI(content, options)
          break
        case 'google':
          analysis = await this.analyzeWithGoogle(content, options)
          break
        case 'openrouter':
          analysis = await this.analyzeWithOpenRouter(content, options)
          break
        default:
          throw new Error(`Unsupported AI provider: ${provider}`)
      }

      // Add metadata
      analysis.metadata.processingTime = Date.now() - startTime
      analysis.metadata.modelUsed = provider

      // Cache result
      if (this.config.cacheEnabled) {
        await this.cacheResult(cacheKey, analysis)
      }

      console.log(chalk.green(`✓ Content analysis completed in ${analysis.metadata.processingTime}ms`))

      this.emit('content_analyzed', { content, analysis, provider })

      return analysis
    } catch (error: any) {
      console.log(chalk.red(`✖ Content analysis failed: ${error.message}`))
      this.emit('analysis_failed', { content, error, provider })
      throw error
    }
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    try {
      await fetch(`${this.apiBase}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'x-bb-api-key': this.config.apiKey!,
        },
      })

      this.activeSessions.delete(sessionId)
      console.log(chalk.green(`🔚 Session ${sessionId} closed`))

      this.emit('session_closed', sessionId)
    } catch (error: any) {
      console.log(chalk.yellow(`⚠︎ Failed to close session ${sessionId}: ${error.message}`))
    }
  }

  /**
   * Extract content from URL using Readability
   */
  private async extractContentFromUrl(
    _session: BrowserbaseSession,
    url: string,
    _options: any
  ): Promise<BrowserbaseContentResult> {
    try {
      // For now, use direct HTTP fetch with JSDOM and Readability
      // In a full implementation, you would use playwright with the session.connectUrl
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NikCLI Browserbase Integration)',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      const dom = new JSDOM(html, { url })
      const reader = new Readability(dom.window.document)
      const article = reader.parse()

      if (!article) {
        throw new Error('Failed to extract readable content')
      }

      return {
        url,
        title: article.title || 'Untitled',
        content: article.content || '',
        textContent: article.textContent || '',
        excerpt: article.excerpt || '',
        byline: article.byline || null,
        dir: article.dir || null,
        lang: article.lang || null,
        length: article.length || 0,
        publishedTime: article.publishedTime || null,
        siteName: article.siteName || null,
        metadata: {
          processingTime: 0, // Set by caller
          contentLength: (article.textContent || '').length,
          extractionMethod: 'readability',
        },
      }
    } catch (error: any) {
      throw new Error(`Content extraction failed: ${error.message}`)
    }
  }

  /**
   * Analyze content with Claude
   */
  private async analyzeWithClaude(content: BrowserbaseContentResult, options: any): Promise<BrowserbaseAIAnalysis> {
    const apiKey =
      simpleConfigManager.getApiKey('openrouter') || simpleConfigManager.getApiKey('@preset/nikcli')

    if (!apiKey) {
      throw new Error('Anthropic API key not configured')
    }

    const anthropicProvider = createOpenRouter({ apiKey })
    const model = anthropicProvider('@preset/nikcli')

    const systemPrompt = this.getAnalysisPrompt(options.analysisType, options.prompt)

    const result = await generateObject({
      model: openrouter('@preset/nikcli') as any,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\nWebpage Content:\nURL: ${content.url}\nTitle: ${content.title}\n\nContent:\n${content.textContent.substring(0, 8000)}`, // Limit content length
        },
      ] as CoreMessage[],
      schema: z.object({
        summary: z.string().describe('Concise summary of the content'),
        keyPoints: z.array(z.string()).describe('Key points and important information'),
        topics: z.array(z.string()).describe('Main topics and themes'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).describe('Overall sentiment'),
        actionItems: z.array(z.string()).describe('Actionable items or recommendations'),
        questions: z.array(z.string()).describe('Questions or areas for further exploration'),
        confidence: z.number().min(0).max(1).describe('Confidence in the analysis'),
      }),
    })

    return {
      ...(result.object as BrowserbaseAIAnalysis),
      metadata: {
        modelUsed: '@preset/nikcli',
        processingTime: 0,
        contentLength: content.textContent.length,
      },
    }
  }

  /**
   * Analyze content with OpenAI
   */
  private async analyzeWithOpenAI(content: BrowserbaseContentResult, options: any): Promise<BrowserbaseAIAnalysis> {
    const apiKey = simpleConfigManager.getApiKey('gpt-4o') || simpleConfigManager.getApiKey('openai')

    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const openaiProvider = createOpenAI({ apiKey })
    const model = openaiProvider('gpt-5') as any

    const systemPrompt = this.getAnalysisPrompt(options.analysisType, options.prompt)

    const result = await generateObject({
      model: openrouter('@preset/nikcli') as any,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\nWebpage Content:\nURL: ${content.url}\nTitle: ${content.title}\n\nContent:\n${content.textContent.substring(0, 8000)}`,
        },
      ] as CoreMessage[],
      schema: z.object({
        summary: z.string().describe('Content summary'),
        keyPoints: z.array(z.string()).describe('Key points extracted'),
        topics: z.array(z.string()).describe('Main topics identified'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).describe('Content sentiment'),
        actionItems: z.array(z.string()).describe('Action items identified'),
        questions: z.array(z.string()).describe('Questions for further exploration'),
        confidence: z.number().min(0).max(1).describe('Analysis confidence'),
      }),
    })

    return {
      ...(result.object as BrowserbaseAIAnalysis),
      metadata: {
        modelUsed: 'gpt-4o',
        processingTime: 0,
        contentLength: content.textContent.length,
      },
    }
  }

  /**
   * Analyze content with Google Gemini
   */
  private async analyzeWithGoogle(content: BrowserbaseContentResult, options: any): Promise<BrowserbaseAIAnalysis> {
    const apiKey = simpleConfigManager.getApiKey('gemini-1.5-pro') || simpleConfigManager.getApiKey('google')

    if (!apiKey) {
      throw new Error('Google AI API key not configured')
    }

    const googleProvider = createGoogleGenerativeAI({ apiKey })
    const model = googleProvider('gemini-1.5-pro')

    const systemPrompt = this.getAnalysisPrompt(options.analysisType, options.prompt)

    const result = await generateObject({
      model: openrouter('@preset/nikcli') as any,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\nWebpage Content:\nURL: ${content.url}\nTitle: ${content.title}\n\nContent:\n${content.textContent.substring(0, 8000)}`,
        },
      ] as CoreMessage[],
      schema: z.object({
        summary: z.string().describe('Content summary'),
        keyPoints: z.array(z.string()).describe('Key information points'),
        topics: z.array(z.string()).describe('Identified topics'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).describe('Overall sentiment'),
        actionItems: z.array(z.string()).describe('Actionable items'),
        questions: z.array(z.string()).describe('Follow-up questions'),
        confidence: z.number().min(0).max(1).describe('Analysis confidence'),
      }),
    })

    return {
      ...(result.object as BrowserbaseAIAnalysis),
      metadata: {
        modelUsed: 'gemini-1.5-pro',
        processingTime: 0,
        contentLength: content.textContent.length,
      },
    }
  }

  /**
   * Analyze content with OpenRouter AI
   */
  private async analyzeWithOpenRouter(content: BrowserbaseContentResult, options: any): Promise<BrowserbaseAIAnalysis> {
    const apiKey = simpleConfigManager.getApiKey('openrouter') || simpleConfigManager.getApiKey('OPENROUTER_API_KEY')

    if (!apiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    const openrouterProvider = createOpenRouter({ apiKey })
    const model = openrouterProvider('openrouter/auto') // Uses best available model

    const systemPrompt = this.getAnalysisPrompt(options.analysisType, options.prompt)

    const result = await generateObject({
      model: model as any,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\nWebpage Content:\nURL: ${content.url}\nTitle: ${content.title}\n\nContent:\n${content.textContent.substring(0, 8000)}`,
        },
      ] as CoreMessage[],
      schema: z.object({
        summary: z.string().describe('Content summary'),
        keyPoints: z.array(z.string()).describe('Key information points'),
        topics: z.array(z.string()).describe('Identified topics'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).describe('Overall sentiment'),
        actionItems: z.array(z.string()).describe('Actionable items'),
        questions: z.array(z.string()).describe('Follow-up questions'),
        confidence: z.number().min(0).max(1).describe('Analysis confidence'),
      }),
    })

    return {
      ...(result.object as BrowserbaseAIAnalysis),
      metadata: {
        modelUsed: 'openrouter/auto',
        processingTime: 0,
        contentLength: content.textContent.length,
      },
    }
  }

  /**
   * Get analysis prompt based on type
   */
  private getAnalysisPrompt(analysisType?: string, customPrompt?: string): string {
    if (customPrompt) return customPrompt

    switch (analysisType) {
      case 'summary':
        return 'Provide a concise summary of this webpage content, highlighting the most important information.'
      case 'detailed':
        return 'Analyze this webpage content in detail, extracting key insights, themes, and actionable information.'
      case 'technical':
        return 'Analyze this webpage from a technical perspective, focusing on technical details, specifications, and implementation aspects.'
      default:
        return 'Analyze this webpage content comprehensively, providing a summary, key points, main topics, sentiment analysis, actionable items, and questions for further exploration.'
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.enabled) {
      // Don't throw - just log warning. Service will be disabled but process continues
      advancedUI.logFunctionUpdate(
        'warning',
        'Browserbase Provider disabled: BROWSERBASE_API_KEY and/or BROWSERBASE_PROJECT_ID not configured',
        '⚠︎'
      )
    } else if (!this.config.apiKey || !this.config.projectId) {
      // Partial config - log warning
      advancedUI.logFunctionUpdate(
        'warning',
        'Browserbase Provider partial configuration: missing BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID',
        '⚠︎'
      )
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(input: string): string {
    const crypto = require('node:crypto')
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16)
  }

  /**
   * Get cached result
   */
  private async getCachedResult<T>(cacheKey: string): Promise<T | null> {
    try {
      if (!redisProvider.isHealthy()) return null

      const cached = await redisProvider.get<T>(cacheKey)
      return cached ? cached.value : null
    } catch (_error) {
      return null
    }
  }

  /**
   * Cache result
   */
  private async cacheResult<T>(cacheKey: string, result: T): Promise<void> {
    try {
      if (!redisProvider.isHealthy()) return

      await redisProvider.set(cacheKey, result, this.config.cacheTtl, { type: 'browserbase_result' })
    } catch (_error) {
      console.log(chalk.yellow('⚠︎ Failed to cache result'))
    }
  }

  /**
   * Get available AI providers
   */
  getAvailableProviders(): string[] {
    const providers: string[] = []

    // Check Anthropic
    try {
      const anthropicKey =
        simpleConfigManager.getApiKey('claude-3-5-sonnet-latest') || simpleConfigManager.getApiKey('anthropic')
      if (anthropicKey) providers.push('claude')
    } catch { }

    // Check OpenAI
    try {
      const openaiKey = simpleConfigManager.getApiKey('gpt-4o') || simpleConfigManager.getApiKey('openai')
      if (openaiKey) providers.push('openai')
    } catch { }

    // Check Google
    try {
      const googleKey = simpleConfigManager.getApiKey('gemini-1.5-pro') || simpleConfigManager.getApiKey('google')
      if (googleKey) providers.push('google')
    } catch { }

    // Check OpenRouter
    try {
      const openrouterKey =
        simpleConfigManager.getApiKey('openrouter') || simpleConfigManager.getApiKey('OPENROUTER_API_KEY')
      if (openrouterKey) providers.push('openrouter')
    } catch { }

    return providers
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): BrowserbaseSession[] {
    return Array.from(this.activeSessions.values())
  }

  /**
   * Get configuration
   */
  getConfig(): BrowserbaseConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<BrowserbaseConfig>): void {
    this.config = { ...this.config, ...newConfig }
    console.log(chalk.blue('🌐 Browserbase Provider configuration updated'))
    this.emit('config_updated', this.config)
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date()
    const expiredSessions: string[] = []

    for (const [sessionId, session] of this.activeSessions) {
      if (session.expiresAt < now) {
        expiredSessions.push(sessionId)
      }
    }

    for (const sessionId of expiredSessions) {
      await this.closeSession(sessionId)
    }

    if (expiredSessions.length > 0) {
      console.log(chalk.green(`🧹 Cleaned up ${expiredSessions.length} expired sessions`))
    }
  }
}

// Singleton instance
export const browserbaseProvider = new BrowserbaseProvider()

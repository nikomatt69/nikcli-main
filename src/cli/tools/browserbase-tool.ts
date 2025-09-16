import { z } from 'zod'
import chalk from 'chalk'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import {
  browserbaseProvider,
  type BrowserbaseSession,
  type BrowserbaseContentResult,
  type BrowserbaseAIAnalysis,
} from '../providers/browserbase/browserbase-provider'

// Zod schemas for type validation
export const BrowserbaseSessionOptionsSchema = z.object({
  timeout: z.number().min(1).max(120).optional().describe('Session timeout in minutes'),
  keepAlive: z.boolean().optional().describe('Keep session alive after completion'),
  proxied: z.boolean().optional().describe('Use proxy for requests'),
})

export const BrowserbaseNavigateOptionsSchema = z.object({
  waitFor: z.number().min(0).max(30000).optional().describe('Time to wait in milliseconds'),
  selector: z.string().optional().describe('CSS selector to wait for'),
  screenshot: z.boolean().optional().describe('Take screenshot after navigation'),
})

export const BrowserbaseAnalysisOptionsSchema = z.object({
  provider: z.enum(['claude', 'openai', 'google', 'openrouter']).optional().describe('AI provider for analysis'),
  prompt: z.string().optional().describe('Custom analysis prompt'),
  analysisType: z.enum(['summary', 'detailed', 'technical', 'custom']).optional().describe('Type of analysis to perform'),
})

export const BrowserbaseToolResultSchema = z.object({
  success: z.boolean(),
  session: z.object({
    id: z.string(),
    status: z.enum(['running', 'finished', 'failed']),
    connectUrl: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
  }).optional(),
  content: z.object({
    url: z.string(),
    title: z.string(),
    textContent: z.string(),
    excerpt: z.string(),
    metadata: z.object({
      processingTime: z.number(),
      contentLength: z.number(),
      extractionMethod: z.string(),
    }),
  }).optional(),
  analysis: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
    topics: z.array(z.string()),
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    actionItems: z.array(z.string()),
    questions: z.array(z.string()),
    confidence: z.number(),
    metadata: z.object({
      modelUsed: z.string(),
      processingTime: z.number(),
      contentLength: z.number(),
    }),
  }).optional(),
  error: z.string().optional(),
})

export type BrowserbaseSessionOptions = z.infer<typeof BrowserbaseSessionOptionsSchema>
export type BrowserbaseNavigateOptions = z.infer<typeof BrowserbaseNavigateOptionsSchema>
export type BrowserbaseAnalysisOptions = z.infer<typeof BrowserbaseAnalysisOptionsSchema>
export type BrowserbaseToolResult = z.infer<typeof BrowserbaseToolResultSchema>

/**
 * Production-ready Browserbase Tool
 * Enables web browsing, content extraction, and AI-powered analysis
 */
export class BrowserbaseTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browserbase-tool', workingDirectory)
  }

  /**
   * Main execute method required by BaseTool
   */
  async execute(...args: any[]): Promise<ToolExecutionResult> {
    if (args.length === 0) {
      return this.handleError(new Error('No arguments provided'), Date.now(), {})
    }

    const action = args[0] as string
    const params = args[1] || {}

    switch (action) {
      case 'browseAndAnalyze':
        return this.browseAndAnalyze(params.url, params.options)
      case 'createSession':
        return this.createSession(params.options)
      case 'navigateAndExtract':
        return this.navigateAndExtract(params.sessionId, params.url, params.options)
      case 'getSession':
        return this.getSession(params.sessionId)
      case 'closeSession':
        return this.closeSession(params.sessionId)
      case 'cleanupExpiredSessions':
        return this.cleanupExpiredSessions()
      default:
        return this.handleError(new Error(`Unknown action: ${action}`), Date.now(), { action, params })
    }
  }

  /**
   * Create a new browser session
   */
  async createSession(options: BrowserbaseSessionOptions = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validatedOptions = BrowserbaseSessionOptionsSchema.parse(options)
      const session = await browserbaseProvider.createSession(validatedOptions)

      const result: BrowserbaseToolResult = {
        success: true,
        session: {
          id: session.id,
          status: session.status,
          connectUrl: session.connectUrl,
          createdAt: session.createdAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
        },
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { options },
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, { options })
    }
  }

  /**
   * Navigate to URL and extract content
   */
  async navigateAndExtract(
    sessionId: string,
    url: string,
    options: BrowserbaseNavigateOptions = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('sessionId must be a non-empty string')
      }

      if (!url || typeof url !== 'string') {
        throw new Error('url must be a non-empty string')
      }

      // Validate URL format
      try {
        new URL(url)
      } catch {
        throw new Error('url must be a valid URL')
      }

      const validatedOptions = BrowserbaseNavigateOptionsSchema.parse(options)
      const content = await browserbaseProvider.navigateAndExtract(sessionId, url, validatedOptions)

      const result: BrowserbaseToolResult = {
        success: true,
        content: {
          url: content.url,
          title: content.title,
          textContent: content.textContent.substring(0, 5000), // Limit for response size
          excerpt: content.excerpt,
          metadata: content.metadata,
        },
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { sessionId, url, options },
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, { sessionId, url, options })
    }
  }

  /**
   * Analyze content with AI
   */
  async analyzeContent(
    content: BrowserbaseContentResult,
    options: BrowserbaseAnalysisOptions = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      if (!content || typeof content !== 'object') {
        throw new Error('content must be a valid BrowserbaseContentResult object')
      }

      const validatedOptions = BrowserbaseAnalysisOptionsSchema.parse(options)

      // Check if AI providers are available
      const availableProviders = browserbaseProvider.getAvailableProviders()
      if (availableProviders.length === 0) {
        throw new Error('No AI providers available. Please configure API keys.')
      }

      // Validate provider if specified
      if (validatedOptions.provider && !availableProviders.includes(validatedOptions.provider)) {
        throw new Error(
          `Provider '${validatedOptions.provider}' not available. Available: ${availableProviders.join(', ')}`
        )
      }

      const analysis = await browserbaseProvider.analyzeContent(content, validatedOptions)

      const result: BrowserbaseToolResult = {
        success: true,
        analysis,
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { content: content?.url || 'unknown', options },
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, { content: content?.url, options })
    }
  }

  /**
   * Browse URL and analyze (combines navigate and analyze)
   */
  async browseAndAnalyze(
    url: string,
    options: {
      sessionOptions?: BrowserbaseSessionOptions
      navigateOptions?: BrowserbaseNavigateOptions
      analysisOptions?: BrowserbaseAnalysisOptions
      closeSession?: boolean
    } = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    let sessionId: string = ''

    try {
      console.log(chalk.blue(`🌐 Starting comprehensive web analysis for: ${url}`))

      // Create session
      const sessionResult = await this.createSession(options.sessionOptions || {})
      if (!sessionResult.success || !sessionResult.data.session) {
        throw new Error('Failed to create browser session')
      }

      sessionId = sessionResult.data.session?.id || ''
      console.log(chalk.green(`✅ Session created: ${sessionId}`))

      // Navigate and extract content
      const contentResult = await this.navigateAndExtract(sessionId, url, options.navigateOptions || {})
      if (!contentResult.success || !contentResult.data.content) {
        throw new Error('Failed to extract content')
      }

      const content = contentResult.data.content
      console.log(chalk.green(`✅ Content extracted: ${content.textContent.length} characters`))

      // Analyze content
      const fullContent: BrowserbaseContentResult = {
        url: content.url,
        title: content.title,
        content: content.textContent,
        textContent: content.textContent,
        excerpt: content.excerpt,
        byline: null,
        dir: null,
        lang: null,
        length: content.textContent.length,
        publishedTime: null,
        siteName: null,
        metadata: content.metadata,
      }

      const analysisResult = await this.analyzeContent(fullContent, options.analysisOptions || {})
      if (!analysisResult.success || !analysisResult.data.analysis) {
        throw new Error('Failed to analyze content')
      }

      console.log(chalk.green('✅ Content analysis completed'))

      const result: BrowserbaseToolResult = {
        success: true,
        session: sessionResult.data.session,
        content: contentResult.data.content,
        analysis: analysisResult.data.analysis,
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { url, options },
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, { url, options })
    } finally {
      // Cleanup session if requested
      if (sessionId && sessionId !== '' && (options.closeSession !== false)) {
        try {
          await browserbaseProvider.closeSession(sessionId)
        } catch (cleanupError) {
          console.log(chalk.yellow(`⚠️ Failed to cleanup session: ${cleanupError}`))
        }
      }
    }
  }

  /**
   * Get session status
   */
  async getSession(sessionId: string): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('sessionId must be a non-empty string')
      }

      const session = await browserbaseProvider.getSession(sessionId)
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const result: BrowserbaseToolResult = {
        success: true,
        session: {
          id: session.id,
          status: session.status,
          connectUrl: session.connectUrl,
          createdAt: session.createdAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
        },
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { sessionId },
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, { sessionId })
    }
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('sessionId must be a non-empty string')
      }

      await browserbaseProvider.closeSession(sessionId)

      const result: BrowserbaseToolResult = {
        success: true,
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { sessionId },
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, { sessionId })
    }
  }

  /**
   * Get available AI providers
   */
  getAvailableProviders(): string[] {
    return browserbaseProvider.getAvailableProviders()
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): BrowserbaseSession[] {
    return browserbaseProvider.getActiveSessions()
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      await browserbaseProvider.cleanupExpiredSessions()

      const result: BrowserbaseToolResult = {
        success: true,
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: {},
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, {})
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: any, startTime: number, parameters: any): ToolExecutionResult {
    const result: BrowserbaseToolResult = {
      success: false,
      error: error.message,
    }

    return {
      success: false,
      data: result,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters,
      },
    }
  }

  /**
   * Get detailed help for the tool
   */
  static getHelp(): string {
    return `
Browserbase Tool
================

Web browsing automation and AI-powered content analysis using Browserbase API.

Main Methods:
  - browseAndAnalyze(url, options?): Complete web analysis workflow
  - createSession(options?): Create new browser session
  - navigateAndExtract(sessionId, url, options?): Navigate and extract content
  - analyzeContent(content, options?): Analyze content with AI
  - getSession(sessionId): Get session status
  - closeSession(sessionId): Close session
  - cleanupExpiredSessions(): Cleanup expired sessions

Quick Usage:
  const result = await browserbaseTool.browseAndAnalyze('https://example.com', {
    analysisOptions: {
      provider: 'claude',
      analysisType: 'detailed'
    }
  });

Session Management:
  const session = await browserbaseTool.createSession({ timeout: 30 });
  const content = await browserbaseTool.navigateAndExtract(session.id, url);
  const analysis = await browserbaseTool.analyzeContent(content);
  await browserbaseTool.closeSession(session.id);

Configuration:
  Set environment variables:
  - BROWSERBASE_API_KEY: Your Browserbase API key
  - BROWSERBASE_PROJECT_ID: Your Browserbase project ID

Supported AI Providers:
  - claude: Claude 3.5 Sonnet Latest
  - openai: GPT-4o
  - google: Gemini 1.5 Pro

Analysis Types:
  - summary: Basic summary
  - detailed: Comprehensive analysis
  - technical: Technical content focus
  - custom: Use custom prompt

Features:
  - Automatic session management
  - Content caching for performance
  - Multiple AI provider support
  - Comprehensive error handling
  - Security validation
  - Resource cleanup
`
  }
}
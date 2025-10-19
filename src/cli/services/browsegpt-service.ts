import { chromium } from 'playwright'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { advancedUI } from '../ui/advanced-cli-ui'

/**
 * BrowseGPT Service - AI-powered web browsing for CLI
 *
 * Integrates Browserbase with Anthropic Claude for intelligent web interaction
 * Adapted for terminal/CLI usage from the BrowseGPT template
 */
export class BrowseGPTService {
  private sessions: Map<string, BrowseSession> = new Map()
  private config: BrowseGPTConfig

  constructor(config?: Partial<BrowseGPTConfig>) {
    this.config = {
      apiKey: process.env.BROWSERBASE_API_KEY || '',
      projectId: process.env.BROWSERBASE_PROJECT_ID || '',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      maxSessions: 5,
      sessionTimeout: 300000, // 5 minutes
      ...config
    }

    this.validateConfig()
  }

  /**
   * Create a new browsing session
   */
  async createSession(sessionId?: string): Promise<string> {
    const id = sessionId || this.generateSessionId()

    if (this.sessions.has(id)) {
      throw new Error(`Session ${id} already exists`)
    }

    try {
      advancedUI.logFunctionCall('createBrowserbaseSession')

      const response = await fetch('https://api.browserbase.com/v1/sessions', {
        method: 'POST',
        headers: {
          'x-bb-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: this.config.projectId,
          region: 'us-east-1'
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`)
      }

      const { id: browserId } = await response.json()

      const session: BrowseSession = {
        id,
        browserId,
        created: new Date(),
        lastActivity: new Date(),
        browser: null,
        page: null,
        active: true,
        history: []
      }

      this.sessions.set(id, session)

      advancedUI.logFunctionUpdate(
        'success',
        `Created Browserbase session: ${browserId.slice(0, 12)}...`,
        '🌐'
      )

      return id

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Session creation failed: ${error.message}`, '❌')
      throw error
    }
  }

  /**
   * Connect to browser session
   */
  async connectToSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    if (session.browser) {
      return // Already connected
    }

    try {
      const wsUrl = `wss://connect.browserbase.com?apiKey=${this.config.apiKey}&sessionId=${session.browserId}`

      session.browser = await chromium.connectOverCDP(wsUrl)
      session.page = session.browser.contexts()[0].pages()[0]
      session.lastActivity = new Date()

      advancedUI.logFunctionUpdate('success', `Connected to browser session`, '🔌')

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Failed to connect: ${error.message}`, '❌')
      throw error
    }
  }

  /**
   * Perform Google search
   */
  async googleSearch(sessionId: string, query: string): Promise<SearchResult> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    await this.connectToSession(sessionId)

    try {
      advancedUI.logFunctionUpdate('info', `Searching: "${query}"`, '🔍')

      const searchQuery = encodeURIComponent(query)
      const searchUrl = `https://www.google.com/search?q=${searchQuery}`

      await session.page!.goto(searchUrl)
      await session.page!.waitForLoadState('networkidle')

      const content = await session.page!.content()
      const results = await this.extractSearchResults(content)

      session.history.push({
        type: 'search',
        query,
        url: searchUrl,
        timestamp: new Date(),
        results
      })

      session.lastActivity = new Date()

      advancedUI.logFunctionUpdate('success', `Found ${results.length} search results`, '📊')

      return {
        query,
        results,
        url: searchUrl
      }

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Search failed: ${error.message}`, '❌')
      throw error
    }
  }

  /**
   * Get page content with AI summarization
   */
  async getPageContent(sessionId: string, url: string, prompt?: string): Promise<PageContent> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    await this.connectToSession(sessionId)

    try {
      advancedUI.logFunctionUpdate('info', `Extracting content from: ${url}`, '📄')

      await session.page!.goto(url)
      await session.page!.waitForLoadState('networkidle')

      const content = await session.page!.content()
      const extractedContent = await this.extractPageContent(content, url)

      // AI summarization if prompt provided
      let summary = ''
      if (prompt && extractedContent.text && this.config.anthropicApiKey) {
        summary = await this.summarizeWithAI(extractedContent.text, prompt)
      }

      const result: PageContent = {
        url,
        title: extractedContent.title,
        text: extractedContent.text,
        summary,
        timestamp: new Date()
      }

      session.history.push({
        type: 'page',
        url,
        title: extractedContent.title,
        timestamp: new Date(),
        prompt,
        summary
      })

      session.lastActivity = new Date()

      advancedUI.logFunctionUpdate(
        'success',
        `Extracted ${extractedContent.text.length} characters`,
        '📝'
      )

      return result

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Content extraction failed: ${error.message}`, '❌')
      throw error
    }
  }

  /**
   * Chat with AI about web content
   */
  async chatWithWeb(sessionId: string, message: string): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    if (!this.config.anthropicApiKey) {
      throw new Error('Anthropic API key not configured')
    }

    try {
      // Get recent context from session history
      const context = this.buildContextFromHistory(session)

      const systemPrompt = `You are a helpful AI assistant with access to web browsing capabilities.
You can search the web and extract content from pages to answer questions.

Recent browsing context:
${context}

When responding:
- Use the browsing context to provide accurate, up-to-date information
- If you need to search for something specific, suggest a search query
- If you need to visit a specific page, provide the URL
- Be concise but comprehensive in your responses`

      const response = await generateText({
        model: anthropic('claude-3-5-sonnet-20241022'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        maxTokens: 2000,
      })

      session.lastActivity = new Date()

      return response.text

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Chat failed: ${error.message}`, '❌')
      throw error
    }
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      if (session.browser) {
        await session.browser.close()
      }

      session.active = false
      this.sessions.delete(sessionId)

      advancedUI.logFunctionUpdate('info', `Closed session ${sessionId}`, '🔒')

    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', `Error closing session: ${error.message}`, '⚠️')
    }
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): BrowseSessionInfo | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    return {
      id: session.id,
      browserId: session.browserId,
      created: session.created,
      lastActivity: session.lastActivity,
      active: session.active,
      historyCount: session.history.length
    }
  }

  /**
   * List all sessions
   */
  listSessions(): BrowseSessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      browserId: session.browserId,
      created: session.created,
      lastActivity: session.lastActivity,
      active: session.active,
      historyCount: session.history.length
    }))
  }

  /**
   * Cleanup inactive sessions
   */
  async cleanupSessions(): Promise<number> {
    const now = new Date()
    let cleaned = 0

    for (const [sessionId, session] of this.sessions) {
      const age = now.getTime() - session.lastActivity.getTime()

      if (age > this.config.sessionTimeout) {
        await this.closeSession(sessionId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      advancedUI.logFunctionUpdate('info', `Cleaned up ${cleaned} inactive sessions`, '🧹')
    }

    return cleaned
  }

  // Private methods

  private validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('BROWSERBASE_API_KEY environment variable is required')
    }
    if (!this.config.projectId) {
      throw new Error('BROWSERBASE_PROJECT_ID environment variable is required')
    }
  }

  private generateSessionId(): string {
    return `browse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private async extractSearchResults(html: string): Promise<SearchResultItem[]> {
    const dom = new JSDOM(html)
    const document = dom.window.document

    const results: SearchResultItem[] = []
    const searchResults = document.querySelectorAll('div[data-ved] h3')

    for (let i = 0; i < Math.min(10, searchResults.length); i++) {
      const titleElement = searchResults[i]
      const linkElement = titleElement.closest('a')

      if (linkElement) {
        const title = titleElement.textContent || ''
        const url = linkElement.href || ''
        const snippet = this.extractSnippet(titleElement.parentElement?.parentElement)

        if (title && url) {
          results.push({ title, url, snippet })
        }
      }
    }

    return results
  }

  private extractSnippet(element: Element | null | undefined): string {
    if (!element) return ''

    const snippetElements = element.querySelectorAll('span, div')
    for (const el of snippetElements) {
      const text = el.textContent || ''
      if (text.length > 50 && text.length < 300) {
        return text
      }
    }

    return ''
  }

  private async extractPageContent(html: string, url: string): Promise<ExtractedContent> {
    const dom = new JSDOM(html)
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    return {
      title: article?.title || '',
      text: article?.textContent || '',
      excerpt: article?.excerpt || '',
      url
    }
  }

  private async summarizeWithAI(content: string, prompt: string): Promise<string> {
    try {
      const response = await generateText({
        model: anthropic('claude-3-5-sonnet-20241022'),
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes web content based on user requests.'
          },
          {
            role: 'user',
            content: `Content: ${content.slice(0, 8000)}\n\nRequest: ${prompt}`
          }
        ],
        maxTokens: 1000,
      })

      return response.text

    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', `AI summarization failed: ${error.message}`, '⚠️')
      return ''
    }
  }

  private buildContextFromHistory(session: BrowseSession): string {
    const recentHistory = session.history.slice(-3) // Last 3 actions

    return recentHistory.map(item => {
      switch (item.type) {
        case 'search':
          return `Search: "${item.query}" - Found ${item.results?.length || 0} results`
        case 'page':
          return `Visited: ${item.title} (${item.url})\n${item.summary ? `Summary: ${item.summary}` : ''}`
        default:
          return ''
      }
    }).filter(Boolean).join('\n\n')
  }
}

// Type definitions
export interface BrowseGPTConfig {
  apiKey: string
  projectId: string
  anthropicApiKey: string
  maxSessions: number
  sessionTimeout: number
}

export interface BrowseSession {
  id: string
  browserId: string
  created: Date
  lastActivity: Date
  browser: any | null
  page: any | null
  active: boolean
  history: HistoryItem[]
}

export interface BrowseSessionInfo {
  id: string
  browserId: string
  created: Date
  lastActivity: Date
  active: boolean
  historyCount: number
}

export interface HistoryItem {
  type: 'search' | 'page'
  timestamp: Date
  query?: string
  url?: string
  title?: string
  prompt?: string
  summary?: string
  results?: SearchResultItem[]
}

export interface SearchResult {
  query: string
  results: SearchResultItem[]
  url: string
}

export interface SearchResultItem {
  title: string
  url: string
  snippet: string
}

export interface PageContent {
  url: string
  title: string
  text: string
  summary: string
  timestamp: Date
}

export interface ExtractedContent {
  title: string
  text: string
  excerpt: string
  url: string
}

// Singleton instance
export const browseGPTService = new BrowseGPTService()
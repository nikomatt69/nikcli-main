import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { advancedUI } from '../ui/advanced-cli-ui'
import { browserContainerManager, type BrowserContainer } from './browser-container-manager'

/**
 * BrowserSessionManager - Manages individual browser conversation sessions
 *
 * Each session represents a continuous conversation with a specific browser instance,
 * maintaining history, context, and managing persistence and recovery of sessions.
 *
 * Adapted from VMSessionManager for browser-specific functionality.
 */
export class BrowserSessionManager extends EventEmitter {
  private sessions: Map<string, BrowserSession> = new Map()
  private messageQueues: Map<string, BrowserMessage[]> = new Map()
  private config: BrowserSessionConfig
  private cleanupInterval?: NodeJS.Timeout

  constructor(config?: Partial<BrowserSessionConfig>) {
    super()
    this.config = { ...DEFAULT_BROWSER_SESSION_CONFIG, ...config }
    this.setupEventHandlers()
  }

  /**
   * Create new browser session
   */
  async createSession(
    containerId: string,
    browserConfig?: BrowserSessionOptions
  ): Promise<BrowserSession> {
    const sessionId = this.generateSessionId()
    const sessionConfig = { ...this.config, ...browserConfig }

    const container = browserContainerManager.getBrowserContainer(containerId)
    if (!container) {
      throw new Error(`Browser container ${containerId} not found`)
    }

    const session: BrowserSession = {
      sessionId,
      containerId,
      status: 'initializing',
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      isActive: false,
      config: sessionConfig,
      container,
      browserState: {
        currentUrl: 'about:blank',
        title: '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        screenshotCache: new Map(),
        elementCache: new Map(),
        lastScreenshotTime: null,
      },
      history: {
        sessionId,
        containerId,
        messages: [],
        actions: [],
        screenshots: [],
        startTime: new Date(),
        metadata: {
          messageCount: 0,
          actionCount: 0,
        },
      },
      context: {
        sessionId,
        containerId,
        capabilities: [
          'navigate',
          'click',
          'type',
          'screenshot',
          'extract_text',
          'wait_for_element',
          'scroll',
          'execute_script',
        ],
        conversationHistory: [],
        settings: {
          autoScreenshot: sessionConfig.autoScreenshot || true,
          screenshotInterval: sessionConfig.screenshotInterval || 30000,
          elementHighlight: sessionConfig.elementHighlight || true,
          waitTimeout: sessionConfig.waitTimeout || 30000,
        },
      },
    }

    this.sessions.set(sessionId, session)
    this.messageQueues.set(sessionId, [])

    advancedUI.logFunctionCall('createBrowserSession')
    advancedUI.logFunctionUpdate(
      'success',
      `Created browser session ${sessionId} for container ${containerId.slice(0, 12)}`,
      '🌐'
    )

    // Initialize session
    await this.initializeSession(session)

    this.emit('session:created', sessionId, session)
    return session
  }

  /**
   * Get existing session
   */
  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get session by container ID
   */
  getSessionByContainer(containerId: string): BrowserSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.containerId === containerId) {
        return session
      }
    }
    return undefined
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): BrowserSession[] {
    return Array.from(this.sessions.values()).filter((session) => session.isActive)
  }

  /**
   * Send message to browser session
   */
  async sendMessage(
    sessionId: string,
    content: string,
    messageType: BrowserMessageType = 'chat'
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) {
      throw new Error(`Browser session ${sessionId} not found or inactive`)
    }

    try {
      const message = this.createBrowserMessage(session, content, messageType, 'user')

      // Add to session history
      await this.addMessageToHistory(session, message)

      // Process message based on type
      await this.processMessage(session, message)

      // Update session activity
      session.lastActivity = new Date()
      session.messageCount++

      this.emit('message:sent', sessionId, message)
      return true

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Failed to send message to session ${sessionId}: ${error.message}`, '✖')
      throw error
    }
  }

  /**
   * Execute browser action
   */
  async executeBrowserAction(
    sessionId: string,
    action: BrowserAction
  ): Promise<BrowserActionResult> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) {
      throw new Error(`Browser session ${sessionId} not found or inactive`)
    }

    try {
      advancedUI.logFunctionUpdate('info', `Executing action: ${action.type}`, '🎬')

      const result = await this.performBrowserAction(session, action)

      // Update browser state
      await this.updateBrowserState(session, action, result)

      // Add to action history
      session.history.actions.push({
        ...action,
        result,
        timestamp: new Date(),
      })
      session.history.metadata.actionCount++

      // Update container activity
      browserContainerManager.updateContainerActivity(session.containerId)

      this.emit('action:executed', sessionId, action, result)
      return result

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Browser action failed: ${error.message}`, '✖')
      throw error
    }
  }

  /**
   * Take screenshot of current page
   */
  async takeScreenshot(sessionId: string, fullPage: boolean = false): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) {
      throw new Error(`Browser session ${sessionId} not found or inactive`)
    }

    try {
      const action: BrowserAction = {
        type: 'screenshot',
        params: { fullPage },
        timestamp: new Date(),
      }

      const result = await this.executeBrowserAction(sessionId, action)

      if (result.success && result.data?.screenshot) {
        // Cache the screenshot
        const timestamp = Date.now()
        session.browserState.screenshotCache.set(timestamp, result.data.screenshot)
        session.browserState.lastScreenshotTime = timestamp

        // Keep only last 5 screenshots to manage memory
        if (session.browserState.screenshotCache.size > 5) {
          const oldestKey = Math.min(...session.browserState.screenshotCache.keys())
          session.browserState.screenshotCache.delete(oldestKey)
        }

        return result.data.screenshot
      }

      throw new Error('Screenshot capture failed')

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Screenshot failed: ${error.message}`, '📸')
      throw error
    }
  }

  /**
   * Get current browser state
   */
  getBrowserState(sessionId: string): BrowserState | null {
    const session = this.sessions.get(sessionId)
    return session?.browserState || null
  }

  /**
   * Update browser state
   */
  async updateBrowserState(
    session: BrowserSession,
    action: BrowserAction,
    result: BrowserActionResult
  ): Promise<void> {
    const state = session.browserState

    switch (action.type) {
      case 'navigate':
        if (result.success && action.params?.url) {
          state.currentUrl = action.params.url
          state.title = result.data?.title || ''
          state.isLoading = false
        }
        break

      case 'get_page_info':
        if (result.success && result.data) {
          state.currentUrl = result.data.url || state.currentUrl
          state.title = result.data.title || state.title
          state.canGoBack = result.data.canGoBack || false
          state.canGoForward = result.data.canGoForward || false
        }
        break

      case 'screenshot':
        if (result.success && result.data?.screenshot) {
          state.lastScreenshotTime = Date.now()
        }
        break
    }

    session.lastActivity = new Date()
  }

  /**
   * End browser session
   */
  async endSession(sessionId: string, reason: string = 'manual'): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      session.status = 'ended'
      session.isActive = false
      session.history.endTime = new Date()

      // Clear auto-screenshot interval if it exists
      const autoScreenshotInterval = (session as any)._autoScreenshotInterval
      if (autoScreenshotInterval) {
        clearInterval(autoScreenshotInterval)
        delete (session as any)._autoScreenshotInterval
      }

      // Save session history if configured
      await this.saveSessionHistory(session)

      // Clean up message queue
      this.messageQueues.delete(sessionId)

      // Clean up caches
      session.browserState.screenshotCache.clear()
      session.browserState.elementCache.clear()

      advancedUI.logFunctionUpdate('warning', `Ended browser session ${sessionId}: ${reason}`, '🛑')

      this.emit('session:ended', sessionId, reason)

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Error ending session ${sessionId}: ${error.message}`, '✖')
    }
  }

  /**
   * Cleanup inactive sessions
   */
  async cleanupInactiveSessions(maxAge: number = 3600000): Promise<number> {
    const now = new Date()
    let cleanedCount = 0

    for (const [sessionId, session] of this.sessions) {
      const age = now.getTime() - session.lastActivity.getTime()

      if (!session.isActive && age > maxAge) {
        await this.endSession(sessionId, 'cleanup_timeout')
        this.sessions.delete(sessionId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      advancedUI.logFunctionUpdate('info', `Cleaned up ${cleanedCount} inactive browser sessions`, '🧹')
    }

    return cleanedCount
  }

  /**
   * Get session statistics
   */
  getSessionStats(): BrowserSessionStats {
    const sessions = Array.from(this.sessions.values())
    const activeSessions = sessions.filter((s) => s.isActive)
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0)
    const totalActions = sessions.reduce((sum, s) => sum + s.history.metadata.actionCount, 0)

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      totalMessages,
      totalActions,
      averageMessagePerSession: sessions.length > 0 ? totalMessages / sessions.length : 0,
      averageActionsPerSession: sessions.length > 0 ? totalActions / sessions.length : 0,
      oldestActiveSession:
        activeSessions.length > 0 ? Math.min(...activeSessions.map((s) => s.startTime.getTime())) : 0,
    }
  }

  // Private methods

  private async initializeSession(session: BrowserSession): Promise<void> {
    try {
      session.status = 'active'
      session.isActive = true

      // Verify container is ready
      const container = session.container
      if (container.status !== 'ready' && container.status !== 'active') {
        throw new Error(`Container ${container.id} not ready for browser session`)
      }

      // Get initial page state
      await this.updateInitialBrowserState(session)

      // Start auto-screenshot if enabled
      if (session.context.settings.autoScreenshot) {
        this.startAutoScreenshot(session)
      }

      advancedUI.logFunctionUpdate('success', `Initialized browser session ${session.sessionId}`, '✅')

    } catch (error: any) {
      session.status = 'error'
      session.isActive = false
      throw new Error(`Failed to initialize browser session: ${error.message}`)
    }
  }

  private async updateInitialBrowserState(session: BrowserSession): Promise<void> {
    try {
      // Get initial page info
      const pageInfoAction: BrowserAction = {
        type: 'get_page_info',
        params: {},
        timestamp: new Date(),
      }

      await this.executeBrowserAction(session.sessionId, pageInfoAction)

    } catch (error: any) {
      // Non-critical error
      advancedUI.logFunctionUpdate('warning', `Could not get initial page state: ${error.message}`, '⚠️')
    }
  }

  private startAutoScreenshot(session: BrowserSession): void {
    const interval = session.context.settings.screenshotInterval
    const sessionId = session.sessionId

    const autoScreenshot = setInterval(() => {
      if (!session.isActive) {
        clearInterval(autoScreenshot as NodeJS.Timeout)
        return
      }

      // Fire and forget - don't await in setInterval
      this.takeScreenshot(sessionId, false).catch(() => {
        // Ignore auto-screenshot errors
      })
    }, interval) as NodeJS.Timeout

    // Store interval ID for cleanup
    (session as any)._autoScreenshotInterval = autoScreenshot
  }

  private async performBrowserAction(
    session: BrowserSession,
    action: BrowserAction
  ): Promise<BrowserActionResult> {
    // This is a placeholder - actual implementation would use Playwright tools
    // The real implementation will be in the Playwright automation tools

    advancedUI.logFunctionUpdate('info', `Simulating browser action: ${action.type}`, '🎭')

    // Simulate action execution
    await this.delay(100)

    return {
      success: true,
      data: {
        action: action.type,
        timestamp: new Date(),
        // Mock data - real implementation will return actual browser data
        title: 'Browser Page',
        url: session.browserState.currentUrl,
      },
      metadata: {
        executionTime: 100,
        timestamp: new Date(),
      },
    }
  }

  private async processMessage(session: BrowserSession, message: BrowserMessage): Promise<void> {
    // Process different message types
    switch (message.type) {
      case 'chat':
        // Chat messages will be processed by the chat bridge
        break
      case 'command':
        // Direct browser commands
        await this.processCommand(session, message.content)
        break
      case 'system':
        // System messages
        break
    }
  }

  private async processCommand(session: BrowserSession, command: string): Promise<void> {
    // Parse and execute browser commands
    // This will integrate with the Playwright automation tools
    advancedUI.logFunctionUpdate('info', `Processing command: ${command}`, '⚡')
  }

  private createBrowserMessage(
    session: BrowserSession,
    content: string,
    type: BrowserMessageType,
    sender: 'user' | 'system' | 'browser'
  ): BrowserMessage {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: session.sessionId,
      containerId: session.containerId,
      type,
      content,
      sender,
      timestamp: new Date(),
      metadata: {
        browserState: { ...session.browserState },
      },
    }
  }

  private async addMessageToHistory(session: BrowserSession, message: BrowserMessage): Promise<void> {
    session.history.messages.push(message)
    session.context.conversationHistory.push(message)

    // Maintain message history limit
    if (session.history.messages.length > session.config.maxMessageHistory) {
      const overflow = session.history.messages.length - session.config.maxMessageHistory
      session.history.messages.splice(0, overflow)
      session.context.conversationHistory.splice(0, overflow)
    }

    session.history.metadata.messageCount = session.history.messages.length
  }

  private async saveSessionHistory(session: BrowserSession): Promise<void> {
    // Implementation for session persistence
    advancedUI.logFunctionUpdate(
      'info',
      `Would save session history for ${session.sessionId} (${session.history.messages.length} messages)`,
      '💾'
    )
  }

  private generateSessionId(): string {
    return `browser_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private setupEventHandlers(): void {
    // Periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions()
    }, 300000) // Every 5 minutes
  }

  /**
   * Destroy the session manager and cleanup all resources
   */
  destroy(): void {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }

    // End all active sessions
    for (const sessionId of this.sessions.keys()) {
      this.endSession(sessionId, 'manager_destroyed').catch((error) => {
        console.error(`Error ending session ${sessionId}:`, error)
      })
    }

    this.sessions.clear()
    this.messageQueues.clear()
    this.removeAllListeners()
  }
}

// Type definitions
export interface BrowserSessionConfig {
  maxMessageHistory: number
  autoScreenshot: boolean
  screenshotInterval: number
  elementHighlight: boolean
  waitTimeout: number
  sessionTimeout: number
}

export const DEFAULT_BROWSER_SESSION_CONFIG: BrowserSessionConfig = {
  maxMessageHistory: 100,
  autoScreenshot: true,
  screenshotInterval: 30000, // 30 seconds
  elementHighlight: true,
  waitTimeout: 30000, // 30 seconds
  sessionTimeout: 3600000, // 1 hour
}

export interface BrowserSessionOptions extends Partial<BrowserSessionConfig> {
  // Additional session-specific options
}

export interface BrowserSession {
  sessionId: string
  containerId: string
  status: 'initializing' | 'active' | 'ended' | 'error'
  startTime: Date
  lastActivity: Date
  messageCount: number
  isActive: boolean
  config: BrowserSessionConfig
  container: BrowserContainer
  browserState: BrowserState
  history: BrowserSessionHistory
  context: BrowserSessionContext
}

export interface BrowserState {
  currentUrl: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  screenshotCache: Map<number, string>
  elementCache: Map<string, any>
  lastScreenshotTime: number | null
}

export interface BrowserSessionHistory {
  sessionId: string
  containerId: string
  messages: BrowserMessage[]
  actions: (BrowserAction & { result: BrowserActionResult; timestamp: Date })[]
  screenshots: Array<{ timestamp: Date; screenshot: string; url: string }>
  startTime: Date
  endTime?: Date
  metadata: {
    messageCount: number
    actionCount: number
  }
}

export interface BrowserSessionContext {
  sessionId: string
  containerId: string
  capabilities: string[]
  conversationHistory: BrowserMessage[]
  settings: {
    autoScreenshot: boolean
    screenshotInterval: number
    elementHighlight: boolean
    waitTimeout: number
  }
}

export interface BrowserMessage {
  id: string
  sessionId: string
  containerId: string
  type: BrowserMessageType
  content: string
  sender: 'user' | 'system' | 'browser'
  timestamp: Date
  metadata?: {
    browserState?: Partial<BrowserState>
    [key: string]: any
  }
}

export type BrowserMessageType = 'chat' | 'command' | 'system' | 'action_result'

export interface BrowserAction {
  type: BrowserActionType
  params?: Record<string, any>
  timestamp: Date
}

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'screenshot'
  | 'extract_text'
  | 'wait_for_element'
  | 'scroll'
  | 'execute_script'
  | 'get_page_info'
  | 'hover'
  | 'select_option'
  | 'fill_form'

export interface BrowserActionResult {
  success: boolean
  data?: Record<string, any>
  error?: string
  metadata?: {
    executionTime: number
    timestamp: Date
    [key: string]: any
  }
}

export interface BrowserSessionStats {
  totalSessions: number
  activeSessions: number
  totalMessages: number
  totalActions: number
  averageMessagePerSession: number
  averageActionsPerSession: number
  oldestActiveSession: number
}

// Singleton instance
export const browserSessionManager = new BrowserSessionManager()
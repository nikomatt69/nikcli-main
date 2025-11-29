import { EventEmitter } from 'node:events'
import { advancedUI } from '../ui/advanced-cli-ui'
import { browserContainerManager } from './browser-container-manager'
import { browserSessionManager, type BrowserSession, type BrowserAction } from './browser-session-manager'
import { createBrowserTools, browserToolDescriptions } from './playwright-automation-tools'

/**
 * BrowserChatBridge - Bridge between chat interface and browser automation
 *
 * Translates natural language commands into browser actions, manages conversation
 * context, and provides real-time feedback to the chat interface.
 *
 * Similar to vm-chat-bridge but specialized for browser automation workflows.
 */
export class BrowserChatBridge extends EventEmitter {
  private activeSessions: Map<string, BrowserSession> = new Map()
  private browserTools: ReturnType<typeof createBrowserTools>
  private currentMode: BrowserMode = 'idle'
  private activeBrowserSession?: BrowserSession

  constructor(workingDirectory: string = process.cwd()) {
    super()
    this.browserTools = createBrowserTools(workingDirectory)
    this.setupEventHandlers()
  }

  /**
   * Start browser mode with optional initial URL
   */
  async startBrowserMode(initialUrl?: string): Promise<BrowserModeResult> {
    try {
      advancedUI.logFunctionCall('startBrowserMode', { initialUrl })

      if (this.currentMode !== 'idle') {
        throw new Error('Browser mode is already active')
      }

      // Check if Docker is available
      const dockerAvailable = await browserContainerManager.checkDockerAvailability()
      if (!dockerAvailable) {
        throw new Error('Docker is not available. Please ensure Docker is installed and running.')
      }

      this.currentMode = 'initializing'

      // Create browser container
      advancedUI.logFunctionUpdate('info', 'Creating browser container...', '🐳')
      const container = await browserContainerManager.createBrowserContainer({
        name: `browser-chat-${Date.now()}`,
        screenWidth: 1920,
        screenHeight: 1080,
      })

      // Create browser session
      advancedUI.logFunctionUpdate('info', 'Initializing browser session...', '🌐')
      const session = await browserSessionManager.createSession(container.id, {
        autoScreenshot: true,
        screenshotInterval: 15000, // More frequent for chat mode
      })

      this.activeBrowserSession = session
      this.activeSessions.set(session.sessionId, session)

      // Navigate to initial URL if provided
      if (initialUrl) {
        advancedUI.logFunctionUpdate('info', `Navigating to: ${initialUrl}`, '🔗')
        await this.browserTools.browser_navigate.execute({
          sessionId: session.sessionId,
          url: initialUrl,
        })
      }

      this.currentMode = 'active'

      const result: BrowserModeResult = {
        success: true,
        session,
        container,
        noVncUrl: container.noVncUrl,
        message: 'Browser mode activated successfully',
      }

      advancedUI.logFunctionUpdate('success', 'Browser mode ready!', '✅')
      advancedUI.logFunctionUpdate('info', `View browser: ${container.noVncUrl}`, '🖥️')

      this.emit('browser:mode:started', result)
      return result

    } catch (error: any) {
      this.currentMode = 'error'
      advancedUI.logFunctionUpdate('error', `Failed to start browser mode: ${error.message}`, '✖')

      const result: BrowserModeResult = {
        success: false,
        error: error.message,
        message: 'Failed to activate browser mode',
      }

      this.emit('browser:mode:error', result)
      return result
    }
  }

  /**
   * Process chat message and execute browser actions
   */
  async processChatMessage(message: string): Promise<BrowserChatResponse> {
    try {
      if (!this.activeBrowserSession) {
        throw new Error('No active browser session. Use /browser to start browser mode.')
      }

      advancedUI.logFunctionCall('processBrowserChatMessage', {
        message: message.substring(0, 100) + (message.length > 100 ? '...' : '')
      })

      // Send message to session
      await browserSessionManager.sendMessage(
        this.activeBrowserSession.sessionId,
        message,
        'chat'
      )

      // Analyze message and determine actions
      const actions = await this.analyzeMessageForActions(message)

      const response: BrowserChatResponse = {
        success: true,
        actions: [],
        screenshots: [],
        pageInfo: null,
        message: '',
      }

      // Execute determined actions
      for (const action of actions) {
        try {
          const result = await this.executeBrowserAction(action)
          response.actions.push({ action, result })

          // Collect screenshots if action was visual
          if (this.isVisualAction(action.type) || action.type === 'screenshot') {
            const screenshot = await this.takeScreenshot()
            if (screenshot) {
              response.screenshots.push({
                timestamp: new Date(),
                screenshot,
                action: action.type,
              })
            }
          }
        } catch (error: any) {
          advancedUI.logFunctionUpdate('warning', `Action failed: ${error.message}`, '⚠️')
          response.actions.push({
            action,
            result: { success: false, error: error.message },
          })
        }
      }

      // Get current page info
      try {
        const pageInfoResult = await this.browserTools.browser_get_page_info.execute({
          sessionId: this.activeBrowserSession.sessionId,
        })

        if (pageInfoResult.success) {
          response.pageInfo = pageInfoResult.data
        }
      } catch (error) {
        // Page info is optional
      }

      // Generate response message
      response.message = this.generateResponseMessage(message, response.actions)

      this.emit('browser:chat:response', response)
      return response

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Chat processing failed: ${error.message}`, '✖')

      const response: BrowserChatResponse = {
        success: false,
        error: error.message,
        actions: [],
        screenshots: [],
        pageInfo: null,
        message: `Error: ${error.message}`,
      }

      this.emit('browser:chat:error', response)
      return response
    }
  }

  /**
   * Execute a specific browser action
   */
  async executeBrowserAction(action: BrowserAction): Promise<any> {
    if (!this.activeBrowserSession) {
      throw new Error('No active browser session')
    }

    const sessionId = this.activeBrowserSession.sessionId

    switch (action.type) {
      case 'navigate':
        return await this.browserTools.browser_navigate.execute({
          sessionId,
          url: action.params?.url,
          waitUntil: action.params?.waitUntil,
          timeout: action.params?.timeout,
        })

      case 'click':
        return await this.browserTools.browser_click.execute({
          sessionId,
          selector: action.params?.selector,
          button: action.params?.button,
          clickCount: action.params?.clickCount,
          force: action.params?.force,
        })

      case 'type':
        return await this.browserTools.browser_type.execute({
          sessionId,
          selector: action.params?.selector,
          text: action.params?.text,
          clear: action.params?.clear,
          delay: action.params?.delay,
        })

      case 'screenshot':
        return await this.browserTools.browser_screenshot.execute({
          sessionId,
          fullPage: action.params?.fullPage,
          quality: action.params?.quality,
          type: action.params?.type,
        })

      case 'extract_text':
        return await this.browserTools.browser_extract_text.execute({
          sessionId,
          selector: action.params?.selector,
          attribute: action.params?.attribute,
        })

      case 'wait_for_element':
        return await this.browserTools.browser_wait_for_element.execute({
          sessionId,
          selector: action.params?.selector,
          state: action.params?.state,
          timeout: action.params?.timeout,
        })

      case 'scroll':
        return await this.browserTools.browser_scroll.execute({
          sessionId,
          direction: action.params?.direction,
          amount: action.params?.amount,
          selector: action.params?.selector,
        })

      case 'execute_script':
        return await this.browserTools.browser_execute_script.execute({
          sessionId,
          script: action.params?.script,
          args: action.params?.args,
        })

      case 'get_page_info':
        return await this.browserTools.browser_get_page_info.execute({
          sessionId,
        })

      default:
        throw new Error(`Unknown browser action type: ${action.type}`)
    }
  }

  /**
   * Take a screenshot of current page
   */
  async takeScreenshot(fullPage: boolean = false): Promise<string | null> {
    if (!this.activeBrowserSession) return null

    try {
      const result = await this.browserTools.browser_screenshot.execute({
        sessionId: this.activeBrowserSession.sessionId,
        fullPage,
        quality: 80,
        type: 'png',
      })

      return result.success ? result.data?.screenshot || null : null
    } catch (error) {
      return null
    }
  }

  /**
   * Get current browser status
   */
  getBrowserStatus(): BrowserStatus {
    const session = this.activeBrowserSession
    const container = session?.container

    return {
      mode: this.currentMode,
      hasActiveSession: !!session,
      session: session ? {
        id: session.sessionId,
        containerId: session.containerId,
        status: session.status,
        createdAt: session.startTime,
        lastActivity: session.lastActivity,
        messageCount: session.messageCount,
        currentUrl: session.browserState.currentUrl,
        title: session.browserState.title,
      } : null,
      container: container ? {
        id: container.id,
        name: container.name,
        status: container.status,
        noVncUrl: container.noVncUrl,
        displayPort: container.displayPort,
        createdAt: container.createdAt,
      } : null,
      capabilities: Object.keys(browserToolDescriptions),
    }
  }

  /**
   * Exit browser mode and cleanup resources
   */
  async exitBrowserMode(): Promise<void> {
    try {
      advancedUI.logFunctionCall('exitBrowserMode')

      if (this.currentMode === 'idle') {
        advancedUI.logFunctionUpdate('info', 'Browser mode is not active', 'ℹ️')
        return
      }

      this.currentMode = 'stopping'

      // End active session
      if (this.activeBrowserSession) {
        await browserSessionManager.endSession(
          this.activeBrowserSession.sessionId,
          'user_exit'
        )

        // Stop container
        await browserContainerManager.stopBrowserContainer(
          this.activeBrowserSession.containerId
        )

        this.activeSessions.delete(this.activeBrowserSession.sessionId)
        this.activeBrowserSession = undefined
      }

      this.currentMode = 'idle'

      advancedUI.logFunctionUpdate('success', 'Browser mode exited successfully', '👋')
      this.emit('browser:mode:exited')

    } catch (error: any) {
      this.currentMode = 'error'
      advancedUI.logFunctionUpdate('error', `Failed to exit browser mode: ${error.message}`, '✖')
      throw error
    }
  }

  // Private methods

  /**
   * Analyze chat message to determine required browser actions
   */
  private async analyzeMessageForActions(message: string): Promise<BrowserAction[]> {
    const actions: BrowserAction[] = []
    const lowerMessage = message.toLowerCase()

    // Simple pattern matching - in a real implementation this would use AI
    // to understand the user's intent more sophisticatedly

    // Navigation patterns
    if (lowerMessage.includes('go to') || lowerMessage.includes('navigate to') || lowerMessage.includes('visit')) {
      const urlMatch = message.match(/(?:go to|navigate to|visit)\s+([^\s]+)/i)
      if (urlMatch) {
        let url = urlMatch[1]
        if (!url.startsWith('http')) {
          url = `https://${url}`
        }
        actions.push({
          type: 'navigate',
          params: { url },
          timestamp: new Date(),
        })
      }
    }

    // Click patterns
    if (lowerMessage.includes('click') || lowerMessage.includes('press')) {
      const clickMatch = message.match(/(?:click|press)\s+(?:on\s+)?['""]?([^'""]+)['""]?/i)
      if (clickMatch) {
        actions.push({
          type: 'click',
          params: { selector: clickMatch[1] },
          timestamp: new Date(),
        })
      }
    }

    // Type patterns
    if (lowerMessage.includes('type') || lowerMessage.includes('enter') || lowerMessage.includes('fill')) {
      const typeMatch = message.match(/(?:type|enter|fill)\s+['""]([^'""]+)['""](?:\s+(?:in|into)\s+([^'""]+))?/i)
      if (typeMatch) {
        actions.push({
          type: 'type',
          params: {
            text: typeMatch[1],
            selector: typeMatch[2] || 'input, textarea',
          },
          timestamp: new Date(),
        })
      }
    }

    // Screenshot patterns
    if (lowerMessage.includes('screenshot') || lowerMessage.includes('capture')) {
      actions.push({
        type: 'screenshot',
        params: { fullPage: lowerMessage.includes('full') },
        timestamp: new Date(),
      })
    }

    // Scroll patterns
    if (lowerMessage.includes('scroll')) {
      let direction: 'up' | 'down' | 'left' | 'right' = 'down'
      if (lowerMessage.includes('up')) direction = 'up'
      else if (lowerMessage.includes('left')) direction = 'left'
      else if (lowerMessage.includes('right')) direction = 'right'

      actions.push({
        type: 'scroll',
        params: { direction },
        timestamp: new Date(),
      })
    }

    // If no specific actions detected, take a screenshot to see current state
    if (actions.length === 0) {
      actions.push({
        type: 'get_page_info',
        params: {},
        timestamp: new Date(),
      })
    }

    return actions
  }

  /**
   * Check if action type produces visual changes
   */
  private isVisualAction(actionType: string): boolean {
    return ['navigate', 'click', 'scroll', 'type'].includes(actionType)
  }

  /**
   * Generate response message based on executed actions
   */
  private generateResponseMessage(userMessage: string, actionResults: Array<{ action: BrowserAction, result: any }>): string {
    if (actionResults.length === 0) {
      return "I understand your request, but I'm not sure what browser action to take. Could you be more specific?"
    }

    const successful = actionResults.filter(ar => ar.result.success)
    const failed = actionResults.filter(ar => !ar.result.success)

    let message = ''

    if (successful.length > 0) {
      const actions = successful.map(ar => {
        switch (ar.action.type) {
          case 'navigate':
            return `navigated to ${ar.action.params?.url}`
          case 'click':
            return `clicked on ${ar.action.params?.selector}`
          case 'type':
            return `typed text into ${ar.action.params?.selector}`
          case 'screenshot':
            return 'took a screenshot'
          case 'scroll':
            return `scrolled ${ar.action.params?.direction}`
          default:
            return `executed ${ar.action.type}`
        }
      })

      message = `I ${actions.join(', ')}.`
    }

    if (failed.length > 0) {
      message += ` However, ${failed.length} action(s) failed.`
    }

    return message
  }

  private setupEventHandlers(): void {
    // Handle session events
    browserSessionManager.on('session:created', (sessionId) => {
      advancedUI.logFunctionUpdate('info', `Browser session created: ${sessionId}`, '🌐')
    })

    browserSessionManager.on('session:ended', (sessionId) => {
      advancedUI.logFunctionUpdate('info', `Browser session ended: ${sessionId}`, '🛑')
      this.activeSessions.delete(sessionId)
    })

    // Handle container events
    browserContainerManager.on('browser:created', (container) => {
      advancedUI.logFunctionUpdate('success', `Browser container ready: ${container.name}`, '🐳')
    })

    browserContainerManager.on('browser:stopped', ({ name }) => {
      advancedUI.logFunctionUpdate('info', `Browser container stopped: ${name}`, '⏹️')
    })
  }
}

// Type definitions
export type BrowserMode = 'idle' | 'initializing' | 'active' | 'stopping' | 'error'

export interface BrowserModeResult {
  success: boolean
  session?: BrowserSession
  container?: any
  noVncUrl?: string
  message: string
  error?: string
}

export interface BrowserChatResponse {
  success: boolean
  actions: Array<{
    action: BrowserAction
    result: any
  }>
  screenshots: Array<{
    timestamp: Date
    screenshot: string
    action: string
  }>
  pageInfo: any
  message: string
  error?: string
}

export interface BrowserStatus {
  mode: BrowserMode
  hasActiveSession: boolean
  session: {
    id: string
    containerId: string
    status: string
    createdAt: Date
    lastActivity: Date
    messageCount: number
    currentUrl: string
    title: string
  } | null
  container: {
    id: string
    name: string
    status: string
    noVncUrl: string
    displayPort: number
    createdAt: Date
  } | null
  capabilities: string[]
}

// Singleton instance
export const browserChatBridge = new BrowserChatBridge()
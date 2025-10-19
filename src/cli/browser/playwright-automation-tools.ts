import { z } from 'zod'
import { BaseTool, type ToolExecutionResult } from '../tools/base-tool'
import { advancedUI } from '../ui/advanced-cli-ui'
import { browserSessionManager, type BrowserAction, type BrowserActionResult } from './browser-session-manager'

/**
 * Playwright Automation Tools - AI-controllable browser automation
 *
 * Provides a comprehensive set of tools for browser automation through Playwright,
 * designed specifically for AI agents to interact with web pages in real-time.
 */

// Zod schemas for input validation
const NavigateSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  url: z.string().url().describe('URL to navigate to'),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe('Wait condition'),
  timeout: z.number().optional().describe('Timeout in milliseconds'),
})

const ClickSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector or text to click'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button'),
  clickCount: z.number().optional().describe('Number of clicks'),
  delay: z.number().optional().describe('Delay between clicks'),
  force: z.boolean().optional().describe('Force click even if element is not visible'),
})

const TypeSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector of input element'),
  text: z.string().describe('Text to type'),
  clear: z.boolean().optional().describe('Clear existing text first'),
  delay: z.number().optional().describe('Delay between keystrokes'),
})

const ScreenshotSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  fullPage: z.boolean().optional().describe('Capture full page or viewport only'),
  quality: z.number().min(0).max(100).optional().describe('JPEG quality (0-100)'),
  type: z.enum(['png', 'jpeg']).optional().describe('Image format'),
})

const ExtractTextSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().optional().describe('CSS selector to extract text from (or entire page)'),
  attribute: z.string().optional().describe('Extract attribute value instead of text'),
})

const WaitForElementSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector to wait for'),
  state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional().describe('Element state to wait for'),
  timeout: z.number().optional().describe('Timeout in milliseconds'),
})

const ScrollSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction'),
  amount: z.number().optional().describe('Pixels to scroll (default: 500)'),
  selector: z.string().optional().describe('Element to scroll (default: page)'),
})

const ExecuteScriptSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  script: z.string().describe('JavaScript code to execute'),
  args: z.array(z.any()).optional().describe('Arguments to pass to script'),
})

const GetPageInfoSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
})

const HoverSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector to hover over'),
  timeout: z.number().optional().describe('Timeout in milliseconds'),
})

const SelectOptionSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  selector: z.string().describe('CSS selector of select element'),
  value: z.union([z.string(), z.array(z.string())]).describe('Option value(s) to select'),
})

const FillFormSchema = z.object({
  sessionId: z.string().describe('Browser session ID'),
  fields: z.record(z.string(), z.string()).describe('Form fields as selector -> value mapping'),
  submit: z.boolean().optional().describe('Submit form after filling'),
})

/**
 * Browser Navigate Tool
 */
export class BrowserNavigateTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_navigate', workingDirectory)
  }

  async execute(params: z.infer<typeof NavigateSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = NavigateSchema.parse(params)

      advancedUI.logFunctionCall('browserNavigate', { url: validated.url })

      const action: BrowserAction = {
        type: 'navigate',
        params: {
          url: validated.url,
          waitUntil: validated.waitUntil || 'load',
          timeout: validated.timeout || 30000,
        },
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        advancedUI.logFunctionUpdate('success', `Navigated to: ${validated.url}`, '🌐')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Navigation failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

/**
 * Browser Click Tool
 */
export class BrowserClickTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_click', workingDirectory)
  }

  async execute(params: z.infer<typeof ClickSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = ClickSchema.parse(params)

      advancedUI.logFunctionCall('browserClick', { selector: validated.selector })

      const action: BrowserAction = {
        type: 'click',
        params: {
          selector: validated.selector,
          button: validated.button || 'left',
          clickCount: validated.clickCount || 1,
          delay: validated.delay,
          force: validated.force || false,
        },
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        advancedUI.logFunctionUpdate('success', `Clicked: ${validated.selector}`, '👆')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Click failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

/**
 * Browser Type Tool
 */
export class BrowserTypeTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_type', workingDirectory)
  }

  async execute(params: z.infer<typeof TypeSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = TypeSchema.parse(params)

      advancedUI.logFunctionCall('browserType', {
        selector: validated.selector,
        text: validated.text.substring(0, 50) + (validated.text.length > 50 ? '...' : '')
      })

      const action: BrowserAction = {
        type: 'type',
        params: {
          selector: validated.selector,
          text: validated.text,
          clear: validated.clear !== false,
          delay: validated.delay || 50,
        },
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        advancedUI.logFunctionUpdate('success', `Typed text in: ${validated.selector}`, '⌨️')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Type failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

/**
 * Browser Screenshot Tool
 */
export class BrowserScreenshotTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_screenshot', workingDirectory)
  }

  async execute(params: z.infer<typeof ScreenshotSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = ScreenshotSchema.parse(params)

      advancedUI.logFunctionCall('browserScreenshot', { fullPage: validated.fullPage })

      const action: BrowserAction = {
        type: 'screenshot',
        params: {
          fullPage: validated.fullPage || false,
          quality: validated.quality || 80,
          type: validated.type || 'png',
        },
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        advancedUI.logFunctionUpdate('success', 'Screenshot captured', '📸')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Screenshot failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

/**
 * Browser Extract Text Tool
 */
export class BrowserExtractTextTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_extract_text', workingDirectory)
  }

  async execute(params: z.infer<typeof ExtractTextSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = ExtractTextSchema.parse(params)

      advancedUI.logFunctionCall('browserExtractText', { selector: validated.selector || 'entire page' })

      const action: BrowserAction = {
        type: 'extract_text',
        params: {
          selector: validated.selector,
          attribute: validated.attribute,
        },
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        const textLength = result.data?.text?.length || 0
        advancedUI.logFunctionUpdate('success', `Extracted ${textLength} characters`, '📝')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Text extraction failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

/**
 * Browser Wait For Element Tool
 */
export class BrowserWaitForElementTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_wait_for_element', workingDirectory)
  }

  async execute(params: z.infer<typeof WaitForElementSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = WaitForElementSchema.parse(params)

      advancedUI.logFunctionCall('browserWaitForElement', {
        selector: validated.selector,
        state: validated.state || 'visible'
      })

      const action: BrowserAction = {
        type: 'wait_for_element',
        params: {
          selector: validated.selector,
          state: validated.state || 'visible',
          timeout: validated.timeout || 30000,
        },
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        advancedUI.logFunctionUpdate('success', `Element found: ${validated.selector}`, '👁️')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Wait failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

/**
 * Browser Scroll Tool
 */
export class BrowserScrollTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_scroll', workingDirectory)
  }

  async execute(params: z.infer<typeof ScrollSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = ScrollSchema.parse(params)

      advancedUI.logFunctionCall('browserScroll', {
        direction: validated.direction,
        amount: validated.amount || 500
      })

      const action: BrowserAction = {
        type: 'scroll',
        params: {
          direction: validated.direction,
          amount: validated.amount || 500,
          selector: validated.selector,
        },
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        advancedUI.logFunctionUpdate('success', `Scrolled ${validated.direction}`, '↕️')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Scroll failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

/**
 * Browser Execute Script Tool
 */
export class BrowserExecuteScriptTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_execute_script', workingDirectory)
  }

  async execute(params: z.infer<typeof ExecuteScriptSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = ExecuteScriptSchema.parse(params)

      advancedUI.logFunctionCall('browserExecuteScript', {
        script: validated.script.substring(0, 100) + (validated.script.length > 100 ? '...' : '')
      })

      const action: BrowserAction = {
        type: 'execute_script',
        params: {
          script: validated.script,
          args: validated.args || [],
        },
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        advancedUI.logFunctionUpdate('success', 'Script executed', '⚡')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Script execution failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

/**
 * Browser Get Page Info Tool
 */
export class BrowserGetPageInfoTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('browser_get_page_info', workingDirectory)
  }

  async execute(params: z.infer<typeof GetPageInfoSchema>): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validated = GetPageInfoSchema.parse(params)

      advancedUI.logFunctionCall('browserGetPageInfo')

      const action: BrowserAction = {
        type: 'get_page_info',
        params: {},
        timestamp: new Date(),
      }

      const result = await browserSessionManager.executeBrowserAction(validated.sessionId, action)

      if (result.success) {
        advancedUI.logFunctionUpdate('success', `Page info retrieved: ${result.data?.title || 'Unknown'}`, '📄')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: validated,
        },
      }
    } catch (error: any) {
      return this.handleError(error, startTime, params)
    }
  }

  private handleError(error: any, startTime: number, params: any): ToolExecutionResult {
    advancedUI.logFunctionUpdate('error', `Get page info failed: ${error.message}`, '❌')
    return {
      success: false,
      data: null,
      error: error.message,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

// Export all browser tools
export const browserAutomationTools = {
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScreenshotTool,
  BrowserExtractTextTool,
  BrowserWaitForElementTool,
  BrowserScrollTool,
  BrowserExecuteScriptTool,
  BrowserGetPageInfoTool,
}

// Create tool instances factory
export function createBrowserTools(workingDirectory: string) {
  return {
    browser_navigate: new BrowserNavigateTool(workingDirectory),
    browser_click: new BrowserClickTool(workingDirectory),
    browser_type: new BrowserTypeTool(workingDirectory),
    browser_screenshot: new BrowserScreenshotTool(workingDirectory),
    browser_extract_text: new BrowserExtractTextTool(workingDirectory),
    browser_wait_for_element: new BrowserWaitForElementTool(workingDirectory),
    browser_scroll: new BrowserScrollTool(workingDirectory),
    browser_execute_script: new BrowserExecuteScriptTool(workingDirectory),
    browser_get_page_info: new BrowserGetPageInfoTool(workingDirectory),
  }
}

// Tool descriptions for AI
export const browserToolDescriptions = {
  browser_navigate: 'Navigate to a URL and wait for page to load',
  browser_click: 'Click on an element using CSS selector or text',
  browser_type: 'Type text into an input field or textarea',
  browser_screenshot: 'Take a screenshot of the current page or viewport',
  browser_extract_text: 'Extract text content from page or specific element',
  browser_wait_for_element: 'Wait for an element to appear or change state',
  browser_scroll: 'Scroll the page or a specific element',
  browser_execute_script: 'Execute custom JavaScript in the browser context',
  browser_get_page_info: 'Get current page information (title, URL, navigation state)',
}
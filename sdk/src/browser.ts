/**
 * NikCLI Enterprise SDK - Browser Module
 * Programmatic browser automation
 */

import type {
  SDKResponse,
  BrowserSession,
  BrowserNavigateOptions,
  BrowserClickOptions,
  BrowserTypeOptions,
  BrowserScreenshotOptions,
  BrowserExtractOptions,
} from './types';

export class BrowserSDK {
  private browserService: any;
  private config: any;

  constructor(browserService: any, config: any) {
    this.browserService = browserService;
    this.config = config;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Start browser session
   */
  async start(): Promise<SDKResponse<BrowserSession>> {
    try {
      const session = await this.browserService.start();
      return { success: true, data: session };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get current session
   */
  async getSession(): Promise<SDKResponse<BrowserSession>> {
    try {
      const session = await this.browserService.getSession();
      return { success: true, data: session };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Close browser session
   */
  async close(): Promise<SDKResponse<void>> {
    try {
      await this.browserService.close();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get browser status
   */
  async getStatus(): Promise<SDKResponse<any>> {
    try {
      const status = await this.browserService.getStatus();
      return { success: true, data: status };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  /**
   * Navigate to URL
   */
  async navigate(options: BrowserNavigateOptions): Promise<SDKResponse<void>> {
    try {
      await this.browserService.navigate(options);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Go back
   */
  async goBack(): Promise<SDKResponse<void>> {
    try {
      await this.browserService.goBack();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Go forward
   */
  async goForward(): Promise<SDKResponse<void>> {
    try {
      await this.browserService.goForward();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Reload page
   */
  async reload(): Promise<SDKResponse<void>> {
    try {
      await this.browserService.reload();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Interaction
  // ============================================================================

  /**
   * Click element
   */
  async click(options: BrowserClickOptions): Promise<SDKResponse<void>> {
    try {
      await this.browserService.click(options);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Type text
   */
  async type(options: BrowserTypeOptions): Promise<SDKResponse<void>> {
    try {
      await this.browserService.type(options);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Scroll page
   */
  async scroll(direction: 'up' | 'down', amount?: number): Promise<SDKResponse<void>> {
    try {
      await this.browserService.scroll(direction, amount);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Wait for element
   */
  async waitForElement(selector: string, timeout?: number): Promise<SDKResponse<void>> {
    try {
      await this.browserService.waitForElement(selector, timeout);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Wait for navigation
   */
  async waitForNavigation(timeout?: number): Promise<SDKResponse<void>> {
    try {
      await this.browserService.waitForNavigation(timeout);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Data Extraction
  // ============================================================================

  /**
   * Take screenshot
   */
  async screenshot(options?: BrowserScreenshotOptions): Promise<SDKResponse<string>> {
    try {
      const path = await this.browserService.screenshot(options);
      return { success: true, data: path };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Extract text
   */
  async extractText(options?: BrowserExtractOptions): Promise<SDKResponse<string>> {
    try {
      const text = await this.browserService.extractText(options);
      return { success: true, data: text };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get page HTML
   */
  async getHTML(): Promise<SDKResponse<string>> {
    try {
      const html = await this.browserService.getHTML();
      return { success: true, data: html };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get page info
   */
  async getPageInfo(): Promise<SDKResponse<any>> {
    try {
      const info = await this.browserService.getPageInfo();
      return { success: true, data: info };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Query selector
   */
  async querySelector(selector: string): Promise<SDKResponse<any>> {
    try {
      const element = await this.browserService.querySelector(selector);
      return { success: true, data: element };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Query all selectors
   */
  async querySelectorAll(selector: string): Promise<SDKResponse<any[]>> {
    try {
      const elements = await this.browserService.querySelectorAll(selector);
      return { success: true, data: elements };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // JavaScript Execution
  // ============================================================================

  /**
   * Execute JavaScript
   */
  async executeScript(script: string): Promise<SDKResponse<any>> {
    try {
      const result = await this.browserService.executeScript(script);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Evaluate expression
   */
  async evaluate(expression: string): Promise<SDKResponse<any>> {
    try {
      const result = await this.browserService.evaluate(expression);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private handleError(error: any): SDKResponse<any> {
    return {
      success: false,
      error: {
        code: error.code || 'BROWSER_ERROR',
        message: error.message || 'Browser operation failed',
        details: error,
        stack: error.stack,
      },
    };
  }
}

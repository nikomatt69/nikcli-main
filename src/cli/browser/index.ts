/**
 * Browser Mode Module - Barrel Exports
 *
 * Provides comprehensive browser automation capabilities through Docker containers
 * with Playwright automation and noVNC real-time viewing.
 */

import { browserToolDescriptions } from './playwright-automation-tools'

// Core browser functionality
export {
  BrowserContainerManager,
  browserContainerManager,
  type BrowserContainerOptions,
  type BrowserContainer,
  type BrowserContainerStats,
} from './browser-container-manager'

export {
  BrowserSessionManager,
  browserSessionManager,
  type BrowserSession,
  type BrowserSessionConfig,
  type BrowserSessionOptions,
  type BrowserState,
  type BrowserMessage,
  type BrowserAction,
  type BrowserActionResult,
  type BrowserSessionStats,
  type BrowserActionType,
  type BrowserMessageType,
  DEFAULT_BROWSER_SESSION_CONFIG,
} from './browser-session-manager'

// Browser automation tools
export {
  browserAutomationTools,
  createBrowserTools,
  browserToolDescriptions,
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScreenshotTool,
  BrowserExtractTextTool,
  BrowserWaitForElementTool,
  BrowserScrollTool,
  BrowserExecuteScriptTool,
  BrowserGetPageInfoTool,
} from './playwright-automation-tools'

// Chat bridge and integration
export {
  BrowserChatBridge,
  browserChatBridge,
  type BrowserMode,
  type BrowserModeResult,
  type BrowserChatResponse,
  type BrowserStatus,
} from './browser-chat-bridge'

// Utility functions
export function isBrowserModeAvailable(): boolean {
  // Check if Docker is available (basic check)
  try {
    const { execSync } = require('child_process')
    execSync('docker --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function getBrowserModeInfo() {
  return {
    name: 'Browser Mode',
    description: 'Interactive browser automation with real-time noVNC viewing',
    features: [
      'Dockerized browser environment',
      'Real-time browser viewing via noVNC',
      'Playwright automation tools',
      'AI-driven browser interactions',
      'Screenshot capture and caching',
      'Session management and persistence',
    ],
    requirements: [
      'Docker installed and running',
      'Available ports for noVNC (6080+)',
      'Sufficient memory for browser containers (2GB+)',
    ],
    capabilities: Object.keys(browserToolDescriptions),
  }
}

// Version and metadata
export const BROWSER_MODE_VERSION = '1.0.2'
export const SUPPORTED_BROWSER_ENGINES = ['chromium', 'chrome'] as const
export const DEFAULT_BROWSER_PORTS = {
  noVNC: 6080,
  vnc: 5900,
  playwright: 3000,
} as const
/**
 * Browser Mode Module - Barrel Exports
 *
 * Provides comprehensive browser automation capabilities through Docker containers
 * with Playwright automation and noVNC real-time viewing.
 */

import { browserToolDescriptions } from './playwright-automation-tools'

// Chat bridge and integration
export {
  BrowserChatBridge,
  type BrowserChatResponse,
  type BrowserMode,
  type BrowserModeResult,
  type BrowserStatus,
  browserChatBridge,
} from './browser-chat-bridge'
// Core browser functionality
export {
  type BrowserContainer,
  BrowserContainerManager,
  type BrowserContainerOptions,
  type BrowserContainerStats,
  browserContainerManager,
} from './browser-container-manager'
export {
  type BrowserAction,
  type BrowserActionResult,
  type BrowserActionType,
  type BrowserMessage,
  type BrowserMessageType,
  type BrowserSession,
  type BrowserSessionConfig,
  BrowserSessionManager,
  type BrowserSessionOptions,
  type BrowserSessionStats,
  type BrowserState,
  browserSessionManager,
  DEFAULT_BROWSER_SESSION_CONFIG,
} from './browser-session-manager'
// Browser automation tools
export {
  BrowserClickTool,
  BrowserExecuteScriptTool,
  BrowserExtractTextTool,
  BrowserGetPageInfoTool,
  BrowserNavigateTool,
  BrowserScreenshotTool,
  BrowserScrollTool,
  BrowserTypeTool,
  BrowserWaitForElementTool,
  browserAutomationTools,
  browserToolDescriptions,
  createBrowserTools,
} from './playwright-automation-tools'

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
export const BROWSER_MODE_VERSION = '1.6.0'
export const SUPPORTED_BROWSER_ENGINES = ['chromium', 'chrome'] as const
export const DEFAULT_BROWSER_PORTS = {
  noVNC: 6080,
  vnc: 5900,
  playwright: 3000,
} as const

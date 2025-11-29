/**
 * Secure Tools Module - Phase 1: Foundation & Security
 *
 * This module provides secure, sandboxed tools with user confirmation
 * for all potentially dangerous operations. It replaces the unsafe
 * ToolsManager with security-first implementations.
 *
 * Key Security Features:
 * - Path sanitization to prevent directory traversal
 * - User confirmation for all write operations
 * - Command allow-listing and analysis
 * - Execution tracking and audit logs
 * - Atomic operations with proper error handling
 */

import chalk from 'chalk'

export {
  type BrowserbaseAnalysisOptions,
  type BrowserbaseNavigateOptions,
  type BrowserbaseSessionOptions,
  BrowserbaseTool,
  type BrowserbaseToolResult,
} from './browserbase-tool'
export { CoinbaseAgentKitTool } from './coinbase-agentkit-tool'
export { type DiffChange, type DiffResult, DiffTool, type DiffToolParams } from './diff-tool'
export {
  extractFileIdFromUrl,
  type FigmaCodeGenOptions,
  type FigmaDesktopOptions,
  type FigmaExportOptions,
  type FigmaTokensOptions,
  FigmaTool,
  type FigmaToolResult,
  figmaTool,
  isFigmaConfigured,
  isValidFigmaFileId,
} from './figma-tool'
export { GitTools } from './git-tools'
// New advanced tools
export { type GlobMatch, type GlobResult, GlobTool, type GlobToolParams } from './glob-tool'
export {
  ImageGenerationTool,
  type ImageGenerationToolOptions,
  type ImageGenerationToolResult,
} from './image-generation-tool'
export { JsonPatchTool } from './json-patch-tool'
// Export migration utilities
export {
  createSecureToolsManager,
  ToolsMigration,
  toolsManager, // deprecated, for backward compatibility
} from './migration-to-secure-tools'
export { MultiReadTool } from './multi-read-tool'
export { RAGSearchTool } from './rag-search-tool'
export {
  type BatchSession,
  type CommandOptions,
  type CommandResult,
  SecureCommandTool,
} from './secure-command-tool'
// Export secure tools (recommended)
export {
  ListDirectoryTool,
  ReadFileTool,
  ReplaceInFileTool,
  sanitizePath,
  WriteFileTool,
} from './secure-file-tools'
export {
  SecureToolsRegistry,
  secureTools,
  type ToolContext,
  type ToolResult,
} from './secure-tools-registry'
// Legacy ToolsManager (deprecated)
export { ToolsManager } from './tools-manager'
export { type TreeNode, type TreeResult, TreeTool, type TreeToolParams } from './tree-tool'
// Export AI Vision and Image Tools
export {
  type VisionAnalysisOptions,
  VisionAnalysisTool,
  type VisionAnalysisToolResult,
} from './vision-analysis-tool'
export { type WatchEvent, type WatchResult, WatchTool, type WatchToolParams } from './watch-tool'
export { WebSearchTool, type WebSearchOptions } from './web-search-tool'

/**
 * Initialize secure tools and show security banner
 */
export function initializeSecureTools(workingDir?: string): void {
  console.log(chalk.green.bold('\n🔒 Secure Tools Initialized'))
  console.log(chalk.gray('─'.repeat(50)))
  console.log(chalk.green('✓ Path sanitization enabled'))
  console.log(chalk.green('✓ User confirmation for write operations'))
  console.log(chalk.green('✓ Command allow-listing active'))
  console.log(chalk.green('✓ Execution tracking enabled'))
  console.log(chalk.yellow('⚠︎  Legacy ToolsManager deprecated'))
  console.log(chalk.blue('💡 Use secureTools.* methods for all operations'))

  if (workingDir) {
    console.log(chalk.gray(`📁 Working directory: ${workingDir}`))
  }

  console.log(chalk.gray('─'.repeat(50)))
}

/**
 * Show security guidelines
 */
export function showSecurityGuidelines(): void {
  console.log(chalk.blue.bold('\n🛡️  Security Guidelines'))
  console.log(chalk.gray('─'.repeat(50)))
  console.log(chalk.white('1. Always use secureTools.* methods'))
  console.log(chalk.white('2. Confirm all write operations'))
  console.log(chalk.white('3. Review command execution plans'))
  console.log(chalk.white('4. Use path validation for file operations'))
  console.log(chalk.white('5. Monitor execution history for anomalies'))
  console.log(chalk.gray('─'.repeat(50)))
}

// Show deprecation warning if legacy tools are imported
if (process.env.NODE_ENV !== 'test') {
  console.log(chalk.yellow('\n⚠︎  Tools Module Loaded'))
  console.log(chalk.gray('Legacy ToolsManager is deprecated. Use secureTools instead.'))
}

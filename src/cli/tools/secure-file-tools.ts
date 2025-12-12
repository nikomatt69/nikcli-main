import fs, { createReadStream } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { inputQueue } from '../core/input-queue'
import { advancedUI } from '../ui/advanced-cli-ui'
import {
  checkPath,
  sanitizePath as centralizedSanitizePath,
  isPathSafe,
  type PathCheckResult,
} from '../utils/path-resolver'

// Global batch approval state
const batchApprovalState = {
  pendingFiles: new Map<string, Array<{ filePath: string; action: string; content?: string }>>(),
  approvalInProgress: false,
}

/**
 * Utility to sanitize and validate file paths to prevent directory traversal attacks
 * @deprecated Use sanitizePath from '../utils/path-resolver' directly
 */
export function sanitizePath(filePath: string, workingDirectory: string = process.cwd()): string {
  return centralizedSanitizePath(filePath, workingDirectory)
}

/**
 * Validate that a path exists and is a file (not a directory)
 * @throws Error if path doesn't exist, is a directory, or other file system error
 */
export function validateIsFile(filePath: string, customErrorMsg?: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const stats = fs.statSync(filePath)
  if (!stats.isFile()) {
    throw new Error(customErrorMsg || `Path is not a file (is a directory): ${filePath}`)
  }
}

/**
 * Validate that a path exists and is a directory (not a file)
 * @throws Error if path doesn't exist, is a file, or other file system error
 */
export function validateIsDirectory(dirPath: string, customErrorMsg?: string): void {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`)
  }

  const stats = fs.statSync(dirPath)
  if (!stats.isDirectory()) {
    throw new Error(customErrorMsg || `Path is not a directory (is a file): ${dirPath}`)
  }
}

/**
 * Check if a path exists and is a directory (does not throw)
 * Uses centralized checkPath for consistent behavior
 */
export function isDirectory(dirPath: string): boolean {
  const result = checkPath(dirPath)
  return result.exists && result.isDirectory
}

/**
 * Check if a path exists and is a file (does not throw)
 * Uses centralized checkPath for consistent behavior
 */
export function isFile(filePath: string): boolean {
  const result = checkPath(filePath)
  return result.exists && result.isFile
}

/**
 * Get detailed path information
 */
export function pathInfo(pathToCheck: string): PathCheckResult {
  return checkPath(pathToCheck)
}

/**
 * Request batch approval for file operations
 */
async function requestBatchApproval(action: string, filePath: string, content?: string): Promise<boolean> {
  const operationKey = action

  // Add to pending operations
  if (!batchApprovalState.pendingFiles.has(operationKey)) {
    batchApprovalState.pendingFiles.set(operationKey, [])
  }

  batchApprovalState.pendingFiles.get(operationKey)?.push({
    filePath,
    action,
    content,
  })

  // If approval is already in progress, wait for it
  if (batchApprovalState.approvalInProgress) {
    return new Promise((resolve) => {
      const checkApproval = () => {
        if (!batchApprovalState.pendingFiles.has(operationKey)) {
          resolve(true) // Assume approved if removed from pending
        } else {
          setTimeout(checkApproval, 100)
        }
      }
      checkApproval()
    })
  }

  // Start batch approval process
  batchApprovalState.approvalInProgress = true
  try {
    ;(global as any).__nikCLI?.suspendPrompt?.()
  } catch {}
  inputQueue.enableBypass()

  try {
    const operations = batchApprovalState.pendingFiles.get(operationKey)!
    const fileCount = operations.length

    // Show batch approval prompt
    const { confirmed } = await inquirer.prompt([
      {
        type: 'list',
        name: 'confirmed',
        message: getBatchMessage(action, fileCount, operations),
        choices: [
          { name: 'Yes, approve all', value: true },
          { name: 'No, cancel all', value: false },
        ],
        default: 1,
      },
    ])

    // Clear pending operations for this action
    batchApprovalState.pendingFiles.delete(operationKey)

    return confirmed
  } finally {
    inputQueue.disableBypass()
    batchApprovalState.approvalInProgress = false
    // Ensure prompt resumes cleanly after batch approval
    try {
      ;(global as any).__nikCLI?.resumePromptAndRender?.()
    } catch {}
  }
}

/**
 * Generate batch approval message
 */
function getBatchMessage(action: string, fileCount: number, operations: any[]): string {
  const actionText = action === 'overwrite' ? '⚠︎ Overwrite' : action === 'create' ? '📝 Create' : '⚡︎ Replace in'
  const filesText = fileCount === 1 ? 'file' : 'files'

  let message = `${actionText} ${fileCount} ${filesText}?`

  // Show first few files as examples
  const exampleFiles = operations.slice(0, 3).map((op) => op.filePath)
  if (exampleFiles.length > 0) {
    message += `\n\nExamples:`
    exampleFiles.forEach((file) => {
      message += `\n  • ${file}`
    })
    if (fileCount > 3) {
      message += `\n  ... and ${fileCount - 3} more`
    }
  }

  return message
}

/**
 * Secure file reading tool with path validation
 */
export class ReadFileTool {
  private workingDirectory: string
  private static readonly DEFAULT_TOKEN_BUDGET = 25000
  private static readonly MAX_LINES_PER_CHUNK = 250
  private static readonly TOKEN_CHAR_RATIO = 3.7

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || process.cwd()
  }

  async execute(
    filePath: string,
    options: {
      startLine?: number
      maxLinesPerChunk?: number
      tokenBudget?: number
      encoding?: BufferEncoding
    } = {}
  ): Promise<{
    path: string
    content: string
    size: number
    modified: Date
    extension: string
    startLine: number
    endLine: number
    nextStartLine: number | null
    truncated: boolean
    estimatedTokens: number
  }> {
    try {
      const safePath = sanitizePath(filePath, this.workingDirectory)

      if (!fs.existsSync(safePath)) {
        throw new Error(`File not found: ${filePath}`)
      }

      const stats = fs.statSync(safePath)

      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`)
      }

      const encoding = options.encoding || 'utf8'
      const chunk = await this.readChunkWithBudget(safePath, encoding, {
        startLine: options.startLine ?? 1,
        maxLinesPerChunk: options.maxLinesPerChunk ?? ReadFileTool.MAX_LINES_PER_CHUNK,
        tokenBudget: options.tokenBudget ?? ReadFileTool.DEFAULT_TOKEN_BUDGET,
      })
      const extension = path.extname(safePath).slice(1)

      advancedUI.logFunctionUpdate('success', `📖 Read file: ${filePath}`)
      if (chunk.truncated && chunk.nextStartLine) {
        advancedUI.logInfo(
          `Output truncated at lines ${chunk.startLine}-${chunk.endLine}; continue from line ${chunk.nextStartLine} for next chunk.`
        )
      }
      advancedUI.logFunctionCall('read-file-tool')

      return {
        path: filePath,
        content: chunk.content,
        size: stats.size,
        modified: stats.mtime,
        extension,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        nextStartLine: chunk.nextStartLine,
        truncated: chunk.truncated,
        estimatedTokens: chunk.estimatedTokens,
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `✖ Failed to read file: ${error.message}`)
      advancedUI.logFunctionCall('read-file-tool')
      throw error
    }
  }

  private estimateTokensFromLength(charCount: number): number {
    return Math.ceil(charCount / ReadFileTool.TOKEN_CHAR_RATIO)
  }

  private async readChunkWithBudget(
    safePath: string,
    encoding: BufferEncoding,
    options: { startLine: number; maxLinesPerChunk: number; tokenBudget: number }
  ): Promise<{
    content: string
    startLine: number
    endLine: number
    nextStartLine: number | null
    truncated: boolean
    estimatedTokens: number
  }> {
    const stream = createReadStream(safePath, {
      encoding,
      highWaterMark: 64 * 1024,
    })
    const reader = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    })

    const lines: string[] = []
    let charCount = 0
    let currentLine = 0
    let truncated = false
    const maxLines = Math.max(1, Math.min(options.maxLinesPerChunk, ReadFileTool.MAX_LINES_PER_CHUNK))
    const tokenBudget = Math.max(1000, Math.min(options.tokenBudget, ReadFileTool.DEFAULT_TOKEN_BUDGET))

    try {
      for await (const line of reader) {
        currentLine++
        if (currentLine < options.startLine) {
          continue
        }

        const projectedCharCount = charCount + line.length + 1
        const projectedTokens = this.estimateTokensFromLength(projectedCharCount)
        if (lines.length >= maxLines || projectedTokens > tokenBudget) {
          truncated = true
          break
        }

        lines.push(line)
        charCount = projectedCharCount
      }
    } finally {
      reader.close()
      stream.close()
    }

    const content = lines.join('\n')
    const endLine = lines.length > 0 ? options.startLine + lines.length - 1 : Math.max(options.startLine, 1)
    const nextStartLine = truncated ? endLine + 1 : null

    return {
      content,
      startLine: options.startLine,
      endLine,
      nextStartLine,
      truncated,
      estimatedTokens: this.estimateTokensFromLength(charCount),
    }
  }
}

/**
 * Secure file writing tool with path validation and user confirmation
 */
export class WriteFileTool {
  private workingDirectory: string

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || process.cwd()
  }

  async execute(
    filePath: string,
    content: string,
    options: {
      skipConfirmation?: boolean
      createDirectories?: boolean
    } = {}
  ): Promise<void> {
    try {
      const safePath = sanitizePath(filePath, this.workingDirectory)
      const fileExists = fs.existsSync(safePath)

      // Validate that if the path exists, it's not a directory
      if (fileExists) {
        const stats = fs.statSync(safePath)
        if (stats.isDirectory()) {
          throw new Error(`Cannot write file: path is a directory: ${filePath}`)
        }
      }

      // Show confirmation prompt unless explicitly skipped
      if (!options.skipConfirmation) {
        const action = fileExists ? 'overwrite' : 'create'

        // Use batch approval system
        const confirmed = await requestBatchApproval(action, filePath, content)

        if (!confirmed) {
          advancedUI.logFunctionUpdate('warning', '✋ File operation cancelled by user')
          return
        }
      }

      // Create parent directories if needed
      if (options.createDirectories) {
        const dir = path.dirname(safePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
          advancedUI.logFunctionUpdate('info', `📁 Created directory: ${path.relative(this.workingDirectory, dir)}`)
        }
      }

      fs.writeFileSync(safePath, content, 'utf8')
      advancedUI.logFunctionUpdate('success', `✓ File ${fileExists ? 'updated' : 'created'}: ${filePath}`)
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `✖ Failed to write file: ${error.message}`)
      throw error
    }
  }
}

/**
 * Secure directory listing tool with path validation
 */
export class ListDirectoryTool {
  private workingDirectory: string

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || process.cwd()
  }

  async execute(
    directoryPath: string = '.',
    options: {
      recursive?: boolean
      includeHidden?: boolean
      pattern?: RegExp
    } = {}
  ): Promise<{
    files: string[]
    directories: string[]
    total: number
  }> {
    try {
      const safePath = sanitizePath(directoryPath, this.workingDirectory)

      if (!fs.existsSync(safePath)) {
        throw new Error(`Directory not found: ${directoryPath}`)
      }

      const stats = fs.statSync(safePath)
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${directoryPath}`)
      }

      const files: string[] = []
      const directories: string[] = []

      const walkDir = (dir: string, currentDepth: number = 0) => {
        const items = fs.readdirSync(dir)

        for (const item of items) {
          // Skip hidden files unless explicitly included
          if (!options.includeHidden && item.startsWith('.')) {
            continue
          }

          const itemPath = path.join(dir, item)
          const relativePath = path.relative(safePath, itemPath)
          const stats = fs.statSync(itemPath)

          if (stats.isDirectory()) {
            // Skip common directories that should be ignored
            if (['node_modules', '.git', 'dist', 'build', '.next'].includes(item)) {
              continue
            }

            directories.push(relativePath || item)

            // Recurse if requested
            if (options.recursive) {
              walkDir(itemPath, currentDepth + 1)
            }
          } else {
            // Apply pattern filter if provided
            if (!options.pattern || options.pattern.test(relativePath || item)) {
              files.push(relativePath || item)
            }
          }
        }
      }

      walkDir(safePath)

      advancedUI.logFunctionUpdate(
        'success',
        `⚡︎ Listed directory: ${directoryPath} (${files.length} files, ${directories.length} directories)`
      )
      advancedUI.logFunctionCall('list-directory-tool')

      return {
        files: files.sort(),
        directories: directories.sort(),
        total: files.length + directories.length,
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `✖ Failed to list directory: ${error.message}`)
      throw error
    }
  }
}

/**
 * Secure file replacement tool with user confirmation
 */
export class ReplaceInFileTool {
  private workingDirectory: string

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || process.cwd()
  }

  async execute(
    filePath: string,
    replacements: Array<{
      find: string | RegExp
      replace: string
      global?: boolean
    }>,
    options: {
      skipConfirmation?: boolean
      createBackup?: boolean
    } = {}
  ): Promise<{
    replacements: number
    backup?: string
  }> {
    try {
      const safePath = sanitizePath(filePath, this.workingDirectory)

      if (!fs.existsSync(safePath)) {
        throw new Error(`File not found: ${filePath}`)
      }

      const originalContent = fs.readFileSync(safePath, 'utf8')
      let modifiedContent = originalContent
      let totalReplacements = 0

      // Apply all replacements
      for (const replacement of replacements) {
        const regex =
          typeof replacement.find === 'string'
            ? new RegExp(replacement.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), replacement.global ? 'g' : '')
            : replacement.find

        const matches = modifiedContent.match(regex)
        if (matches) {
          modifiedContent = modifiedContent.replace(regex, replacement.replace)
          totalReplacements += matches.length
        }
      }

      if (totalReplacements === 0) {
        advancedUI.logFunctionUpdate('warning', `⚠︎  No replacements made in: ${filePath}`)
        return { replacements: 0 }
      }

      // Show confirmation unless skipped
      if (!options.skipConfirmation) {
        advancedUI.logFunctionUpdate('info', `\n📝 Proposed changes to ${filePath}:`)
        advancedUI.logFunctionUpdate('info', `${totalReplacements} replacement(s) will be made`)

        // Use batch approval system
        const confirmed = await requestBatchApproval('replace', filePath)

        if (!confirmed) {
          advancedUI.logFunctionUpdate('warning', ' File replacement cancelled by user')
          return { replacements: 0 }
        }
      }

      let backupPath: string | undefined

      // Create backup if requested
      if (options.createBackup) {
        backupPath = `${safePath}.backup.${Date.now()}`
        fs.writeFileSync(backupPath, originalContent, 'utf8')
        advancedUI.logFunctionUpdate('info', ` Backup created: ${path.relative(this.workingDirectory, backupPath)}`)
      }

      // Write the modified content
      fs.writeFileSync(safePath, modifiedContent, 'utf8')
      advancedUI.logFunctionUpdate('success', `✓ Applied ${totalReplacements} replacement(s) to: ${filePath}`)

      return {
        replacements: totalReplacements,
        backup: backupPath ? path.relative(this.workingDirectory, backupPath) : undefined,
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `✖ Failed to replace in file: ${error.message}`)
      throw error
    }
  }
}

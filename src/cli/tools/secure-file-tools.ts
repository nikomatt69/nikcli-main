import path from 'node:path' // Keep for security-critical path operations
import chalk from 'chalk'
import inquirer from 'inquirer'
import { inputQueue } from '../core/input-queue'
import { advancedUI } from '../ui/advanced-cli-ui'
import { fileExists, readText, writeText, mkdirp } from '../utils/bun-compat'

// Helper to get file/directory stats using Bun
async function getStats(filePath: string) {
  const file = Bun.file(filePath)
  const exists = await file.exists()
  if (!exists) return null

  // Use shell stat command for detailed info
  try {
    const result = await Bun.$`stat -f '%HT' ${filePath} 2>/dev/null || stat -c '%F' ${filePath} 2>/dev/null`.text()
    const type = result.trim()
    return {
      isFile: () => type.includes('Regular File') || type === 'regular file',
      isDirectory: () => type.includes('Directory') || type === 'directory',
    }
  } catch {
    // Fallback: try to read as file
    try {
      await file.text()
      return { isFile: () => true, isDirectory: () => false }
    } catch {
      return { isFile: () => false, isDirectory: () => true }
    }
  }
}

// Synchronous version using shell
function getStatsSync(filePath: string) {
  try {
    const result = Bun.$.sync`test -f ${filePath} && echo 'file' || (test -d ${filePath} && echo 'directory' || echo 'none')`.text()
    const type = result.trim()
    return type === 'none' ? null : {
      isFile: () => type === 'file',
      isDirectory: () => type === 'directory',
    }
  } catch {
    return null
  }
}

// Global batch approval state
const batchApprovalState = {
  pendingFiles: new Map<string, Array<{ filePath: string; action: string; content?: string }>>(),
  approvalInProgress: false,
}

/**
 * Utility to sanitize and validate file paths to prevent directory traversal attacks
 */
export function sanitizePath(filePath: string, workingDirectory: string = process.cwd()): string {
  // Normalize the path to resolve any '..' or '.' segments
  const normalizedPath = path.normalize(filePath)

  // Resolve to absolute path
  const absolutePath = path.resolve(workingDirectory, normalizedPath)

  // Ensure the resolved path is within the working directory
  const workingDirAbsolute = path.resolve(workingDirectory)

  if (!absolutePath.startsWith(workingDirAbsolute)) {
    throw new Error(`Path traversal detected: ${filePath} resolves outside working directory`)
  }

  return absolutePath
}

/**
 * Validate that a path exists and is a file (not a directory)
 * @throws Error if path doesn't exist, is a directory, or other file system error
 */
export function validateIsFile(filePath: string, customErrorMsg?: string): void {
  const stats = getStatsSync(filePath)

  if (!stats) {
    throw new Error(`File not found: ${filePath}`)
  }

  if (!stats.isFile()) {
    throw new Error(customErrorMsg || `Path is not a file (is a directory): ${filePath}`)
  }
}

/**
 * Validate that a path exists and is a directory (not a file)
 * @throws Error if path doesn't exist, is a file, or other file system error
 */
export function validateIsDirectory(dirPath: string, customErrorMsg?: string): void {
  const stats = getStatsSync(dirPath)

  if (!stats) {
    throw new Error(`Directory not found: ${dirPath}`)
  }

  if (!stats.isDirectory()) {
    throw new Error(customErrorMsg || `Path is not a directory (is a file): ${dirPath}`)
  }
}

/**
 * Check if a path exists and is a directory (does not throw)
 */
export function isDirectory(dirPath: string): boolean {
  try {
    const stats = getStatsSync(dirPath)
    return stats ? stats.isDirectory() : false
  } catch {
    return false
  }
}

/**
 * Check if a path exists and is a file (does not throw)
 */
export function isFile(filePath: string): boolean {
  try {
    const stats = getStatsSync(filePath)
    return stats ? stats.isFile() : false
  } catch {
    return false
  }
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

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || process.cwd()
  }

  async execute(filePath: string): Promise<{
    path: string
    content: string
    size: number
    modified: Date
    extension: string
  }> {
    try {
      const safePath = sanitizePath(filePath, this.workingDirectory)

      const file = Bun.file(safePath)
      if (!(await file.exists())) {
        throw new Error(`File not found: ${filePath}`)
      }

      const stats = await getStats(safePath)
      if (!stats || !stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`)
      }

      const content = await file.text()
      const extension = path.extname(safePath).slice(1)

      advancedUI.logFunctionUpdate('success', `📖 Read file: ${filePath}`)
      advancedUI.logFunctionCall('read-file-tool')

      return {
        path: filePath,
        content,
        size: file.size,
        modified: new Date(file.lastModified),
        extension,
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `✖ Failed to read file: ${error.message}`)
      advancedUI.logFunctionCall('read-file-tool')
      throw error
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
      const file = Bun.file(safePath)
      const fileAlreadyExists = await file.exists()

      // Validate that if the path exists, it's not a directory
      if (fileAlreadyExists) {
        const stats = await getStats(safePath)
        if (stats && stats.isDirectory()) {
          throw new Error(`Cannot write file: path is a directory: ${filePath}`)
        }
      }

      // Show confirmation prompt unless explicitly skipped
      if (!options.skipConfirmation) {
        const action = fileAlreadyExists ? 'overwrite' : 'create'

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
        const dirFile = Bun.file(dir)
        if (!(await dirFile.exists())) {
          await mkdirp(dir)
          advancedUI.logFunctionUpdate('info', `📁 Created directory: ${path.relative(this.workingDirectory, dir)}`)
        }
      }

      await writeText(safePath, content)
      advancedUI.logFunctionUpdate('success', `✓ File ${fileAlreadyExists ? 'updated' : 'created'}: ${filePath}`)
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

      const file = Bun.file(safePath)
      if (!(await file.exists())) {
        throw new Error(`Directory not found: ${directoryPath}`)
      }

      const stats = await getStats(safePath)
      if (!stats || !stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${directoryPath}`)
      }

      const files: string[] = []
      const directories: string[] = []

      const walkDir = async (dir: string, currentDepth: number = 0) => {
        // Use ls command to list directory
        const lsResult = await Bun.$`ls -1 ${dir}`.quiet().text()
        const items = lsResult.trim().split('\n').filter(Boolean)

        for (const item of items) {
          // Skip hidden files unless explicitly included
          if (!options.includeHidden && item.startsWith('.')) {
            continue
          }

          const itemPath = path.join(dir, item)
          const relativePath = path.relative(safePath, itemPath)
          const stats = await getStats(itemPath)

          if (stats && stats.isDirectory()) {
            // Skip common directories that should be ignored
            if (['node_modules', '.git', 'dist', 'build', '.next'].includes(item)) {
              continue
            }

            directories.push(relativePath || item)

            // Recurse if requested
            if (options.recursive) {
              await walkDir(itemPath, currentDepth + 1)
            }
          } else if (stats) {
            // Apply pattern filter if provided
            if (!options.pattern || options.pattern.test(relativePath || item)) {
              files.push(relativePath || item)
            }
          }
        }
      }

      await walkDir(safePath)

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

      const file = Bun.file(safePath)
      if (!(await file.exists())) {
        throw new Error(`File not found: ${filePath}`)
      }

      const originalContent = await readText(safePath)
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
        await writeText(backupPath, originalContent)
        advancedUI.logFunctionUpdate('info', ` Backup created: ${path.relative(this.workingDirectory, backupPath)}`)
      }

      // Write the modified content
      await writeText(safePath, modifiedContent)
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

import * as fs from 'fs'
import * as path from 'path'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { inputQueue } from '../core/input-queue'
import { advancedUI } from '../ui/advanced-cli-ui'

// Global batch approval state
const batchApprovalState = {
  pendingFiles: new Map<string, Array<{ filePath: string; action: string; content?: string }>>(),
  approvalInProgress: false,
}

/**
 * Utility to sanitize and validate file paths to prevent directory traversal attacks
 */
export function sanitizePath(filePath: string, workingDir: string = process.cwd()): string {
  // Normalize the path to resolve any '..' or '.' segments
  const normalizedPath = path.normalize(filePath)

  // Resolve to absolute path
  const absolutePath = path.resolve(workingDir, normalizedPath)

  // Ensure the resolved path is within the working directory
  const workingDirAbsolute = path.resolve(workingDir)

  if (!absolutePath.startsWith(workingDirAbsolute)) {
    throw new Error(`Path traversal detected: ${filePath} resolves outside working directory`)
  }

  return absolutePath
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
  const actionText = action === 'overwrite' ? '⚠️ Overwrite' : action === 'create' ? '📝 Create' : '⚡︎ Replace in'
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

      if (!fs.existsSync(safePath)) {
        throw new Error(`File not found: ${filePath}`)
      }

      const stats = fs.statSync(safePath)

      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`)
      }

      const content = fs.readFileSync(safePath, 'utf8')
      const extension = path.extname(safePath).slice(1)

      advancedUI.logFunctionUpdate('success', `📖 Read file: ${filePath}`)
      advancedUI.logFunctionCall('read-file-tool')

      return {
        path: filePath,
        content,
        size: stats.size,
        modified: stats.mtime,
        extension,
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `❌ Failed to read file: ${error.message}`)
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
      const fileExists = fs.existsSync(safePath)

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
      advancedUI.logFunctionUpdate('error', `❌ Failed to write file: ${error.message}`)
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
      advancedUI.logFunctionUpdate('error', `❌ Failed to list directory: ${error.message}`)
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
        advancedUI.logFunctionUpdate('warning', `⚠️  No replacements made in: ${filePath}`)
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
      advancedUI.logFunctionUpdate('error', `❌ Failed to replace in file: ${error.message}`)
      throw error
    }
  }
}

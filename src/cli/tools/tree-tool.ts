import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import chalk from 'chalk'
import { PromptManager } from '../prompts/prompt-manager'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { IGNORE_PATTERNS } from './list-tool'
import { sanitizePath } from './secure-file-tools'

/**
 * TreeTool - Directory structure visualization
 *
 * Features:
 * - Beautiful tree visualization
 * - Gitignore support
 * - Max depth control
 * - Size information
 * - File count statistics
 * - Customizable icons
 */

export interface TreeToolParams {
  path?: string
  maxDepth?: number
  showHidden?: boolean
  showSize?: boolean
  showFullPath?: boolean
  ignorePatterns?: string[]
  onlyDirectories?: boolean
  sortBy?: 'name' | 'size' | 'type'
  useIcons?: boolean
}

export interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  size: number
  children?: TreeNode[]
  depth: number
}

export interface TreeResult {
  rootPath: string
  tree: TreeNode
  formatted: string
  stats: {
    totalFiles: number
    totalDirectories: number
    totalSize: number
    maxDepth: number
    executionTime: number
  }
}

const TREE_CHARS = {
  BRANCH: '├── ',
  LAST_BRANCH: '└── ',
  PIPE: '│   ',
  SPACE: '    ',
}

const FILE_ICONS: Record<string, string> = {
  '.ts': '󰛦',
  '.tsx': '',
  '.js': '',
  '.jsx': '',
  '.json': '',
  '.md': '',
  '.txt': '',
  '.yml': '',
  '.yaml': '',
  '.toml': '',
  '.lock': '',
  '.git': '',
  '.gitignore': '',
  '.env': '',
  '.pdf': '',
  '.jpg': '',
  '.png': '',
  '.svg': '',
  '.css': '',
  '.scss': '',
  '.html': '',
  '.zip': '',
  '.tar': '',
  '.gz': '',
  directory: '',
}

export class TreeTool extends BaseTool {
  private totalFiles = 0
  private totalDirectories = 0
  private totalSize = 0
  private currentMaxDepth = 0

  constructor(workingDirectory: string) {
    super('tree-tool', workingDirectory)
  }

  async execute(params: TreeToolParams): Promise<ToolExecutionResult> {
    try {
      // Load tool-specific prompt
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'tree-tool',
        parameters: params,
      })

      advancedUI.logInfo(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      const searchPath = params.path || this.workingDirectory
      const maxDepth = params.maxDepth !== undefined ? params.maxDepth : 5
      const showSize = params.showSize !== undefined ? params.showSize : true
      const useIcons = params.useIcons !== undefined ? params.useIcons : true

      // Security validation
      const sanitized = sanitizePath(searchPath, this.workingDirectory)

      advancedUI.logInfo(` Building tree for: ${CliUI.info(sanitized)}`)

      const startTime = Date.now()

      // Reset counters
      this.totalFiles = 0
      this.totalDirectories = 0
      this.totalSize = 0
      this.currentMaxDepth = 0

      // Build tree structure
      const tree = await this.buildTree(sanitized, 0, maxDepth, params)

      // Format tree for display
      const formatted = this.formatTree(tree, '', true, useIcons, showSize)

      const executionTime = Date.now() - startTime

      const result: TreeResult = {
        rootPath: sanitized,
        tree,
        formatted,
        stats: {
          totalFiles: this.totalFiles,
          totalDirectories: this.totalDirectories,
          totalSize: this.totalSize,
          maxDepth: this.currentMaxDepth,
          executionTime,
        },
      }

      advancedUI.logSuccess(`✓ Tree complete: ${this.totalDirectories} directories, ${this.totalFiles} files`)

      // Display tree
      console.log('\n' + chalk.cyan.bold(relative(this.workingDirectory, sanitized) || '.'))
      console.log(result.formatted)
      console.log(
        chalk.gray(
          `\n${this.totalDirectories} directories, ${this.totalFiles} files, ${this.formatSize(this.totalSize)}`
        )
      )

      return {
        success: true,
        data: result,
        metadata: {
          executionTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      advancedUI.logError(`Tree tool failed: ${error.message}`)
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Build tree structure recursively
   */
  private async buildTree(path: string, depth: number, maxDepth: number, params: TreeToolParams): Promise<TreeNode> {
    const stats = await stat(path)
    const name = require('node:path').basename(path)

    this.currentMaxDepth = Math.max(this.currentMaxDepth, depth)

    const node: TreeNode = {
      name,
      path,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      depth,
    }

    if (stats.isFile()) {
      this.totalFiles++
      this.totalSize += stats.size
      return node
    }

    this.totalDirectories++

    // Don't recurse if max depth reached
    if (depth >= maxDepth) {
      return node
    }

    // Only show directories if requested
    if (params.onlyDirectories && !stats.isDirectory()) {
      return node
    }

    try {
      const entries = await readdir(path)
      const children: TreeNode[] = []

      for (const entry of entries) {
        // Skip hidden files unless requested
        if (!params.showHidden && entry.startsWith('.')) {
          continue
        }

        const entryPath = join(path, entry)
        const relativePath = relative(this.workingDirectory, entryPath)

        // Apply ignore patterns
        if (this.shouldIgnore(relativePath, params.ignorePatterns)) {
          continue
        }

        try {
          const child = await this.buildTree(entryPath, depth + 1, maxDepth, params)
          children.push(child)
        } catch (error) {
          advancedUI.logInfo(`Skipping ${entry}: ${error}`)
        }
      }

      // Sort children
      this.sortNodes(children, params.sortBy || 'name')

      node.children = children
    } catch (error) {
      advancedUI.logInfo(`Cannot read directory ${path}: ${error}`)
    }

    return node
  }

  /**
   * Format tree for display
   */
  private formatTree(node: TreeNode, prefix: string, isLast: boolean, useIcons: boolean, showSize: boolean): string {
    const lines: string[] = []

    if (node.depth > 0) {
      const connector = isLast ? TREE_CHARS.LAST_BRANCH : TREE_CHARS.BRANCH
      const icon = useIcons ? this.getIcon(node) + ' ' : ''
      const sizeInfo = showSize && node.isDirectory === false ? ` ${chalk.gray(this.formatSize(node.size))}` : ''

      const nameColor = node.isDirectory ? chalk.blue.bold : chalk.white
      lines.push(`${prefix}${connector}${icon}${nameColor(node.name)}${sizeInfo}`)
    }

    if (node.children) {
      const childPrefix = node.depth > 0 ? prefix + (isLast ? TREE_CHARS.SPACE : TREE_CHARS.PIPE) : ''

      node.children.forEach((child, index) => {
        const childIsLast = index === node.children!.length - 1
        lines.push(this.formatTree(child, childPrefix, childIsLast, useIcons, showSize))
      })
    }

    return lines.join('\n')
  }

  /**
   * Get icon for file/directory
   */
  private getIcon(node: TreeNode): string {
    if (node.isDirectory) {
      return FILE_ICONS.directory
    }

    const ext = require('node:path').extname(node.name).toLowerCase()
    return FILE_ICONS[ext] || FILE_ICONS[node.name] || ''
  }

  /**
   * Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }

  /**
   * Sort tree nodes
   */
  private sortNodes(nodes: TreeNode[], sortBy: string): void {
    nodes.sort((a, b) => {
      // Directories first
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }

      switch (sortBy) {
        case 'size':
          return b.size - a.size
        case 'type': {
          const extA = require('node:path').extname(a.name)
          const extB = require('node:path').extname(b.name)
          return extA.localeCompare(extB)
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name)
      }
    })
  }

  /**
   * Check if path should be ignored
   */
  private shouldIgnore(relativePath: string, customPatterns?: string[]): boolean {
    const allPatterns = [...IGNORE_PATTERNS, ...(customPatterns || [])]
    const pathLower = relativePath.toLowerCase()

    return allPatterns.some((pattern) => {
      if (pattern.endsWith('/')) {
        return pathLower.includes(pattern.toLowerCase())
      }
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        return regex.test(pathLower)
      }
      return pathLower.includes(pattern.toLowerCase())
    })
  }
}

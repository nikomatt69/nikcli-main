import { watch } from 'chokidar'
import { relative } from 'node:path'
import chalk from 'chalk'
import { PromptManager } from '../prompts/prompt-manager'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { sanitizePath } from './secure-file-tools'

/**
 * WatchTool - File system monitoring and change detection
 *
 * Features:
 * - Real-time file system monitoring
 * - Multiple event types (add, change, unlink)
 * - Pattern-based filtering
 * - Debouncing support
 * - Change aggregation
 * - Callback execution on changes
 */

export interface WatchToolParams {
  path?: string | string[]
  patterns?: string[]
  ignorePatterns?: string[]
  ignoreInitial?: boolean
  persistent?: boolean
  depth?: number
  awaitWriteFinish?: boolean
  debounceDelay?: number
  events?: ('add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir')[]
  maxEvents?: number
  callback?: (event: WatchEvent) => void | Promise<void>
}

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  relativePath: string
  timestamp: Date
  size?: number
}

export interface WatchResult {
  watchedPaths: string[]
  events: WatchEvent[]
  stats: {
    totalEvents: number
    addedFiles: number
    changedFiles: number
    removedFiles: number
    startTime: Date
    endTime?: Date
  }
  stop: () => Promise<void>
}

export class WatchTool extends BaseTool {
  private watcher: any = null
  private events: WatchEvent[] = []
  private eventCounts = {
    add: 0,
    change: 0,
    unlink: 0,
    addDir: 0,
    unlinkDir: 0,
  }

  constructor(workingDirectory: string) {
    super('watch-tool', workingDirectory)
  }

  async execute(params: WatchToolParams): Promise<ToolExecutionResult> {
    try {
      // Load tool-specific prompt
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'watch-tool',
        parameters: params,
      })

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      const watchPaths = params.path || this.workingDirectory
      const maxEvents = params.maxEvents || 100
      const debounceDelay = params.debounceDelay || 300
      const watchedEvents = params.events || ['add', 'change', 'unlink']

      // Security validation
      const sanitizedPaths = Array.isArray(watchPaths)
        ? watchPaths.map((p) => sanitizePath(p, this.workingDirectory))
        : [sanitizePath(watchPaths, this.workingDirectory)]

      CliUI.logInfo(`👁️  Watching: ${CliUI.highlight(sanitizedPaths.join(', '))}`)

      const startTime = new Date()

      // Reset counters
      this.events = []
      this.eventCounts = {
        add: 0,
        change: 0,
        unlink: 0,
        addDir: 0,
        unlinkDir: 0,
      }

      // Configure chokidar watcher
      const chokidarOptions = {
        ignored: params.ignorePatterns || ['**/node_modules/**', '**/.git/**'],
        ignoreInitial: params.ignoreInitial !== undefined ? params.ignoreInitial : true,
        persistent: params.persistent !== undefined ? params.persistent : true,
        depth: params.depth,
        awaitWriteFinish: params.awaitWriteFinish
          ? {
              stabilityThreshold: debounceDelay,
              pollInterval: 100,
            }
          : false,
      }

      // Start watching
      this.watcher = watch(sanitizedPaths, chokidarOptions)

      // Set up event handlers
      const handleEvent = async (type: WatchEvent['type'], path: string, stats?: any) => {
        if (!watchedEvents.includes(type)) return

        const event: WatchEvent = {
          type,
          path,
          relativePath: relative(this.workingDirectory, path),
          timestamp: new Date(),
          size: stats?.size,
        }

        this.events.push(event)
        this.eventCounts[type]++

        // Log event
        const icon = this.getEventIcon(type)
        const color = this.getEventColor(type)
        CliUI.logInfo(`${icon} ${color(type.toUpperCase())}: ${chalk.cyan(event.relativePath)}`)

        // Execute callback if provided
        if (params.callback) {
          try {
            await params.callback(event)
          } catch (error: any) {
            CliUI.logError(`Callback failed: ${error.message}`)
          }
        }

        // Stop if max events reached
        if (this.events.length >= maxEvents) {
          CliUI.logWarning(`⚠️  Max events (${maxEvents}) reached, stopping watcher`)
          await this.stopWatcher()
        }
      }

      this.watcher.on('add', (path: string, stats: any) => handleEvent('add', path, stats))
      this.watcher.on('change', (path: string, stats: any) => handleEvent('change', path, stats))
      this.watcher.on('unlink', (path: string) => handleEvent('unlink', path))
      this.watcher.on('addDir', (path: string) => handleEvent('addDir', path))
      this.watcher.on('unlinkDir', (path: string) => handleEvent('unlinkDir', path))

      this.watcher.on('error', (error: Error) => {
        CliUI.logError(`Watch error: ${error.message}`)
      })

      this.watcher.on('ready', () => {
        CliUI.logSuccess('✓ Watcher ready')
      })

      const result: WatchResult = {
        watchedPaths: sanitizedPaths,
        events: this.events,
        stats: {
          totalEvents: this.events.length,
          addedFiles: this.eventCounts.add,
          changedFiles: this.eventCounts.change,
          removedFiles: this.eventCounts.unlink,
          startTime,
        },
        stop: async () => {
          await this.stopWatcher()
        },
      }

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime.getTime(),
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      CliUI.logError(`Watch tool failed: ${error.message}`)
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
   * Stop the watcher
   */
  private async stopWatcher(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      CliUI.logInfo('👋 Watcher stopped')
    }
  }

  /**
   * Get icon for event type
   */
  private getEventIcon(type: string): string {
    const icons: Record<string, string> = {
      add: '➕',
      change: '📝',
      unlink: '🗑️',
      addDir: '📁',
      unlinkDir: '🗂️',
    }
    return icons[type] || '•'
  }

  /**
   * Get color function for event type
   */
  private getEventColor(type: string): (text: string) => string {
    const colors: Record<string, (text: string) => string> = {
      add: chalk.green,
      change: chalk.yellow,
      unlink: chalk.red,
      addDir: chalk.blue,
      unlinkDir: chalk.gray,
    }
    return colors[type] || chalk.white
  }

  /**
   * Cleanup on tool destruction
   */
  async cleanup(): Promise<void> {
    await this.stopWatcher()
  }
}

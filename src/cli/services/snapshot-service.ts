import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import {
  type SnapshotEntry,
  type SnapshotSearchOptions,
  snapshotProvider,
} from '../providers/snapshot/snapshot-provider'
import { structuredLogger } from '../utils/structured-logger'

export interface SnapshotTemplate {
  name: string
  description: string
  includePaths: string[]
  excludePaths: string[]
  tags: string[]
  schedule?: {
    enabled: boolean
    cron: string
    maxKeep: number
  }
}

/**
 * Snapshot Service - High-level interface for snapshot management
 * Provides project snapshot capabilities with templates and automation
 */
export class SnapshotService extends EventEmitter {
  private templates: Map<string, SnapshotTemplate> = new Map()
  private isInitialized = false
  private scheduleTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor() {
    super()

    // Listen to provider events
    snapshotProvider.on('snapshot_created', (data) => {
      this.emit('snapshot_created', data)
    })

    snapshotProvider.on('snapshot_restored', (data) => {
      this.emit('snapshot_restored', data)
    })

    snapshotProvider.on('snapshot_deleted', (data) => {
      this.emit('snapshot_deleted', data)
    })

    // Setup default templates
    this.setupDefaultTemplates()
  }

  /**
   * Initialize snapshot service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      await snapshotProvider.initialize()
      this.isInitialized = true

      structuredLogger.success('Snapshot Service', '✅ Snapshot Service initialized')
      this.emit('initialized')
    } catch (error: any) {
      structuredLogger.error('Snapshot Service', `❌ Snapshot Service initialization failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Create snapshot from template
   */
  async createFromTemplate(
    templateName: string,
    snapshotName?: string,
    additionalTags: string[] = []
  ): Promise<string> {
    if (!this.isInitialized) await this.initialize()

    const template = this.templates.get(templateName)
    if (!template) {
      throw new Error(`Template not found: ${templateName}`)
    }

    const name = snapshotName || `${template.name}_${new Date().toISOString().split('T')[0]}`
    const tags = [...template.tags, ...additionalTags]

    console.log(chalk.blue(`📸 Creating snapshot from template: ${templateName}`))

    return await snapshotProvider.createSnapshot(name, template.description, {
      includePaths: template.includePaths,
      excludePaths: template.excludePaths,
      tags,
    })
  }

  /**
   * Create quick snapshot of current project
   */
  async createQuickSnapshot(name: string, description: string = '', tags: string[] = ['quick']): Promise<string> {
    if (!this.isInitialized) await this.initialize()

    console.log(chalk.blue(`📸 Creating quick snapshot: ${name}`))

    return await snapshotProvider.createSnapshot(name, description, {
      tags: [...tags, 'quick'],
    })
  }

  /**
   * Create full project snapshot
   */
  async createFullSnapshot(
    name: string,
    description: string = '',
    includeNodeModules: boolean = false
  ): Promise<string> {
    if (!this.isInitialized) await this.initialize()

    const excludePaths = includeNodeModules
      ? ['.git/**', 'dist/**', 'build/**', '*.log']
      : ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.log']

    console.log(chalk.blue(`📸 Creating full project snapshot: ${name}`))

    return await snapshotProvider.createSnapshot(name, description, {
      excludePaths,
      tags: ['full', 'project'],
    })
  }

  /**
   * Create development snapshot
   */
  async createDevSnapshot(name: string, description: string = ''): Promise<string> {
    if (!this.isInitialized) await this.initialize()

    console.log(chalk.blue(`📸 Creating development snapshot: ${name}`))

    return await snapshotProvider.createSnapshot(name, description, {
      includePaths: ['src/**', '*.json', '*.md', '*.ts', '*.js'],
      tags: ['development', 'dev'],
    })
  }

  /**
   * Restore snapshot with options
   */
  async restoreSnapshot(
    snapshotId: string,
    options: {
      targetPath?: string
      overwrite?: boolean
      selectedFiles?: string[]
      backup?: boolean
    } = {}
  ): Promise<void> {
    if (!this.isInitialized) await this.initialize()

    // Create backup before restore if requested
    if (options.backup) {
      const backupName = `backup_before_restore_${new Date().toISOString().split('T')[0]}`
      console.log(chalk.blue(`💾 Creating backup before restore: ${backupName}`))
      await this.createQuickSnapshot(backupName, 'Auto backup before snapshot restore', ['backup', 'auto'])
    }

    await snapshotProvider.restoreSnapshot(snapshotId, options)
  }

  /**
   * Compare two snapshots
   */
  async compareSnapshots(
    snapshotId1: string,
    snapshotId2: string
  ): Promise<{
    added: string[]
    removed: string[]
    modified: string[]
    unchanged: string[]
  }> {
    if (!this.isInitialized) await this.initialize()

    const snapshots = await snapshotProvider.listSnapshots()
    const snapshot1 = snapshots.find((s) => s.id === snapshotId1)
    const snapshot2 = snapshots.find((s) => s.id === snapshotId2)

    if (!snapshot1 || !snapshot2) {
      throw new Error('One or both snapshots not found')
    }

    const files1 = new Map(snapshot1.files.map((f) => [f.path, f]))
    const files2 = new Map(snapshot2.files.map((f) => [f.path, f]))

    const added: string[] = []
    const removed: string[] = []
    const modified: string[] = []
    const unchanged: string[] = []

    // Check files in snapshot2
    for (const [path, file2] of files2) {
      const file1 = files1.get(path)
      if (!file1) {
        added.push(path)
      } else if (file1.hash !== file2.hash) {
        modified.push(path)
      } else {
        unchanged.push(path)
      }
    }

    // Check files only in snapshot1 (removed in snapshot2)
    for (const path of files1.keys()) {
      if (!files2.has(path)) {
        removed.push(path)
      }
    }

    return { added, removed, modified, unchanged }
  }

  /**
   * Search snapshots with advanced filtering
   */
  async searchSnapshots(query: string, options: SnapshotSearchOptions = {}): Promise<SnapshotEntry[]> {
    if (!this.isInitialized) await this.initialize()

    const searchOptions = {
      ...options,
      name: query || options.name,
    }

    return await snapshotProvider.listSnapshots(searchOptions)
  }

  /**
   * Get snapshots by tag
   */
  async getSnapshotsByTag(tag: string): Promise<SnapshotEntry[]> {
    if (!this.isInitialized) await this.initialize()

    return await snapshotProvider.listSnapshots({ tags: [tag] })
  }

  /**
   * Get recent snapshots
   */
  async getRecentSnapshots(limit: number = 10): Promise<SnapshotEntry[]> {
    if (!this.isInitialized) await this.initialize()

    return await snapshotProvider.listSnapshots({ limit })
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    if (!this.isInitialized) await this.initialize()

    return await snapshotProvider.deleteSnapshot(snapshotId)
  }

  /**
   * Cleanup old snapshots by criteria
   */
  async cleanupSnapshots(criteria: { olderThanDays?: number; keepCount?: number; tags?: string[] }): Promise<number> {
    if (!this.isInitialized) await this.initialize()

    const snapshots = await snapshotProvider.listSnapshots()
    let toDelete = snapshots

    // Filter by age
    if (criteria.olderThanDays) {
      const cutoffTime = Date.now() - criteria.olderThanDays * 24 * 60 * 60 * 1000
      toDelete = toDelete.filter((s) => s.timestamp < cutoffTime)
    }

    // Filter by tags
    if (criteria.tags && criteria.tags.length > 0) {
      toDelete = toDelete.filter((s) => criteria.tags!.some((tag) => s.metadata.tags.includes(tag)))
    }

    // Keep most recent if keepCount specified
    if (criteria.keepCount && criteria.keepCount > 0) {
      toDelete.sort((a, b) => b.timestamp - a.timestamp)
      toDelete = toDelete.slice(criteria.keepCount)
    }

    let deletedCount = 0
    for (const snapshot of toDelete) {
      const success = await snapshotProvider.deleteSnapshot(snapshot.id)
      if (success) deletedCount++
    }

    if (deletedCount > 0) {
      console.log(chalk.green(`🧹 Cleaned up ${deletedCount} snapshots`))
    }

    return deletedCount
  }

  /**
   * Create and manage template
   */
  createTemplate(name: string, template: SnapshotTemplate): void {
    this.templates.set(name, template)

    // Setup scheduling if enabled
    if (template.schedule?.enabled) {
      this.scheduleTemplate(name, template)
    }

    console.log(chalk.green(`✅ Template created: ${name}`))
    this.emit('template_created', { name, template })
  }

  /**
   * Get available templates
   */
  getTemplates(): Map<string, SnapshotTemplate> {
    return new Map(this.templates)
  }

  /**
   * Delete template
   */
  deleteTemplate(name: string): boolean {
    const deleted = this.templates.delete(name)

    if (deleted) {
      // Cancel any scheduled jobs
      const timer = this.scheduleTimers.get(name)
      if (timer) {
        clearTimeout(timer)
        this.scheduleTimers.delete(name)
      }

      console.log(chalk.green(`✅ Template deleted: ${name}`))
      this.emit('template_deleted', { name })
    }

    return deleted
  }

  /**
   * Get snapshot statistics
   */
  getSnapshotStats(): any {
    return snapshotProvider.getSnapshotStats()
  }

  // ===== PRIVATE METHODS =====

  private setupDefaultTemplates(): void {
    // Quick snapshot template
    this.templates.set('quick', {
      name: 'Quick',
      description: 'Quick snapshot of current state',
      includePaths: ['.'],
      excludePaths: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      tags: ['quick', 'auto'],
    })

    // Development template
    this.templates.set('dev', {
      name: 'Development',
      description: 'Development files snapshot',
      includePaths: ['src/**', '*.json', '*.md', '*.ts', '*.js', '*.tsx', '*.jsx'],
      excludePaths: ['dist/**', 'build/**'],
      tags: ['development', 'dev'],
    })

    // Full project template
    this.templates.set('full', {
      name: 'Full Project',
      description: 'Complete project snapshot',
      includePaths: ['.'],
      excludePaths: ['.git/**', 'node_modules/**', 'dist/**', 'build/**', '*.log'],
      tags: ['full', 'project'],
    })

    // Configuration template
    this.templates.set('config', {
      name: 'Configuration',
      description: 'Configuration files snapshot',
      includePaths: ['*.json', '*.yml', '*.yaml', '*.toml', '*.ini', '*.env*', 'Dockerfile*', '*.md'],
      excludePaths: [],
      tags: ['config', 'configuration'],
    })
  }

  private scheduleTemplate(name: string, template: SnapshotTemplate): void {
    if (!template.schedule?.enabled || !template.schedule?.cron) return

    // Simple scheduling - in production would use proper cron library
    const scheduleMs = this.parseCronToMs(template.schedule.cron)

    const timer = setTimeout(async () => {
      try {
        console.log(chalk.blue(`⏰ Running scheduled snapshot: ${name}`))

        const _snapshotId = await this.createFromTemplate(
          name,
          `${template.name}_scheduled_${new Date().toISOString().split('T')[0]}`,
          ['scheduled', 'auto']
        )

        // Cleanup old scheduled snapshots if maxKeep is set
        if (template.schedule!.maxKeep) {
          const scheduledSnapshots = await this.getSnapshotsByTag('scheduled')
          const templatedSnapshots = scheduledSnapshots.filter((s) => s.metadata.tags.includes(name))

          if (templatedSnapshots.length > template.schedule!.maxKeep) {
            templatedSnapshots.sort((a, b) => b.timestamp - a.timestamp)
            const toDelete = templatedSnapshots.slice(template.schedule!.maxKeep)

            for (const snapshot of toDelete) {
              await this.deleteSnapshot(snapshot.id)
            }
          }
        }

        // Reschedule
        this.scheduleTemplate(name, template)
      } catch (error: any) {
        console.log(chalk.red(`❌ Scheduled snapshot failed: ${error.message}`))
      }
    }, scheduleMs)

    this.scheduleTimers.set(name, timer)
  }

  private parseCronToMs(cron: string): number {
    // Simple cron parsing - in production would use proper cron library
    // For now, just return 24 hours for daily snapshots
    if (cron.includes('daily') || cron.includes('0 0 * * *')) {
      return 24 * 60 * 60 * 1000
    }
    if (cron.includes('hourly') || cron.includes('0 * * * *')) {
      return 60 * 60 * 1000
    }

    // Default to daily
    return 24 * 60 * 60 * 1000
  }

  /**
   * Export snapshot as archive
   */
  async exportSnapshot(snapshotId: string, format: 'json' | 'zip' = 'json'): Promise<string> {
    if (!this.isInitialized) await this.initialize()

    const snapshots = await snapshotProvider.listSnapshots()
    const snapshot = snapshots.find((s) => s.id === snapshotId)

    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`)
    }

    const exportPath = `./snapshot_${snapshotId.substring(0, 8)}.${format}`

    if (format === 'json') {
      const fs = require('node:fs/promises')
      await fs.writeFile(exportPath, JSON.stringify(snapshot, null, 2))
    } else if (format === 'zip') {
      // Would implement ZIP creation here
      throw new Error('ZIP export not yet implemented')
    }

    console.log(chalk.green(`📦 Snapshot exported: ${exportPath}`))
    return exportPath
  }

  /**
   * Get provider configuration
   */
  getConfig(): any {
    return snapshotProvider.getConfig()
  }
}

// Singleton instance
export const snapshotService = new SnapshotService()

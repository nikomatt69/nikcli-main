import { tool } from 'ai'
import chalk from 'chalk'
import { z } from 'zod'
import { snapshotService } from '../services/snapshot-service'

// Schema definitions
const CreateSnapshotSchema = z.object({
  name: z.string().describe('Name for the snapshot'),
  description: z.string().optional().describe('Optional description of the snapshot'),
  type: z.enum(['quick', 'full', 'dev', 'config']).default('quick').describe('Type of snapshot to create'),
  tags: z.array(z.string()).optional().describe('Optional tags for the snapshot'),
  includeNodeModules: z.boolean().optional().default(false).describe('Include node_modules in full snapshot'),
})

const RestoreSnapshotSchema = z.object({
  snapshotId: z.string().describe('ID of the snapshot to restore'),
  targetPath: z.string().optional().describe('Target path for restoration (default: current directory)'),
  overwrite: z.boolean().optional().default(false).describe('Overwrite existing files'),
  selectedFiles: z.array(z.string()).optional().describe('Specific files to restore'),
  backup: z.boolean().optional().default(true).describe('Create backup before restore'),
})

const ListSnapshotsSchema = z.object({
  query: z.string().optional().describe('Search query for snapshot names'),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  limit: z.number().optional().default(10).describe('Maximum number of snapshots to return'),
  dateRange: z
    .object({
      start: z.string().describe('Start date (ISO string)'),
      end: z.string().describe('End date (ISO string)'),
    })
    .optional()
    .describe('Date range filter'),
})

const CompareSnapshotsSchema = z.object({
  snapshot1Id: z.string().describe('First snapshot ID to compare'),
  snapshot2Id: z.string().describe('Second snapshot ID to compare'),
})

const DeleteSnapshotSchema = z.object({
  snapshotId: z.string().describe('ID of the snapshot to delete'),
  confirm: z.boolean().default(false).describe('Confirmation to delete snapshot'),
})

const CreateTemplateSchema = z.object({
  name: z.string().describe('Name for the template'),
  description: z.string().describe('Description of what this template captures'),
  includePaths: z.array(z.string()).describe('Paths to include in snapshot'),
  excludePaths: z.array(z.string()).optional().describe('Paths to exclude from snapshot'),
  tags: z.array(z.string()).optional().describe('Default tags for snapshots from this template'),
})

/**
 * Create Snapshot Tool
 * Creates project snapshots with different presets
 */
export const createSnapshotTool = tool({
  description:
    'Create a snapshot of the current project state. Supports different types: quick (current state), full (entire project), dev (source code only), config (configuration files)',
  parameters: CreateSnapshotSchema,
  execute: async ({ name, description = '', type, tags = [], includeNodeModules = false }) => {
    try {
      console.log(chalk.blue(`📸 Creating ${type} snapshot: ${name}`))

      let snapshotId: string

      switch (type) {
        case 'quick':
          snapshotId = await snapshotService.createQuickSnapshot(name, description, tags)
          break
        case 'full':
          snapshotId = await snapshotService.createFullSnapshot(name, description, includeNodeModules)
          break
        case 'dev':
          snapshotId = await snapshotService.createDevSnapshot(name, description)
          break
        case 'config':
          snapshotId = await snapshotService.createFromTemplate('config', name, tags)
          break
        default:
          snapshotId = await snapshotService.createQuickSnapshot(name, description, tags)
      }

      const stats = snapshotService.getSnapshotStats()

      return {
        success: true,
        snapshotId,
        name,
        type,
        message: `Snapshot created successfully: ${snapshotId.substring(0, 8)}...`,
        stats: {
          totalSnapshots: stats.totalSnapshots,
          totalSize: stats.totalSize,
        },
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to create snapshot: ${error.message}`))
      return {
        success: false,
        error: error.message,
        message: `Failed to create snapshot: ${error.message}`,
      }
    }
  },
})

/**
 * Restore Snapshot Tool
 * Restores files from a snapshot with options
 */
export const restoreSnapshotTool = tool({
  description:
    'Restore files from a snapshot. Can restore to current directory or specified path, with options for overwrite and file selection',
  parameters: RestoreSnapshotSchema,
  execute: async ({ snapshotId, targetPath, overwrite = false, selectedFiles, backup = true }) => {
    try {
      console.log(chalk.blue(`⚡︎ Restoring snapshot: ${snapshotId.substring(0, 8)}...`))

      await snapshotService.restoreSnapshot(snapshotId, {
        targetPath,
        overwrite,
        selectedFiles,
        backup,
      })

      return {
        success: true,
        snapshotId,
        targetPath: targetPath || process.cwd(),
        overwrite,
        backup,
        message: `Snapshot restored successfully`,
        filesRestored: selectedFiles ? selectedFiles.length : 'all',
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to restore snapshot: ${error.message}`))
      return {
        success: false,
        error: error.message,
        message: `Failed to restore snapshot: ${error.message}`,
      }
    }
  },
})

/**
 * List Snapshots Tool
 * Lists available snapshots with filtering options
 */
export const listSnapshotsTool = tool({
  description: 'List available snapshots with optional filtering by name, tags, or date range',
  parameters: ListSnapshotsSchema,
  execute: async ({ query, tags, limit = 10, dateRange }) => {
    try {
      const searchOptions: any = { limit }

      if (query) searchOptions.name = query
      if (tags) searchOptions.tags = tags
      if (dateRange) {
        searchOptions.dateRange = {
          start: new Date(dateRange.start).getTime(),
          end: new Date(dateRange.end).getTime(),
        }
      }

      const snapshots = await snapshotService.searchSnapshots(query || '', searchOptions)

      const snapshotList = snapshots.map((snapshot) => ({
        id: `${snapshot.id.substring(0, 8)}...`,
        fullId: snapshot.id,
        name: snapshot.name,
        description: snapshot.description,
        created: new Date(snapshot.timestamp).toLocaleString(),
        size: snapshot.metadata.size,
        fileCount: snapshot.metadata.fileCount,
        tags: snapshot.metadata.tags,
        branch: snapshot.metadata.branch,
        author: snapshot.metadata.author,
      }))

      console.log(chalk.green(`📋 Found ${snapshots.length} snapshots`))

      if (snapshots.length > 0) {
        console.log(chalk.cyan('Recent snapshots:'))
        snapshotList.slice(0, 5).forEach((s) => {
          console.log(chalk.gray(`  • ${s.name} (${s.id}) - ${s.created}`))
        })
      }

      return {
        success: true,
        count: snapshots.length,
        snapshots: snapshotList,
        query,
        tags,
        message: `Found ${snapshots.length} snapshots`,
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to list snapshots: ${error.message}`))
      return {
        success: false,
        error: error.message,
        message: `Failed to list snapshots: ${error.message}`,
      }
    }
  },
})

/**
 * Compare Snapshots Tool
 * Compares two snapshots to show differences
 */
export const compareSnapshotsTool = tool({
  description: 'Compare two snapshots to see what files were added, removed, or modified between them',
  parameters: CompareSnapshotsSchema,
  execute: async ({ snapshot1Id, snapshot2Id }) => {
    try {
      console.log(
        chalk.blue(`🔍 Comparing snapshots: ${snapshot1Id.substring(0, 8)}... vs ${snapshot2Id.substring(0, 8)}...`)
      )

      const comparison = await snapshotService.compareSnapshots(snapshot1Id, snapshot2Id)

      console.log(chalk.green(`📊 Comparison results:`))
      console.log(chalk.green(`  Added: ${comparison.added.length} files`))
      console.log(chalk.yellow(`  Modified: ${comparison.modified.length} files`))
      console.log(chalk.red(`  Removed: ${comparison.removed.length} files`))
      console.log(chalk.gray(`  Unchanged: ${comparison.unchanged.length} files`))

      if (comparison.added.length > 0) {
        console.log(chalk.green(`\n➕ Added files:`))
        comparison.added.slice(0, 10).forEach((file) => {
          console.log(chalk.green(`  + ${file}`))
        })
        if (comparison.added.length > 10) {
          console.log(chalk.gray(`  ... and ${comparison.added.length - 10} more`))
        }
      }

      if (comparison.modified.length > 0) {
        console.log(chalk.yellow(`\n📝 Modified files:`))
        comparison.modified.slice(0, 10).forEach((file) => {
          console.log(chalk.yellow(`  ~ ${file}`))
        })
        if (comparison.modified.length > 10) {
          console.log(chalk.gray(`  ... and ${comparison.modified.length - 10} more`))
        }
      }

      if (comparison.removed.length > 0) {
        console.log(chalk.red(`\n➖ Removed files:`))
        comparison.removed.slice(0, 10).forEach((file) => {
          console.log(chalk.red(`  - ${file}`))
        })
        if (comparison.removed.length > 10) {
          console.log(chalk.gray(`  ... and ${comparison.removed.length - 10} more`))
        }
      }

      return {
        success: true,
        snapshot1Id,
        snapshot2Id,
        comparison,
        summary: {
          added: comparison.added.length,
          modified: comparison.modified.length,
          removed: comparison.removed.length,
          unchanged: comparison.unchanged.length,
        },
        message: `Comparison completed: ${comparison.added.length} added, ${comparison.modified.length} modified, ${comparison.removed.length} removed`,
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to compare snapshots: ${error.message}`))
      return {
        success: false,
        error: error.message,
        message: `Failed to compare snapshots: ${error.message}`,
      }
    }
  },
})

/**
 * Delete Snapshot Tool
 * Deletes a snapshot permanently
 */
export const deleteSnapshotTool = tool({
  description: 'Delete a snapshot permanently. This action cannot be undone.',
  parameters: DeleteSnapshotSchema,
  execute: async ({ snapshotId, confirm = false }) => {
    try {
      if (!confirm) {
        return {
          success: false,
          message: 'Snapshot deletion requires confirmation. Set confirm: true to proceed.',
          warning: 'This action cannot be undone',
        }
      }

      console.log(chalk.blue(`🗑️ Deleting snapshot: ${snapshotId.substring(0, 8)}...`))

      const deleted = await snapshotService.deleteSnapshot(snapshotId)

      if (deleted) {
        console.log(chalk.green(`✓ Snapshot deleted successfully`))
        return {
          success: true,
          snapshotId,
          message: `Snapshot deleted successfully`,
        }
      } else {
        return {
          success: false,
          message: `Snapshot not found: ${snapshotId}`,
          error: 'Snapshot not found',
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to delete snapshot: ${error.message}`))
      return {
        success: false,
        error: error.message,
        message: `Failed to delete snapshot: ${error.message}`,
      }
    }
  },
})

/**
 * Create Snapshot Template Tool
 * Creates a reusable template for snapshots
 */
export const createSnapshotTemplateTool = tool({
  description: 'Create a reusable template for snapshots with specific include/exclude patterns and tags',
  parameters: CreateTemplateSchema,
  execute: async ({ name, description, includePaths, excludePaths = [], tags = [] }) => {
    try {
      console.log(chalk.blue(`📋 Creating snapshot template: ${name}`))

      const template = {
        name,
        description,
        includePaths,
        excludePaths,
        tags,
      }

      snapshotService.createTemplate(name, template)

      console.log(chalk.green(`✓ Template created: ${name}`))
      console.log(chalk.gray(`  Include: ${includePaths.join(', ')}`))
      if (excludePaths.length > 0) {
        console.log(chalk.gray(`  Exclude: ${excludePaths.join(', ')}`))
      }
      if (tags.length > 0) {
        console.log(chalk.gray(`  Tags: ${tags.join(', ')}`))
      }

      return {
        success: true,
        templateName: name,
        template,
        message: `Template created successfully: ${name}`,
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to create template: ${error.message}`))
      return {
        success: false,
        error: error.message,
        message: `Failed to create template: ${error.message}`,
      }
    }
  },
})

/**
 * Get Snapshot Stats Tool
 * Gets statistics about snapshots
 */
export const getSnapshotStatsTool = tool({
  description: 'Get statistics about snapshots including total count, size, and recent activity',
  parameters: z.object({}),
  execute: async () => {
    try {
      const stats = snapshotService.getSnapshotStats()
      const recentSnapshots = await snapshotService.getRecentSnapshots(5)

      console.log(chalk.green(`📊 Snapshot Statistics:`))
      console.log(chalk.cyan(`  Total Snapshots: ${stats.totalSnapshots}`))
      console.log(chalk.cyan(`  Total Size: ${formatSize(stats.totalSize)}`))
      console.log(chalk.cyan(`  Average Size: ${formatSize(stats.averageSize)}`))

      if (stats.oldestSnapshot) {
        console.log(chalk.cyan(`  Oldest: ${new Date(stats.oldestSnapshot).toLocaleDateString()}`))
      }
      if (stats.newestSnapshot) {
        console.log(chalk.cyan(`  Newest: ${new Date(stats.newestSnapshot).toLocaleDateString()}`))
      }

      if (recentSnapshots.length > 0) {
        console.log(chalk.green(`\n📋 Recent Snapshots:`))
        recentSnapshots.forEach((snapshot) => {
          console.log(chalk.gray(`  • ${snapshot.name} (${new Date(snapshot.timestamp).toLocaleDateString()})`))
        })
      }

      return {
        success: true,
        stats,
        recentSnapshots: recentSnapshots.map((s) => ({
          id: s.id,
          name: s.name,
          timestamp: s.timestamp,
          size: s.metadata.size,
        })),
        message: `Found ${stats.totalSnapshots} snapshots`,
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get snapshot stats: ${error.message}`))
      return {
        success: false,
        error: error.message,
        message: `Failed to get snapshot stats: ${error.message}`,
      }
    }
  },
})

// Helper function
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${Math.round(size * 100) / 100} ${units[unitIndex]}`
}

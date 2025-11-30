import chalk from 'chalk'
import { simpleConfigManager } from '../core/config-manager'
import { type NikDriveSyncStats, nikdriveProvider } from '../providers/nikdrive'
import { BaseTool, type ToolExecutionResult } from './base-tool'

export interface NikDriveToolOptions {
  verbose?: boolean
  progressCallback?: (message: string) => void
}

export class NikDriveTool extends BaseTool {
  private options: NikDriveToolOptions

  constructor(workingDirectory: string, options?: NikDriveToolOptions) {
    super('nikdrive-tool', workingDirectory)
    this.options = options || {}
  }

  async execute(...args: any[]): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      if (args.length === 0) {
        throw new Error('No action specified for NikDriveTool')
      }

      const [action, ...params] = args
      let data: any

      switch (action.toLowerCase()) {
        case 'upload':
          data = await this.handleUpload(params)
          break
        case 'download':
          data = await this.handleDownload(params)
          break
        case 'sync':
          data = await this.handleSync(params)
          break
        case 'search':
          data = await this.handleSearch(params)
          break
        case 'list':
          data = await this.handleList(params)
          break
        case 'share':
          data = await this.handleShare(params)
          break
        case 'delete':
          data = await this.handleDelete(params)
          break
        case 'mkdir':
          data = await this.handleMkdir(params)
          break
        case 'status':
          data = await this.handleStatus(params)
          break
        default:
          throw new Error(`Unknown action: ${action}`)
      }

      return {
        success: true,
        data,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: args,
        },
      }
    }
  }

  /**
   * Upload file or folder to NikDrive
   */
  private async handleUpload(params: any[]): Promise<any> {
    if (params.length < 1) {
      throw new Error('Usage: upload <localPath> [destination]')
    }

    const [localPath, destination = '/'] = params
    this.log(`Uploading ${localPath} to ${destination}...`)

    const result = await nikdriveProvider.uploadFile(localPath, destination)
    this.log(chalk.green(`✓ File uploaded: ${result.fileName} (${result.size} bytes)`))
    return result
  }

  /**
   * Download file from NikDrive
   */
  private async handleDownload(params: any[]): Promise<any> {
    if (params.length < 2) {
      throw new Error('Usage: download <fileId> <destinationPath>')
    }

    const [fileId, destinationPath] = params
    this.log(`Downloading file ${fileId} to ${destinationPath}...`)

    await nikdriveProvider.downloadFile(fileId, destinationPath)
    this.log(chalk.green(`✓ File downloaded to ${destinationPath}`))
    return { success: true, path: destinationPath }
  }

  /**
   * Sync workspace with cloud
   */
  private async handleSync(params: any[]): Promise<NikDriveSyncStats> {
    if (params.length < 1) {
      throw new Error('Usage: sync <localPath> [cloudPath]')
    }

    const [localPath, cloudPath = '/'] = params
    this.log(`Syncing ${localPath} with ${cloudPath}...`)

    const stats = await nikdriveProvider.syncWorkspace(localPath, cloudPath)

    this.log(chalk.green('\n✓ Sync complete!'))
    this.log(`  Files uploaded: ${stats.filesUploaded}`)
    this.log(`  Files downloaded: ${stats.filesDownloaded}`)
    this.log(`  Folders synced: ${stats.foldersSynced}`)
    this.log(`  Total size: ${this.formatBytes(stats.totalSize)}`)
    this.log(`  Duration: ${(stats.duration / 1000).toFixed(2)}s`)

    if (stats.errors.length > 0) {
      this.log(chalk.yellow(`\n⚠ ${stats.errors.length} error(s) occurred:`))
      stats.errors.forEach((err) => {
        this.log(chalk.yellow(`  • ${err.path}: ${err.error}`))
      })
    }

    return stats
  }

  /**
   * Search files in cloud
   */
  private async handleSearch(params: any[]): Promise<any> {
    if (params.length < 1) {
      throw new Error('Usage: search <query> [limit]')
    }

    const [query, limit = 20] = params
    this.log(`Searching for "${query}"...`)

    const results = await nikdriveProvider.searchFiles(query, limit)

    if (results.length === 0) {
      this.log(chalk.yellow('No results found'))
      return { results: [] }
    }

    this.log(chalk.green(`\n✓ Found ${results.length} result(s):`))
    results.forEach((result) => {
      const icon = result.type === 'folder' ? '📁' : '📄'
      const relevance = (result.relevance * 100).toFixed(0)
      this.log(`  ${icon} ${result.name} (${result.path}) - ${relevance}% match`)
    })

    return { results }
  }

  /**
   * List files in folder
   */
  private async handleList(params: any[]): Promise<any> {
    const [folderId = 'root'] = params
    this.log(`Listing files in folder ${folderId}...`)

    const files = await nikdriveProvider.listFiles(folderId)

    if (files.length === 0) {
      this.log(chalk.yellow('Folder is empty'))
      return { files: [] }
    }

    this.log(chalk.green(`\n✓ Found ${files.length} item(s):`))
    files.forEach((file) => {
      const icon = file.type === 'folder' ? '📁' : '📄'
      const size = file.size ? ` (${this.formatBytes(file.size)})` : ''
      this.log(`  ${icon} ${file.name}${size}`)
    })

    return { files }
  }

  /**
   * Create share link
   */
  private async handleShare(params: any[]): Promise<any> {
    if (params.length < 1) {
      throw new Error('Usage: share <fileId> [expiresInDays]')
    }

    const [fileId, expiresInDays] = params
    const expiresIn = expiresInDays ? expiresInDays * 24 * 60 * 60 * 1000 : undefined

    this.log(`Creating share link for ${fileId}...`)

    const share = await nikdriveProvider.createShareLink(fileId, expiresIn)

    this.log(chalk.green(`\n✓ Share link created!`))
    this.log(`  URL: ${share.url}`)
    this.log(`  Token: ${share.token}`)
    if (share.expiresAt) {
      this.log(`  Expires: ${share.expiresAt}`)
    }

    return share
  }

  /**
   * Delete file
   */
  private async handleDelete(params: any[]): Promise<any> {
    if (params.length < 1) {
      throw new Error('Usage: delete <fileId>')
    }

    const [fileId] = params
    this.log(`Deleting file ${fileId}...`)

    await nikdriveProvider.deleteFile(fileId)

    this.log(chalk.green(`✓ File deleted`))
    return { success: true, fileId }
  }

  /**
   * Create folder
   */
  private async handleMkdir(params: any[]): Promise<any> {
    if (params.length < 1) {
      throw new Error('Usage: mkdir <folderName> [parentId]')
    }

    const [folderName, parentId = 'root'] = params
    this.log(`Creating folder "${folderName}"...`)

    const folder = await nikdriveProvider.createFolder(folderName, parentId)

    this.log(chalk.green(`✓ Folder created: ${folder.name}`))
    return folder
  }

  /**
   * Get cloud storage status
   */
  private async handleStatus(params: any[]): Promise<any> {
    this.log('Checking NikDrive status...')

    const health = await nikdriveProvider.getHealth()

    if (!health.connected) {
      throw new Error(`NikDrive is unavailable: ${health.status}`)
    }

    this.log(chalk.green('✓ NikDrive is online'))
    this.log(`  Status: ${health.status}`)
    this.log(`  Latency: ${health.latency}ms`)

    if (health.quota) {
      const used = this.formatBytes(health.quota.used)
      const total = this.formatBytes(health.quota.total)
      const available = this.formatBytes(health.quota.available)
      const percentage = ((health.quota.used / health.quota.total) * 100).toFixed(1)

      this.log(`  Quota: ${used} / ${total} (${percentage}%)`)
      this.log(`  Available: ${available}`)
    }

    return health
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }

  /**
   * Log with optional callback
   */
  private log(message: string): void {
    if (this.options.progressCallback) {
      this.options.progressCallback(message)
    } else if (this.options.verbose !== false) {
      console.log(message)
    }
  }
}

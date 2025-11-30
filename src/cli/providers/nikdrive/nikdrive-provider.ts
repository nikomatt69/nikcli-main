import { EventEmitter } from 'node:events'
import axios, { AxiosInstance } from 'axios'
import chalk from 'chalk'
import { type ConfigType, configManager, KeyEncryption } from '../../core/config-manager'

export interface NikDriveProviderOptions {
  endpoint?: string
  apiKey?: string
  timeout?: number
  retries?: number
  retryDelayMs?: number
}

export interface NikDriveFile {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  size?: number
  mimeType?: string
  createdAt: string
  updatedAt: string
  owner: string
  isPublic?: boolean
  parentId?: string
  thumbnail?: string
  metadata?: Record<string, any>
}

export interface NikDriveFolder {
  id: string
  name: string
  path: string
  parentId?: string
  createdAt: string
  updatedAt: string
  owner: string
  itemCount: number
  totalSize: number
}

export interface NikDriveUploadResult {
  success: boolean
  fileId: string
  fileName: string
  path: string
  size: number
  uploadTime: number
}

export interface NikDriveSearchResult {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  relevance: number
  matchedFields: string[]
  size?: number
  mimeType?: string
}

export interface NikDriveShareLink {
  token: string
  fileId: string
  fileName: string
  expiresAt?: string
  accessCount: number
  url: string
}

export interface NikDriveHealth {
  connected: boolean
  latency: number
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastCheck: number
  quota?: {
    used: number
    total: number
    available: number
  }
  apiVersion?: string
}

export interface NikDriveSyncStats {
  filesUploaded: number
  filesDownloaded: number
  filesDeleted: number
  foldersSynced: number
  totalSize: number
  duration: number
  errors: Array<{ path: string; error: string }>
}

export class NikDriveProvider extends EventEmitter {
  private defaultClient = axios.create({
    baseURL: 'https://nikcli-drive-production.up.railway.app',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.NIKDRIVE_API_KEY || '',
    },
  })
  private config!: ConfigType['nikdrive'] & { endpoint?: string; apiKey?: string }
  private isConnected = false
  private connectionAttempts = 0
  private healthCheckInterval?: NodeJS.Timeout
  private lastHealthCheck?: NikDriveHealth
  private fileCache = new Map<string, NikDriveFile>()
  private folderCache = new Map<string, NikDriveFolder>()
  private cacheExpiry = 5 * 60 * 1000 // 5 minutes
  private initialized = false

  constructor(options?: NikDriveProviderOptions) {
    super()
    // Don't initialize here - wait for lazy initialization on first use
  }

  private initializeClient(options?: NikDriveProviderOptions): void {
    if (this.initialized) return

    try {
      // Get configuration from environment variables and options
      const endpoint = 'https://nikcli-drive-production.up.railway.app'

      // Try to get API key from multiple sources, including ConfigManager
      const credentials = configManager.getNikDriveCredentials()
      let apiKey = process.env.NIKDRIVE_API_KEY!

      // Decrypt the API key if it's encrypted
      if (apiKey && typeof apiKey === 'string' && apiKey.length > 0) {
        // Check if it looks like encrypted (contains colons)
        if (apiKey.includes(':')) {
          try {
            const decrypted = KeyEncryption.decrypt(apiKey)
            // Verify decryption was successful
            if (decrypted && !decrypted.includes(':')) {
              apiKey = decrypted
            } else {
              // Decryption failed or returned wrong format
              console.warn(
                chalk.yellow('Warning: Failed to decrypt NikDrive API key. The encryption key may have changed.')
              )
              apiKey = ''
            }
          } catch (e) {
            // Decryption threw an error
            console.warn(
              chalk.yellow('Warning: Failed to decrypt NikDrive API key. Please run: /set-key nikdrive <YOUR_API_KEY>')
            )
            apiKey = ''
          }
        }
        // Otherwise it's already plain text, use as-is
      }

      this.config = {
        enabled: true,
        timeout: options?.timeout || 30000,
        retries: options?.retries || 3,
        retryDelayMs: options?.retryDelayMs || 1000,
        endpoint: endpoint,
        apiKey: apiKey as string,
        features: {
          syncWorkspace: true,
          autoBackup: false,
          shareEnabled: true,
          ragIndexing: false,
          contextAware: true,
        },
        autoSyncInterval: 3600000, // 1 hour
        cacheTtl: 300, // 5 minutes
      }

      // Only add X-API-Key header if we have a valid API key
      // Authentication is now optional - requests work without it
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (apiKey && !apiKey.includes(':')) {
        // Only add header if we have a plain text API key (not encrypted/corrupted)
        headers['X-API-Key'] = apiKey
      }

      this.defaultClient = axios.create({
        baseURL: endpoint,
        timeout: this.config.timeout || 30000,
        headers,
      })

      this.initialized = true

      // Setup request interceptor to ensure auth header is present
      this.setupAuthInterceptor()

      // Auto-connect if configured
      this.connect()
    } catch (error) {
      console.error(chalk.red('Failed to initialize NikDriveProvider:'), error)
      this.initialized = true // Mark as initialized even on error to avoid retry loops
    }
  }

  /**
   * Setup axios request interceptor for authentication
   */
  private setupAuthInterceptor(): void {
    this.defaultClient.interceptors.request.use(
      (config) => {
        // Add X-API-Key header only if we have a valid plain-text API key
        // Authentication is optional - requests work without it
        if (this.config.apiKey && !this.config.apiKey.includes(':')) {
          config.headers['X-API-Key'] = this.config.apiKey
        }
        return config
      },
      (error) => Promise.reject(error)
    )
  }

  /**
   * Setup axios retry interceptor
   */
  private setupRetryInterceptor(): void {
    const maxRetries = this.config.retries || 3
    const retryDelay = this.config.retryDelayMs || 1000

    this.defaultClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config
        if (!config || !config.__retryCount) {
          config.__retryCount = 0
        }

        if (config.__retryCount < maxRetries && this.isRetryableError(error)) {
          config.__retryCount++
          await new Promise((resolve) => setTimeout(resolve, retryDelay * config.__retryCount))
          return this.defaultClient(config)
        }

        return Promise.reject(error)
      }
    )
  }

  /**
   * Ensure client is initialized
   */
  private ensureClient(): void {
    if (!this.initialized) {
      this.initializeClient()
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error.response) return true
    const status = error.response.status
    return status === 408 || status === 429 || status >= 500
  }

  /**
   * Connect to NikDrive
   */
  async connect(): Promise<boolean> {
    try {
      this.connectionAttempts++
      const health = await this.getHealth()

      if (health.status === 'healthy') {
        this.isConnected = true
        this.connectionAttempts = 0
        this.emit('connected')
        this.startHealthChecks()
        return true
      }
    } catch (error) {
      console.error(chalk.yellow('NikDrive connection failed:'), error instanceof Error ? error.message : error)
    }

    this.isConnected = false
    return false
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) return

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealth()
        this.lastHealthCheck = health

        if (health.status === 'unhealthy' && this.isConnected) {
          this.isConnected = false
          this.emit('disconnected', health)
        } else if (health.status === 'healthy' && !this.isConnected) {
          this.isConnected = true
          this.emit('reconnected', health)
        }

        this.emit('healthCheck', health)
      } catch (error) {
        this.emit('healthCheckError', error)
      }
    }, 60000) // Check every minute
  }

  /**
   * Upload file to NikDrive
   */
  async uploadFile(filePath: string, destination: string = '/'): Promise<NikDriveUploadResult> {
    try {
      this.ensureClient()
      const fs = await import('node:fs/promises')
      const { basename } = await import('node:path')

      const fileContent = await fs.readFile(filePath)
      const fileName = basename(filePath)

      const formData = new FormData()
      const blob = new Blob([fileContent])
      formData.append('file', blob, fileName)
      formData.append('destination', destination)

      const response = await this.defaultClient.post<NikDriveUploadResult>('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-API-Key': this.config.apiKey as string,
        },
      })

      this.clearCache()
      this.emit('fileUploaded', response.data)
      return response.data
    } catch (error) {
      throw this.handleError('uploadFile', error)
    }
  }

  /**
   * Download file from NikDrive
   */
  async downloadFile(fileId: string, destinationPath: string): Promise<void> {
    try {
      this.ensureClient()
      const fs = await import('node:fs/promises')
      const { dirname } = await import('node:path')

      const response = await this.defaultClient.get<ArrayBuffer>(`/api/files/${fileId}`, {
        responseType: 'arraybuffer',
        headers: {
          'X-API-Key': this.config.apiKey as string,
        },
      })

      const dir = dirname(destinationPath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(destinationPath, new Uint8Array(response.data))

      this.emit('fileDownloaded', { fileId, path: destinationPath })
    } catch (error) {
      throw this.handleError('downloadFile', error)
    }
  }

  /**
   * List files in a folder
   */
  async listFiles(folderId: string = 'root'): Promise<NikDriveFile[]> {
    try {
      this.ensureClient()
      const cached = this.fileCache.get(folderId)
      if (cached && this.isCacheValid(folderId)) {
        return [cached]
      }

      const response = await this.defaultClient.get<NikDriveFile[]>('/api/files', {
        params: { folderId },
        headers: {
          'X-API-Key': this.config.apiKey as string,
        },
      })

      response.data.forEach((file) => {
        this.fileCache.set(file.id, file)
      })

      return response.data
    } catch (error) {
      throw this.handleError('listFiles', error)
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(fileId: string): Promise<NikDriveFile> {
    try {
      this.ensureClient()
      const cached = this.fileCache.get(fileId)
      if (cached && this.isCacheValid(fileId)) {
        return cached
      }

      const response = await this.defaultClient.get<NikDriveFile>(`/api/files/${fileId}/info`, {
        headers: {
          'X-API-Key': this.config.apiKey as string,
        },
      })

      this.fileCache.set(fileId, response.data)
      return response.data
    } catch (error) {
      throw this.handleError('getFileInfo', error)
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      this.ensureClient()
      await this.defaultClient.delete(`/api/files/${fileId}`, {
        headers: {
          'X-API-Key': this.config.apiKey as string,
        },
      })
      this.fileCache.delete(fileId)
      this.clearCache()
      this.emit('fileDeleted', { fileId })
      return true
    } catch (error) {
      throw this.handleError('deleteFile', error)
    }
  }

  /**
   * Create folder
   */
  async createFolder(name: string, parentId: string = 'root'): Promise<NikDriveFolder> {
    try {
      this.ensureClient()
      const response = await this.defaultClient.post<NikDriveFolder>('/api/folders', {
        name,
        parentId,
        headers: {
          'X-API-Key': this.config.apiKey as string,
        },
      })

      this.folderCache.set(response.data.id, response.data)
      this.clearCache()
      this.emit('folderCreated', response.data)
      return response.data
    } catch (error) {
      throw this.handleError('createFolder', error)
    }
  }

  /**
   * Search files
   */
  async searchFiles(query: string, limit: number = 20): Promise<NikDriveSearchResult[]> {
    try {
      this.ensureClient()
      const response = await this.defaultClient.get<NikDriveSearchResult[]>('/api/search', {
        params: { q: query, limit },
        headers: {
          'X-API-Key': this.config.apiKey as string,
        },
      })

      return response.data
    } catch (error) {
      throw this.handleError('searchFiles', error)
    }
  }

  /**
   * Create share link
   */
  async createShareLink(fileId: string, expiresIn?: number): Promise<NikDriveShareLink> {
    try {
      this.ensureClient()
      const response = await this.defaultClient.post<NikDriveShareLink>(`/api/share/${fileId}`, {
        expiresIn,
        headers: {
          'X-API-Key': this.config.apiKey as string,
        },
      })

      this.emit('shareLinkCreated', response.data)
      return response.data
    } catch (error) {
      throw this.handleError('createShareLink', error)
    }
  }

  /**
   * Sync workspace with cloud
   */
  async syncWorkspace(localPath: string, cloudPath: string = '/'): Promise<NikDriveSyncStats> {
    const stats: NikDriveSyncStats = {
      filesUploaded: 0,
      filesDownloaded: 0,
      filesDeleted: 0,
      foldersSynced: 0,
      totalSize: 0,
      duration: 0,
      errors: [],
    }

    const startTime = Date.now()

    try {
      const fs = await import('node:fs/promises')
      const { join, relative } = await import('node:path')

      // Recursive sync function
      const syncDirectory = async (localDir: string, cloudDir: string): Promise<void> => {
        try {
          const entries = await fs.readdir(localDir, { withFileTypes: true })

          for (const entry of entries) {
            const localItemPath = join(localDir, entry.name)
            const cloudItemPath = `${cloudDir}/${entry.name}`

            try {
              if (entry.isDirectory()) {
                await this.createFolder(entry.name, cloudDir)
                stats.foldersSynced++
                await syncDirectory(localItemPath, cloudItemPath)
              } else {
                const result = await this.uploadFile(localItemPath, cloudDir)
                stats.filesUploaded++
                stats.totalSize += result.size
                this.emit('syncProgress', {
                  file: entry.name,
                  status: 'uploaded',
                  size: result.size,
                })
              }
            } catch (error) {
              stats.errors.push({
                path: localItemPath,
                error: error instanceof Error ? error.message : String(error),
              })
              this.emit('syncError', { path: localItemPath, error })
            }
          }
        } catch (error) {
          stats.errors.push({
            path: localDir,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      await syncDirectory(localPath, cloudPath)
      stats.duration = Date.now() - startTime

      this.emit('syncComplete', stats)
      return stats
    } catch (error) {
      stats.duration = Date.now() - startTime
      throw this.handleError('syncWorkspace', error)
    }
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<NikDriveHealth> {
    const startTime = Date.now()

    try {
      this.ensureClient()
      const response = await this.defaultClient.get('/health', {
        timeout: 5000,
        headers: {
          'X-API-Key': this.config.apiKey as string,
        },
      })

      const latency = Date.now() - startTime

      return {
        connected: true,
        latency,
        status: 'healthy',
        lastCheck: Date.now(),
        quota: response.data.quota,
        apiVersion: response.data.apiVersion,
      }
    } catch (error) {
      const latency = Date.now() - startTime

      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          connected: false,
          latency,
          status: 'degraded',
          lastCheck: Date.now(),
        }
      }

      return {
        connected: false,
        latency,
        status: 'unhealthy',
        lastCheck: Date.now(),
      }
    }
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(key: string): boolean {
    // For simplicity, invalidate cache when cleared
    return this.fileCache.has(key) || this.folderCache.has(key)
  }

  /**
   * Clear caches
   */
  private clearCache(): void {
    this.fileCache.clear()
    this.folderCache.clear()
  }

  /**
   * Handle errors consistently
   */
  private handleError(method: string, error: any): Error {
    const message = error instanceof Error ? error.message : error.response?.data?.message || String(error)

    const err = new Error(`NikDrive ${method} failed: ${message}`)
    this.emit('error', { method, error: err })

    return err
  }

  /**
   * Get connection status
   */
  isReady(): boolean {
    return this.isConnected
  }

  /**
   * Get last health check
   */
  getLastHealthCheck(): NikDriveHealth | undefined {
    return this.lastHealthCheck
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.isConnected = false
    this.clearCache()
    this.emit('disconnected')
  }

  /**
   * Destructor
   */
  destroy(): void {
    this.disconnect()
    this.removeAllListeners()
  }
}

// Singleton instance
export const nikdriveProvider = new NikDriveProvider()

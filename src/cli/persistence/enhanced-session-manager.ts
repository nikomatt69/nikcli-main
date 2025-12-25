import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Mutex } from 'async-mutex'
import chalk from 'chalk'
import { v4 as uuidv4 } from 'uuid'
import { simpleConfigManager } from '../core/config-manager'
import { enhancedSupabaseProvider, type SupabaseSession } from '../providers/supabase/enhanced-supabase-provider'
import { cacheService } from '../services/cache-service'

export interface EnhancedChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: {
    model?: string
    temperature?: number
    tokenCount?: number
    responseTime?: number
    cached?: boolean
  }
}

export interface EnhancedSessionData {
  id: string
  user_id?: string
  title?: string
  createdAt: string
  updatedAt: string
  messages: EnhancedChatMessage[]
  metadata?: {
    totalTokens?: number
    totalMessages?: number
    avgResponseTime?: number
    models?: string[]
    tags?: string[]
    version?: number
    deviceType?: 'mobile' | 'desktop' | 'tablet'
    sessionType?: 'ssh' | 'local' | 'web'
    tmuxSessionId?: string
    screenDimensions?: { width: number; height: number }
  }
  syncStatus: 'local' | 'synced' | 'conflict' | 'pending'
  cloudId?: string
}

export interface SessionSyncResult {
  success: boolean
  action: 'created' | 'updated' | 'conflict' | 'skipped'
  localVersion?: number
  cloudVersion?: number
  error?: string
}

/**
 * Enhanced Session Manager with Supabase sync and caching
 */
export class EnhancedSessionManager extends EventEmitter {
  private baseDir: string
  private supabase = enhancedSupabaseProvider
  private cacheTTL = 300 // 5 minutes cache for sessions
  private autoSyncEnabled = true
  private currentUserId?: string
  private isMobileSession = false
  private sessionType: 'ssh' | 'local' | 'web' = 'local'
  private screenDimensions = { width: 80, height: 24 }
  // 🔒 FIXED: Mutex for thread-safe operations
  private globalMutex = new Mutex()
  private sessionMutexes = new Map<string, Mutex>()

  constructor(dir?: string) {
    super()
    this.baseDir = dir || path.join(process.cwd(), '.nikcli', 'work-sessions')

    const supabaseConfig = simpleConfigManager.getSupabaseConfig()
    this.autoSyncEnabled = supabaseConfig.enabled && supabaseConfig.features.database

    this.detectEnvironment()
    this.setupEventHandlers()

    // Setup graceful shutdown handlers
    process.on('SIGTERM', () => this.cleanup())
    process.on('SIGINT', () => this.cleanup())
  }

  /**
   * Get or create a mutex for a specific session
   */
  private getSessionMutex(sessionId: string): Mutex {
    let mutex = this.sessionMutexes.get(sessionId)
    if (!mutex) {
      mutex = new Mutex()
      this.sessionMutexes.set(sessionId, mutex)
    }
    return mutex
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    this.sessionMutexes.clear()
  }

  /**
   * Detect mobile/SSH environment and session type
   */
  private detectEnvironment(): void {
    // Detect SSH session
    if (process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION) {
      this.sessionType = 'ssh'
    }

    // Detect screen dimensions
    this.screenDimensions = {
      width: process.stdout.columns || 80,
      height: process.stdout.rows || 24,
    }

    // Detect mobile based on screen size and environment
    this.isMobileSession = this.detectMobileEnvironment()

    if (this.isMobileSession) {
      console.log(chalk.blue('📱 Mobile session detected - optimizing interface'))
    }
  }

  /**
   * Detect if running in mobile environment
   */
  private detectMobileEnvironment(): boolean {
    // Mobile screen typically <= 120 characters wide
    const isMobileScreen = this.screenDimensions.width <= 120

    // Common mobile terminal environment variables
    const mobileTerminals = ['termius', 'termux', 'ish', 'juicessh']
    const termProgram = (process.env.TERM_PROGRAM || '').toLowerCase()
    const isMobileTerminal = mobileTerminals.some((mobile) => termProgram.includes(mobile))

    // SSH from mobile device patterns
    const _sshClient = process.env.SSH_CLIENT || ''
    const isMobileSSH = this.sessionType === 'ssh' && isMobileScreen

    return isMobileScreen || isMobileTerminal || isMobileSSH
  }

  /**
   * Get mobile session status
   */
  isMobile(): boolean {
    return this.isMobileSession
  }

  /**
   * Get session type
   */
  getSessionType(): 'ssh' | 'local' | 'web' {
    return this.sessionType
  }

  /**
   * Get screen dimensions
   */
  getScreenDimensions(): { width: number; height: number } {
    return { ...this.screenDimensions }
  }

  /**
   * Create tmux session for persistence (SSH sessions)
   */
  async createTmuxSession(sessionName?: string): Promise<string | null> {
    if (this.sessionType !== 'ssh') return null

    try {
      const { execSync } = await import('node:child_process')
      const tmuxSessionId = sessionName || `nikcli-${Date.now()}`

      // Check if tmux is available
      try {
        execSync('which tmux', { stdio: 'ignore' })
      } catch {
        console.log(chalk.yellow('⚠︎ tmux not available - session persistence limited'))
        return null
      }

      // Create tmux session
      execSync(`tmux new-session -d -s "${tmuxSessionId}"`, { stdio: 'ignore' })
      console.log(chalk.green(`✓ tmux session created: ${tmuxSessionId}`))

      return tmuxSessionId
    } catch (error: any) {
      console.log(chalk.yellow(`⚠︎ Failed to create tmux session: ${error.message}`))
      return null
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Listen for Supabase session changes (real-time)
    this.supabase.on('session_change', (payload) => {
      this.handleRemoteSessionChange(payload)
    })

    // Listen for connection changes
    this.supabase.on('connected', () => {
      console.log(chalk.blue('📡 Session Manager: Supabase connected, enabling sync'))
      this.autoSyncEnabled = true
      this.emit('sync_enabled')
    })

    this.supabase.on('disconnected', () => {
      console.log(chalk.yellow('📡 Session Manager: Supabase disconnected, using local storage'))
      this.autoSyncEnabled = false
      this.emit('sync_disabled')
    })
  }

  /**
   * Handle remote session changes from real-time updates
   */
  private async handleRemoteSessionChange(payload: any): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload

      switch (eventType) {
        case 'INSERT':
        case 'UPDATE':
          if (newRecord && newRecord.user_id === this.currentUserId) {
            // Update local cache
            const cacheKey = `session:${newRecord.id}`
            await cacheService.set(cacheKey, newRecord, '', { ttl: this.cacheTTL })

            this.emit('session_updated', {
              sessionId: newRecord.id,
              source: 'remote',
              action: eventType.toLowerCase(),
            })
          }
          break

        case 'DELETE':
          if (oldRecord && oldRecord.user_id === this.currentUserId) {
            // Remove from local cache
            const cacheKey = `session:${oldRecord.id}`
            await cacheService.delete(cacheKey)

            this.emit('session_deleted', {
              sessionId: oldRecord.id,
              source: 'remote',
            })
          }
          break
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠︎ Failed to handle remote session change: ${error.message}`))
    }
  }

  /**
   * Set current user for session management
   */
  setCurrentUser(userId: string): void {
    this.currentUserId = userId
    this.emit('user_changed', userId)
  }

  /**
   * Get session path for local storage
   */
  private getSessionPath(id: string): string {
    return path.join(this.baseDir, `${id}.json`)
  }

  /**
   * Generate cache key for session
   */
  private getSessionCacheKey(id: string): string {
    return `session:${id}`
  }

  /**
   * Load session with intelligent routing (cache → cloud → local)
   */
  async loadSession(
    id: string,
    options?: { preferLocal?: boolean; skipCache?: boolean }
  ): Promise<EnhancedSessionData | null> {
    const { preferLocal = false, skipCache = false } = options || {}
    const mutex = this.getSessionMutex(id)
    const release = await mutex.acquire()

    try {
      // 1. Try cache first (unless skipped)
      if (!skipCache && !preferLocal) {
        const cachedSession = await cacheService.get<SupabaseSession>(
          this.getSessionCacheKey(id),
          `sessions:${this.currentUserId || 'anonymous'}`,
          { strategy: 'both' }
        )

        if (cachedSession) {
          return this.convertSupabaseToLocal(cachedSession)
        }
      }

      // 2. Try cloud storage (if enabled and not preferring local)
      if (this.autoSyncEnabled && this.supabase.isHealthy() && !preferLocal) {
        try {
          const supabaseSession = await this.supabase.getSession(id)
          if (supabaseSession) {
            // Cache the result
            if (!skipCache) {
              await cacheService.set(
                this.getSessionCacheKey(id),
                supabaseSession,
                `sessions:${this.currentUserId || 'anonymous'}`,
                { ttl: this.cacheTTL }
              )
            }

            return this.convertSupabaseToLocal(supabaseSession)
          }
        } catch (error: any) {
          console.log(chalk.yellow(`⚠︎ Cloud session load failed, trying local: ${error.message}`))
        }
      }

      // 3. Try local storage as fallback
      const localPath = this.getSessionPath(id)
      try {
        const raw = await fs.readFile(localPath, 'utf-8')
        const session: EnhancedSessionData = JSON.parse(raw)

        // Mark as local-only if cloud failed
        if (!this.autoSyncEnabled || !this.supabase.isHealthy()) {
          session.syncStatus = 'local'
        }

        return session
      } catch (e: any) {
        if (e.code === 'ENOENT') return null
        throw e
      }
    } catch (error: any) {
      console.log(chalk.red(`✖ Failed to load session ${id}: ${error.message}`))
      return null
    } finally {
      release()
    }
  }

  /**
   * Save session with intelligent routing and sync
   */
  async saveSession(
    session: EnhancedSessionData,
    options?: { localOnly?: boolean; skipCache?: boolean }
  ): Promise<SessionSyncResult> {
    const { localOnly = false, skipCache = false } = options || {}

    try {
      // Update session metadata
      session.updatedAt = new Date().toISOString()
      session.metadata = {
        ...session.metadata,
        totalMessages: session.messages.length,
        totalTokens: session.messages.reduce((sum, msg) => sum + (msg.metadata?.tokenCount || 0), 0),
        avgResponseTime: this.calculateAverageResponseTime(session.messages),
        models: Array.from(new Set(session.messages.map((msg) => msg.metadata?.model).filter(Boolean))) as string[],
        version: (session.metadata?.version || 0) + 1,
      }

      let result: SessionSyncResult = {
        success: false,
        action: 'skipped',
      }

      // 1. Always save locally first
      await this.saveSessionLocally(session)

      // 2. Sync to cloud if enabled and not local-only
      if (this.autoSyncEnabled && this.supabase.isHealthy() && !localOnly) {
        try {
          const supabaseSession = this.convertLocalToSupabase(session)
          const cloudSession = await this.supabase.upsertSession(supabaseSession)

          if (cloudSession) {
            session.cloudId = cloudSession.id
            session.syncStatus = 'synced'

            result = {
              success: true,
              action: session.metadata?.version === 1 ? 'created' : 'updated',
              localVersion: session.metadata?.version,
              cloudVersion: cloudSession.version,
            }

            // Update local copy with cloud data
            await this.saveSessionLocally(session)
          }
        } catch (error: any) {
          console.log(chalk.yellow(`⚠︎ Cloud sync failed: ${error.message}`))
          session.syncStatus = 'conflict'
          result = {
            success: false,
            action: 'conflict',
            error: error.message,
          }
        }
      } else {
        session.syncStatus = 'local'
        result = {
          success: true,
          action: 'updated',
        }
      }

      // 3. Update cache
      if (!skipCache) {
        await cacheService.set(
          this.getSessionCacheKey(session.id),
          session,
          `sessions:${this.currentUserId || 'anonymous'}`,
          { ttl: this.cacheTTL }
        )
      }

      this.emit('session_saved', {
        sessionId: session.id,
        syncResult: result,
        syncStatus: session.syncStatus,
      })

      return result
    } catch (error: any) {
      console.log(chalk.red(`✖ Failed to save session ${session.id}: ${error.message}`))
      return {
        success: false,
        action: 'skipped',
        error: error.message,
      }
    }
  }

  /**
   * Save session locally
   */
  private async saveSessionLocally(session: EnhancedSessionData): Promise<void> {
    const mutex = this.getSessionMutex(session.id)
    const release = await mutex.acquire()
    try {
      await fs.mkdir(this.baseDir, { recursive: true })
      const sessionPath = this.getSessionPath(session.id)
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8')
    } finally {
      release()
    }
  }

  /**
   * List sessions with cloud sync and caching
   */
  async listSessions(options?: {
    userId?: string
    limit?: number
    offset?: number
    tags?: string[]
    orderBy?: 'createdAt' | 'updatedAt' | 'title'
    includeCloudOnly?: boolean
  }): Promise<EnhancedSessionData[]> {
    const { includeCloudOnly = true, userId, limit = 50, offset = 0 } = options || {}
    const sessions: Map<string, EnhancedSessionData> = new Map()

    try {
      // 1. Get local sessions
      try {
        const files = await fs.readdir(this.baseDir)
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const raw = await fs.readFile(path.join(this.baseDir, file), 'utf-8')
              const session: EnhancedSessionData = JSON.parse(raw)

              if (!userId || session.user_id === userId) {
                sessions.set(session.id, session)
              }
            } catch (_error) {
              console.log(chalk.yellow(`⚠︎ Failed to parse session file ${file}`))
            }
          }
        }
      } catch (e: any) {
        if (e.code !== 'ENOENT') {
          console.log(chalk.yellow(`⚠︎ Failed to read local sessions: ${e.message}`))
        }
      }

      // 2. Get cloud sessions if enabled
      if (this.autoSyncEnabled && this.supabase.isHealthy() && includeCloudOnly) {
        try {
          const cloudSessions = await this.supabase.listSessions({
            userId: userId || this.currentUserId,
            limit: limit * 2, // Get more to account for deduplication
            offset,
            orderBy: options?.orderBy === 'title' ? 'title' : 'updated_at',
          })

          for (const cloudSession of cloudSessions) {
            const localSession = this.convertSupabaseToLocal(cloudSession)

            // Merge with local if exists, prefer newer version
            const existingLocal = sessions.get(localSession.id)
            if (existingLocal) {
              const localVersion = existingLocal.metadata?.version || 0
              const cloudVersion = cloudSession.version || 0

              if (cloudVersion > localVersion) {
                localSession.syncStatus = 'synced'
                sessions.set(localSession.id, localSession)
              }
            } else {
              localSession.syncStatus = 'synced'
              sessions.set(localSession.id, localSession)
            }
          }
        } catch (error: any) {
          console.log(chalk.yellow(`⚠︎ Failed to fetch cloud sessions: ${error.message}`))
        }
      }

      // 3. Apply filters and sorting
      let sessionList = Array.from(sessions.values())

      if (options?.tags && options.tags.length > 0) {
        sessionList = sessionList.filter((session) =>
          session.metadata?.tags?.some((tag) => options.tags?.includes(tag))
        )
      }

      // Sort sessions
      const orderBy = options?.orderBy || 'updatedAt'
      sessionList.sort((a, b) => {
        let aVal: any, bVal: any
        switch (orderBy) {
          case 'title':
            aVal = a.title || ''
            bVal = b.title || ''
            break
          case 'createdAt':
            aVal = new Date(a.createdAt).getTime()
            bVal = new Date(b.createdAt).getTime()
            break
          default:
            aVal = new Date(a.updatedAt).getTime()
            bVal = new Date(b.updatedAt).getTime()
            break
        }

        return orderBy === 'title' ? aVal.localeCompare(bVal) : bVal - aVal // Newest first for dates
      })

      // Apply pagination
      return sessionList.slice(offset, offset + limit)
    } catch (error: any) {
      console.log(chalk.red(`✖ Failed to list sessions: ${error.message}`))
      return []
    }
  }

  /**
   * Delete session from all storage layers
   */
  async deleteSession(id: string, options?: { localOnly?: boolean }): Promise<boolean> {
    const { localOnly = false } = options || {}
    let success = true

    try {
      // 1. Delete from cache
      await cacheService.delete(this.getSessionCacheKey(id))

      // 2. Delete from cloud if enabled
      if (this.autoSyncEnabled && this.supabase.isHealthy() && !localOnly) {
        try {
          await this.supabase.deleteSession(id)
        } catch (error: any) {
          console.log(chalk.yellow(`⚠︎ Cloud deletion failed: ${error.message}`))
          success = false
        }
      }

      // 3. Delete from local storage
      try {
        await fs.unlink(this.getSessionPath(id))
      } catch (e: any) {
        if (e.code !== 'ENOENT') {
          console.log(chalk.yellow(`⚠︎ Local deletion failed: ${e.message}`))
          success = false
        }
      }

      this.emit('session_deleted', { sessionId: id, success })

      return success
    } catch (error: any) {
      console.log(chalk.red(`✖ Failed to delete session ${id}: ${error.message}`))
      return false
    }
  }

  /**
   * Sync all local sessions to cloud
   */
  async syncAllSessions(): Promise<{ synced: number; conflicts: number; errors: number }> {
    if (!this.autoSyncEnabled || !this.supabase.isHealthy()) {
      throw new Error('Cloud sync not available')
    }

    let synced = 0
    let conflicts = 0
    let errors = 0

    try {
      const localSessions = await this.listSessions({ includeCloudOnly: false })

      for (const session of localSessions) {
        if (session.syncStatus !== 'synced') {
          try {
            const result = await this.saveSession(session, { skipCache: true })

            if (result.success) {
              if (result.action === 'conflict') {
                conflicts++
              } else {
                synced++
              }
            } else {
              errors++
            }
          } catch (_error) {
            errors++
          }
        }
      }

      console.log(chalk.green(`✓ Sync complete: ${synced} synced, ${conflicts} conflicts, ${errors} errors`))

      return { synced, conflicts, errors }
    } catch (error: any) {
      console.log(chalk.red(`✖ Sync failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Create new session with auto-generated ID
   */
  createNewSession(options?: { title?: string; userId?: string; tags?: string[] }): EnhancedSessionData {
    const now = new Date().toISOString()

    return {
      id: uuidv4(),
      user_id: options?.userId || this.currentUserId,
      title: options?.title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata: {
        version: 1,
        tags: options?.tags || [],
        deviceType: this.isMobileSession ? 'mobile' : 'desktop',
        sessionType: this.sessionType,
        screenDimensions: this.screenDimensions,
      },
      syncStatus: 'pending',
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Calculate average response time from messages
   */
  private calculateAverageResponseTime(messages: EnhancedChatMessage[]): number {
    const responseTimes = messages
      .map((msg) => msg.metadata?.responseTime)
      .filter((time) => typeof time === 'number') as number[]

    if (responseTimes.length === 0) return 0

    return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
  }

  /**
   * Convert Supabase session to local format
   */
  private convertSupabaseToLocal(supabaseSession: SupabaseSession): EnhancedSessionData {
    return {
      id: supabaseSession.id,
      user_id: supabaseSession.user_id,
      title: supabaseSession.title,
      createdAt: supabaseSession.created_at,
      updatedAt: supabaseSession.updated_at,
      messages: supabaseSession.content?.messages || [],
      metadata: {
        ...supabaseSession.content?.metadata,
        version: supabaseSession.version,
        tags: supabaseSession.tags || [],
      },
      syncStatus: 'synced',
      cloudId: supabaseSession.id,
    }
  }

  /**
   * Convert local session to Supabase format
   */
  private convertLocalToSupabase(localSession: EnhancedSessionData): Partial<SupabaseSession> {
    return {
      id: localSession.cloudId || localSession.id,
      user_id: localSession.user_id,
      title: localSession.title,
      content: {
        messages: localSession.messages,
        metadata: localSession.metadata,
      },
      metadata: localSession.metadata,
      tags: localSession.metadata?.tags || [],
      version: localSession.metadata?.version || 1,
    }
  }

  /**
   * Get sync status for all sessions
   */
  async getSyncStatus(): Promise<{
    totalLocal: number
    totalCloud: number
    synced: number
    conflicts: number
    localOnly: number
    cloudOnly: number
  }> {
    const localSessions = await this.listSessions({ includeCloudOnly: false })
    const allSessions = await this.listSessions({ includeCloudOnly: true })

    const _localIds = new Set(localSessions.map((s) => s.id))
    const allIds = new Set(allSessions.map((s) => s.id))

    const synced = allSessions.filter((s) => s.syncStatus === 'synced').length
    const conflicts = allSessions.filter((s) => s.syncStatus === 'conflict').length
    const localOnly = localSessions.filter((s) => !allIds.has(s.id) || s.syncStatus === 'local').length
    const cloudOnly = allSessions.length - localSessions.length

    return {
      totalLocal: localSessions.length,
      totalCloud: allSessions.length - localOnly,
      synced,
      conflicts,
      localOnly,
      cloudOnly: Math.max(0, cloudOnly),
    }
  }
}

// Add uuid dependency
// (This would need to be added to package.json)

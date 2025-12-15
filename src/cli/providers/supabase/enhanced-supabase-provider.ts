import { EventEmitter } from 'node:events'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import chalk from 'chalk'
import { type ConfigType, simpleConfigManager } from '../../core/config-manager'
import { advancedUI } from '../../ui/advanced-cli-ui'

export interface SupabaseSession {
  id: string
  user_id?: string
  title?: string
  content: any // JSON content
  created_at: string
  updated_at: string
  metadata?: Record<string, any>
  tags?: string[]
  version: number
}

export interface SupabaseBlueprint {
  id: string
  name: string
  description: string
  content: any // JSON blueprint definition
  created_by?: string
  created_at: string
  updated_at: string
  version: number
  is_public: boolean
  tags: string[]
  install_count: number
  metadata?: Record<string, any>
}

export interface SupabaseUser {
  id: string
  email?: string
  username?: string
  full_name?: string
  avatar_url?: string
  created_at: string
  last_active: string
  preferences?: Record<string, any>
  subscription_tier?: 'free' | 'pro' | 'enterprise'
}

export interface SupabaseMetric {
  id: string
  user_id?: string
  session_id?: string
  event_type: string
  event_data: any
  timestamp: string
  metadata?: Record<string, any>
}

export interface SupabaseDocument {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  language: string
  word_count: number
  contributor_id?: string
  created_at: string
  updated_at: string
  access_count: number
  popularity_score: number
  is_public: boolean
  vector_embedding?: number[] // For semantic search
}

/**
 * Enhanced Supabase Provider with full database operations, auth, and real-time features
 */
export class EnhancedSupabaseProvider extends EventEmitter {
  private client: SupabaseClient | null = null
  private config: ConfigType['supabase']
  private isConnected = false
  private realtimeChannels: Map<string, RealtimeChannel> = new Map()

  constructor() {
    super()
    this.config = simpleConfigManager.getSupabaseConfig()

    if (this.config.enabled) {
      this.connect()
    }
  }

  /**
   * Initialize Supabase connection
   */
  private async connect(): Promise<void> {
    try {
      const credentials = simpleConfigManager.getSupabaseCredentials()

      if (!credentials.url || !credentials.anonKey) {
        throw new Error('Supabase URL and anonymous key are required')
      }

      this.client = createClient(credentials.url, credentials.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
        realtime: this.config.features.realtime
          ? {
              heartbeatIntervalMs: 30000,
            }
          : undefined,
      })

      advancedUI.logInfo(chalk.blue('🔗 Connecting to Supabase...'))

      // Test connection
      const { error } = await this.client.from(this.config.tables.sessions).select('id').limit(1)

      if (error && !error.message.includes('relation') && !error.message.includes('permission')) {
        throw error
      }

      this.isConnected = true
      advancedUI.logInfo(chalk.green('✓ Supabase connected successfully'))
      this.emit('connected')

      // Setup real-time if enabled
      if (this.config.features.realtime) {
        this.setupRealtime()
      }
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Supabase connection failed: ${error.message}`))
      this.isConnected = false

      // Handle the error without throwing to prevent unhandled promise rejection
      try {
        this.emit('error', error)
      } catch (_emitError) {
        // Silent failure if no error listeners
        advancedUI.logInfo(chalk.yellow('⚠︎ No error listeners registered for Supabase provider'))
      }

      // Don't throw the error to prevent unhandled rejections
      return
    }
  }

  /**
   * Setup real-time subscriptions
   */
  private setupRealtime(): void {
    if (!this.client || !this.config.features.realtime) return

    // Subscribe to session changes
    const sessionChannel = this.client
      .channel('session_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: this.config.tables.sessions,
        },
        (payload) => {
          this.emit('session_change', payload)
        }
      )
      .subscribe()

    this.realtimeChannels.set('sessions', sessionChannel)

    // Subscribe to blueprint changes
    const blueprintChannel = this.client
      .channel('blueprint_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: this.config.tables.blueprints,
        },
        (payload) => {
          this.emit('blueprint_change', payload)
        }
      )
      .subscribe()

    this.realtimeChannels.set('blueprints', blueprintChannel)

    advancedUI.logInfo(chalk.blue('📡 Supabase real-time subscriptions active'))
  }

  // ===== SESSION OPERATIONS =====

  /**
   * Create or update a session
   */
  async upsertSession(session: Partial<SupabaseSession>): Promise<SupabaseSession | null> {
    if (!this.client || !this.config.features.database) {
      throw new Error('Supabase database not available')
    }

    try {
      const sessionData = {
        ...session,
        updated_at: new Date().toISOString(),
        version: (session.version || 0) + 1,
      }

      const { data, error } = await this.client.from(this.config.tables.sessions).upsert(sessionData).select().single()

      if (error) throw error

      return data
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Session upsert failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SupabaseSession | null> {
    if (!this.client || !this.config.features.database) {
      throw new Error('Supabase database not available')
    }

    try {
      const { data, error } = await this.client
        .from(this.config.tables.sessions)
        .select('*')
        .eq('id', sessionId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null // Not found
        throw error
      }

      return data
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Session get failed: ${error.message}`))
      throw error
    }
  }

  /**
   * List sessions with pagination and filtering
   */
  async listSessions(options?: {
    userId?: string
    limit?: number
    offset?: number
    tags?: string[]
    orderBy?: 'created_at' | 'updated_at' | 'title'
    ascending?: boolean
  }): Promise<SupabaseSession[]> {
    if (!this.client || !this.config.features.database) {
      throw new Error('Supabase database not available')
    }

    try {
      let query = this.client.from(this.config.tables.sessions).select('*')

      if (options?.userId) {
        query = query.eq('user_id', options.userId)
      }

      if (options?.tags && options.tags.length > 0) {
        query = query.overlaps('tags', options.tags)
      }

      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending ?? false })
      }

      if (options?.limit) {
        query = query.limit(options.limit)
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
      }

      const { data, error } = await query

      if (error) throw error

      return data || []
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Sessions list failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.client || !this.config.features.database) {
      throw new Error('Supabase database not available')
    }

    try {
      const { error } = await this.client.from(this.config.tables.sessions).delete().eq('id', sessionId)

      if (error) throw error

      return true
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Session delete failed: ${error.message}`))
      return false
    }
  }

  // ===== BLUEPRINT OPERATIONS =====

  /**
   * Create or update a blueprint
   */
  async upsertBlueprint(blueprint: Partial<SupabaseBlueprint>): Promise<SupabaseBlueprint | null> {
    if (!this.client || !this.config.features.database) {
      throw new Error('Supabase database not available')
    }

    try {
      const blueprintData = {
        ...blueprint,
        updated_at: new Date().toISOString(),
        version: (blueprint.version || 0) + 1,
      }

      const { data, error } = await this.client
        .from(this.config.tables.blueprints)
        .upsert(blueprintData)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Blueprint upsert failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Get blueprint by ID
   */
  async getBlueprint(blueprintId: string): Promise<SupabaseBlueprint | null> {
    if (!this.client || !this.config.features.database) {
      throw new Error('Supabase database not available')
    }

    try {
      const { data, error } = await this.client
        .from(this.config.tables.blueprints)
        .select('*')
        .eq('id', blueprintId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw error
      }

      // Increment install count
      if (data) {
        await this.client
          .from(this.config.tables.blueprints)
          .update({ install_count: (data.install_count || 0) + 1 })
          .eq('id', blueprintId)
      }

      return data
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Blueprint get failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Search blueprints
   */
  async searchBlueprints(options?: {
    query?: string
    tags?: string[]
    publicOnly?: boolean
    limit?: number
    orderBy?: 'created_at' | 'install_count' | 'name'
  }): Promise<SupabaseBlueprint[]> {
    if (!this.client || !this.config.features.database) {
      throw new Error('Supabase database not available')
    }

    try {
      let query = this.client.from(this.config.tables.blueprints).select('*')

      if (options?.publicOnly ?? true) {
        query = query.eq('is_public', true)
      }

      if (options?.query) {
        query = query.or(`name.ilike.%${options.query}%, description.ilike.%${options.query}%`)
      }

      if (options?.tags && options.tags.length > 0) {
        query = query.overlaps('tags', options.tags)
      }

      if (options?.orderBy) {
        const ascending = options.orderBy === 'name'
        query = query.order(options.orderBy, { ascending })
      }

      if (options?.limit) {
        query = query.limit(options.limit)
      }

      const { data, error } = await query

      if (error) throw error

      return data || []
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Blueprint search failed: ${error.message}`))
      throw error
    }
  }

  // ===== DOCUMENTATION OPERATIONS =====

  /**
   * Vector search for documents (if vector extension enabled)
   */
  async vectorSearchDocuments(
    query: string,
    options?: {
      limit?: number
      category?: string
      language?: string
      threshold?: number
    }
  ): Promise<SupabaseDocument[]> {
    if (!this.client || !this.config.features.database || !this.config.features.vector) {
      throw new Error('Supabase vector search not available')
    }

    try {
      // This requires the pgvector extension and embedding generation
      // For now, we'll do a text-based search as fallback
      let query_builder = this.client.from(this.config.tables.documents).select('*')

      if (options?.category) {
        query_builder = query_builder.eq('category', options.category)
      }

      if (options?.language) {
        query_builder = query_builder.eq('language', options.language)
      }

      // Text search fallback
      query_builder = query_builder.textSearch('content', query)

      if (options?.limit) {
        query_builder = query_builder.limit(options.limit)
      }

      query_builder = query_builder.order('popularity_score', { ascending: false })

      const { data, error } = await query_builder

      if (error) throw error

      return data || []
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Document vector search failed: ${error.message}`))
      throw error
    }
  }

  // ===== METRICS OPERATIONS =====

  /**
   * Record usage metric
   */
  async recordMetric(metric: Partial<SupabaseMetric>): Promise<void> {
    if (!this.client || !this.config.features.database) {
      return // Silent failure for metrics
    }

    try {
      await this.client.from(this.config.tables.metrics).insert({
        ...metric,
        timestamp: new Date().toISOString(),
      })
    } catch (_error) {
      // Silent failure for metrics to avoid disrupting main flow
    }
  }

  // ===== AUTHENTICATION =====

  /**
   * Sign in user
   */
  async signIn(email: string, password: string): Promise<SupabaseUser | null> {
    if (!this.client || !this.config.features.auth) {
      throw new Error('Supabase auth not available')
    }

    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      return data.user as any
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Sign in failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Sign up user
   */
  async signUp(email: string, password: string, metadata?: Record<string, any>): Promise<SupabaseUser | null> {
    if (!this.client || !this.config.features.auth) {
      throw new Error('Supabase auth not available')
    }

    try {
      const { data, error } = await this.client.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      })

      if (error) throw error

      return data.user as any
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Sign up failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<SupabaseUser | null> {
    if (!this.client || !this.config.features.auth) {
      return null
    }

    try {
      const {
        data: { user },
        error,
      } = await this.client.auth.getUser()

      if (error) throw error

      return user as any
    } catch (_error) {
      return null
    }
  }

  /**
   * Sign out user
   */
  async signOut(): Promise<void> {
    if (!this.client || !this.config.features.auth) {
      return
    }

    try {
      await this.client.auth.signOut()
    } catch (error: any) {
      advancedUI.logInfo(chalk.red(`✖ Sign out failed: ${error.message}`))
    }
  }

  /**
   * Get current access token from Supabase session
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.client || !this.config.features.auth) return null
    try {
      const { data, error } = await this.client.auth.getSession()
      if (error) return null
      return data.session?.access_token || null
    } catch (_e) {
      return null
    }
  }

  /**
   * Get current refresh token from Supabase session
   */
  async getRefreshToken(): Promise<string | null> {
    if (!this.client || !this.config.features.auth) return null
    try {
      const { data, error } = await this.client.auth.getSession()
      if (error) return null
      return (data.session as any)?.refresh_token || null
    } catch (_e) {
      return null
    }
  }

  /**
   * Refresh session with stored tokens
   */
  async refreshSession(accessToken: string, refreshToken: string): Promise<SupabaseUser | null> {
    if (!this.client || !this.config.features.auth) return null
    try {
      const { data, error } = await this.client.auth.refreshSession({
        refresh_token: refreshToken,
      })

      if (error || !data.user) {
        return null
      }

      // Set the new session
      if (data.session) {
        await this.client.auth.setSession(data.session)
      }

      return data.user as any
    } catch (_e) {
      return null
    }
  }

  // ===== HEALTH & UTILITIES =====

  /**
   * Test database connection and features
   */
  async healthCheck(): Promise<{
    connected: boolean
    features: {
      database: boolean
      auth: boolean
      realtime: boolean
      storage: boolean
      vector: boolean
    }
    latency?: number
  }> {
    if (!this.client) {
      return {
        connected: false,
        features: {
          database: false,
          auth: false,
          realtime: false,
          storage: false,
          vector: false,
        },
      }
    }

    const start = Date.now()

    try {
      // Test database
      const { error: dbError } = await this.client.from(this.config.tables.sessions).select('id').limit(1)

      const latency = Date.now() - start

      return {
        connected: this.isConnected,
        latency,
        features: {
          database: !dbError || dbError.message.includes('permission'),
          auth: this.config.features.auth,
          realtime: this.config.features.realtime && this.realtimeChannels.size > 0,
          storage: this.config.features.storage,
          vector: this.config.features.vector,
        },
      }
    } catch (_error) {
      return {
        connected: false,
        features: {
          database: false,
          auth: false,
          realtime: false,
          storage: false,
          vector: false,
        },
      }
    }
  }

  /**
   * Get connection status
   */
  isHealthy(): boolean {
    return this.isConnected && this.client !== null
  }

  /**
   * Get Supabase client instance
   */
  async getClient(): Promise<SupabaseClient | null> {
    if (!this.isConnected || !this.client) {
      return null
    }
    return this.client
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // Close real-time channels
    for (const [_name, channel] of this.realtimeChannels.entries()) {
      await channel.unsubscribe()
    }
    this.realtimeChannels.clear()

    this.client = null
    this.isConnected = false

    advancedUI.logInfo(chalk.yellow('🔌 Supabase disconnected'))
    this.emit('disconnected')
  }

  /**
   * Get configuration
   */
  getConfig(): ConfigType['supabase'] {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<ConfigType['supabase']>): Promise<void> {
    this.config = { ...this.config, ...newConfig }
    simpleConfigManager.setSupabaseConfig(newConfig)

    // Reconnect if needed
    if (newConfig.enabled && !this.isConnected) {
      await this.connect()
    } else if (newConfig.enabled === false && this.isConnected) {
      await this.disconnect()
    }
  }

  // ===== ML OPERATIONS =====

  /**
   * Record toolchain execution for ML training
   */
  async recordToolchainExecution(execution: Record<string, any>): Promise<void> {
    if (!this.client || !this.config.features.database) {
      return
    }

    try {
      const { error } = await this.client.from(this.config.tables.mlToolchainExecutions).insert({
        ...execution,
        created_at: new Date().toISOString(),
      })

      if (error) {
        advancedUI.logInfo(chalk.yellow(`⚠︎ Failed to record toolchain execution: ${error.message}`))
      }
    } catch (error: any) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Toolchain execution recording failed: ${error.message}`))
    }
  }

  /**
   * Get session toolchain executions
   */
  async getSessionToolchainExecutions(sessionId: string): Promise<any[]> {
    if (!this.client || !this.config.features.database) {
      return []
    }

    try {
      const { data, error } = await this.client
        .from(this.config.tables.mlToolchainExecutions)
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) {
        advancedUI.logInfo(chalk.yellow(`⚠︎ Failed to get session executions: ${error.message}`))
        return []
      }

      return data || []
    } catch (error: any) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Session executions query failed: ${error.message}`))
      return []
    }
  }

  /**
   * Get toolchain executions from specific date
   */
  async getToolchainExecutions(startDate: Date): Promise<any[]> {
    if (!this.client || !this.config.features.database) {
      return []
    }

    try {
      const { data, error } = await this.client
        .from(this.config.tables.mlToolchainExecutions)
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })

      if (error) {
        advancedUI.logInfo(chalk.yellow(`⚠︎ Failed to get toolchain executions: ${error.message}`))
        return []
      }

      return data || []
    } catch (error: any) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Toolchain executions query failed: ${error.message}`))
      return []
    }
  }

  /**
   * Get latest deployed ML model
   */
  async getLatestModel(modelType: string): Promise<any | null> {
    if (!this.client || !this.config.features.database) {
      return null
    }

    try {
      const { data, error } = await this.client
        .from(this.config.tables.mlToolchainModels)
        .select('*')
        .eq('model_type', modelType)
        .eq('deployed', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        advancedUI.logInfo(chalk.yellow(`⚠︎ Failed to get latest model: ${error.message}`))
        return null
      }

      return data
    } catch (error: any) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Latest model query failed: ${error.message}`))
      return null
    }
  }

  /**
   * Cache ML inference result
   */
  async cacheInference(hash: string, prediction: Record<string, any>, expiresAt: string): Promise<void> {
    if (!this.client || !this.config.features.database) {
      return
    }

    try {
      const { error } = await this.client.from(this.config.tables.mlInferenceCache).upsert({
        input_hash: hash,
        prediction,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      })

      if (error) {
        advancedUI.logInfo(chalk.yellow(`⚠︎ Failed to cache inference: ${error.message}`))
      }
    } catch (error: any) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Inference caching failed: ${error.message}`))
    }
  }

  /**
   * Get cached inference result
   */
  async getInferenceCache(hash: string): Promise<any | null> {
    if (!this.client || !this.config.features.database) {
      return null
    }

    try {
      const now = new Date().toISOString()
      const { data, error } = await this.client
        .from(this.config.tables.mlInferenceCache)
        .select('prediction')
        .eq('input_hash', hash)
        .gt('expires_at', now)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        return null // Silent fail for cache misses
      }

      return data?.prediction || null
    } catch {
      return null
    }
  }

  /**
   * Get baseline metrics for comparison
   */
  async getBaselineMetrics(): Promise<any | null> {
    if (!this.client || !this.config.features.database) {
      return null
    }

    try {
      const { data, error } = await this.client
        .from(this.config.tables.mlToolchainExecutions)
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (error || !data) {
        return null
      }

      return data
    } catch {
      return null
    }
  }

  /**
   * Get current best metrics
   */
  async getCurrentMetrics(): Promise<any | null> {
    if (!this.client || !this.config.features.database) {
      return null
    }

    try {
      const { data, error } = await this.client
        .from(this.config.tables.mlToolchainExecutions)
        .select('*')
        .eq('execution_success', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        return null
      }

      return data
    } catch {
      return null
    }
  }

  /**
   * Record benchmark result
   */
  async recordBenchmarkResult(result: Record<string, any>): Promise<void> {
    if (!this.client || !this.config.features.database) {
      return
    }

    try {
      const { error } = await this.client.from(this.config.tables.mlBenchmarkResults).insert({
        session_id: result.sessionId,
        metrics: result.metrics,
        regressions: result.regressions,
        improvements: result.improvements,
        recommendations: result.recommendations,
        created_at: new Date().toISOString(),
      })

      if (error) {
        advancedUI.logInfo(chalk.yellow(`⚠︎ Failed to record benchmark: ${error.message}`))
      }
    } catch (error: any) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Benchmark recording failed: ${error.message}`))
    }
  }

  /**
   * Record batch metrics
   */
  async recordBatchMetrics(metrics: Record<string, any>, lookbackDays: number): Promise<void> {
    if (!this.client || !this.config.features.database) {
      return
    }

    try {
      const { error } = await this.client.from(this.config.tables.mlBatchMetrics).insert({
        metrics,
        lookback_days: lookbackDays,
        created_at: new Date().toISOString(),
      })

      if (error) {
        advancedUI.logInfo(chalk.yellow(`⚠︎ Failed to record batch metrics: ${error.message}`))
      }
    } catch (error: any) {
      advancedUI.logInfo(chalk.yellow(`⚠︎ Batch metrics recording failed: ${error.message}`))
    }
  }
}

// Singleton instance
export const enhancedSupabaseProvider = new EnhancedSupabaseProvider()

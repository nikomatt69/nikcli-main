import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { simpleConfigManager } from '../../core/config-manager'
import { cacheService } from '../../services/cache-service'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { enhancedSupabaseProvider, type SupabaseUser } from './enhanced-supabase-provider'

export interface AuthSession {
  user: SupabaseUser
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface AuthConfig {
  enabled: boolean
  persistSession: boolean
  autoRefresh: boolean
  sessionTTL: number // seconds
  roles: string[]
  permissions: Record<string, string[]>
}

export interface UserProfile {
  id: string
  email?: string
  username?: string
  full_name?: string
  avatar_url?: string
  subscription_tier: 'free' | 'pro' | 'enterprise'
  preferences: {
    theme: 'light' | 'dark' | 'auto'
    language: string
    notifications: boolean
    analytics: boolean
  }
  notification_settings?: {
    enabled: boolean
    providers: {
      slack?: {
        enabled: boolean
        webhookUrl?: string
        channel?: string
        username?: string
      }
      discord?: {
        enabled: boolean
        webhookUrl?: string
        username?: string
      }
      linear?: {
        enabled: boolean
        apiKey?: string
        teamId?: string
        createIssues?: boolean
      }
    }
  }
  quotas: {
    sessionsPerMonth: number
    tokensPerMonth: number
    apiCallsPerHour: number
  }
  usage: {
    sessionsThisMonth: number
    tokensThisMonth: number
    apiCallsThisHour: number
    lastResetMonth?: string
    lastResetHour?: string
  }
}

/**
 * Authentication Provider with Supabase integration
 */
export class AuthProvider extends EventEmitter {
  private supabase = enhancedSupabaseProvider
  private currentSession: AuthSession | null = null
  private currentProfile: UserProfile | null = null
  private config: AuthConfig
  private refreshTimer?: NodeJS.Timeout
  private userTableName: string = 'user_profiles'

  constructor() {
    super()

    const supabaseConfig = simpleConfigManager.getSupabaseConfig()
    this.userTableName = supabaseConfig.tables.users
    this.config = {
      enabled: supabaseConfig.enabled && supabaseConfig.features.auth,
      persistSession: true,
      autoRefresh: true,
      sessionTTL: 3600, // 1 hour
      roles: ['user', 'admin'],
      permissions: {
        user: ['sessions:read', 'sessions:write', 'blueprints:read'],
        admin: ['*'],
      },
    }

    if (this.config.enabled) {
      this.initialize()
    }
  }

  /**
   * Initialize auth provider
   */
  private async initialize(): Promise<void> {
    try {
      // Try to restore session from cache
      if (this.config.persistSession) {
        await this.restoreSession()
      }

      // Setup auto-refresh if needed
      if (this.config.autoRefresh && this.currentSession) {
        this.setupAutoRefresh()
      }

      advancedUI.logFunctionCall('authproviderinit')
      advancedUI.logFunctionUpdate('success', 'Auth Provider initialized', '✓')
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Auth initialization failed: ${error.message}`, '✖')
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(
    email: string,
    password: string,
    options?: {
      rememberMe?: boolean
      deviceInfo?: Record<string, any>
    }
  ): Promise<{ session: AuthSession; profile: UserProfile } | null> {
    if (!this.config.enabled) {
      throw new Error('Authentication not enabled')
    }

    try {
      console.log(chalk.blue('🔐 Signing in...'))

      const user = await this.supabase.signIn(email, password)
      if (!user) {
        throw new Error('Sign in failed - invalid credentials')
      }

      // Create session using real tokens from Supabase client
      const accessToken = await this.supabase.getAccessToken()
      const refreshToken = await this.supabase.getRefreshToken()
      const session: AuthSession = {
        user,
        accessToken: accessToken || '',
        refreshToken: refreshToken || '',
        expiresAt: Date.now() + this.config.sessionTTL * 1000,
      }

      // Load or create user profile
      const profile = (await this.loadUserProfile(user.id)) || (await this.createUserProfile(user))

      // Store session
      this.currentSession = session
      this.currentProfile = profile

      // Reset usage counters if periods have expired
      await this.resetMonthlyUsageIfNeeded()
      await this.resetHourlyUsageIfNeeded()

      // Persist session if enabled
      if (this.config.persistSession && options?.rememberMe !== false) {
        await this.persistSession(session, profile)
        // Also save credentials to config for auto-login on next startup
        simpleConfigManager.saveAuthCredentials({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        })
      }

      // Setup auto-refresh
      if (this.config.autoRefresh) {
        this.setupAutoRefresh()
      }

      // Record sign-in metric
      await this.recordAuthMetric('sign_in', {
        userId: user.id,
        deviceInfo: options?.deviceInfo,
        timestamp: new Date().toISOString(),
      })

      console.log(chalk.green(`✓ Signed in as ${profile.email || profile.username}`))

      this.emit('signed_in', { session, profile })

      return { session, profile }
    } catch (error: any) {
      console.log(chalk.red(`✖ Sign in failed: ${error.message}`))
      this.emit('sign_in_failed', error)
      throw error
    }
  }

  /**
   * Sign up new user
   */
  async signUp(
    email: string,
    password: string,
    options?: {
      username?: string
      fullName?: string
      metadata?: Record<string, any>
    }
  ): Promise<{ session: AuthSession; profile: UserProfile } | null> {
    if (!this.config.enabled) {
      throw new Error('Authentication not enabled')
    }

    try {
      console.log(chalk.blue('📝 Creating new account...'))

      const user = await this.supabase.signUp(email, password, options?.metadata)
      if (!user) {
        throw new Error('Sign up failed')
      }

      // Create session using real tokens from Supabase client
      const accessToken = await this.supabase.getAccessToken()
      const refreshToken = await this.supabase.getRefreshToken()
      const session: AuthSession = {
        user,
        accessToken: accessToken || '',
        refreshToken: refreshToken || '',
        expiresAt: Date.now() + this.config.sessionTTL * 1000,
      }

      // Create user profile
      const profile = await this.createUserProfile(user, {
        username: options?.username,
        full_name: options?.fullName,
      })

      this.currentSession = session
      this.currentProfile = profile

      // Persist session
      if (this.config.persistSession) {
        await this.persistSession(session, profile)
      }

      // Setup auto-refresh
      if (this.config.autoRefresh) {
        this.setupAutoRefresh()
      }

      // Record sign-up metric
      await this.recordAuthMetric('sign_up', {
        userId: user.id,
        subscriptionTier: 'free',
        timestamp: new Date().toISOString(),
      })

      console.log(chalk.green(`✓ Account created for ${profile.email}`))

      this.emit('signed_up', { session, profile })

      return { session, profile }
    } catch (error: any) {
      console.log(chalk.red(`✖ Sign up failed: ${error.message}`))
      this.emit('sign_up_failed', error)
      throw error
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      if (this.currentSession) {
        // Record sign-out metric
        await this.recordAuthMetric('sign_out', {
          userId: this.currentSession.user.id,
          sessionDuration: Date.now() - (this.currentSession.expiresAt - this.config.sessionTTL * 1000),
          timestamp: new Date().toISOString(),
        })

        // Clear refresh timer
        if (this.refreshTimer) {
          clearTimeout(this.refreshTimer)
          this.refreshTimer = undefined
        }

        // Clear cached session
        await this.clearPersistedSession()

        // Clear stored credentials from config
        simpleConfigManager.clearAuthCredentials()

        // Sign out from Supabase
        await this.supabase.signOut()

        console.log(chalk.green('👋 Signed out successfully'))
      }

      this.currentSession = null
      this.currentProfile = null

      this.emit('signed_out')
    } catch (error: any) {
      console.log(chalk.red(`✖ Sign out failed: ${error.message}`))
      this.emit('sign_out_failed', error)
      throw error
    }
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): SupabaseUser | null {
    return this.currentSession?.user || null
  }

  /**
   * Get current user profile
   */
  getCurrentProfile(): UserProfile | null {
    return this.currentProfile
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentSession !== null && this.currentSession.expiresAt > Date.now()
  }

  /**
   * Check if user has permission
   */
  hasPermission(permission: string): boolean {
    if (!this.currentProfile) return false

    const userRole = this.getUserRole()
    const rolePermissions = this.config.permissions[userRole] || []

    return rolePermissions.includes('*') || rolePermissions.includes(permission)
  }

  /**
   * Get user role
   */
  private getUserRole(): string {
    if (!this.currentProfile) return 'anonymous'

    // In real implementation, this would come from the user profile or JWT
    return this.currentProfile.subscription_tier === 'enterprise' ? 'admin' : 'user'
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
    if (!this.currentProfile || !this.currentSession) {
      throw new Error('Not authenticated')
    }

    try {
      const updatedProfile = {
        ...this.currentProfile,
        ...updates,
      }

      // Update in cache
      await cacheService.set(`profile:${this.currentSession.user.id}`, updatedProfile, 'auth', {
        ttl: this.config.sessionTTL,
      })

      this.currentProfile = updatedProfile

      this.emit('profile_updated', updatedProfile)

      return updatedProfile
    } catch (error: any) {
      console.log(chalk.red(`✖ Profile update failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Check usage quotas
   */
  checkQuota(quotaType: 'sessions' | 'tokens' | 'apiCalls'): {
    allowed: boolean
    used: number
    limit: number
    resetTime?: Date
  } {
    if (!this.currentProfile) {
      return { allowed: false, used: 0, limit: 0 }
    }

    // 🔓 Whitelist users with unlimited access
    const UNLIMITED_USERS = ['nicola.mattioli.95@gmail.com', 'nicom.19@icloud.com']
    if (UNLIMITED_USERS.includes(this.currentProfile.email || '')) {
      // Return unlimited quota for whitelisted users
      return {
        allowed: true,
        used: 0,
        limit: Number.MAX_SAFE_INTEGER,
        resetTime: this.getMonthResetTime(),
      }
    }

    // ⭐ Pro users get unlimited access
    if (this.currentProfile.subscription_tier === 'pro') {
      return {
        allowed: true,
        used: 0,
        limit: Number.MAX_SAFE_INTEGER,
        resetTime: this.getMonthResetTime(),
      }
    }

    const { quotas, usage } = this.currentProfile

    switch (quotaType) {
      case 'sessions':
        return {
          allowed: usage.sessionsThisMonth < quotas.sessionsPerMonth,
          used: usage.sessionsThisMonth,
          limit: quotas.sessionsPerMonth,
          resetTime: this.getMonthResetTime(),
        }

      case 'tokens':
        return {
          allowed: usage.tokensThisMonth < quotas.tokensPerMonth,
          used: usage.tokensThisMonth,
          limit: quotas.tokensPerMonth,
          resetTime: this.getMonthResetTime(),
        }

      case 'apiCalls':
        return {
          allowed: usage.apiCallsThisHour < quotas.apiCallsPerHour,
          used: usage.apiCallsThisHour,
          limit: quotas.apiCallsPerHour,
          resetTime: this.getHourResetTime(),
        }

      default:
        return { allowed: false, used: 0, limit: 0 }
    }
  }

  /**
   * Record usage - Updates in-memory profile AND persists to database
   */
  async recordUsage(usageType: 'sessions' | 'tokens' | 'apiCalls', amount: number = 1): Promise<void> {
    if (!this.currentProfile) return

    const updatedProfile = { ...this.currentProfile }

    switch (usageType) {
      case 'sessions':
        updatedProfile.usage.sessionsThisMonth += amount
        break
      case 'tokens':
        updatedProfile.usage.tokensThisMonth += amount
        break
      case 'apiCalls':
        updatedProfile.usage.apiCallsThisHour += amount
        break
    }

    await this.updateProfile(updatedProfile)

    // Persist usage to database
    try {
      if (this.supabase && this.currentProfile?.id) {
        const client = (this.supabase as any).client
        if (client) {
          await client
            .from(this.userTableName)
            .update({ usage: updatedProfile.usage })
            .eq('id', this.currentProfile.id)
        }
      }
    } catch (error: any) {
      // Usage persistence is best-effort; log but don't break flow
      console.debug(`[auth-provider] Failed to persist ${usageType} usage to database:`, error.message)
    }

    // Record metric
    await this.recordAuthMetric('usage', {
      userId: this.currentProfile.id,
      usageType,
      amount,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Reset usage counters if monthly period has expired
   */
  async resetMonthlyUsageIfNeeded(): Promise<void> {
    if (!this.currentProfile) return

    const lastResetMonth = this.currentProfile.usage.lastResetMonth
    const today = new Date()
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    if (lastResetMonth !== currentMonth) {
      this.currentProfile.usage.sessionsThisMonth = 0
      this.currentProfile.usage.tokensThisMonth = 0
      this.currentProfile.usage.lastResetMonth = currentMonth

      // Attempt to persist to database
      try {
        if (this.supabase && this.currentProfile?.id) {
          const client = (this.supabase as any).client
          if (client) {
            await client
              .from(this.userTableName)
              .update({ usage: this.currentProfile.usage })
              .eq('id', this.currentProfile.id)
          }
        }
      } catch (error: any) {
        console.debug('[auth-provider] Failed to persist monthly reset:', error?.message || error)
      }
    }
  }

  /**
   * Reset usage counters if hourly period has expired
   */
  async resetHourlyUsageIfNeeded(): Promise<void> {
    if (!this.currentProfile) return

    const lastResetHour = this.currentProfile.usage.lastResetHour
    const today = new Date()
    const currentHour = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${String(today.getHours()).padStart(2, '0')}:00`

    if (lastResetHour !== currentHour) {
      this.currentProfile.usage.apiCallsThisHour = 0
      this.currentProfile.usage.lastResetHour = currentHour

      // Attempt to persist to database
      try {
        if (this.supabase && this.currentProfile?.id) {
          const client = (this.supabase as any).client
          if (client) {
            await client
              .from(this.userTableName)
              .update({ usage: this.currentProfile.usage })
              .eq('id', this.currentProfile.id)
          }
        }
      } catch (error: any) {
        console.debug('[auth-provider] Failed to persist hourly reset:', error?.message || error)
      }
    }
  }

  // ===== PRIVATE METHODS =====

  /**
   * Setup auto-refresh for session
   */
  private setupAutoRefresh(): void {
    if (!this.currentSession) return

    const timeUntilExpiry = this.currentSession.expiresAt - Date.now()
    const refreshTime = Math.max(timeUntilExpiry - 300000, 60000) // Refresh 5 mins before expiry or in 1 min

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshSession()
      } catch (error: any) {
        console.log(chalk.yellow(`⚠️ Session refresh failed: ${error.message}`))
        this.emit('session_expired')
      }
    }, refreshTime)
  }

  /**
   * Refresh current session
   */
  private async refreshSession(): Promise<void> {
    if (!this.currentSession) return

    // In real implementation, use refresh token
    this.currentSession.expiresAt = Date.now() + this.config.sessionTTL * 1000

    // Persist updated session
    if (this.config.persistSession) {
      await this.persistSession(this.currentSession, this.currentProfile!)
    }

    // Setup next refresh
    this.setupAutoRefresh()

    this.emit('session_refreshed', this.currentSession)
  }

  /**
   * Persist session to cache
   */
  private async persistSession(session: AuthSession, profile: UserProfile): Promise<void> {
    await cacheService.set(`session:${session.user.id}`, session, 'auth', { ttl: this.config.sessionTTL })

    await cacheService.set(`profile:${session.user.id}`, profile, 'auth', { ttl: this.config.sessionTTL })
  }

  /**
   * Restore session from cache
   */
  private async restoreSession(): Promise<void> {
    try {
      // First try Supabase client's own session storage (most reliable)
      try {
        const currentUser = await this.supabase.getCurrentUser()
        if (currentUser) {
          const accessToken = await this.supabase.getAccessToken()
          const refreshToken = await this.supabase.getRefreshToken()

          if (accessToken && refreshToken) {
            const session: AuthSession = {
              user: currentUser,
              accessToken,
              refreshToken,
              expiresAt: Date.now() + this.config.sessionTTL * 1000,
            }

            const profile = (await this.loadUserProfile(currentUser.id)) || (await this.createUserProfile(currentUser))

            this.currentSession = session
            this.currentProfile = profile

            // Reset usage counters if periods have expired
            this.resetMonthlyUsageIfNeeded()
            this.resetHourlyUsageIfNeeded()

            // Save credentials for next time
            simpleConfigManager.saveAuthCredentials({
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
            })

            this.emit('auto_login_success', { session, profile })
            return
          }
        }
      } catch (_error) {
        // Supabase session not available, try saved credentials
      }

      // Try to restore from config.json (for persistent login)
      const savedCredentials = simpleConfigManager.getAuthCredentials()
      if (savedCredentials?.accessToken && savedCredentials?.refreshToken) {
        try {
          // Try to refresh the session with stored tokens
          const user = await this.supabase.refreshSession(
            savedCredentials.accessToken,
            savedCredentials.refreshToken
          )

          if (user) {
            // Get fresh tokens from Supabase client after refresh
            const freshAccessToken = await this.supabase.getAccessToken()
            const freshRefreshToken = await this.supabase.getRefreshToken()

            const session: AuthSession = {
              user,
              accessToken: freshAccessToken || savedCredentials.accessToken,
              refreshToken: freshRefreshToken || savedCredentials.refreshToken,
              expiresAt: Date.now() + this.config.sessionTTL * 1000,
            }

            const profile = (await this.loadUserProfile(user.id)) || (await this.createUserProfile(user))

            this.currentSession = session
            this.currentProfile = profile

            // Reset usage counters if periods have expired
            this.resetMonthlyUsageIfNeeded()
            this.resetHourlyUsageIfNeeded()

            // Update saved credentials with fresh tokens
            simpleConfigManager.saveAuthCredentials({
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
            })

            this.emit('auto_login_success', { session, profile })
            return
          }
        } catch (error: any) {
          // Tokens expired or invalid, clear them
          simpleConfigManager.clearAuthCredentials()
        }
      }
    } catch (error: any) {
      // Silently fail - user will be logged out
      if (process.env.DEBUG) {
        console.warn('Session restoration failed:', error.message)
      }
    }
  }

  /**
   * Clear persisted session
   */
  private async clearPersistedSession(): Promise<void> {
    if (this.currentSession) {
      await cacheService.delete(`session:${this.currentSession.user.id}`)
      await cacheService.delete(`profile:${this.currentSession.user.id}`)
    }
  }

  /**
   * Load user profile
   */
  private async loadUserProfile(userId: string): Promise<UserProfile | null> {
    // Prefer the database as source of truth for subscription tier and quotas,
    // then fall back to cached profile if the DB is unavailable.
    try {
      const client = (this.supabase as any).client as any
      if (client) {
        const { data, error } = await client.from(this.userTableName).select('*').eq('id', userId).single()

        if (!error && data) {
          const dbProfile = data as any

          const profile: UserProfile = {
            id: dbProfile.id,
            email: dbProfile.email ?? undefined,
            username: dbProfile.username ?? dbProfile.email?.split?.('@')?.[0],
            full_name: dbProfile.full_name ?? undefined,
            avatar_url: dbProfile.avatar_url ?? undefined,
            subscription_tier: dbProfile.subscription_tier ?? 'free',
            preferences: {
              theme: (dbProfile.preferences?.theme ?? 'auto') as 'light' | 'dark' | 'auto',
              language: dbProfile.preferences?.language ?? 'en',
              notifications: dbProfile.preferences?.notifications ?? true,
              analytics: dbProfile.preferences?.analytics ?? true,
            },
            notification_settings: dbProfile.notification_settings ?? undefined,
            quotas: {
              sessionsPerMonth: dbProfile.quotas?.sessionsPerMonth ?? 1000,
              tokensPerMonth: dbProfile.quotas?.tokensPerMonth ?? 5000000, // 5M tokens for free users
              apiCallsPerHour: dbProfile.quotas?.apiCallsPerHour ?? 600,
            },
            usage: {
              sessionsThisMonth: dbProfile.usage?.sessionsThisMonth ?? 0,
              tokensThisMonth: dbProfile.usage?.tokensThisMonth ?? 0,
              apiCallsThisHour: dbProfile.usage?.apiCallsThisHour ?? 0,
            },
          }

          await cacheService.set(`profile:${userId}`, profile, 'auth', {
            ttl: this.config.sessionTTL,
          })

          return profile
        }
      }
    } catch (_dbError) {
      // Fall back to cache if DB fetch fails
    }

    try {
      const cached = await cacheService.get<UserProfile>(`profile:${userId}`, 'auth')
      return cached || null
    } catch (_error) {
      return null
    }
  }

  /**
   * Create new user profile
   */
  private async createUserProfile(
    user: SupabaseUser,
    extra?: { username?: string; full_name?: string }
  ): Promise<UserProfile> {
    const profile: UserProfile = {
      id: user.id,
      email: user.email,
      username: extra?.username || user.email?.split('@')[0],
      full_name: extra?.full_name || user.full_name,
      avatar_url: user.avatar_url,
      subscription_tier: 'free',
      preferences: {
        theme: 'auto',
        language: 'en',
        notifications: true,
        analytics: true,
      },
      quotas: {
        sessionsPerMonth: 1000,
        tokensPerMonth: 5000000, // 5M tokens for free users
        apiCallsPerHour: 600,
      },
      usage: {
        sessionsThisMonth: 0,
        tokensThisMonth: 0,
        apiCallsThisHour: 0,
      },
    }

    // Persist profile in Supabase so that subscription updates (e.g., Pro plan)
    // are always reflected across environments.
    try {
      const client = (this.supabase as any).client as any
      if (client) {
        await client.from(this.userTableName).insert({
          id: profile.id,
          email: profile.email,
          username: profile.username,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          subscription_tier: profile.subscription_tier,
          preferences: profile.preferences,
          notification_settings: profile.notification_settings,
          quotas: profile.quotas,
          usage: profile.usage,
        })
      }
    } catch (_dbError) {
      // Profile creation in DB is best-effort; continue with in-memory profile.
    }

    // Cache profile for faster access during the session
    try {
      await cacheService.set(`profile:${user.id}`, profile, 'auth', {
        ttl: this.config.sessionTTL,
      })
    } catch (_cacheError) {
      // Ignore cache failures
    }

    return profile
  }

  /**
   * Record authentication metric
   */
  private async recordAuthMetric(eventType: string, data: any): Promise<void> {
    try {
      await this.supabase.recordMetric({
        event_type: `auth_${eventType}`,
        event_data: data,
      })
    } catch (_error) {
      // Silent failure for metrics
    }
  }

  /**
   * Get month reset time
   */
  private getMonthResetTime(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 1)
  }

  /**
   * Get hour reset time
   */
  private getHourResetTime(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1)
  }

  /**
   * Get auth configuration
   */
  getConfig(): AuthConfig {
    return { ...this.config }
  }

  /**
   * Update auth configuration
   */
  updateConfig(newConfig: Partial<AuthConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.emit('config_updated', this.config)
  }
}

// Singleton instance
export const authProvider = new AuthProvider()

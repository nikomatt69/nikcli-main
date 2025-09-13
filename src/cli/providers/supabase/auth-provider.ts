import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { simpleConfigManager } from '../../core/config-manager'
import { cacheService } from '../../services/cache-service'
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
  quotas: {
    sessionsPerMonth: number
    tokensPerMonth: number
    apiCallsPerHour: number
  }
  usage: {
    sessionsThisMonth: number
    tokensThisMonth: number
    apiCallsThisHour: number
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

  constructor() {
    super()

    const supabaseConfig = simpleConfigManager.getSupabaseConfig()
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

      console.log(chalk.blue('🔐 Auth Provider initialized'))
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Auth initialization failed: ${error.message}`))
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

      // Create session
      const session: AuthSession = {
        user,
        accessToken: 'mock_access_token', // In real implementation, get from Supabase
        refreshToken: 'mock_refresh_token',
        expiresAt: Date.now() + this.config.sessionTTL * 1000,
      }

      // Load or create user profile
      const profile = (await this.loadUserProfile(user.id)) || (await this.createUserProfile(user))

      // Store session
      this.currentSession = session
      this.currentProfile = profile

      // Persist session if enabled
      if (this.config.persistSession && options?.rememberMe !== false) {
        await this.persistSession(session, profile)
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

      console.log(chalk.green(`✅ Signed in as ${profile.email || profile.username}`))

      this.emit('signed_in', { session, profile })

      return { session, profile }
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign in failed: ${error.message}`))
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

      // Create session
      const session: AuthSession = {
        user,
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
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

      console.log(chalk.green(`✅ Account created for ${profile.email}`))

      this.emit('signed_up', { session, profile })

      return { session, profile }
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign up failed: ${error.message}`))
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

        // Sign out from Supabase
        await this.supabase.signOut()

        console.log(chalk.green('👋 Signed out successfully'))
      }

      this.currentSession = null
      this.currentProfile = null

      this.emit('signed_out')
    } catch (error: any) {
      console.log(chalk.red(`❌ Sign out failed: ${error.message}`))
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
      console.log(chalk.red(`❌ Profile update failed: ${error.message}`))
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
   * Record usage
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

    // Record metric
    await this.recordAuthMetric('usage', {
      userId: this.currentProfile.id,
      usageType,
      amount,
      timestamp: new Date().toISOString(),
    })
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
    // This would be implemented based on your session storage strategy
    // For now, we'll skip automatic session restoration
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
    try {
      const cached = await cacheService.get<UserProfile>(`profile:${userId}`, 'auth')
      return cached
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
        sessionsPerMonth: 100,
        tokensPerMonth: 10000,
        apiCallsPerHour: 60,
      },
      usage: {
        sessionsThisMonth: 0,
        tokensThisMonth: 0,
        apiCallsThisHour: 0,
      },
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

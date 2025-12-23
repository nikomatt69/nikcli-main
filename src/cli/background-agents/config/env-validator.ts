/**
 * Environment Variable Validator
 * Validates and provides defaults for environment variables
 */

export interface EnvironmentConfig {
  // API Keys
  openrouterApiKey: string
  githubToken?: string
  supabaseUrl?: string
  supabaseAnonKey?: string

  // Server
  port: number
  nodeEnv: 'development' | 'production' | 'test'
  apiUrl: string

  // Security
  jwtSecret: string
  allowedOrigins: string[]

  // AI Configuration
  openrouterModel: string
  maxOutputTokens: number
  temperature: number

  // Queue
  queueType: 'local' | 'redis'
  redisUrl?: string

  // Slack
  slackWebhookUrl?: string
  slackChannel?: string
  slackNotificationsEnabled: boolean

  // Features
  enableMonitoring: boolean
  enableMetrics: boolean
}

class EnvironmentValidator {
  private errors: string[] = []
  private warnings: string[] = []

  /**
   * Validate and load environment configuration
   */
  validate(): EnvironmentConfig {
    this.errors = []
    this.warnings = []

    const config: EnvironmentConfig = {
      // API Keys
      openrouterApiKey: this.getRequired('OPENROUTER_API_KEY'),
      githubToken: this.getOptional('GITHUB_TOKEN') || this.getOptional('GH_TOKEN'),
      supabaseUrl: this.getOptional('NEXT_PUBLIC_SUPABASE_URL'),
      supabaseAnonKey: this.getOptional('NEXT_PUBLIC_SUPABASE_ANON_KEY'),

      // Server
      port: this.getNumber('PORT', 3001),
      nodeEnv: this.getEnum('NODE_ENV', ['development', 'production', 'test'], 'development') as any,
      apiUrl: this.getOptional('API_URL') || 'http://localhost:3001',

      // Security
      jwtSecret: this.getJWTSecret(),
      allowedOrigins: this.getAllowedOrigins(),

      // AI Configuration
      openrouterModel: this.getOptional('OPENROUTER_MODEL') || '@preset/nikcli',
      maxOutputTokens: this.getNumber('MAX_TOKENS', 6000),
      temperature: this.getNumber('TEMPERATURE', 1),

      // Queue
      queueType: this.getEnum('QUEUE_TYPE', ['local', 'redis'], 'local') as any,
      redisUrl: this.getOptional('REDIS_URL'),

      // Slack
      slackWebhookUrl: this.getOptional('SLACK_WEBHOOK_URL'),
      slackChannel: this.getOptional('SLACK_CHANNEL') || '#nikcli-notifications',
      slackNotificationsEnabled: this.getBoolean('SLACK_TASK_NOTIFICATIONS', false),

      // Features
      enableMonitoring: this.getBoolean('ENABLE_MONITORING', true),
      enableMetrics: this.getBoolean('ENABLE_METRICS', true),
    }

    // Validate interdependencies
    this.validateDependencies(config)

    // Report errors and warnings
    if (this.errors.length > 0) {
      console.error('✖ Environment validation failed:')
      for (const error of this.errors) {
        console.error(`  - ${error}`)
      }
      throw new Error('Environment validation failed. Please fix the errors above.')
    }

    if (this.warnings.length > 0) {
      console.warn('⚠︎  Environment warnings:')
      for (const warning of this.warnings) {
        console.warn(`  - ${warning}`)
      }
    }

    console.log('✓ Environment validation passed')
    return config
  }

  /**
   * Get required environment variable
   */
  private getRequired(key: string): string {
    const value = process.env[key]
    if (!value) {
      this.errors.push(`${key} is required but not set`)
      return ''
    }
    return value
  }

  /**
   * Get optional environment variable
   */
  private getOptional(key: string): string | undefined {
    return process.env[key]
  }

  /**
   * Get number from environment variable
   */
  private getNumber(key: string, defaultValue: number): number {
    const value = process.env[key]
    if (!value) return defaultValue

    const parsed = Number.parseFloat(value)
    if (Number.isNaN(parsed)) {
      this.warnings.push(`${key}=${value} is not a valid number, using default: ${defaultValue}`)
      return defaultValue
    }

    return parsed
  }

  /**
   * Get boolean from environment variable
   */
  private getBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key]
    if (!value) return defaultValue

    return value.toLowerCase() === 'true' || value === '1'
  }

  /**
   * Get enum value from environment variable
   */
  private getEnum(key: string, allowedValues: string[], defaultValue: string): string {
    const value = process.env[key]
    if (!value) return defaultValue

    if (!allowedValues.includes(value)) {
      this.warnings.push(
        `${key}=${value} is not valid. Allowed: ${allowedValues.join(', ')}. Using default: ${defaultValue}`
      )
      return defaultValue
    }

    return value
  }

  /**
   * Get JWT secret with production validation
   */
  private getJWTSecret(): string {
    const secret = process.env.JWT_SECRET
    const nodeEnv = process.env.NODE_ENV || 'development'

    if (!secret) {
      if (nodeEnv === 'production') {
        this.errors.push('JWT_SECRET is required in production')
        return ''
      }

      this.warnings.push('JWT_SECRET not set, using development default (DO NOT USE IN PRODUCTION)')
      return 'nikcli-dev-secret-' + Math.random().toString(36)
    }

    // Validate secret strength in production
    if (nodeEnv === 'production') {
      if (secret.length < 32) {
        this.errors.push('JWT_SECRET must be at least 32 characters in production')
      }
      if (secret.includes('default') || secret.includes('change') || secret.includes('example')) {
        this.errors.push('JWT_SECRET appears to be a default/example value in production')
      }
    }

    return secret
  }

  /**
   * Get allowed CORS origins
   */
  private getAllowedOrigins(): string[] {
    const origins = process.env.ALLOWED_ORIGINS
    if (!origins) {
      const nodeEnv = process.env.NODE_ENV || 'development'
      if (nodeEnv === 'production') {
        this.warnings.push('ALLOWED_ORIGINS not set in production, defaulting to restrictive policy')
        return []
      }
      return ['http://localhost:3000', 'http://localhost:3001']
    }

    return origins.split(',').map((o) => o.trim())
  }

  /**
   * Validate interdependencies between config values
   */
  private validateDependencies(config: EnvironmentConfig): void {
    // Redis validation
    if (config.queueType === 'redis' && !config.redisUrl) {
      this.errors.push('REDIS_URL is required when QUEUE_TYPE=redis')
    }

    // Slack validation
    if (config.slackNotificationsEnabled && !config.slackWebhookUrl) {
      this.warnings.push(
        'SLACK_TASK_NOTIFICATIONS is enabled but SLACK_WEBHOOK_URL is not set. Notifications will fail.'
      )
    }

    // Production checks
    if (config.nodeEnv === 'production') {
      if (!config.githubToken) {
        this.warnings.push('GITHUB_TOKEN not set. PR creation will not work.')
      }

      if (config.allowedOrigins.length === 0) {
        this.warnings.push('No ALLOWED_ORIGINS set. CORS will block all requests.')
      }

      if (config.apiUrl.includes('localhost')) {
        this.warnings.push('API_URL contains localhost in production environment')
      }
    }
  }
}

// Singleton instance
let envConfig: EnvironmentConfig | null = null

/**
 * Get validated environment configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  if (!envConfig) {
    const validator = new EnvironmentValidator()
    envConfig = validator.validate()
  }
  return envConfig
}

/**
 * Reset environment configuration (for testing)
 */
export function resetEnvironmentConfig(): void {
  envConfig = null
}

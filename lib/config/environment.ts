// lib/config/environment.ts

/**
 * Environment configuration for NikCLI Web App
 * Centralizes all environment variable access with validation
 */

// AI Model Configuration
export const AI_CONFIG = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  google: {
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
  },
  gateway: {
    apiKey: process.env.AI_GATEWAY_API_KEY || '',
  },
  v0: {
    apiKey: process.env.V0_API_KEY || '',
  },
  defaultModel: process.env.DEFAULT_AI_MODEL || 'claude-3-5-sonnet-latest',
} as const

// Database Configuration
export const DATABASE_CONFIG = {
  kv: {
    url: process.env.KV_REST_API_URL || '',
    token: process.env.KV_REST_API_TOKEN || '',
  },
  upstash: {
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  },
} as const

// Application Configuration
export const APP_CONFIG = {
  env: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
  urls: {
    api: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    websocket: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
  },
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
} as const

// Security Configuration
export const SECURITY_CONFIG = {
  cronSecret: process.env.CRON_SECRET || '',
  jwtSecret: process.env.JWT_SECRET || 'fallback-jwt-secret-change-in-production',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
} as const

// GitHub Integration Configuration
export const GITHUB_CONFIG = {
  appId: process.env.GITHUB_APP_ID || '',
  privateKey: process.env.GITHUB_PRIVATE_KEY || '',
  installationId: process.env.GITHUB_INSTALLATION_ID || '',
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  isEnabled: process.env.ENABLE_GITHUB_INTEGRATION === 'true',
} as const

// Background Jobs Configuration
export const JOBS_CONFIG = {
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10),
  defaultTimeoutMinutes: parseInt(process.env.DEFAULT_JOB_TIMEOUT_MINUTES || '30', 10),
  defaultMemoryMB: parseInt(process.env.DEFAULT_JOB_MEMORY_MB || '2048', 10),
  isEnabled: process.env.ENABLE_BACKGROUND_JOBS !== 'false',
  cleanupIntervalHours: 6,
} as const

// Feature Flags
export const FEATURES = {
  githubIntegration: process.env.ENABLE_GITHUB_INTEGRATION === 'true',
  backgroundJobs: process.env.ENABLE_BACKGROUND_JOBS !== 'false',
  websocket: process.env.ENABLE_WEBSOCKET !== 'false',
  analytics: process.env.ENABLE_ANALYTICS === 'true',
} as const

// Rate Limiting Configuration
export const RATE_LIMIT_CONFIG = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
} as const

// Monitoring Configuration
export const MONITORING_CONFIG = {
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
    enabled: Boolean(process.env.SENTRY_DSN),
  },
  posthog: {
    key: process.env.NEXT_PUBLIC_POSTHOG_KEY || '',
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    enabled: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  },
} as const

// External Services Configuration
export const SERVICES_CONFIG = {
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    enabled: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
  },
} as const

/**
 * Validation functions
 */
export function validateEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check for required KV database configuration
  if (!DATABASE_CONFIG.kv.url) {
    errors.push('KV_REST_API_URL is required')
  }
  if (!DATABASE_CONFIG.kv.token) {
    errors.push('KV_REST_API_TOKEN is required')
  }

  // Check for at least one AI API key
  const hasAnyAIKey = Object.values(AI_CONFIG).some(
    (config) => typeof config === 'object' && 'apiKey' in config && config.apiKey
  )
  if (!hasAnyAIKey) {
    errors.push(
      'At least one AI API key is required (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY)'
    )
  }

  // Production-specific validation
  if (APP_CONFIG.isProduction) {
    if (!SECURITY_CONFIG.cronSecret) {
      errors.push('CRON_SECRET is required in production')
    }
    if (SECURITY_CONFIG.jwtSecret === 'fallback-jwt-secret-change-in-production') {
      errors.push('JWT_SECRET must be set in production')
    }
  }

  // GitHub integration validation
  if (FEATURES.githubIntegration) {
    if (!GITHUB_CONFIG.appId || !GITHUB_CONFIG.privateKey || !GITHUB_CONFIG.installationId) {
      errors.push('GitHub integration requires GITHUB_APP_ID, GITHUB_PRIVATE_KEY, and GITHUB_INSTALLATION_ID')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Get environment configuration summary for debugging
 */
export function getEnvironmentSummary() {
  return {
    environment: APP_CONFIG.env,
    features: FEATURES,
    database: {
      kv: Boolean(DATABASE_CONFIG.kv.url && DATABASE_CONFIG.kv.token),
      upstash: Boolean(DATABASE_CONFIG.upstash.url && DATABASE_CONFIG.upstash.token),
    },
    ai: {
      anthropic: Boolean(AI_CONFIG.anthropic.apiKey),
      openai: Boolean(AI_CONFIG.openai.apiKey),
      google: Boolean(AI_CONFIG.google.apiKey),
      gateway: Boolean(AI_CONFIG.gateway.apiKey),
      v0: Boolean(AI_CONFIG.v0.apiKey),
      defaultModel: AI_CONFIG.defaultModel,
    },
    services: {
      github: GITHUB_CONFIG.isEnabled && Boolean(GITHUB_CONFIG.appId),
      supabase: SERVICES_CONFIG.supabase.enabled,
      monitoring: {
        sentry: MONITORING_CONFIG.sentry.enabled,
        posthog: MONITORING_CONFIG.posthog.enabled,
      },
    },
    jobs: {
      enabled: JOBS_CONFIG.isEnabled,
      maxConcurrent: JOBS_CONFIG.maxConcurrent,
      defaultTimeout: JOBS_CONFIG.defaultTimeoutMinutes,
    },
  }
}

/**
 * Ensure required environment variables are available at startup
 */
export function ensureEnvironment(): void {
  const validation = validateEnvironment()

  if (!validation.isValid) {
    console.error('❌ Environment validation failed:')
    validation.errors.forEach((error) => console.error(`  - ${error}`))

    if (APP_CONFIG.isProduction) {
      throw new Error('Environment validation failed in production')
    } else {
      console.warn('⚠️  Continuing in development mode with missing configuration')
    }
  } else {
    console.log('✅ Environment validation passed')
  }

  // Log configuration summary in development
  if (APP_CONFIG.isDevelopment) {
    console.log('🔧 Environment Summary:', JSON.stringify(getEnvironmentSummary(), null, 2))
  }
}

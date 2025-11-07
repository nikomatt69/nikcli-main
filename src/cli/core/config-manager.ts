import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import chalk from 'chalk'
import { z } from 'zod'
import { OutputStyleConfigSchema, OutputStyleEnum } from '../types/output-styles'

// Validation schemas
const ModelConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'ollama', 'vercel', 'gateway', 'openrouter', 'cerebras']),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8000).optional(),
  maxContextTokens: z.number().min(1).max(10000000).optional().describe('Maximum context window for this model'),
  // Reasoning configuration
  enableReasoning: z.boolean().optional().describe('Enable reasoning for supported models'),
  reasoningMode: z.enum(['auto', 'explicit', 'disabled']).optional().describe('How to handle reasoning'),
  // Output style configuration
  outputStyle: OutputStyleEnum.optional().describe('AI output style for this model'),
})

const ConfigSchema = z.object({
  currentModel: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(8000).default(8000),
  chatHistory: z.boolean().default(true),
  maxHistoryLength: z.number().min(1).max(1000).default(100),
  // Optional system prompt for general chat mode
  systemPrompt: z.string().optional(),
  autoAnalyzeWorkspace: z.boolean().default(true),
  enableAutoApprove: z.boolean().default(false),
  preferredAgent: z.string().optional(),
  // Output style configuration
  outputStyle: OutputStyleConfigSchema.default({
    defaultStyle: 'production-focused',
    customizations: {
      verbosityLevel: 5,
      includeCodeExamples: true,
      includeStepByStep: true,
      useDecorative: false,
      maxResponseLength: 'medium',
    },
  }),
  models: z.record(ModelConfigSchema),
  apiKeys: z.record(z.string()).optional(),
  environmentVariables: z.record(z.string()).default({}),
  environmentSources: z.array(z.string()).default([]),
  modelRouting: z
    .object({
      enabled: z.boolean().default(true),
      verbose: z.boolean().default(false),
      mode: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
    })
    .default({ enabled: true, verbose: false, mode: 'balanced' }),
  // Reasoning configuration
  reasoning: z
    .object({
      enabled: z.boolean().default(true).describe('Enable reasoning globally'),
      autoDetect: z.boolean().default(true).describe('Auto-detect reasoning capable models'),
      showReasoningProcess: z.boolean().default(false).describe('Display reasoning process to user'),
      logReasoning: z.boolean().default(false).describe('Log reasoning to debug output'),
    })
    .default({ enabled: true, autoDetect: true, showReasoningProcess: false, logReasoning: false }),
  // MCP (Model Context Protocol) servers configuration - Claude Code/OpenCode compatible
  mcp: z
    .record(
      z.union([
        // Local MCP server (compatible with Claude Code)
        z.object({
          type: z.literal('local'),
          command: z.array(z.string()),
          enabled: z.boolean().default(true),
          environment: z.record(z.string()).optional(),
          // Extended NikCLI specific options
          timeout: z.number().optional(),
          retries: z.number().optional(),
          priority: z.number().optional(),
          capabilities: z.array(z.string()).optional(),
        }),
        // Remote MCP server (compatible with OpenCode)
        z.object({
          type: z.literal('remote'),
          url: z.string(),
          enabled: z.boolean().default(true),
          headers: z.record(z.string()).optional(),
          // Extended NikCLI specific options
          timeout: z.number().optional(),
          retries: z.number().optional(),
          priority: z.number().optional(),
          capabilities: z.array(z.string()).optional(),
        }),
      ])
    )
    .optional(),
  // Legacy MCP configuration (for backward compatibility)
  mcpServers: z
    .record(
      z.object({
        name: z.string(),
        type: z.enum(['http', 'websocket', 'command', 'stdio']),
        endpoint: z.string().optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        headers: z.record(z.string()).optional(),
        timeout: z.number().optional(),
        retries: z.number().optional(),
        healthCheck: z.string().optional(),
        enabled: z.boolean(),
        priority: z.number().optional(),
        capabilities: z.array(z.string()).optional(),
        authentication: z
          .object({
            type: z.enum(['bearer', 'basic', 'api_key']),
            token: z.string().optional(),
            username: z.string().optional(),
            password: z.string().optional(),
            apiKey: z.string().optional(),
            header: z.string().optional(),
          })
          .optional(),
      })
    )
    .optional(),
  // Agent Manager specific config
  maxConcurrentAgents: z.number().min(1).max(10).default(3),
  enableGuidanceSystem: z.boolean().default(true),
  defaultAgentTimeout: z.number().min(1000).default(60000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  requireApprovalForNetwork: z.boolean().default(true),
  approvalPolicy: z.enum(['strict', 'moderate', 'permissive']).default('moderate'),
  // Embedding provider configuration
  embeddingProvider: z
    .object({
      default: z.enum(['openai', 'google', 'anthropic', 'openrouter']).default('openai'),
      fallbackChain: z
        .array(z.enum(['openai', 'google', 'anthropic', 'openrouter']))
        .default(['openai', 'openrouter']),
      costOptimization: z.boolean().default(true),
      autoSwitchOnFailure: z.boolean().default(true),
    })
    .default({
      default: 'openai',
      fallbackChain: ['openai', 'openrouter'],
      costOptimization: true,
      autoSwitchOnFailure: true,
    }),
  // Security configuration for different modes
  securityMode: z.enum(['safe', 'default', 'developer']).default('safe'),
  toolApprovalPolicies: z
    .object({
      fileOperations: z.enum(['always', 'risky', 'never']).default('risky'),
      gitOperations: z.enum(['always', 'risky', 'never']).default('risky'),
      packageOperations: z.enum(['always', 'risky', 'never']).default('risky'),
      systemCommands: z.enum(['always', 'risky', 'never']).default('always'),
      networkRequests: z.enum(['always', 'risky', 'never']).default('always'),
    })
    .default({
      fileOperations: 'risky',
      gitOperations: 'risky',
      packageOperations: 'risky',
      systemCommands: 'always',
      networkRequests: 'always',
    }),
  // Middleware system configuration
  middleware: z
    .object({
      enabled: z.boolean().default(true),
      security: z
        .object({
          enabled: z.boolean().default(true),
          priority: z.number().default(1000),
          strictMode: z.boolean().default(false),
          requireApproval: z.boolean().default(true),
          riskThreshold: z.enum(['low', 'medium', 'high']).default('medium'),
        })
        .default({
          enabled: true,
          priority: 1000,
          strictMode: false,
          requireApproval: true,
          riskThreshold: 'medium',
        }),
      logging: z
        .object({
          enabled: z.boolean().default(true),
          priority: z.number().default(900),
          logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
          logToFile: z.boolean().default(true),
          sanitizeData: z.boolean().default(true),
          includeArgs: z.boolean().default(true),
          includeResponse: z.boolean().default(false),
        })
        .default({
          enabled: true,
          priority: 900,
          logLevel: 'info',
          logToFile: true,
          sanitizeData: true,
          includeArgs: true,
          includeResponse: false,
        }),
      validation: z
        .object({
          enabled: z.boolean().default(true),
          priority: z.number().default(800),
          strictMode: z.boolean().default(false),
          validateArgs: z.boolean().default(true),
          validateContext: z.boolean().default(true),
          validateResponse: z.boolean().default(false),
          failOnValidationError: z.boolean().default(true),
        })
        .default({
          enabled: true,
          priority: 800,
          strictMode: false,
          validateArgs: true,
          validateContext: true,
          validateResponse: false,
          failOnValidationError: true,
        }),
      performance: z
        .object({
          enabled: z.boolean().default(true),
          priority: z.number().default(700),
          trackMemory: z.boolean().default(true),
          trackCpu: z.boolean().default(true),
          slowExecutionThreshold: z.number().default(5000),
          reportSlowOperations: z.boolean().default(true),
          enableOptimizations: z.boolean().default(true),
        })
        .default({
          enabled: true,
          priority: 700,
          trackMemory: true,
          trackCpu: true,
          slowExecutionThreshold: 5000,
          reportSlowOperations: true,
          enableOptimizations: true,
        }),
      audit: z
        .object({
          enabled: z.boolean().default(true),
          priority: z.number().default(600),
          auditLevel: z.enum(['minimal', 'standard', 'comprehensive']).default('standard'),
          enableCompliance: z.boolean().default(true),
          enableIntegrityChecks: z.boolean().default(true),
          dataRetentionDays: z.number().default(90),
          enableRealTimeAlerts: z.boolean().default(true),
        })
        .default({
          enabled: true,
          priority: 600,
          auditLevel: 'standard',
          enableCompliance: true,
          enableIntegrityChecks: true,
          dataRetentionDays: 90,
          enableRealTimeAlerts: true,
        }),
    })
    .default({
      enabled: true,
      security: {
        enabled: true,
        priority: 1000,
        strictMode: false,
        requireApproval: true,
        riskThreshold: 'medium',
      },
      logging: {
        enabled: true,
        priority: 900,
        logLevel: 'info',
        logToFile: true,
        sanitizeData: true,
        includeArgs: true,
        includeResponse: false,
      },
      validation: {
        enabled: true,
        priority: 800,
        strictMode: false,
        validateArgs: true,
        validateContext: true,
        validateResponse: false,
        failOnValidationError: true,
      },
      performance: {
        enabled: true,
        priority: 700,
        trackMemory: true,
        trackCpu: true,
        slowExecutionThreshold: 5000,
        reportSlowOperations: true,
        enableOptimizations: true,
      },
      audit: {
        enabled: true,
        priority: 600,
        auditLevel: 'standard',
        enableCompliance: true,
        enableIntegrityChecks: true,
        dataRetentionDays: 90,
        enableRealTimeAlerts: true,
      },
    }),
  // Session-based settings
  sessionSettings: z
    .object({
      approvalTimeoutMs: z.number().min(5000).max(300000).default(30000),
      devModeTimeoutMs: z.number().min(60000).max(7200000).default(3600000),
      batchApprovalEnabled: z.boolean().default(true),
      autoApproveReadOnly: z.boolean().default(true),
    })
    .default({
      approvalTimeoutMs: 30000,
      devModeTimeoutMs: 3600000,
      batchApprovalEnabled: true,
      autoApproveReadOnly: true,
    }),
  sandbox: z
    .object({
      enabled: z.boolean().default(true),
      allowFileSystem: z.boolean().default(true),
      allowNetwork: z.boolean().default(true),
      allowCommands: z.boolean().default(true),
      trustedDomains: z.array(z.string()).default([
        // NPM ecosystem
        'registry.npmjs.org',
        'npmjs.org',
        'npm.community',
        'yarnpkg.com',
        // Rust/Cargo
        'crates.io',
        'static.crates.io',
        'index.crates.io',
        // Python/PyPI
        'pypi.org',
        'files.pythonhosted.org',
        'pypi.python.org',
        // Ruby/Gems
        'rubygems.org',
        'api.rubygems.org',
        // Go modules
        'proxy.golang.org',
        'sum.golang.org',
        'golang.org',
        // GitHub (for dependencies)
        'github.com',
        'api.github.com',
        'raw.githubusercontent.com',
        'codeload.github.com',
        // Other package managers
        'packagist.org',
        'repo1.maven.org',
        'central.maven.org',
        'mvnrepository.com',
        // Docker
        'registry-1.docker.io',
        'docker.io',
        'hub.docker.com',
      ]),
    })
    .default({
      enabled: true,
      allowFileSystem: true,
      allowNetwork: true,
      allowCommands: true,
      trustedDomains: [
        'registry.npmjs.org',
        'npmjs.org',
        'npm.community',
        'yarnpkg.com',
        'crates.io',
        'static.crates.io',
        'index.crates.io',
        'pypi.org',
        'files.pythonhosted.org',
        'pypi.python.org',
        'rubygems.org',
        'api.rubygems.org',
        'proxy.golang.org',
        'sum.golang.org',
        'golang.org',
        'github.com',
        'api.github.com',
        'raw.githubusercontent.com',
        'codeload.github.com',
        'packagist.org',
        'repo1.maven.org',
        'central.maven.org',
        'mvnrepository.com',
        'registry-1.docker.io',
        'docker.io',
        'hub.docker.com',
      ],
    }),
  // Redis Cache System (Upstash Redis - Cloud Native)
  redis: z
    .object({
      enabled: z.boolean().default(true),
      // Upstash Redis configuration (preferred)
      url: z.string().optional(),
      token: z.string().optional(),
      // Legacy configuration (for backward compatibility)
      host: z.string().default('localhost'),
      port: z.number().min(1).max(65535).default(6379),
      password: z.string().optional(),
      database: z.number().min(0).max(15).default(0),
      keyPrefix: z.string().default('nikcli:'),
      ttl: z.number().min(60).max(86400).default(3600), // 1 hour default
      maxRetries: z.number().min(1).max(10).default(3),
      retryDelayMs: z.number().min(100).max(5000).default(1000),
      cluster: z
        .object({
          enabled: z.boolean().default(false),
          nodes: z
            .array(
              z.object({
                host: z.string(),
                port: z.number().min(1).max(65535),
              })
            )
            .optional(),
        })
        .default({
          enabled: false,
        }),
      fallback: z
        .object({
          enabled: z.boolean().default(true),
          strategy: z.enum(['memory', 'file', 'none']).default('memory'),
        })
        .default({
          enabled: true,
          strategy: 'memory',
        }),
      strategies: z
        .object({
          tokens: z.boolean().default(true),
          sessions: z.boolean().default(true),
          agents: z.boolean().default(true),
          documentation: z.boolean().default(true),
        })
        .default({
          tokens: true,
          sessions: true,
          agents: true,
          documentation: true,
        }),
    })
    .default({
      enabled: true, // ✅ Enabled by default in schema
      host: 'localhost',
      port: 6379,
      database: 0,
      keyPrefix: 'nikcli:',
      ttl: 3600,
      maxRetries: 3,
      retryDelayMs: 1000,
      cluster: { enabled: false },
      fallback: { enabled: true, strategy: 'memory' },
      strategies: { tokens: true, sessions: true, agents: true, documentation: true },
    }),
  // Supabase Integration Extensions
  supabase: z
    .object({
      enabled: z.boolean().default(true),
      url: z.string().optional(),
      anonKey: z.string().optional(),
      serviceRoleKey: z.string().optional(),
      features: z
        .object({
          database: z.boolean().default(true),
          storage: z.boolean().default(false),
          auth: z.boolean().default(true),
          realtime: z.boolean().default(true), // ✅ Enabled by default
          vector: z.boolean().default(false),
        })
        .default({
          database: true,
          storage: false,
          auth: true,
          realtime: true, // ✅ Enabled by default
          vector: false,
        }),
      tables: z
        .object({
          sessions: z.string().default('chat_sessions'),
          blueprints: z.string().default('agent_blueprints'),
          users: z.string().default('cli_users'),
          metrics: z.string().default('usage_metrics'),
          documents: z.string().default('documentation'),
        })
        .default({
          sessions: 'chat_sessions',
          blueprints: 'agent_blueprints',
          users: 'cli_users',
          metrics: 'usage_metrics',
          documents: 'documentation',
        }),
    })
    .default({
      enabled: true, // ✅ Enabled by default in schema
      features: {
        database: true,
        storage: true,
        auth: true,
        realtime: true, // ✅ Enabled by default
        vector: true, // ✅ Enabled by default
      },
      tables: {
        sessions: 'chat_sessions',
        blueprints: 'agent_blueprints',
        users: 'cli_users',
        metrics: 'usage_metrics',
        documents: 'documentation',
      },
    }),
  // Cloud documentation system (legacy compatibility)
  cloudDocs: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(['supabase', 'firebase', 'github']).default('supabase'),
      apiUrl: z.string().optional(),
      apiKey: z.string().optional(),
      autoSync: z.boolean().default(true),
      contributionMode: z.boolean().default(true),
      maxContextSize: z.number().min(10000).max(100000).default(50000),
      autoLoadForAgents: z.boolean().default(true),
      smartSuggestions: z.boolean().default(true),
    })
    .default({
      enabled: false,
      provider: 'supabase',
      autoSync: true,
      contributionMode: true,
      maxContextSize: 50000,
      autoLoadForAgents: true,
      smartSuggestions: true,
    }),
  // Auto Todo generation settings
  autoTodo: z
    .object({
      requireExplicitTrigger: z.boolean().default(false),
    })
    .default({ requireExplicitTrigger: false }),
  // Authentication credentials (encrypted)
  auth: z
    .object({
      email: z.string().optional().describe('Encrypted user email'),
      password: z.string().optional().describe('Encrypted user password'),
      accessToken: z.string().optional().describe('Encrypted access token'),
      refreshToken: z.string().optional().describe('Encrypted refresh token'),
      lastLogin: z.string().optional().describe('ISO timestamp of last login'),
    })
    .optional(),
  // Enhanced diff display configuration
  diff: z
    .object({
      enabled: z.boolean().default(true).describe('Enable enhanced diff visualization'),
      style: z.enum(['unified', 'side-by-side', 'compact']).default('unified').describe('Default diff display style'),
      theme: z.enum(['dark', 'light', 'auto']).default('auto').describe('Color theme for diffs'),
      showLineNumbers: z.boolean().default(true).describe('Show line numbers in diffs'),
      contextLines: z.number().min(0).max(10).default(3).describe('Number of context lines to show'),
      syntaxHighlight: z.boolean().default(true).describe('Enable syntax highlighting in diffs'),
      showStats: z.boolean().default(true).describe('Show addition/deletion statistics'),
      maxWidth: z.number().min(80).max(200).default(120).describe('Maximum width for diff display'),
      compactThreshold: z.number().min(5).max(100).default(20).describe('Auto-switch to compact mode for large diffs'),
    })
    .default({
      enabled: true,
      style: 'unified',
      theme: 'auto',
      showLineNumbers: true,
      contextLines: 3,
      syntaxHighlight: true,
      showStats: true,
      maxWidth: 120,
      compactThreshold: 20,
    }),
  // Enterprise Monitoring configuration
  monitoring: z
    .object({
      enabled: z.boolean().default(true).describe('Enable enterprise monitoring'),
      opentelemetry: z
        .object({
          enabled: z.boolean().default(true).describe('Enable OpenTelemetry distributed tracing'),
          endpoint: z.string().default('http://localhost:4318').describe('OTLP endpoint URL'),
          serviceName: z.string().default('nikcli').describe('Service name for traces'),
          serviceVersion: z.string().default('1.1.0').describe('Service version'),
          sampleRate: z.number().min(0).max(1).default(0.1).describe('Trace sampling rate (0-1)'),
          exportIntervalMs: z.number().min(1000).max(300000).default(60000).describe('Export interval in milliseconds'),
        })
        .default({
          enabled: true,
          endpoint: 'http://localhost:4318',
          serviceName: 'nikcli',
          serviceVersion: '1.1.0',
          sampleRate: 0.1,
          exportIntervalMs: 60000,
        }),
      prometheus: z
        .object({
          enabled: z.boolean().default(true).describe('Enable Prometheus metrics'),
          port: z.number().min(1024).max(65535).default(9090).describe('Metrics server port'),
          path: z.string().default('/metrics').describe('Metrics endpoint path'),
        })
        .default({
          enabled: true,
          port: 9090,
          path: '/metrics',
        }),
      sentry: z
        .object({
          enabled: z.boolean().default(false).describe('Enable Sentry error tracking'),
          dsn: z.string().optional().describe('Sentry DSN'),
          environment: z.string().default('production').describe('Environment name'),
          tracesSampleRate: z.number().min(0).max(1).default(0.1).describe('Traces sample rate'),
          profilesSampleRate: z.number().min(0).max(1).default(0.1).describe('Profiles sample rate'),
          debug: z.boolean().default(false).describe('Enable Sentry debug mode'),
        })
        .default({
          enabled: false,
          environment: 'production',
          tracesSampleRate: 0.1,
          profilesSampleRate: 0.1,
          debug: false,
        }),
      alerting: z
        .object({
          enabled: z.boolean().default(true).describe('Enable alerting system'),
          channels: z
            .object({
              slack: z
                .object({
                  enabled: z.boolean().default(false).describe('Enable Slack alerts'),
                  webhookUrl: z.string().optional().describe('Slack webhook URL'),
                  minSeverity: z.enum(['low', 'medium', 'high', 'critical']).default('high').describe('Minimum severity'),
                })
                .optional(),
              discord: z
                .object({
                  enabled: z.boolean().default(false).describe('Enable Discord alerts'),
                  webhookUrl: z.string().optional().describe('Discord webhook URL'),
                  minSeverity: z.enum(['low', 'medium', 'high', 'critical']).default('high').describe('Minimum severity'),
                })
                .optional(),
            })
            .default({}),
          deduplication: z
            .object({
              enabled: z.boolean().default(true).describe('Enable alert deduplication'),
              windowMs: z.number().min(60000).max(3600000).default(300000).describe('Deduplication window (ms)'),
            })
            .default({
              enabled: true,
              windowMs: 300000,
            }),
          throttling: z
            .object({
              enabled: z.boolean().default(true).describe('Enable alert throttling'),
              maxAlertsPerMinute: z.number().min(1).max(100).default(10).describe('Max alerts per minute'),
            })
            .default({
              enabled: true,
              maxAlertsPerMinute: 10,
            }),
        })
        .default({
          enabled: true,
          channels: {},
          deduplication: {
            enabled: true,
            windowMs: 300000,
          },
          throttling: {
            enabled: true,
            maxAlertsPerMinute: 10,
          },
        }),
      health: z
        .object({
          enabled: z.boolean().default(true).describe('Enable health checks'),
          checkIntervalMs: z.number().min(5000).max(300000).default(30000).describe('Health check interval'),
        })
        .default({
          enabled: true,
          checkIntervalMs: 30000,
        }),
    })
    .default({
      enabled: true,
      opentelemetry: {
        enabled: true,
        endpoint: 'http://localhost:4318',
        serviceName: 'nikcli',
        serviceVersion: '1.1.0',
        sampleRate: 0.1,
        exportIntervalMs: 60000,
      },
      prometheus: {
        enabled: true,
        port: 9090,
        path: '/metrics',
      },
      sentry: {
        enabled: false,
        environment: 'production',
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.1,
        debug: false,
      },
      alerting: {
        enabled: true,
        channels: {},
        deduplication: {
          enabled: true,
          windowMs: 300000,
        },
        throttling: {
          enabled: true,
          maxAlertsPerMinute: 10,
        },
      },
      health: {
        enabled: true,
        checkIntervalMs: 30000,
      },
    }),
})

export type ConfigType = z.infer<typeof ConfigSchema>
export type ModelConfig = z.infer<typeof ModelConfigSchema>
export type CliConfig = ConfigType

// Encryption utilities for API keys
class KeyEncryption {
  private static ALGORITHM = 'aes-256-gcm'
  private static KEY_LENGTH = 32
  private static IV_LENGTH = 16

  private static getEncryptionKey(): Buffer {
    // Use machine-specific key derivation
    const machineId = os.hostname() + os.userInfo().username
    return crypto.scryptSync(machineId, 'nikcli-salt', KeyEncryption.KEY_LENGTH)
  }

  static encrypt(text: string): string {
    try {
      const key = KeyEncryption.getEncryptionKey()
      const iv = crypto.randomBytes(KeyEncryption.IV_LENGTH)
      const cipher = crypto.createCipheriv(KeyEncryption.ALGORITHM, key, iv) as crypto.CipherGCM
      cipher.setAAD(Buffer.from('nikcli-api-key'))

      let encrypted = cipher.update(text, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      const authTag = cipher.getAuthTag()

      // Combine iv + authTag + encrypted
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
    } catch {
      // Fallback: return base64 encoded (basic obfuscation)
      return `b64:${Buffer.from(text).toString('base64')}`
    }
  }

  static decrypt(encryptedText: string): string {
    try {
      // Handle base64 fallback
      if (encryptedText.startsWith('b64:')) {
        return Buffer.from(encryptedText.slice(4), 'base64').toString('utf8')
      }

      const parts = encryptedText.split(':')
      if (parts.length !== 3) throw new Error('Invalid format')

      const key = KeyEncryption.getEncryptionKey()
      const iv = Buffer.from(parts[0], 'hex')
      const authTag = Buffer.from(parts[1], 'hex')
      const encrypted = parts[2]

      const decipher = crypto.createDecipheriv(KeyEncryption.ALGORITHM, key, iv) as crypto.DecipherGCM
      decipher.setAAD(Buffer.from('nikcli-api-key'))
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch {
      // If decryption fails, assume it's already decrypted (migration case)
      return encryptedText
    }
  }
}

export class SimpleConfigManager {
  private configPath: string
  private config!: ConfigType

  /**
   * Safe environment variable readers for embedding optimization
   */
  static getEmbedBatchSize(): number {
    const value = process.env.EMBED_BATCH_SIZE
    const parsed = value ? Number(value) : 300
    return isNaN(parsed) || parsed < 1 ? 300 : Math.min(parsed, 1000) // Cap at 1000 for safety
  }

  static getEmbedMaxConcurrency(): number {
    const value = process.env.EMBED_MAX_CONCURRENCY
    const parsed = value ? Number(value) : 6
    return isNaN(parsed) || parsed < 1 ? 6 : Math.min(parsed, 20) // Cap at 20 for safety
  }

  static getEmbedInterBatchDelay(): number {
    const value = process.env.EMBED_INTER_BATCH_DELAY_MS
    const parsed = value ? Number(value) : 25
    return isNaN(parsed) || parsed < 0 ? 25 : Math.min(parsed, 1000) // Cap at 1000ms
  }

  static getIndexingBatchSize(): number {
    const value = process.env.INDEXING_BATCH_SIZE
    const parsed = value ? Number(value) : 300
    return isNaN(parsed) || parsed < 1 ? 300 : Math.min(parsed, 1000) // Cap at 1000 for safety
  }

  static isAdaptiveBatchingEnabled(): boolean {
    return process.env.EMBED_ADAPTIVE_BATCHING !== 'false'
  }

  // Default models configuration
  private defaultModels: Record<string, ModelConfig> = {
    'claude-sonnet-4-20250514': {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      maxContextTokens: 200000,
    },
    'claude-3-5-sonnet-latest': {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      maxContextTokens: 200000,
    },
    'claude-3-7-sonnet-20250219': {
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-20250219',
      maxContextTokens: 200000,
    },
    'claude-opus-4-20250514': {
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
      maxContextTokens: 200000,
    },
    'gpt-5-mini-2025-08-07': {
      provider: 'openai',
      model: 'gpt-5-mini-2025-08-07',
      maxContextTokens: 128000,
    },
    'gpt-5-nano-2025-08-07': {
      provider: 'openai',
      model: 'gpt-5-nano-2025-08-07',
      maxContextTokens: 128000,
    },
    'gpt-4o-mini': {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxContextTokens: 128000,
    },
    'gpt-5': {
      provider: 'openai',
      model: 'gpt-5',
      maxContextTokens: 200000,
    },
    'gpt-4o': {
      provider: 'openai',
      model: 'gpt-4o',
      maxContextTokens: 128000,
    },
    'gpt-4.1': {
      provider: 'openai',
      model: 'gpt-4.1',
      maxContextTokens: 1000000,
    },
    'gpt-4': {
      provider: 'openai',
      model: 'gpt-4',
      maxContextTokens: 128000,
    },
    'v0-1.0-md': {
      provider: 'vercel',
      model: 'v0-1.0-md',
      maxContextTokens: 32000,
    },
    'vercel/v0-1.5-md': {
      provider: 'gateway',
      model: 'vercel/v0-1.5-md',
      maxContextTokens: 32000,
    },
    'vercel/v0-1.5-lg': {
      provider: 'gateway',
      model: 'vercel/v0-1.5-lg',
      maxContextTokens: 32000,
    },
    'gemini-2.5-pro': {
      provider: 'google',
      model: 'gemini-2.5-pro',
      maxContextTokens: 2097152,
    },

    'gemini-2.5-flash': {
      provider: 'google',
      model: 'gemini-2.5-flash',
      maxContextTokens: 1000000,
    },
    'gemini-2.5-flash-lite': {
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
      maxContextTokens: 1000000,
    },
    'llama3.1:8b': {
      provider: 'ollama',
      model: 'llama3.1:8b',
      maxContextTokens: 128000,
    },
    'codellama:7b': {
      provider: 'ollama',
      model: 'codellama:7b',
      maxContextTokens: 16000,
    },
    'deepseek-r1:8b': {
      provider: 'ollama',
      model: 'deepseek-r1:8b',
      maxContextTokens: 128000,
    },
    'deepseek-r1:3b': {
      provider: 'ollama',
      model: 'deepseek-r1:3b',
      maxContextTokens: 128000,
    },
    'deepseek-r1:7b': {
      provider: 'ollama',
      model: 'deepseek-r1:7b',
      maxContextTokens: 128000,
    },
    'mistral:7b': {
      provider: 'ollama',
      model: 'mistral:7b',
      maxContextTokens: 128000,
    },
    'gpt-oss:20b': {
      provider: 'openrouter',
      model: 'gpt-oss:20b',
      maxContextTokens: 128000,
    },
    gemma3n: {
      provider: 'openrouter',
      model: 'gemma3n',
      maxContextTokens: 8192,
    },
    'gemma3n-large': {
      provider: 'openrouter',
      model: 'gemma3n-large',
      maxContextTokens: 8192,
    },
    // OpenRouter models
    'anthropic/claude-sonnet-4.5': {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
      maxContextTokens: 1000000,
    },
    ' z-ai/glm-4.6:exacto': {
      provider: 'openrouter',
      model: 'z-ai/glm-4.6:exacto',
      maxContextTokens: 128000,
    },

    'anthropic/claude-haiku-4.5': {
      provider: 'openrouter',
      model: 'anthropic/claude-haiku-4.5',
      maxContextTokens: 200000,
    },
    'anthropic/claude-sonnet-4': {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      maxContextTokens: 200000,
    },
    'anthropic/claude-3.7-sonnet:thinking': {
      provider: 'openrouter',
      model: 'anthropic/claude-3.7-sonnet:thinking',
      maxContextTokens: 200000,
    },
    'anthropic/claude-3.7-sonnet': {
      provider: 'openrouter',
      model: 'anthropic/claude-3.7-sonnet',
      maxContextTokens: 200000,
    },
    'anthropic/claude-opus-4.1': {
      provider: 'openrouter',
      model: 'anthropic/claude-opus-4.1',
      maxContextTokens: 200000,
    },
    'anthropic/claude-3.5-sonnet': {
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet',
      maxContextTokens: 200000,
    },

    'nvidia/nemotron-nano-9b-v2:free': {
      provider: 'openrouter',
      model: 'nvidia/nemotron-nano-9b-v2:free',
      maxContextTokens: 32000,
    },
    'openai/gpt-5-pro': {
      provider: 'openrouter',
      model: 'openai/gpt-5-pro',
      maxContextTokens: 400000,
    },
    'openai/gpt-5-codex': {
      provider: 'openrouter',
      model: 'openai/gpt-5-codex',
      maxContextTokens: 400000,
    },
    'openai/gpt-5-image': {
      provider: 'openrouter',
      model: 'openai/gpt-5-image',
      maxContextTokens: 400000,
    },
    'openai/gpt-5-image-mini': {
      provider: 'openrouter',
      model: 'openai/gpt-5-image-mini',
      maxContextTokens: 400000,
    },
    'openai/o3-deep-research': {
      provider: 'openrouter',
      model: 'openai/o3-deep-research',
      maxContextTokens: 200000,
    },
    'openai/o4-mini-deep-research': {
      provider: 'openrouter',
      model: 'openai/o4-mini-deep-research',
      maxContextTokens: 200000,
    },
    'openai/gpt-4o-audio-preview': {
      provider: 'openrouter',
      model: 'openai/gpt-4o-audio-preview',
      maxContextTokens: 128000,
    },

    'meta-llama/llama-3.1-405b-instruct': {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-405b-instruct',
      maxContextTokens: 128000,
    },
    'meta-llama/llama-3.1-70b-instruct': {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-70b-instruct',
      maxContextTokens: 128000,
    },
    'meta-llama/llama-3.1-8b-instruct': {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-8b-instruct',
      maxContextTokens: 128000,
    },
    'google/gemini-2.5-flash-lite': {
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
      maxContextTokens: 1000000,
    },
    'google/gemini-2.5-flash': {
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash',
      maxContextTokens: 1000000,
    },
    'google/gemini-2.5-flash-image-preview': {
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-image-preview',
      maxContextTokens: 1000000,
    },
    'google/gemini-2.5-pro': {
      provider: 'openrouter',
      model: 'google/gemini-2.5-pro',
      maxContextTokens: 2097152,
    },

    'google/gemini-2.0-flash-exp': {
      provider: 'openrouter',
      model: 'google/gemini-2.0-flash-exp',
      maxContextTokens: 1000000,
    },
    'google/gemini-1.5-pro': {
      provider: 'openrouter',
      model: 'google/gemini-1.5-pro',
      maxContextTokens: 2097152,
    },
    'openai/gpt-oss-120b:free': {
      provider: 'openrouter',
      model: 'openai/gpt-oss-120b:free',
      maxContextTokens: 128000,
    },
    'z-ai/glm-4.5v': {
      provider: 'openrouter',
      model: 'z-ai/glm-4.5v',
      maxContextTokens: 128000,
    },
    'z-ai/glm-4.5': {
      provider: 'openrouter',
      model: 'z-ai/glm-4.5',
      maxContextTokens: 128000,
    },
    'z-ai/glm-4.6': {
      provider: 'openrouter',
      model: 'z-ai/glm-4.6',
      maxContextTokens: 128000,
    },
    'mistralai/mistral-large': {
      provider: 'openrouter',
      model: 'mistralai/mistral-large',
      maxContextTokens: 128000,
    },
    'qwen/qwen3-next-80b-a3b-thinking': {
      provider: 'openrouter',
      model: 'qwen/qwen3-next-80b-a3b-thinking',
      maxContextTokens: 128000,
    },
    'qwen/qwen3-coder:free': {
      provider: 'openrouter',
      model: 'qwen/qwen3-coder:free',
      maxContextTokens: 128000,
    },
    'x-ai/grok-2': {
      provider: 'openrouter',
      model: 'x-ai/grok-2',
      maxContextTokens: 128000,
    },
    'deepseek/deepseek-chat-v3.1:free': {
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat-v3.1:free',
      maxContextTokens: 128000,
    },
    'deepseek/deepseek-v3.1-terminus': {
      provider: 'openrouter',
      model: 'deepseek/deepseek-v3.1-terminus',
      maxContextTokens: 128000,
    },
    'deepseek/deepseek-v3.2-exp': {
      provider: 'openrouter',
      model: 'deepseek/deepseek-v3.2-exp',
      maxContextTokens: 128000,
    },
    'moonshotai/kimi-k2-0905': {
      provider: 'openrouter',
      model: 'moonshotai/kimi-k2-0905',
      maxContextTokens: 128000,
    },
    'moonshotai/kimi-k2-0905:exacto': {
      provider: 'openrouter',
      model: 'moonshotai/kimi-k2-0905:exacto',
      maxContextTokens: 128000,
    },
    'minimax/minimax-m2:free': {
      provider: 'openrouter',
      model: 'minimax/minimax-m2:free',
      maxContextTokens: 128000,
    },
    'qwen/qwen3-coder': {
      provider: 'openrouter',
      model: 'qwen/qwen3-coder',
      maxContextTokens: 128000,
    },
    'x-ai/grok-4': {
      provider: 'openrouter',
      model: 'x-ai/grok-4',
      maxContextTokens: 128000,
    },
    'x-ai/grok-3': {
      provider: 'openrouter',
      model: 'x-ai/grok-3',
      maxContextTokens: 128000,
    },
    'x-ai/grok-3-mini': {
      provider: 'openrouter',
      model: 'x-ai/grok-3-mini',
      maxContextTokens: 128000,
    },
    'x-ai/grok-4-fast:free': {
      provider: 'openrouter',
      model: 'x-ai/grok-4-fast:free',
      maxContextTokens: 128000,
    },
    'x-ai/grok-code-fast-1': {
      provider: 'openrouter',
      model: 'x-ai/grok-code-fast-1',
      maxContextTokens: 128000,
    },
    'qwen/qwen3-coder-plus': {
      provider: 'openrouter',
      model: 'qwen/qwen3-coder-plus',
      maxContextTokens: 128000,
    },
    '@preset/nikcli': {
      provider: 'openrouter',
      model: '@preset/nikcli',
      maxContextTokens: 200000,
    },
    '@preset/nikcli-pro': {
      provider: 'openrouter',
      model: '@preset/nikcli-pro',
      maxContextTokens: 200000,
    },
    '@preset/nikcli-research': {
      provider: 'openrouter',
      model: '@preset/nikcli-research',
      maxContextTokens: 200000,
    },
    '@preset/nikcli-free': {
      provider: 'openrouter',
      model: '@preset/nikcli-free',
      maxContextTokens: 200000,
    },
  }

  private defaultConfig: ConfigType = {
    currentModel: '@preset/nikcli',
    temperature: 1,
    maxTokens: 8000,
    chatHistory: true,
    maxHistoryLength: 100,
    systemPrompt: undefined,
    autoAnalyzeWorkspace: true,
    enableAutoApprove: false,
    outputStyle: {
      defaultStyle: 'production-focused',
      customizations: {
        verbosityLevel: 5,
        includeCodeExamples: true,
        includeStepByStep: true,
        useDecorative: true,
        maxResponseLength: 'medium',
      },
    },
    models: this.defaultModels,
    monitoring: {
      enabled: true,
      opentelemetry: {
        enabled: true,
        endpoint: 'http://localhost:4318',
        serviceName: 'nikcli',
        serviceVersion: '1.1.0',
        sampleRate: 0.1,
        exportIntervalMs: 60000,
      },
      prometheus: {
        enabled: true,
        port: 9090,
        path: '/metrics',
      },
      sentry: {
        enabled: false,
        environment: 'production',
        debug: false,
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.1,
      },
      alerting: {
        enabled: true,
        channels: {},
        deduplication: {
          enabled: true,
          windowMs: 300000,
        },
        throttling: {
          enabled: true,
          maxAlertsPerMinute: 10,
        },
      },
      health: {
        enabled: true,
        checkIntervalMs: 30000,
      },

    },

    apiKeys: {},
    environmentVariables: {},
    environmentSources: [],
    modelRouting: { enabled: true, verbose: false, mode: 'balanced' },
    reasoning: { enabled: true, autoDetect: true, showReasoningProcess: true, logReasoning: false },
    mcpServers: {},
    maxConcurrentAgents: 5,
    enableGuidanceSystem: true,
    defaultAgentTimeout: 60000,
    logLevel: 'info' as const,
    requireApprovalForNetwork: true,
    approvalPolicy: 'moderate' as const,
    embeddingProvider: {
      default: 'openai',
      fallbackChain: ['openai', 'openrouter'],
      costOptimization: true,
      autoSwitchOnFailure: true,
    },
    securityMode: 'safe' as const,
    toolApprovalPolicies: {
      fileOperations: 'risky' as const,
      gitOperations: 'risky' as const,
      packageOperations: 'risky' as const,
      systemCommands: 'always' as const,
      networkRequests: 'always' as const,
    },
    sessionSettings: {
      approvalTimeoutMs: 30000,
      devModeTimeoutMs: 3600000,
      batchApprovalEnabled: true,
      autoApproveReadOnly: true,
    },
    sandbox: {
      enabled: true,
      allowFileSystem: true,
      allowNetwork: true,
      allowCommands: true,
      trustedDomains: [
        'registry.npmjs.org',
        'npmjs.org',
        'npm.community',
        'yarnpkg.com',
        'crates.io',
        'static.crates.io',
        'index.crates.io',
        'pypi.org',
        'files.pythonhosted.org',
        'pypi.python.org',
        'rubygems.org',
        'api.rubygems.org',
        'proxy.golang.org',
        'sum.golang.org',
        'golang.org',
        'github.com',
        'api.github.com',
        'raw.githubusercontent.com',
        'codeload.github.com',
        'packagist.org',
        'repo1.maven.org',
        'central.maven.org',
        'mvnrepository.com',
        'registry-1.docker.io',
        'docker.io',
        'hub.docker.com',

      ],
    },
    redis: {
      enabled: true, // ✅ Enabled by default - Upstash Redis cache
      host: 'localhost',
      port: 6379,
      database: 0,
      keyPrefix: 'nikcli:',
      ttl: 3600, // 1 hour default TTL
      maxRetries: 3,
      retryDelayMs: 1000,
      cluster: { enabled: false },
      fallback: { enabled: true, strategy: 'memory' as const }, // Fallback to memory if Redis unavailable
      strategies: { tokens: true, sessions: true, agents: true, documentation: true }, // All strategies enabled
    },
    supabase: {
      enabled: true, // ✅ Enabled by default - Supabase database integration
      features: {
        database: true, // ✅ Database operations enabled
        storage: true, // ✅ File storage enabled
        auth: true, // ✅ Authentication enabled
        realtime: true, // ✅ Real-time subscriptions enabled
        vector: true, // ✅ Vector search (pgvector) enabled
      },
      tables: {
        sessions: 'chat_sessions',
        blueprints: 'agent_blueprints',
        users: 'cli_users',
        metrics: 'usage_metrics',
        documents: 'documentation',
      },
    },
    cloudDocs: {
      enabled: true,
      provider: 'supabase' as const,
      autoSync: true,
      contributionMode: true,
      maxContextSize: 50000,
      autoLoadForAgents: true,
      smartSuggestions: true,
    },
    autoTodo: {
      requireExplicitTrigger: false,
    },
    middleware: {
      enabled: true,
      security: {
        enabled: true,
        priority: 1000,
        strictMode: false,
        requireApproval: true,
        riskThreshold: 'medium' as const,
      },
      logging: {
        enabled: true,
        priority: 900,
        logLevel: 'info' as const,
        logToFile: true,
        sanitizeData: true,
        includeArgs: true,
        includeResponse: false,
      },
      validation: {
        enabled: true,
        priority: 800,
        strictMode: false,
        validateArgs: true,
        validateContext: true,
        validateResponse: false,
        failOnValidationError: true,
      },
      performance: {
        enabled: true,
        priority: 700,
        trackMemory: true,
        trackCpu: true,
        slowExecutionThreshold: 5000,
        reportSlowOperations: true,
        enableOptimizations: true,
      },
      audit: {
        enabled: true,
        priority: 600,
        auditLevel: 'standard' as const,
        enableCompliance: true,
        enableIntegrityChecks: true,
        dataRetentionDays: 90,
        enableRealTimeAlerts: true,
      },
    },
    diff: {
      enabled: true,
      style: 'unified',
      theme: 'auto',
      showLineNumbers: true,
      contextLines: 3,
      syntaxHighlight: true,
      showStats: true,
      maxWidth: 120,
      compactThreshold: 20,
    },
  }

  constructor() {
    // Create config directory in user's home directory
    const configDir = path.join(os.homedir(), '.nikcli')
    this.configPath = path.join(configDir, 'config.json')

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Load configuration from config.json
    this.loadConfig()

    // Load embedded secrets from bundle and update config.json
    // This happens BEFORE applying to process.env so new secrets are available
    this.loadAndSaveEmbeddedSecrets()

    // Apply ALL environment variables to process.env
    // This includes both stored (from config.json) and newly loaded (from bundle)
    this.applyEnvironmentVariablesToProcess()

    // Apply smart defaults AFTER all env vars are loaded
    this.applySmartDefaults()
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
        // Merge with defaults to ensure all fields exist
        this.config = { ...this.defaultConfig, ...configData }
      } else {
        this.config = { ...this.defaultConfig }
        this.saveConfig()
      }
    } catch (_error) {
      console.warn(chalk.yellow('Warning: Failed to load config, using defaults'))
      this.config = { ...this.defaultConfig }
    }
  }

  private applySmartDefaults(): void {
    // Detect CI/CD environment
    const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI)

    if (isCI) {
      this.config.enableAutoApprove = true
      this.config.requireApprovalForNetwork = false
      this.config.approvalPolicy = 'permissive'
    }

    // Detect development environment
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
      this.config.logLevel = 'debug'
      this.config.maxHistoryLength = 200
    }
  }

  private applyEnvironmentVariablesToProcess(options: { overwriteProcess?: boolean } = {}): void {
    const overwriteProcess = options.overwriteProcess ?? false
    const stored = this.config.environmentVariables ?? {}

    for (const [key, encryptedValue] of Object.entries(stored)) {
      try {
        const value = KeyEncryption.decrypt(encryptedValue)
        if (overwriteProcess || process.env[key] === undefined) {
          process.env[key] = value
        }
      } catch (error) {
        if (process.env.DEBUG) {
          console.error(`Failed to apply ${key}:`, error)
        }
      }
    }
  }

  private loadAndSaveEmbeddedSecrets(): void {
    try {
      // Try to import the generated secrets file first (this injects configs into EmbeddedSecrets)
      // This file may not exist in all build contexts (e.g., Docker), so we handle it gracefully
      try {
        require('../config/generated-embedded-secrets')
      } catch (requireError: any) {
        // File doesn't exist or can't be loaded - this is expected in some build contexts
        // Silently return if it's a MODULE_NOT_FOUND error, otherwise re-throw
        if (requireError?.code === 'MODULE_NOT_FOUND') {
          if (process.env.DEBUG) {
            console.debug('Embedded secrets file not found - skipping embedded secrets loading')
          }
          return
        }
        throw requireError
      }

      // Try to load EmbeddedSecrets
      const { EmbeddedSecrets } = require('../config/embedded-secrets')

      // Check if we have embedded secrets in the bundle
      if (!EmbeddedSecrets.isBuiltWithSecrets()) {
        return // No embedded secrets to load
      }

      // Initialize EmbeddedSecrets synchronously
      EmbeddedSecrets.initializeSync()

      // Get all available embedded secrets
      const secretConfigs = EmbeddedSecrets.listAvailable()

      if (!this.config.environmentVariables) {
        this.config.environmentVariables = {}
      }

      let changed = false
      const secretsToOverwrite: { envVarName: string; oldValue: string; newValue: string }[] = []

      // For each embedded secret, check if it needs to be added or updated
      for (const secretInfo of secretConfigs) {
        const secret = EmbeddedSecrets.getSecretSync(secretInfo.id)
        if (!secret) continue

        // Use the actual env var name (not the internal ID)
        const envVarName = secretInfo.envVarName
        const encryptedNewValue = KeyEncryption.encrypt(secret.value)

        // Check if secret exists in config
        if (!this.config.environmentVariables[envVarName]) {
          // Secret doesn't exist - add it automatically
          this.config.environmentVariables[envVarName] = encryptedNewValue
          changed = true

          // Also apply to process.env
          if (!process.env[envVarName]) {
            process.env[envVarName] = secret.value
          }
        } else {
          // Secret exists - check if it's different
          try {
            const existingDecrypted = KeyEncryption.decrypt(this.config.environmentVariables[envVarName])

            if (existingDecrypted !== secret.value) {
              // Value is different - need to ask user confirmation
              secretsToOverwrite.push({
                envVarName,
                oldValue: existingDecrypted,
                newValue: secret.value,
              })
            } else {
              // Value is the same - update silently to ensure sync
              this.config.environmentVariables[envVarName] = encryptedNewValue
              changed = true
            }
          } catch (decryptError) {
            // If decryption fails, treat as different and ask user
            secretsToOverwrite.push({
              envVarName,
              oldValue: '[encrypted]',
              newValue: secret.value,
            })
          }
        }
      }

      // Handle secrets that need user confirmation
      if (secretsToOverwrite.length > 0) {
        this.handleSecretOverwrites(secretsToOverwrite)
        changed = true
      }

      // Save config if we made changes
      if (changed) {
        this.saveConfig()
      }
    } catch (error: any) {
      // Silently fail - embedded secrets are optional
      // Only log non-MODULE_NOT_FOUND errors in DEBUG mode since missing files are expected
      if (process.env.DEBUG && error?.code !== 'MODULE_NOT_FOUND') {
        console.warn('Failed to load embedded secrets:', error)
      }
    }
  }

  private handleSecretOverwrites(secretsToOverwrite: { envVarName: string; oldValue: string; newValue: string }[]): void {
    const { createInterface } = require('readline')
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const askForOverwrite = (index: number) => {
      if (index >= secretsToOverwrite.length) {
        rl.close()
        return
      }

      const secret = secretsToOverwrite[index]
      rl.question(
        `\n🔄 Secret "${secret.envVarName}" has been updated in the new version.\n` +
        `   Old: ${secret.oldValue.slice(0, 20)}${secret.oldValue.length > 20 ? '...' : ''}\n` +
        `   New: ${secret.newValue.slice(0, 20)}${secret.newValue.length > 20 ? '...' : ''}\n` +
        `   Overwrite with new value? (y/n): `,
        (answer: string) => {
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            this.config.environmentVariables[secret.envVarName] = KeyEncryption.encrypt(secret.newValue)
            process.env[secret.envVarName] = secret.newValue
            console.log(`✓ Updated ${secret.envVarName}`)
          } else {
            console.log(`✗ Kept existing value for ${secret.envVarName}`)
          }
          askForOverwrite(index + 1)
        }
      )
    }

    askForOverwrite(0)
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (error) {
      console.error(chalk.red('Error: Failed to save config'), error)
    }
  }

  get<K extends keyof ConfigType>(key: K): ConfigType[K] {
    return this.config[key]
  }

  set<K extends keyof ConfigType>(key: K, value: ConfigType[K]): void {
    this.config[key] = value
    this.saveConfig()
  }

  getAll(): ConfigType {
    return { ...this.config }
  }

  setAll(newConfig: ConfigType): void {
    this.config = { ...newConfig }
    this.saveConfig()
  }

  // API Key management
  setApiKey(model: string, apiKey: string): void {
    if (!this.config.apiKeys) {
      this.config.apiKeys = {}
    }
    // Encrypt the API key before storing
    this.config.apiKeys[model] = KeyEncryption.encrypt(apiKey)
    this.saveConfig()
  }

  getApiKey(model: string): string | undefined {
    // First check config file
    if (this.config.apiKeys?.[model]) {
      // Decrypt the API key when retrieving
      return KeyEncryption.decrypt(this.config.apiKeys[model])
    }

    // Then check environment variables
    const modelConfig = this.config.models[model]
    if (modelConfig) {
      switch (modelConfig.provider) {
        case 'openai':
          return process.env.OPENAI_API_KEY
        case 'anthropic':
          return process.env.ANTHROPIC_API_KEY
        case 'google':
          return process.env.GOOGLE_GENERATIVE_AI_API_KEY
        case 'vercel':
          return process.env.V0_API_KEY
        case 'gateway':
          return process.env.GATEWAY_API_KEY
        case 'openrouter':
          return process.env.OPENROUTER_API_KEY
        case 'ollama':
          return undefined // Ollama doesn't need API keys
      }
    }

    // Check for special services (not model-specific)
    if (model === 'browserbase') {
      return process.env.BROWSERBASE_API_KEY
    }

    return undefined
  }

  getEnvironmentVariables(): Record<string, string> {
    const stored = this.config.environmentVariables ?? {}
    const result: Record<string, string> = {}

    for (const [key, encryptedValue] of Object.entries(stored)) {
      result[key] = KeyEncryption.decrypt(encryptedValue)
    }

    return result
  }

  getEnvironmentSources(): string[] {
    return [...(this.config.environmentSources ?? [])]
  }

  storeEnvironmentVariables(sourcePath: string, variables: Record<string, string>): { added: number; updated: number } {
    if (!this.config.environmentVariables) {
      this.config.environmentVariables = {}
    }
    if (!this.config.environmentSources) {
      this.config.environmentSources = []
    }

    let added = 0
    let updated = 0

    for (const [key, value] of Object.entries(variables)) {
      const encryptedValue = KeyEncryption.encrypt(value)
      const existingEncrypted = this.config.environmentVariables[key]

      if (!existingEncrypted) {
        added += 1
      } else {
        const existingValue = KeyEncryption.decrypt(existingEncrypted)
        if (existingValue !== value) {
          updated += 1
        }
      }

      this.config.environmentVariables[key] = encryptedValue
    }

    const resolvedPath = path.resolve(sourcePath)
    if (!this.config.environmentSources.includes(resolvedPath)) {
      this.config.environmentSources.push(resolvedPath)
    }

    this.saveConfig()
    this.applyEnvironmentVariablesToProcess({ overwriteProcess: true })

    return { added, updated }
  }

  // Cloud documentation API keys
  getCloudDocsApiKeys(): { apiUrl?: string; apiKey?: string } {
    // Fallback to environment variables if config not loaded
    if (!this.config || !this.config.cloudDocs) {
      return {
        apiUrl: process.env.SUPABASE_URL,
        apiKey: process.env.SUPABASE_ANON_KEY,
      }
    }

    const cloudDocsConfig = this.config.cloudDocs

    return {
      apiUrl: cloudDocsConfig.apiUrl || process.env.SUPABASE_URL,
      apiKey: cloudDocsConfig.apiKey || process.env.SUPABASE_ANON_KEY,
    }
  }

  // Model management
  setCurrentModel(model: string): void {
    // Attempt auto-register for OpenRouter-style IDs if missing
    if (!this.config.models[model] && this.isOpenRouterModelId(model)) {
      this.tryAutoRegisterOpenRouterModelIfMissing(model)
    }

    if (!this.config.models[model]) {
      throw new Error(`Model ${model} not found in configuration`)
    }
    this.config.currentModel = model
    this.saveConfig()

    // Validate against OpenRouter API asynchronously (non-blocking)
    if (this.isOpenRouterModelId(model)) {
      void this.validateOpenRouterModelExists(model).then((ok) => {
        if (!ok) {
          console.warn(
            chalk.yellow(
              `Warning: OpenRouter API did not return model '${model}'. It may be new, private, or unavailable.`,
            ),
          )
        }
      }).catch(() => { })
    }
  }

  getCurrentModel(): string {
    return this.config.currentModel
  }

  getModelConfig(model: string): ModelConfig | undefined {
    return this.config.models[model]
  }

  addModel(name: string, config: ModelConfig): void {
    this.config.models[name] = config
    this.saveConfig()
  }

  removeModel(name: string): void {
    if (this.config.currentModel === name) {
      throw new Error('Cannot remove the currently active model')
    }
    delete this.config.models[name]
    this.saveConfig()
  }

  listModels(): Array<{
    name: string
    config: ModelConfig
    hasApiKey: boolean
  }> {
    return Object.entries(this.config.models).map(([name, config]) => ({
      name,
      config,
      hasApiKey: !!this.getApiKey(name),
    }))
  }

  // Validation
  validateConfig(): boolean {
    try {
      ConfigSchema.parse(this.config)
      return true
    } catch (error) {
      console.error(chalk.red('Config validation failed:'), error)
      return false
    }
  }

  // Reset to defaults
  reset(): void {
    this.config = { ...this.defaultConfig }
    this.saveConfig()
  }

  // Export/Import
  export(): ConfigType {
    return { ...this.config }
  }

  getConfig(): ConfigType {
    return { ...this.config }
  }

  import(config: Partial<ConfigType>): void {
    this.config = { ...this.defaultConfig, ...config }
    this.saveConfig()
  }

  // Redis configuration management
  getRedisConfig(): ConfigType['redis'] {
    return this.config.redis
  }

  setRedisConfig(config: Partial<ConfigType['redis']>): void {
    this.config.redis = { ...this.config.redis, ...config }
    this.saveConfig()
  }

  getRedisConnectionString(): string | null {
    const redisConfig = this.config.redis
    if (!redisConfig.enabled) return null

    // Prefer Upstash URL if available
    if (redisConfig.url) {
      return redisConfig.url
    }

    // Fallback to legacy connection string
    const auth = redisConfig.password ? `:${redisConfig.password}@` : ''
    return `redis://${auth}${redisConfig.host}:${redisConfig.port}/${redisConfig.database}`
  }

  getRedisCredentials(): { url?: string; token?: string; host?: string; port?: number } {
    const redisConfig = this.config.redis

    return {
      url: redisConfig.url || process.env.REDIS_URL,
      token: redisConfig.token || process.env.REDIS_TOKEN,
      host: redisConfig.host,
      port: redisConfig.port,
    }
  }

  // Supabase configuration management
  getSupabaseConfig(): ConfigType['supabase'] {
    return this.config.supabase
  }

  setSupabaseConfig(config: Partial<ConfigType['supabase']>): void {
    this.config.supabase = { ...this.config.supabase, ...config }
    this.saveConfig()
  }

  getSupabaseCredentials(): { url?: string; anonKey?: string; serviceRoleKey?: string } {
    const supabaseConfig = this.config.supabase

    return {
      url: supabaseConfig.url || process.env.SUPABASE_URL,
      anonKey: supabaseConfig.anonKey || process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: supabaseConfig.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
  }

  // Notification configuration management
  getNotificationConfig(): import('../types/notifications').NotificationConfig {
    const { DEFAULT_NOTIFICATION_CONFIG, mergeNotificationConfigs } = require('../config/notification-defaults')

    // ENV configuration (highest priority after local)
    const envConfig: Partial<import('../types/notifications').NotificationConfig> = {
      enabled: process.env.NOTIFICATIONS_ENABLED === 'true',
      providers: {
        slack: {
          enabled: process.env.SLACK_TASK_NOTIFICATIONS === 'true',
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL,
          username: process.env.SLACK_USERNAME,
        },
        discord: {
          enabled: process.env.DISCORD_TASK_NOTIFICATIONS === 'true',
          webhookUrl: process.env.DISCORD_WEBHOOK_URL,
          username: process.env.DISCORD_USERNAME,
        },
        linear: {
          enabled: process.env.LINEAR_TASK_NOTIFICATIONS === 'true',
          apiKey: process.env.LINEAR_API_KEY,
          teamId: process.env.LINEAR_TEAM_ID,
          createIssues: process.env.LINEAR_CREATE_ISSUES === 'true',
        },
      },
    }

    // Supabase user profile config (lower priority)
    let supabaseConfig: Partial<import('../types/notifications').NotificationConfig> | undefined
    try {
      const { authProvider } = require('../providers/supabase/auth-provider')
      const profile = authProvider.getCurrentProfile()
      if (profile?.notification_settings) {
        supabaseConfig = {
          enabled: profile.notification_settings.enabled,
          providers: profile.notification_settings.providers,
        }
      }
    } catch {
      // Auth provider not available or not authenticated
    }

    // Merge configs: local > env > supabase > defaults
    return mergeNotificationConfigs(DEFAULT_NOTIFICATION_CONFIG, supabaseConfig, envConfig)
  }

  validateNotificationConfig(config: any): boolean {
    const { validateNotificationConfig } = require('../config/notification-defaults')
    const result = validateNotificationConfig(config)
    return result.valid
  }

  // Browserbase configuration management
  getBrowserbaseCredentials(): { apiKey?: string; projectId?: string } {
    return {
      apiKey: this.getApiKey('browserbase') || process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
    }
  }

  // Output Style configuration management
  getOutputStyleConfig(): ConfigType['outputStyle'] {
    return this.config.outputStyle
  }

  setOutputStyleConfig(config: Partial<ConfigType['outputStyle']>): void {
    this.config.outputStyle = { ...this.config.outputStyle, ...config }
    this.saveConfig()
  }

  setDefaultOutputStyle(style: import('../types/output-styles').OutputStyle): void {
    this.config.outputStyle.defaultStyle = style
    this.saveConfig()
  }

  getDefaultOutputStyle(): import('../types/output-styles').OutputStyle {
    return this.config.outputStyle.defaultStyle
  }

  setModelOutputStyle(modelName: string, style: import('../types/output-styles').OutputStyle): void {
    if (!this.config.models[modelName]) {
      throw new Error(`Model ${modelName} not found in configuration`)
    }
    this.config.models[modelName].outputStyle = style
    this.saveConfig()
  }

  getModelOutputStyle(modelName: string): import('../types/output-styles').OutputStyle | undefined {
    const model = this.config.models[modelName]
    return model?.outputStyle
  }

  setContextOutputStyle(context: string, style: import('../types/output-styles').OutputStyle): void {
    if (!this.config.outputStyle.contextOverrides) {
      this.config.outputStyle.contextOverrides = {}
    }
    this.config.outputStyle.contextOverrides[context as keyof typeof this.config.outputStyle.contextOverrides] = style
    this.saveConfig()
  }

  getContextOutputStyle(context: string): import('../types/output-styles').OutputStyle | undefined {
    return this.config.outputStyle.contextOverrides?.[context as keyof typeof this.config.outputStyle.contextOverrides]
  }

  /**
   * Resolve output style with fallback logic:
   * 1. Model-specific override
   * 2. Context-specific override
   * 3. Provider-specific override
   * 4. Default style
   */
  resolveOutputStyle(options: {
    modelName?: string
    context?: string
    provider?: string
  }): import('../types/output-styles').OutputStyle {
    const { modelName, context, provider } = options

    // 1. Model-specific override
    if (modelName) {
      const modelStyle = this.getModelOutputStyle(modelName)
      if (modelStyle) return modelStyle
    }

    // 2. Context-specific override
    if (context) {
      const contextStyle = this.getContextOutputStyle(context)
      if (contextStyle) return contextStyle
    }

    // 3. Provider-specific override
    if (
      provider &&
      this.config.outputStyle.providerOverrides?.[provider as keyof typeof this.config.outputStyle.providerOverrides]
    ) {
      return this.config.outputStyle.providerOverrides[
        provider as keyof typeof this.config.outputStyle.providerOverrides
      ]!
    }

    // 4. Default fallback
    return this.config.outputStyle.defaultStyle
  }

  /**
   * Get max context tokens for current or specified model
   * @param modelName Optional model name, defaults to current model
   * @returns Maximum context window in tokens
   */
  getMaxContextTokens(modelName?: string): number {
    const model = modelName || this.config.currentModel
    const modelConfig = this.config.models[model]

    if (modelConfig?.maxContextTokens) {
      return modelConfig.maxContextTokens
    }

    // Fallback to imported function
    const { getModelContextLimit } = require('../config/token-limits')
    return getModelContextLimit(model)
  }

  /**
   * Get safe context limit with safety margin
   * @param modelName Optional model name, defaults to current model
   * @param safetyRatio Safety margin ratio (0-1), default 0.8 for 80%
   * @returns Safe context limit in tokens
   */
  getSafeContextLimit(modelName?: string, safetyRatio: number = 0.8): number {
    return Math.floor(this.getMaxContextTokens(modelName) * safetyRatio)
  }

  // ------------------------------------------------------------
  // OpenRouter model auto-registration helpers
  // ------------------------------------------------------------

  private isOpenRouterModelId(modelName: string): boolean {
    if (!modelName) return false
    // Heuristic: OpenRouter model IDs typically include a provider prefix like "openai/", "anthropic/", etc.
    // Avoid special local presets and non-OpenRouter identifiers
    if (modelName.startsWith('@preset/')) return true
    return modelName.includes('/')
  }

  private tryAutoRegisterOpenRouterModelIfMissing(modelName: string): boolean {
    if (this.config.models[modelName]) return true
    if (!this.isOpenRouterModelId(modelName)) return false

    try {
      const { getModelContextLimit } = require('../config/token-limits')
      this.config.models[modelName] = {
        provider: 'openrouter',
        model: modelName,
        maxContextTokens: getModelContextLimit(modelName),
      }
      this.saveConfig()
      return true
    } catch {
      // Fallback if token-limits module is unavailable for some reason
      this.config.models[modelName] = {
        provider: 'openrouter',
        model: modelName,
        maxContextTokens: 128000,
      }
      this.saveConfig()
      return true
    }
  }

  private async fetchOpenRouterModels(): Promise<Set<string>> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return new Set()

    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/nicomatt69/nikcli',
          'X-Title': process.env.OPENROUTER_X_TITLE || 'NikCLI',
        },
      })

      if (!res.ok) return new Set()
      const data = await res.json()
      const ids = new Set<string>()
      const list = Array.isArray(data?.data) ? data.data : []
      for (const item of list) {
        if (item && typeof item.id === 'string') ids.add(item.id)
      }
      return ids
    } catch {
      return new Set()
    }
  }

  private async validateOpenRouterModelExists(modelName: string): Promise<boolean> {
    const ids = await this.fetchOpenRouterModels()
    if (ids.size === 0) return false
    return ids.has(modelName)
  }

  // Authentication credentials management
  saveAuthCredentials(credentials: {
    email?: string
    password?: string
    accessToken?: string
    refreshToken?: string
  }): void {
    if (!this.config.auth) {
      this.config.auth = {}
    }

    // Encrypt sensitive data
    if (credentials.email) this.config.auth.email = KeyEncryption.encrypt(credentials.email)
    if (credentials.password) this.config.auth.password = KeyEncryption.encrypt(credentials.password)
    if (credentials.accessToken) this.config.auth.accessToken = KeyEncryption.encrypt(credentials.accessToken)
    if (credentials.refreshToken) this.config.auth.refreshToken = KeyEncryption.encrypt(credentials.refreshToken)

    this.config.auth.lastLogin = new Date().toISOString()
    this.saveConfig()
  }

  getAuthCredentials(): { email?: string; password?: string; accessToken?: string; refreshToken?: string } | null {
    if (!this.config.auth) {
      return null
    }

    try {
      return {
        email: this.config.auth.email ? KeyEncryption.decrypt(this.config.auth.email) : undefined,
        password: this.config.auth.password ? KeyEncryption.decrypt(this.config.auth.password) : undefined,
        accessToken: this.config.auth.accessToken ? KeyEncryption.decrypt(this.config.auth.accessToken) : undefined,
        refreshToken: this.config.auth.refreshToken ? KeyEncryption.decrypt(this.config.auth.refreshToken) : undefined,
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Failed to decrypt auth credentials'))
      return null
    }
  }

  clearAuthCredentials(): void {
    this.config.auth = undefined
    this.saveConfig()
  }

  hasAuthCredentials(): boolean {
    return !!(this.config.auth?.email || this.config.auth?.accessToken)
  }
}

// Create and export singleton instance
export const simpleConfigManager = new SimpleConfigManager()

// Export aliases for compatibility
export const ConfigManager = SimpleConfigManager
export const configManager = simpleConfigManager

/**
 * Get Mermaid rendering preferences with defaults
 * @returns Mermaid rendering preferences configuration
 */
export function getMermaidRenderingPreferences() {
  // Import here to avoid circular dependencies
  const { DEFAULT_MERMAID_RENDERING_PREFERENCES } = require('../types/config')

  // TODO: In future, load from user config if available
  // For now, return defaults
  return DEFAULT_MERMAID_RENDERING_PREFERENCES
}

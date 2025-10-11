import * as crypto from 'node:crypto'
import chalk from 'chalk'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { z } from 'zod'
import { OutputStyleConfigSchema, OutputStyleEnum } from '../types/output-styles'

// Validation schemas
const ModelConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'ollama', 'vercel', 'gateway', 'openrouter']),
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
        .default(['openai', 'openrouter', 'google']),
      costOptimization: z.boolean().default(true),
      autoSwitchOnFailure: z.boolean().default(true),
    })
    .default({
      default: 'openai',
      fallbackChain: ['openai', 'openrouter', 'google'],
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
  // Authentication credentials
  auth: z
    .object({
      email: z.string().optional(),
      token: z.string().optional(),
      lastLogin: z.string().optional(),
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
    return Number.isNaN(parsed) || parsed < 1 ? 300 : Math.min(parsed, 1000) // Cap at 1000 for safety
  }

  static getEmbedMaxConcurrency(): number {
    const value = process.env.EMBED_MAX_CONCURRENCY
    const parsed = value ? Number(value) : 6
    return Number.isNaN(parsed) || parsed < 1 ? 6 : Math.min(parsed, 20) // Cap at 20 for safety
  }

  static getEmbedInterBatchDelay(): number {
    const value = process.env.EMBED_INTER_BATCH_DELAY_MS
    const parsed = value ? Number(value) : 25
    return Number.isNaN(parsed) || parsed < 0 ? 25 : Math.min(parsed, 1000) // Cap at 1000ms
  }

  static getIndexingBatchSize(): number {
    const value = process.env.INDEXING_BATCH_SIZE
    const parsed = value ? Number(value) : 300
    return Number.isNaN(parsed) || parsed < 1 ? 300 : Math.min(parsed, 1000) // Cap at 1000 for safety
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
    'v0-1.5-md': {
      provider: 'vercel',
      model: 'v0-1.5-md',
      maxContextTokens: 32000,
    },
    'v0-1.5-lg': {
      provider: 'vercel',
      model: 'v0-1.5-lg',
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
    'openai/gpt-5': {
      provider: 'openrouter',
      model: 'openai/gpt-5',
      maxContextTokens: 200000,
    },
    'openai/gpt-5-codex': {
      provider: 'openrouter',
      model: 'openai/gpt-5-codex',
      maxContextTokens: 200000,
    },
    'openai/gpt-5-mini': {
      provider: 'openrouter',
      model: 'openai/gpt-5-mini',
      maxContextTokens: 128000,
    },
    'openai/gpt-5-nano': {
      provider: 'openrouter',
      model: 'openai/gpt-5-nano',
      maxContextTokens: 128000,
    },
    'openai/gpt-5-mini-2025-08-07': {
      provider: 'openrouter',
      model: 'openai/gpt-5-mini-2025-08-07',
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
        useDecorative: false,
        maxResponseLength: 'medium',
      },
    },
    models: this.defaultModels,
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
      fallbackChain: ['openai', 'openrouter', 'google'],
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

    // Load or create config
    this.loadConfig()
    this.applySmartDefaults()
    this.applyEnvironmentVariablesToProcess()
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
      const value = KeyEncryption.decrypt(encryptedValue)
      if (overwriteProcess || process.env[key] === undefined) {
        process.env[key] = value
      }
    }
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
    if (!this.config.models[model]) {
      throw new Error(`Model ${model} not found in configuration`)
    }
    this.config.currentModel = model
    this.saveConfig()
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
      url: redisConfig.url || process.env.UPSTASH_REDIS_REST_URL,
      token: redisConfig.token || process.env.UPSTASH_REDIS_REST_TOKEN,
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

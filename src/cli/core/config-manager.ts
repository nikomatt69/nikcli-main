import * as crypto from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'
import chalk from 'chalk'
import { z } from 'zod'
import { OutputStyleConfigSchema, OutputStyleEnum } from '../types/output-styles'
import { advancedUI } from '../ui/advanced-cli-ui'
import { fileExistsSync, mkdirpSync, readTextSync, writeTextSync } from '../utils/bun-compat'

// Validation schemas
const ModelConfigSchema = z.object({
  provider: z.enum([
    'openai',
    'anthropic',
    'google',
    'ollama',
    'vercel',
    'gateway',
    'openrouter',
    'cerebras',
    'groq',
    'llamacpp',
    'lmstudio',
    'openai-compatible',
    'opencode',
  ]),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(6000).optional(),
  maxContextTokens: z.number().min(1).max(3000000).optional().describe('Maximum context window for this model'),
  // Reasoning configuration
  enableReasoning: z.boolean().optional().describe('Enable reasoning for supported models'),
  reasoningMode: z.enum(['auto', 'explicit', 'disabled']).optional().describe('How to handle reasoning'),
  // Output style configuration
  outputStyle: OutputStyleEnum.optional().describe('AI output style for this model'),
  // OpenAI-compatible extras
  baseURL: z.string().url().optional().describe('Base URL for OpenAI-compatible providers'),
  name: z.string().optional().describe('Provider name for OpenAI-compatible'),
  headers: z.record(z.string()).optional().describe('Custom headers for OpenAI-compatible providers'),
})

const EmbeddingModelConfigSchema = z.object({
  provider: z.enum(['openai', 'google', 'anthropic', 'openrouter']),
  model: z.string(),
  dimensions: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  batchSize: z.number().int().positive().optional(),
  costPer1KTokens: z.number().nonnegative().optional(),
  baseURL: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
})

const RerankingModelConfigSchema = z.object({
  provider: z.enum(['openrouter']),
  model: z.string(),
  topK: z.number().int().positive().optional(),
  maxDocuments: z.number().int().positive().optional(),
  baseURL: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
})

// NEW: Edit Tools Configuration Schema (Phase 2)
const EditToolConfigSchema = z.object({
  defaultFuzzyMatch: z.boolean().default(false).describe('Enable fuzzy matching by default'),
  defaultFuzzyThreshold: z.number().min(0).max(1).default(0.85).describe('Default similarity threshold'),
  defaultIgnoreWhitespace: z.boolean().default(true).describe('Normalize whitespace by default'),
  defaultIgnoreIndentation: z.boolean().default(true).describe('Ignore indentation by default'),
  maxFileSize: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024)
    .describe('Max file size (10MB default)'),
  enableMatchCache: z.boolean().default(true).describe('Enable match result caching'),
  cacheSizeLimit: z.number().int().positive().default(1000).describe('Max cache entries'),
  suggestionsOnFailure: z.boolean().default(true).describe('Show suggestions when edit fails'),
  maxSuggestions: z.number().int().positive().default(3).describe('Max similar lines to suggest'),
})

const ConfigSchema = z.object({
  currentModel: z.string(),
  currentEmbeddingModel: z.string().default('openai/text-embedding-3-small'),
  temperature: z.number().min(0).max(2).default(1),
  maxTokens: z.number().min(1).max(6000).default(6000),
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
  embeddingModels: z.record(EmbeddingModelConfigSchema).default({}),
  rerankingModels: z.record(RerankingModelConfigSchema).default({}),
  currentRerankingModel: z.string().optional(),
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
    .default({
      enabled: true,
      autoDetect: true,
      showReasoningProcess: false,
      logReasoning: false,
    }),
  // OpenRouter transforms configuration (e.g., middle-out for context compression)
  openrouterTransforms: z
    .array(z.string())
    .default(['middle-out'])
    .describe('OpenRouter prompt transforms to apply (e.g., "middle-out" for automatic context compression)'),
  // OpenRouter prompt caching (optional)
  openrouterPromptCache: z
    .object({
      enabled: z.boolean().default(false),
      mode: z.enum(['prefill', 'strict', 'default']).optional(),
      ttl: z.number().int().positive().optional(),
    })
    .optional(),
  // NEW: Edit tools configuration (Phase 2)
  editTools: EditToolConfigSchema.default({
    defaultFuzzyMatch: false,
    defaultFuzzyThreshold: 0.85,
    defaultIgnoreWhitespace: true,
    defaultIgnoreIndentation: true,
    maxFileSize: 10 * 1024 * 1024,
    enableMatchCache: true,
    cacheSizeLimit: 1000,
    suggestionsOnFailure: true,
    maxSuggestions: 3,
  }),
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
      fallbackChain: z.array(z.enum(['openai', 'google', 'anthropic', 'openrouter'])).default(['openai', 'openrouter']),
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
  // Sandbox Approvals - Persistent user approvals for dangerous operations
  sandboxApprovals: z
    .object({
      approvedPaths: z
        .array(
          z.object({
            path: z.string().describe('File or directory path'),
            operation: z.enum(['read', 'write', 'delete']).describe('Operation type'),
            toolName: z.string().describe('Tool that requested approval'),
            timestamp: z.string().describe('When approval was granted'),
            expiresAt: z.string().optional().describe('Optional expiration date'),
          })
        )
        .default([]),
      approvedCommands: z
        .array(
          z.object({
            command: z.string().describe('Command pattern (supports wildcards)'),
            toolName: z.string().describe('Tool that requested approval'),
            timestamp: z.string().describe('When approval was granted'),
            expiresAt: z.string().optional().describe('Optional expiration date'),
          })
        )
        .default([]),
      rememberChoices: z.boolean().default(true).describe('Save user approvals to config'),
      expirationDays: z.number().min(1).max(365).default(30).describe('Days until approval expires'),
    })
    .default({
      approvedPaths: [],
      approvedCommands: [],
      rememberChoices: true,
      expirationDays: 30,
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
      enabled: true, // ✓ Enabled by default in schema
      host: 'localhost',
      port: 6379,
      database: 0,
      keyPrefix: 'nikcli:',
      ttl: 3600,
      maxRetries: 3,
      retryDelayMs: 1000,
      cluster: { enabled: false },
      fallback: { enabled: true, strategy: 'memory' },
      strategies: {
        tokens: true,
        sessions: true,
        agents: true,
        documentation: true,
      },
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
          realtime: z.boolean().default(true), // ✓ Enabled by default
          vector: z.boolean().default(false),
        })
        .default({
          database: true,
          storage: false,
          auth: true,
          realtime: true, // ✓ Enabled by default
          vector: false,
        }),
      tables: z
        .object({
          // Core tables
          sessions: z.string().default('chat_sessions'),
          blueprints: z.string().default('agent_blueprints'),
          users: z.string().default('user_profiles'),
          metrics: z.string().default('usage_metrics'),
          documents: z.string().default('documentation'),
          // Ad system tables
          adCampaigns: z.string().default('ad_campaigns'),
          adImpressions: z.string().default('ad_impressions'),
          adRotationState: z.string().default('ad_rotation_state'),
          userAdsConfig: z.string().default('user_ads_config'),
          // ML system tables
          mlToolchainExecutions: z.string().default('ml_toolchain_executions'),
          mlToolchainModels: z.string().default('ml_toolchain_models'),
          mlInferenceCache: z.string().default('ml_inference_cache'),
          mlBenchmarkResults: z.string().default('ml_benchmark_results'),
          mlBatchMetrics: z.string().default('ml_batch_metrics'),
          // Documentation system tables
          sharedDocs: z.string().default('shared_docs'),
          docsLibraries: z.string().default('docs_libraries'),
          // Misc tables
          niklcliApiKey: z.string().default('nikcli-api-key'),
          subscriptionEvents: z.string().default('subscription_events'),
        })
        .default({
          // Core tables
          sessions: 'chat_sessions',
          blueprints: 'agent_blueprints',
          users: 'user_profiles',
          metrics: 'usage_metrics',
          documents: 'documentation',
          // Ad system tables
          adCampaigns: 'ad_campaigns',
          adImpressions: 'ad_impressions',
          adRotationState: 'ad_rotation_state',
          userAdsConfig: 'user_ads_config',
          // ML system tables
          mlToolchainExecutions: 'ml_toolchain_executions',
          mlToolchainModels: 'ml_toolchain_models',
          mlInferenceCache: 'ml_inference_cache',
          mlBenchmarkResults: 'ml_benchmark_results',
          mlBatchMetrics: 'ml_batch_metrics',
          // Documentation system tables
          sharedDocs: 'shared_docs',
          docsLibraries: 'docs_libraries',
          // Misc tables
          niklcliApiKey: 'nikcli-api-key',
          subscriptionEvents: 'subscription_events',
        }),
    })
    .default({
      enabled: true, // ✓ Enabled by default in schema
      features: {
        database: true,
        storage: true,
        auth: true,
        realtime: true, // ✓ Enabled by default
        vector: true, // ✓ Enabled by default
      },
      tables: {
        sessions: 'chat_sessions',
        blueprints: 'agent_blueprints',
        users: 'user_profiles',
        metrics: 'usage_metrics',
        documents: 'documentation',
        adCampaigns: 'ad_campaigns',
        adImpressions: 'ad_impressions',
        adRotationState: 'ad_rotation_state',
        userAdsConfig: 'user_ads_config',
        mlToolchainExecutions: 'ml_toolchain_executions',
        mlToolchainModels: 'ml_toolchain_models',
        mlInferenceCache: 'ml_inference_cache',
        mlBenchmarkResults: 'ml_benchmark_results',
        mlBatchMetrics: 'ml_batch_metrics',
        sharedDocs: 'shared_docs',
        docsLibraries: 'docs_libraries',
        niklcliApiKey: 'nikcli-api-key',
        subscriptionEvents: 'subscription_events',
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
  // Advertising System Configuration (CPM-based revenue model)
  ads: z
    .object({
      enabled: z.boolean().default(true).describe('Enable ads system'),
      userOptIn: z.boolean().default(false).describe('Pro: hide ads, Free: ignored'),
      frequencyMinutes: z.number().min(1).max(60).default(5).describe('Minutes between ads'),
      impressionCount: z.number().min(0).default(0).describe('Total impressions seen'),
      lastAdShownAt: z.string().optional().describe('ISO timestamp of last ad shown'),
      tier: z.enum(['free', 'pro']).default('free').describe('User tier'),
      optInDate: z.string().optional().describe('ISO timestamp of opt-in'),
      adPreferences: z
        .object({
          allowedCategories: z.array(z.string()).default(['all']),
          blockedAdvertisers: z.array(z.string()).default([]),
        })
        .default({ allowedCategories: ['all'], blockedAdvertisers: [] }),
    })
    .default({
      enabled: true,
      userOptIn: false,
      frequencyMinutes: 5,
      impressionCount: 0,
      tier: 'free',
      adPreferences: {
        allowedCategories: ['all'],
        blockedAdvertisers: [],
      },
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
  // Anthropic OAuth for Claude Pro/Max subscription
  anthropicOAuth: z
    .object({
      access: z.string().describe('Encrypted OAuth access token'),
      refresh: z.string().describe('Encrypted OAuth refresh token'),
      expires: z.number().describe('Token expiration timestamp'),
    })
    .optional(),
  // Temporary OAuth verifier (not saved to disk)
  anthropicOAuthVerifier: z.string().optional(),
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
  // UI Theme configuration
  ui: z
    .object({
      theme: z
        .object({
          active: z.string().default('default').describe('Active theme name'),
          customThemes: z.record(z.string()).default({}).describe('Custom themes as JSON'),
        })
        .default({ active: 'default', customThemes: {} }),
    })
    .default({ theme: { active: 'default', customThemes: {} } }),

  // Enterprise Monitoring configuration
  monitoring: z
    .object({
      enabled: z.boolean().default(true).describe('Enable enterprise monitoring'),
      opentelemetry: z
        .object({
          enabled: z.boolean().default(true).describe('Enable OpenTelemetry distributed tracing'),
          endpoint: z.string().default('http://localhost:4318').describe('OTLP endpoint URL'),
          serviceName: z.string().default('nikcli').describe('Service name for traces'),
          serviceVersion: z.string().default('1.6.0').describe('Service version'),
          sampleRate: z.number().min(0).max(1).default(0.1).describe('Trace sampling rate (0-1)'),
          exportIntervalMs: z.number().min(1000).max(300000).default(60000).describe('Export interval in milliseconds'),
        })
        .default({
          enabled: true,
          endpoint: 'http://localhost:4318',
          serviceName: 'nikcli',
          serviceVersion: '1.6.0',
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
                  minSeverity: z
                    .enum(['low', 'medium', 'high', 'critical'])
                    .default('high')
                    .describe('Minimum severity'),
                })
                .optional(),
              discord: z
                .object({
                  enabled: z.boolean().default(false).describe('Enable Discord alerts'),
                  webhookUrl: z.string().optional().describe('Discord webhook URL'),
                  minSeverity: z
                    .enum(['low', 'medium', 'high', 'critical'])
                    .default('high')
                    .describe('Minimum severity'),
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
        serviceVersion: '1.6.0',
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
  // NikDrive Cloud Storage Integration
  nikdrive: z
    .object({
      enabled: z.boolean().default(false).describe('Enable NikDrive cloud storage'),
      endpoint: z
        .string()
        .default('https://nikcli-drive-production.up.railway.app')
        .describe('NikDrive API endpoint URL'),
      apiKey: z.string().optional().describe('Encrypted NikDrive API key'),
      timeout: z.number().min(1000).max(200000).default(30000).describe('Request timeout in milliseconds'),
      retries: z.number().min(1).max(10).default(3).describe('Number of retries for failed requests'),
      retryDelayMs: z.number().min(100).max(10000).default(1000).describe('Delay between retries in milliseconds'),
      features: z
        .object({
          syncWorkspace: z.boolean().default(false).describe('Auto-sync workspace with cloud'),
          autoBackup: z.boolean().default(false).describe('Automatic backup to cloud'),
          shareEnabled: z.boolean().default(true).describe('Enable share link generation'),
          ragIndexing: z.boolean().default(false).describe('Index cloud files for RAG'),
          contextAware: z.boolean().default(true).describe('Make cloud storage context-aware for AI'),
        })
        .default({
          syncWorkspace: false,
          autoBackup: false,
          shareEnabled: true,
          ragIndexing: false,
          contextAware: true,
        }),
      autoSyncInterval: z
        .number()
        .min(60000)
        .max(86400000)
        .default(3600000)
        .describe('Auto-sync interval in milliseconds (1 hour default)'),
      cacheTtl: z.number().min(60).max(86400).default(300).describe('Cache TTL in seconds'),
    })
    .default({
      enabled: false,
      endpoint: 'https://nikcli-drive-production.up.railway.app',
      timeout: 30000,
      retries: 3,
      retryDelayMs: 1000,
      features: {
        syncWorkspace: false,
        autoBackup: false,
        shareEnabled: true,
        ragIndexing: false,
        contextAware: true,
      },
      autoSyncInterval: 3600000,
      cacheTtl: 300,
    }),
  // Auto-update configuration
  autoUpdate: z.boolean().default(true).describe('Enable automatic updates on startup'),
})

export type ConfigType = z.infer<typeof ConfigSchema>
export type ModelConfig = z.infer<typeof ModelConfigSchema>
export type EditToolConfig = z.infer<typeof EditToolConfigSchema>
export type CliConfig = ConfigType

// Encryption utilities for API keys
export class KeyEncryption {
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
      maxContextTokens: 120000,
    },
    'claude-3-5-sonnet-latest': {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      maxContextTokens: 120000,
    },
    'claude-3-7-sonnet-20250219': {
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-20250219',
      maxContextTokens: 120000,
    },
    'claude-opus-4-20250514': {
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
      maxContextTokens: 120000,
    },
    'gpt-5-mini-2025-08-07': {
      provider: 'openai',
      model: 'gpt-5-mini-2025-08-07',
      maxContextTokens: 120000,
    },
    'gpt-5-nano-2025-08-07': {
      provider: 'openai',
      model: 'gpt-5-nano-2025-08-07',
      maxContextTokens: 120000,
    },
    'gpt-4o-mini': {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxContextTokens: 120000,
    },
    'gpt-5': {
      provider: 'openai',
      model: 'gpt-5',
      maxContextTokens: 120000,
    },
    'gpt-4o': {
      provider: 'openai',
      model: 'gpt-4o',
      maxContextTokens: 120000,
    },
    'gpt-4.1': {
      provider: 'openai',
      model: 'gpt-4.1',
      maxContextTokens: 1000000,
    },
    'gpt-4': {
      provider: 'openai',
      model: 'gpt-4',
      maxContextTokens: 120000,
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
      maxContextTokens: 120000,
    },

    'gemini-2.5-flash': {
      provider: 'google',
      model: 'gemini-2.5-flash',
      maxContextTokens: 120000,
    },
    'gemini-2.5-flash-lite': {
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
      maxContextTokens: 120000,
    },
    'llama3.1:8b': {
      provider: 'ollama',
      model: 'llama3.1:8b',
      maxContextTokens: 120000,
    },
    'codellama:7b': {
      provider: 'ollama',
      model: 'codellama:7b',
      maxContextTokens: 16000,
    },
    'deepseek-r1:8b': {
      provider: 'ollama',
      model: 'deepseek-r1:8b',
      maxContextTokens: 120000,
    },
    'deepseek-r1:3b': {
      provider: 'ollama',
      model: 'deepseek-r1:3b',
      maxContextTokens: 120000,
    },
    'deepseek-r1:7b': {
      provider: 'ollama',
      model: 'deepseek-r1:7b',
      maxContextTokens: 120000,
    },
    'mistral:7b': {
      provider: 'ollama',
      model: 'mistral:7b',
      maxContextTokens: 120000,
    },
    // Groq models - Ultra-fast inference
    'llama-3.1-8b-instant': {
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      maxContextTokens: 120000,
    },
    'llama-3.3-70b-versatile': {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      maxContextTokens: 120000,
    },
    'meta-llama/llama-guard-4-12b': {
      provider: 'groq',
      model: 'meta-llama/llama-guard-4-12b',
      maxContextTokens: 120000,
    },
    'openai/gpt-oss-120b': {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      maxContextTokens: 120000,
    },
    'openai/gpt-oss-20b': {
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      maxContextTokens: 120000,
    },
    'whisper-large-v3': {
      provider: 'groq',
      model: 'whisper-large-v3',
      maxContextTokens: 8192,
    },
    'whisper-large-v3-turbo': {
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      maxContextTokens: 8192,
    },
    'groq/compound': {
      provider: 'groq',
      model: 'groq/compound',
      maxContextTokens: 120000,
    },
    'groq/compound-mini': {
      provider: 'groq',
      model: 'groq/compound-mini',
      maxContextTokens: 120000,
    },
    // Groq Preview Models
    'meta-llama/llama-4-maverick-17b-128e-instruct': {
      provider: 'groq',
      model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
      maxContextTokens: 120000,
    },
    'meta-llama/llama-4-scout-17b-16e-instruct': {
      provider: 'groq',
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      maxContextTokens: 120000,
    },
    'meta-llama/llama-prompt-guard-2-22m': {
      provider: 'groq',
      model: 'meta-llama/llama-prompt-guard-2-22m',
      maxContextTokens: 512,
    },
    'meta-llama/llama-prompt-guard-2-86m': {
      provider: 'groq',
      model: 'meta-llama/llama-prompt-guard-2-86m',
      maxContextTokens: 512,
    },
    'moonshotai/kimi-k2-instruct-0905': {
      provider: 'groq',
      model: 'moonshotai/kimi-k2-instruct-0905',
      maxContextTokens: 120000,
    },
    'openai/gpt-oss-safeguard-20b': {
      provider: 'groq',
      model: 'openai/gpt-oss-safeguard-20b',
      maxContextTokens: 120000,
    },
    'playai-tts': {
      provider: 'groq',
      model: 'playai-tts',
      maxContextTokens: 8192,
    },
    'playai-tts-arabic': {
      provider: 'groq',
      model: 'playai-tts-arabic',
      maxContextTokens: 8192,
    },
    'qwen/qwen3-32b': {
      provider: 'groq',
      model: 'qwen/qwen3-32b',
      maxContextTokens: 120000,
    },
    // Cerebras models - High-speed inference
    'zai-glm-4.6': {
      provider: 'cerebras',
      model: 'zai-glm-4.6',
      maxContextTokens: 120000,
    },
    'gpt-oss:20b': {
      provider: 'openrouter',
      model: 'gpt-oss:20b',
      maxContextTokens: 120000,
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
      maxContextTokens: 120000,
    },

    'anthropic/claude-haiku-4.5': {
      provider: 'openrouter',
      model: 'anthropic/claude-haiku-4.5',
      maxContextTokens: 120000,
    },
    'anthropic/claude-sonnet-4': {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      maxContextTokens: 120000,
    },
    'anthropic/claude-3.7-sonnet:thinking': {
      provider: 'openrouter',
      model: 'anthropic/claude-3.7-sonnet:thinking',
      maxContextTokens: 120000,
    },
    'anthropic/claude-3.7-sonnet': {
      provider: 'openrouter',
      model: 'anthropic/claude-3.7-sonnet',
      maxContextTokens: 120000,
    },
    'anthropic/claude-opus-4.1': {
      provider: 'openrouter',
      model: 'anthropic/claude-opus-4.1',
      maxContextTokens: 120000,
    },
    'anthropic/claude-3.5-sonnet': {
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet',
      maxContextTokens: 120000,
    },

    'nvidia/nemotron-nano-9b-v2:free': {
      provider: 'openrouter',
      model: 'nvidia/nemotron-nano-9b-v2:free',
      maxContextTokens: 32000,
    },
    'openai/gpt-5-pro': {
      provider: 'openrouter',
      model: 'openai/gpt-5-pro',
      maxContextTokens: 120000,
    },
    'openai/gpt-5-codex': {
      provider: 'openrouter',
      model: 'openai/gpt-5-codex',
      maxContextTokens: 120000,
    },
    'openai/gpt-5-image': {
      provider: 'openrouter',
      model: 'openai/gpt-5-image',
      maxContextTokens: 120000,
    },
    'openai/gpt-5-image-mini': {
      provider: 'openrouter',
      model: 'openai/gpt-5-image-mini',
      maxContextTokens: 120000,
    },
    'openai/gpt-5.1-codex-mini': {
      provider: 'openrouter',
      model: 'openai/gpt-5.1-codex-mini',
      maxContextTokens: 120000,
    },
    'openai/gpt-5.1-codex': {
      provider: 'openrouter',
      model: 'openai/gpt-5.1-codex',
      maxContextTokens: 120000,
    },
    'openai/gpt-5.1-image': {
      provider: 'openrouter',
      model: 'openai/gpt-5.1-image',
      maxContextTokens: 120000,
    },
    'openai/o3-deep-research': {
      provider: 'openrouter',
      model: 'openai/o3-deep-research',
      maxContextTokens: 120000,
    },
    'openai/o4-mini-deep-research': {
      provider: 'openrouter',
      model: 'openai/o4-mini-deep-research',
      maxContextTokens: 120000,
    },
    'openai/gpt-4o-audio-preview': {
      provider: 'openrouter',
      model: 'openai/gpt-4o-audio-preview',
      maxContextTokens: 120000,
    },

    'meta-llama/llama-3.1-405b-instruct': {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-405b-instruct',
      maxContextTokens: 120000,
    },
    'meta-llama/llama-3.1-70b-instruct': {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-70b-instruct',
      maxContextTokens: 120000,
    },
    'meta-llama/llama-3.1-8b-instruct': {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-8b-instruct',
      maxContextTokens: 120000,
    },
    'google/gemini-2.5-flash-lite': {
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
      maxContextTokens: 120000,
    },
    'google/gemini-2.5-flash': {
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash',
      maxContextTokens: 120000,
    },
    'google/gemini-2.5-flash-image-preview': {
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-image-preview',
      maxContextTokens: 120000,
    },
    'google/gemini-2.5-pro': {
      provider: 'openrouter',
      model: 'google/gemini-2.5-pro',
      maxContextTokens: 120000,
    },

    'google/gemini-2.0-flash-exp': {
      provider: 'openrouter',
      model: 'google/gemini-2.0-flash-exp',
      maxContextTokens: 120000,
    },
    'google/gemini-1.5-pro': {
      provider: 'openrouter',
      model: 'google/gemini-1.5-pro',
      maxContextTokens: 120000,
    },
    // Google Gemini 3 models
    'google/gemini-3-pro-preview': {
      provider: 'openrouter',
      model: 'google/gemini-3-pro-preview',
      maxContextTokens: 120000,
    },
    'google/gemini-3-pro': {
      provider: 'openrouter',
      model: 'google/gemini-3-pro',
      maxContextTokens: 120000,
    },
    'google/gemini-3-flash': {
      provider: 'openrouter',
      model: 'google/gemini-3-flash',
      maxContextTokens: 120000,
    },
    'openai/gpt-oss-120b:free': {
      provider: 'openrouter',
      model: 'openai/gpt-oss-120b:free',
      maxContextTokens: 120000,
    },
    'z-ai/glm-4.5v': {
      provider: 'openrouter',
      model: 'z-ai/glm-4.5v',
      maxContextTokens: 120000,
    },
    'z-ai/glm-4.5': {
      provider: 'openrouter',
      model: 'z-ai/glm-4.5',
      maxContextTokens: 120000,
    },
    'z-ai/glm-4.6': {
      provider: 'openrouter',
      model: 'z-ai/glm-4.6',
      maxContextTokens: 120000,
    },
    'mistralai/mistral-large': {
      provider: 'openrouter',
      model: 'mistralai/mistral-large',
      maxContextTokens: 120000,
    },
    'qwen/qwen3-next-80b-a3b-thinking': {
      provider: 'openrouter',
      model: 'qwen/qwen3-next-80b-a3b-thinking',
      maxContextTokens: 120000,
    },
    'qwen/qwen3-coder:free': {
      provider: 'openrouter',
      model: 'qwen/qwen3-coder:free',
      maxContextTokens: 120000,
    },
    'x-ai/grok-2': {
      provider: 'openrouter',
      model: 'x-ai/grok-2',
      maxContextTokens: 120000,
    },
    'deepseek/deepseek-chat-v3.1:free': {
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat-v3.1:free',
      maxContextTokens: 120000,
    },
    'deepseek/deepseek-v3.1-terminus': {
      provider: 'openrouter',
      model: 'deepseek/deepseek-v3.1-terminus',
      maxContextTokens: 120000,
    },
    'deepseek/deepseek-v3.2-exp': {
      provider: 'openrouter',
      model: 'deepseek/deepseek-v3.2-exp',
      maxContextTokens: 120000,
    },
    'moonshotai/kimi-k2-0905': {
      provider: 'openrouter',
      model: 'moonshotai/kimi-k2-0905',
      maxContextTokens: 120000,
    },
    'moonshotai/kimi-k2-0905:exacto': {
      provider: 'openrouter',
      model: 'moonshotai/kimi-k2-0905:exacto',
      maxContextTokens: 120000,
    },
    'minimax/minimax-m2': {
      provider: 'openrouter',
      model: 'minimax/minimax-m2',
      maxContextTokens: 120000,
    },
    'qwen/qwen3-coder': {
      provider: 'openrouter',
      model: 'qwen/qwen3-coder',
      maxContextTokens: 120000,
    },
    'x-ai/grok-4': {
      provider: 'openrouter',
      model: 'x-ai/grok-4',
      maxContextTokens: 120000,
    },
    'x-ai/grok-3': {
      provider: 'openrouter',
      model: 'x-ai/grok-3',
      maxContextTokens: 120000,
    },
    'x-ai/grok-3-mini': {
      provider: 'openrouter',
      model: 'x-ai/grok-3-mini',
      maxContextTokens: 120000,
    },
    'x-ai/grok-4-fast': {
      provider: 'openrouter',
      model: 'x-ai/grok-4-fast',
      maxContextTokens: 120000,
    },
    'x-ai/grok-code-fast-1': {
      provider: 'openrouter',
      model: 'x-ai/grok-code-fast-1',
      maxContextTokens: 120000,
    },
    'qwen/qwen3-coder-plus': {
      provider: 'openrouter',
      model: 'qwen/qwen3-coder-plus',
      maxContextTokens: 120000,
    },
    'kwaipilot/kat-coder-pro:free': {
      provider: 'openrouter',
      model: 'kwaipilot/kat-coder-pro:free',
      maxContextTokens: 120000,
    },
    '@preset/nikcli': {
      provider: 'openrouter',
      model: '@preset/nikcli',
      maxContextTokens: 120000,
    },
    '@preset/nikcli-pro': {
      provider: 'openrouter',
      model: '@preset/nikcli-pro',
      maxContextTokens: 120000,
    },
    '@preset/nikcli-research': {
      provider: 'openrouter',
      model: '@preset/nikcli-research',
      maxContextTokens: 120000,
    },
    '@preset/nikcli-free': {
      provider: 'openrouter',
      model: '@preset/nikcli-free',
      maxContextTokens: 120000,
    },
    // OpenCode provider models
    'opencode/grok-code': {
      provider: 'opencode',
      model: 'opencode/grok-code',
      baseURL: 'https://opencode.ai/zen/v1',
      maxContextTokens: 120000,
      name: 'opencode-grok',
    },
    'opencode/big-pickle': {
      provider: 'opencode',
      model: 'opencode/big-pickle',
      baseURL: 'https://opencode.ai/zen/v1',
      maxContextTokens: 120000,
      name: 'opencode-big-pickle',
    },
  }

  private defaultEmbeddingModels: Record<string, z.infer<typeof EmbeddingModelConfigSchema>> = {
    'openai/text-embedding-3-small': {
      provider: 'openrouter',
      model: 'openai/text-embedding-3-small',
      dimensions: 1536,
      maxTokens: 8191,
      batchSize: 256,
      costPer1KTokens: 0.00002,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': 'https://nikcli.mintlify.app',
        'X-Title': 'NikCLI',
      },
    },
    'google/text-embedding-004': {
      provider: 'google',
      model: 'text-embedding-004',
      dimensions: 768,
      maxTokens: 2048,
      batchSize: 128,
      costPer1KTokens: 0.000025,
    },
  }

  private defaultConfig: ConfigType = {
    currentModel: '@preset/nikcli',
    currentEmbeddingModel: 'openai/text-embedding-3-small',
    nikdrive: {
      enabled: true,
      endpoint: 'https://nikcli-drive-production.up.railway.app',
      apiKey: process.env.NIKDRIVE_API_KEY || '',
      timeout: 300000,
      retries: 3,
      retryDelayMs: 1000,
      features: {
        syncWorkspace: true,
        autoBackup: true,
        shareEnabled: true,
        ragIndexing: true,
        contextAware: true,
      },
      autoSyncInterval: 3600000,
      cacheTtl: 300,
    },
    temperature: 1,
    maxTokens: 6000,
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
    ui: {
      theme: {
        active: 'default',
        customThemes: {},
      },
    },
    models: this.defaultModels,
    embeddingModels: this.defaultEmbeddingModels,
    rerankingModels: {
      'sentence-transformers/paraphrase-minilm-l6-v2': {
        provider: 'openrouter',
        model: 'sentence-transformers/paraphrase-minilm-l6-v2',
        topK: 20,
        maxDocuments: 100,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://nikcli.mintlify.app',
          'X-Title': 'NikCLI',
        },
      },
    },
    currentRerankingModel: process.env.RERANKING_MODEL || 'sentence-transformers/paraphrase-minilm-l6-v2',
    monitoring: {
      enabled: true,
      opentelemetry: {
        enabled: true,
        endpoint: 'http://localhost:4318',
        serviceName: 'nikcli',
        serviceVersion: '1.6.0',
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
    reasoning: {
      enabled: true,
      autoDetect: true,
      showReasoningProcess: true,
      logReasoning: false,
    },
    openrouterTransforms: ['middle-out'],
    // NEW: Edit tools configuration (Phase 2)
    editTools: {
      defaultFuzzyMatch: false,
      defaultFuzzyThreshold: 0.85,
      defaultIgnoreWhitespace: true,
      defaultIgnoreIndentation: true,
      maxFileSize: 10 * 1024 * 1024,
      enableMatchCache: true,
      cacheSizeLimit: 1000,
      suggestionsOnFailure: true,
      maxSuggestions: 3,
    },
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
    sandboxApprovals: {
      approvedPaths: [],
      approvedCommands: [],
      rememberChoices: true,
      expirationDays: 30,
    },

    redis: {
      enabled: true, // ✓ Enabled by default - Upstash Redis cache
      host: 'localhost',
      port: 6379,
      database: 0,
      keyPrefix: 'nikcli:',
      ttl: 3600, // 1 hour default TTL
      maxRetries: 3,
      retryDelayMs: 1000,
      cluster: { enabled: false },
      fallback: { enabled: true, strategy: 'memory' as const }, // Fallback to memory if Redis unavailable
      strategies: {
        tokens: true,
        sessions: true,
        agents: true,
        documentation: true,
      }, // All strategies enabled
    },
    supabase: {
      enabled: true, // ✓ Enabled by default - Supabase database integration
      features: {
        database: true, // ✓ Database operations enabled
        storage: true, // ✓ File storage enabled
        auth: true, // ✓ Authentication enabled
        realtime: true, // ✓ Real-time subscriptions enabled
        vector: true, // ✓ Vector search (pgvector) enabled
      },
      tables: {
        sessions: 'chat_sessions',
        blueprints: 'agent_blueprints',
        users: 'user_profiles',
        metrics: 'usage_metrics',
        documents: 'documentation',
        adCampaigns: 'ad_campaigns',
        adImpressions: 'ad_impressions',
        adRotationState: 'ad_rotation_state',
        userAdsConfig: 'user_ads_config',
        mlToolchainExecutions: 'ml_toolchain_executions',
        mlToolchainModels: 'ml_toolchain_models',
        mlInferenceCache: 'ml_inference_cache',
        mlBenchmarkResults: 'ml_benchmark_results',
        mlBatchMetrics: 'ml_batch_metrics',
        sharedDocs: 'shared_docs',
        docsLibraries: 'docs_libraries',
        niklcliApiKey: 'nikcli-api-key',
        subscriptionEvents: 'subscription_events',
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
    ads: {
      enabled: true,
      userOptIn: false,
      frequencyMinutes: 5,
      impressionCount: 0,
      tier: 'free',
      adPreferences: {
        allowedCategories: ['all'],
        blockedAdvertisers: [],
      },
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

    // Ensure config directory exists (Bun native)
    if (!fileExistsSync(configDir)) {
      mkdirpSync(configDir)
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
      if (fileExistsSync(this.configPath)) {
        const configData = JSON.parse(readTextSync(this.configPath))
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
      const secretsToOverwrite: {
        envVarName: string
        oldValue: string
        newValue: string
      }[] = []

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

  private saveConfig(): void {
    try {
      writeTextSync(this.configPath, JSON.stringify(this.config, null, 2))
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

  getAllModels(): Record<string, ModelConfig> {
    return this.config.models
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
    const embedConfig = this.config.embeddingModels?.[model]
    const provider = modelConfig?.provider || embedConfig?.provider

    // If a provider-level key is stored, decrypt and use it
    if (provider && this.config.apiKeys?.[provider]) {
      return KeyEncryption.decrypt(this.config.apiKeys[provider])
    }

    if (provider) {
      switch (provider) {
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
        case 'openai-compatible':
          // Generic OpenAI-compatible endpoint; allow multiple env fallbacks
          return process.env.OPENAI_COMPATIBLE_API_KEY || process.env.SAM3_API_KEY
        case 'opencode':
          // OpenCode specific API key
          return process.env.OPENCODE_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY
        case 'cerebras':
          return process.env.CEREBRAS_API_KEY
        case 'groq':
          return process.env.GROQ_API_KEY
        case 'ollama':
          return undefined // Ollama doesn't need API keys
        case 'llamacpp':
          return undefined // LlamaCpp local server doesn't need API keys
        case 'lmstudio':
          return undefined // LMStudio local server doesn't need API keys
      }
    }

    // Check for special services (not model-specific)
    if (model === 'browserbase') {
      return process.env.BROWSERBASE_API_KEY
    }

    if (model === 'nikdrive' || model === 'cloud') {
      return process.env.NIKDRIVE_API_KEY
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
      void this.validateOpenRouterModelExists(model)
        .then((ok) => {
          if (!ok) {
            console.warn(
              chalk.yellow(
                `Warning: OpenRouter API did not return model '${model}'. It may be new, private, or unavailable.`
              )
            )
          }
        })
        .catch(() => {})
    }
  }

  setCurrentEmbeddingModel(model: string, config?: Partial<z.infer<typeof EmbeddingModelConfigSchema>>): void {
    this.ensureEmbeddingModel(model, config)
    this.config.currentEmbeddingModel = model
    this.saveConfig()
  }

  getCurrentEmbeddingModel(): string {
    return this.config.currentEmbeddingModel || 'openai/text-embedding-3-small'
  }

  getCurrentRerankingModel(): string {
    return this.config.currentRerankingModel || 'sentence-transformers/paraphrase-minilm-l6-v2'
  }

  getEmbeddingModelConfig(model: string): z.infer<typeof EmbeddingModelConfigSchema> | undefined {
    const existing = this.config.embeddingModels?.[model]
    if (existing) return existing

    if (this.isOpenRouterModelId(model)) {
      return {
        provider: 'openrouter',
        model,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://nikcli.mintlify.app',
          'X-Title': 'NikCLI',
        },
        dimensions: this.getDefaultEmbeddingDimensions('openrouter'),
        maxTokens: 8191,
        batchSize: 256,
        costPer1KTokens: 0,
      }
    }

    return undefined
  }

  getRerankingModelConfig(model: string): z.infer<typeof RerankingModelConfigSchema> | undefined {
    const existing = this.config.rerankingModels?.[model]
    if (existing) return existing

    if (this.isOpenRouterModelId(model)) {
      return {
        provider: 'openrouter',
        model,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://nikcli.mintlify.app',
          'X-Title': 'NikCLI',
        },
        topK: 10,
        maxDocuments: 100,
      }
    }

    return undefined
  }

  setEmbeddingModelConfig(model: string, config: Partial<z.infer<typeof EmbeddingModelConfigSchema>>): void {
    const baseConfig = this.config.embeddingModels?.[model] ||
      this.getEmbeddingModelConfig(model) || {
        provider: this.inferEmbeddingProvider(model),
        model,
      }

    this.config.embeddingModels = {
      ...this.config.embeddingModels,
      [model]: {
        ...baseConfig,
        ...config,
        provider: config.provider || baseConfig.provider || this.inferEmbeddingProvider(model),
        model,
        baseURL: config.baseURL || baseConfig.baseURL,
        headers: config.headers || baseConfig.headers,
        dimensions:
          config.dimensions ?? baseConfig.dimensions ?? this.getDefaultEmbeddingDimensions(baseConfig.provider),
        maxTokens: config.maxTokens ?? baseConfig.maxTokens ?? 8191,
        batchSize: config.batchSize ?? baseConfig.batchSize ?? 256,
        costPer1KTokens: config.costPer1KTokens ?? baseConfig.costPer1KTokens ?? 0,
      },
    }
    this.saveConfig()
  }

  setRerankingModelConfig(model: string, config: Partial<z.infer<typeof RerankingModelConfigSchema>>): void {
    const baseConfig = this.config.rerankingModels?.[model] || {
      provider: 'openrouter',
      model,
    }

    this.config.rerankingModels = {
      ...this.config.rerankingModels,
      [model]: {
        ...baseConfig,
        ...config,
        provider: config.provider || baseConfig.provider || 'openrouter',
        model,
        baseURL: config.baseURL || baseConfig.baseURL,
        headers: config.headers || baseConfig.headers,
        topK: config.topK ?? baseConfig.topK ?? 10,
        maxDocuments: config.maxDocuments ?? baseConfig.maxDocuments ?? 100,
      },
    }
    this.saveConfig()
  }

  setCurrentRerankingModel(model: string, config?: Partial<z.infer<typeof RerankingModelConfigSchema>>): void {
    this.ensureRerankingModel(model, config)
    this.config.currentRerankingModel = model
    this.saveConfig()
  }

  getCurrentModel(): string {
    return this.config.currentModel
  }

  getModelConfig(model: string): ModelConfig | undefined {
    // Try exact match first
    const exactMatch = this.config.models[model]
    if (exactMatch) {
      return exactMatch
    }

    // Fallback: if model has a provider prefix (google/, openai/, anthropic/, etc.)
    // and matches a configured OpenRouter model, return that configuration
    if (model.includes('/')) {
      const configuredModel = this.config.models[model]
      if (configuredModel) {
        return configuredModel
      }

      // If we still don't have it, create a dynamic config for OpenRouter models
      // This handles cases like --model google/gemini-3-pro-preview
      if (
        model.startsWith('google/') ||
        model.startsWith('openai/') ||
        model.startsWith('anthropic/') ||
        model.startsWith('x-ai/') ||
        model.startsWith('qwen/') ||
        model.startsWith('mistralai/') ||
        model.startsWith('nvidia/') ||
        model.startsWith('z-ai/') ||
        model.startsWith('moonshotai/') ||
        model.startsWith('minimax/') ||
        model.startsWith('xai/')
      ) {
        // Return a dynamic OpenRouter config for namespaced models
        return {
          provider: 'openrouter',
          model: model,
          temperature: 1,
          maxTokens: 6000,
          maxContextTokens: this.getDefaultContextTokens(model),
        }
      }
    }

    return undefined
  }

  /**
   * Get default context tokens for a model based on its name
   */
  private getDefaultContextTokens(model: string): number {
    // Google models
    if (model.includes('gemini-2.5') || model.includes('gemini-3')) {
      return 2097152 // 2M tokens
    }
    if (model.includes('gemini-2.0')) {
      return 1000000
    }
    if (model.includes('gemini-1.5')) {
      return 2097152
    }

    // OpenAI models
    if (model.includes('gpt-5')) {
      return 400000
    }
    if (model.includes('gpt-4')) {
      return 128000
    }

    // Anthropic models
    if (model.includes('claude')) {
      return 200000
    }

    // Default
    return 128000
  }

  private inferEmbeddingProvider(model: string): 'openai' | 'google' | 'anthropic' | 'openrouter' {
    if (model.startsWith('google/')) return 'google'
    if (model.startsWith('openai/')) return 'openai'
    if (model.includes('claude') || model.includes('anthropic')) return 'anthropic'
    if (model.includes('/')) return 'openrouter'
    return 'openai'
  }

  private getDefaultEmbeddingDimensions(provider: string | undefined): number {
    switch (provider) {
      case 'google':
        return 768
      case 'anthropic':
        return 1536
      case 'openrouter':
        return 1536
      case 'openai':
      default:
        return 1536
    }
  }

  private ensureEmbeddingModel(model: string, config?: Partial<z.infer<typeof EmbeddingModelConfigSchema>>): void {
    if (!this.config.embeddingModels) {
      this.config.embeddingModels = { ...this.defaultEmbeddingModels }
    }
    if (!this.config.embeddingModels[model]) {
      this.setEmbeddingModelConfig(model, config || {})
      return
    }
    if (config) {
      this.setEmbeddingModelConfig(model, config)
    }
  }

  private ensureRerankingModel(model: string, config?: Partial<z.infer<typeof RerankingModelConfigSchema>>): void {
    if (!this.config.rerankingModels) {
      this.config.rerankingModels = {}
    }
    if (!this.config.rerankingModels[model]) {
      this.setRerankingModelConfig(model, config || {})
      return
    }
    if (config) {
      this.setRerankingModelConfig(model, config)
    }
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

  getRedisCredentials(): {
    url?: string
    token?: string
    host?: string
    port?: number
  } {
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

  getSupabaseCredentials(): {
    url?: string
    anonKey?: string
    serviceRoleKey?: string
  } {
    const supabaseConfig = this.config.supabase

    return {
      url: supabaseConfig.url || process.env.SUPABASE_URL,
      anonKey: supabaseConfig.anonKey || process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: supabaseConfig.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
  }

  // NikDrive configuration management
  getNikDriveConfig(): ConfigType['nikdrive'] {
    return this.config.nikdrive
  }

  setNikDriveConfig(config: Partial<ConfigType['nikdrive']>): void {
    this.config.nikdrive = { ...this.config.nikdrive, ...config }
    this.saveConfig()
  }

  getNikDriveCredentials(): { endpoint?: string; apiKey?: string } {
    const nikdriveConfig = this.config.nikdrive

    return {
      endpoint:
        nikdriveConfig.endpoint || process.env.NIKDRIVE_ENDPOINT || 'https://nikcli-drive-production.up.railway.app',
      apiKey: nikdriveConfig.apiKey || process.env.NIKDRIVE_API_KEY,
    }
  }

  enableNikDrive(apiKey: string): void {
    const encryptedKey = KeyEncryption.encrypt(apiKey)
    this.setNikDriveConfig({
      enabled: true,
      apiKey: encryptedKey,
    })
  }

  disableNikDrive(): void {
    this.setNikDriveConfig({
      enabled: false,
      apiKey: undefined,
    })
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
        maxContextTokens: 120000,
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
      const data = (await res.json()) as { data?: Array<{ id?: string }> }
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

  getAuthCredentials(): {
    email?: string
    password?: string
    accessToken?: string
    refreshToken?: string
  } | null {
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

  // Anthropic OAuth management for Claude Pro/Max subscription
  getAnthropicOAuthTokens(): {
    access: string
    refresh: string
    expires: number
  } | null {
    if (!this.config.anthropicOAuth) {
      return null
    }

    try {
      return {
        access: KeyEncryption.decrypt(this.config.anthropicOAuth.access),
        refresh: KeyEncryption.decrypt(this.config.anthropicOAuth.refresh),
        expires: this.config.anthropicOAuth.expires,
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Failed to decrypt Anthropic OAuth tokens'))
      return null
    }
  }

  setAnthropicOAuthTokens(tokens: { access: string; refresh: string; expires: number }): void {
    this.config.anthropicOAuth = {
      access: KeyEncryption.encrypt(tokens.access),
      refresh: KeyEncryption.encrypt(tokens.refresh),
      expires: tokens.expires,
    }
    this.saveConfig()
  }

  clearAnthropicOAuth(): void {
    this.config.anthropicOAuth = undefined
    this.saveConfig()
  }

  hasAnthropicOAuth(): boolean {
    return !!this.config.anthropicOAuth?.access
  }

  // Temporary verifier storage for OAuth flow
  setAnthropicOAuthVerifier(verifier: string): void {
    this.config.anthropicOAuthVerifier = verifier
    // Don't save to disk - only keep in memory for security
  }

  getAnthropicOAuthVerifier(): string | null {
    return this.config.anthropicOAuthVerifier || null
  }

  clearAnthropicOAuthVerifier(): void {
    this.config.anthropicOAuthVerifier = undefined
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

/**
 * Load user ads config from Supabase database
 * Synchronizes local config with database preferences
 */
export async function loadUserAdsConfigFromDatabase(userId: string, supabase: any): Promise<void> {
  try {
    const config = simpleConfigManager.getSupabaseConfig()
    const { data } = await supabase.from(config.tables.userAdsConfig).select('*').eq('user_id', userId).single()

    if (data) {
      const config = simpleConfigManager.getAll()
      config.ads = {
        enabled: data.ads_enabled !== false,
        userOptIn: data.ads_hidden === true,
        frequencyMinutes: data.frequency_minutes || 5,
        impressionCount: data.impression_count || 0,
        lastAdShownAt: data.last_ad_shown_at,
        tier: config.ads.tier,
        optInDate: data.optInDate,
        adPreferences: {
          allowedCategories: data.allowed_categories || ['all'],
          blockedAdvertisers: data.blocked_advertisers || [],
        },
      }
      simpleConfigManager.setAll(config)
    }
  } catch (error) {
    console.debug('Could not load ads config from database:', error)
  }
}

/**
 * Save user ads config to Supabase database
 * Persists local config to database for cross-device sync
 */
export async function saveUserAdsConfigToDatabase(userId: string, supabase: any): Promise<void> {
  try {
    const config = simpleConfigManager.getAll()
    const supabaseConfig = simpleConfigManager.getSupabaseConfig()
    await supabase
      .from(supabaseConfig.tables.userAdsConfig)
      .update({
        ads_enabled: config.ads.enabled,
        ads_hidden: config.ads.userOptIn,
        frequency_minutes: config.ads.frequencyMinutes,
        impression_count: config.ads.impressionCount,
        last_ad_shown_at: config.ads.lastAdShownAt,
        allowed_categories: config.ads.adPreferences.allowedCategories,
        blocked_advertisers: config.ads.adPreferences.blockedAdvertisers,
      })
      .eq('user_id', userId)
  } catch (error) {
    console.debug('Could not save ads config to database:', error)
  }
}

/**
 * Sync subscription tier from Supabase user_profiles
 * Ensures ads.tier matches actual subscription level
 */
export async function syncSubscriptionTierFromDatabase(userId: string, supabase: any): Promise<void> {
  try {
    const supabaseConfig = simpleConfigManager.getSupabaseConfig()
    const { data: profile } = await supabase
      .from(supabaseConfig.tables.users)
      .select('subscription_tier')
      .eq('id', userId)
      .single()

    if (profile) {
      const config = simpleConfigManager.getAll()
      config.ads.tier = profile.subscription_tier || 'free'
      simpleConfigManager.setAll(config)
    }
  } catch (error) {
    console.debug('Could not sync subscription tier from database:', error)
  }
}

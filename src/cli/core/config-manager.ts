import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import chalk from 'chalk';
import { z } from 'zod';

// Validation schemas
const ModelConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'ollama', 'vercel', 'gateway']),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(8000).optional(),
});

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
  models: z.record(ModelConfigSchema),
  apiKeys: z.record(z.string()).optional(),
  // MCP (Model Context Protocol) servers configuration - Claude Code/OpenCode compatible
  mcp: z.record(z.union([
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
    })
  ])).optional(),
  // Legacy MCP configuration (for backward compatibility)
  mcpServers: z.record(z.object({
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
    authentication: z.object({
      type: z.enum(['bearer', 'basic', 'api_key']),
      token: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      apiKey: z.string().optional(),
      header: z.string().optional(),
    }).optional(),
  })).optional(),
  // Agent Manager specific config
  maxConcurrentAgents: z.number().min(1).max(10).default(3),
  enableGuidanceSystem: z.boolean().default(true),
  defaultAgentTimeout: z.number().min(1000).default(60000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  requireApprovalForNetwork: z.boolean().default(true),
  approvalPolicy: z.enum(['strict', 'moderate', 'permissive']).default('moderate'),
  // Security configuration for different modes
  securityMode: z.enum(['safe', 'default', 'developer']).default('safe'),
  toolApprovalPolicies: z.object({
    fileOperations: z.enum(['always', 'risky', 'never']).default('risky'),
    gitOperations: z.enum(['always', 'risky', 'never']).default('risky'),
    packageOperations: z.enum(['always', 'risky', 'never']).default('risky'),
    systemCommands: z.enum(['always', 'risky', 'never']).default('always'),
    networkRequests: z.enum(['always', 'risky', 'never']).default('always'),
  }).default({
    fileOperations: 'risky',
    gitOperations: 'risky',
    packageOperations: 'risky',
    systemCommands: 'always',
    networkRequests: 'always',
  }),
  // Session-based settings
  sessionSettings: z.object({
    approvalTimeoutMs: z.number().min(5000).max(300000).default(30000),
    devModeTimeoutMs: z.number().min(60000).max(7200000).default(3600000),
    batchApprovalEnabled: z.boolean().default(true),
    autoApproveReadOnly: z.boolean().default(true),
  }).default({
    approvalTimeoutMs: 30000,
    devModeTimeoutMs: 3600000,
    batchApprovalEnabled: true,
    autoApproveReadOnly: true,
  }),
  sandbox: z.object({
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
      'hub.docker.com'
    ]),
  }).default({
    enabled: true,
    allowFileSystem: true,
    allowNetwork: true,
    allowCommands: true,
    trustedDomains: [
      'registry.npmjs.org', 'npmjs.org', 'npm.community', 'yarnpkg.com',
      'crates.io', 'static.crates.io', 'index.crates.io',
      'pypi.org', 'files.pythonhosted.org', 'pypi.python.org',
      'rubygems.org', 'api.rubygems.org',
      'proxy.golang.org', 'sum.golang.org', 'golang.org',
      'github.com', 'api.github.com', 'raw.githubusercontent.com', 'codeload.github.com',
      'packagist.org', 'repo1.maven.org', 'central.maven.org', 'mvnrepository.com',
      'registry-1.docker.io', 'docker.io', 'hub.docker.com'
    ],
  }),
  // Redis Cache System
  redis: z.object({
    enabled: z.boolean().default(true),
    host: z.string().default('localhost'),
    port: z.number().min(1).max(65535).default(6379),
    password: z.string().optional(),
    database: z.number().min(0).max(15).default(0),
    keyPrefix: z.string().default('nikcli:'),
    ttl: z.number().min(60).max(86400).default(3600), // 1 hour default
    maxRetries: z.number().min(1).max(10).default(3),
    retryDelayMs: z.number().min(100).max(5000).default(1000),
    cluster: z.object({
      enabled: z.boolean().default(false),
      nodes: z.array(z.object({
        host: z.string(),
        port: z.number().min(1).max(65535)
      })).optional(),
    }).default({
      enabled: false
    }),
    fallback: z.object({
      enabled: z.boolean().default(true),
      strategy: z.enum(['memory', 'file', 'none']).default('memory'),
    }).default({
      enabled: true,
      strategy: 'memory'
    }),
    strategies: z.object({
      tokens: z.boolean().default(true),
      sessions: z.boolean().default(true),
      agents: z.boolean().default(true),
      documentation: z.boolean().default(true),
    }).default({
      tokens: true,
      sessions: true,
      agents: true,
      documentation: true,
    }),
  }).default({
    enabled: false,
    host: 'localhost',
    port: 6379,
    database: 0,
    keyPrefix: 'nikcli:',
    ttl: 3600,
    maxRetries: 3,
    retryDelayMs: 1000,
    cluster: { enabled: false },
    fallback: { enabled: true, strategy: 'memory' },
    strategies: { tokens: true, sessions: true, agents: true, documentation: true }
  }),
  // Supabase Integration Extensions
  supabase: z.object({
    enabled: z.boolean().default(true),
    url: z.string().optional(),
    anonKey: z.string().optional(),
    serviceRoleKey: z.string().optional(),
    features: z.object({
      database: z.boolean().default(true),
      storage: z.boolean().default(true),
      auth: z.boolean().default(true),
      realtime: z.boolean().default(false),
      vector: z.boolean().default(true),
    }).default({
      database: true,
      storage: true,
      auth: true,
      realtime: false,
      vector: true,
    }),
    tables: z.object({
      sessions: z.string().default('cli_sessions'),
      blueprints: z.string().default('agent_blueprints'),
      users: z.string().default('cli_users'),
      metrics: z.string().default('usage_metrics'),
      documents: z.string().default('documentation'),
    }).default({
      sessions: 'cli_sessions',
      blueprints: 'agent_blueprints',
      users: 'cli_users',
      metrics: 'usage_metrics',
      documents: 'documentation',
    }),
  }).default({
    enabled: false,
    features: {
      database: true,
      storage: true,
      auth: true,
      realtime: false,
      vector: false,
    },
    tables: {
      sessions: 'cli_sessions',
      blueprints: 'agent_blueprints',
      users: 'cli_users',
      metrics: 'usage_metrics',
      documents: 'documentation',
    }
  }),
  // Cloud documentation system (legacy compatibility)
  cloudDocs: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['supabase', 'firebase', 'github']).default('supabase'),
    apiUrl: z.string().optional(),
    apiKey: z.string().optional(),
    autoSync: z.boolean().default(true),
    contributionMode: z.boolean().default(true),
    maxContextSize: z.number().min(10000).max(100000).default(50000),
    autoLoadForAgents: z.boolean().default(true),
    smartSuggestions: z.boolean().default(true),
  }).default({
    enabled: false,
    provider: 'supabase',
    autoSync: true,
    contributionMode: true,
    maxContextSize: 50000,
    autoLoadForAgents: true,
    smartSuggestions: true,
  }),
});

export type ConfigType = z.infer<typeof ConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type CliConfig = ConfigType;

// Encryption utilities for API keys
class KeyEncryption {
  private static ALGORITHM = 'aes-256-gcm';
  private static KEY_LENGTH = 32;
  private static IV_LENGTH = 16;
  
  private static getEncryptionKey(): Buffer {
    // Use machine-specific key derivation
    const machineId = os.hostname() + os.userInfo().username;
    return crypto.scryptSync(machineId, 'nikcli-salt', this.KEY_LENGTH);
  }
  
  static encrypt(text: string): string {
    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv) as crypto.CipherGCM;
      cipher.setAAD(Buffer.from('nikcli-api-key'));
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      
      // Combine iv + authTag + encrypted
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch {
      // Fallback: return base64 encoded (basic obfuscation)
      return 'b64:' + Buffer.from(text).toString('base64');
    }
  }
  
  static decrypt(encryptedText: string): string {
    try {
      // Handle base64 fallback
      if (encryptedText.startsWith('b64:')) {
        return Buffer.from(encryptedText.slice(4), 'base64').toString('utf8');
      }
      
      const parts = encryptedText.split(':');
      if (parts.length !== 3) throw new Error('Invalid format');
      
      const key = this.getEncryptionKey();
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv) as crypto.DecipherGCM;
      decipher.setAAD(Buffer.from('nikcli-api-key'));
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch {
      // If decryption fails, assume it's already decrypted (migration case)
      return encryptedText;
    }
  }
}

export class SimpleConfigManager {
  private configPath: string;
  private config!: ConfigType;

  // Default models configuration
  private defaultModels: Record<string, ModelConfig> = {
    'claude-sonnet-4-20250514': {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    },
    'claude-3-5-sonnet-latest': {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
    },
    "claude-3-7-sonnet-20250219": {
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-20250219',
    },
    "claude-opus-4-20250514": {
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
    },
    'gpt-5-mini-2025-08-07': {
      provider: 'openai',
      model: 'gpt-5-mini-2025-08-07',
    },
    'gpt-5-nano-2025-08-07': {
      provider: 'openai',
      model: 'gpt-5-nano-2025-08-07',
    },
    'gpt-4o-mini': {
      provider: 'openai',
      model: 'gpt-4o-mini',
    },
    'gpt-5': {
      provider: 'openai',
      model: 'gpt-5',
    },
    'gpt-4o': {
      provider: 'openai',
      model: 'gpt-4o',
    },
    'gpt-4.1': {
      provider: 'openai',
      model: 'gpt-4.1',
    },
    'gpt-4': {
      provider: 'openai',
      model: 'gpt-4',
    },
    'v0-1.0-md': {
      provider: 'vercel',
      model: 'v0-1.0-md',

    },
    'v0-1.5-md': {
      provider: 'vercel',
      model: 'v0-1.5-md',

    },
    'v0-1.5-lg': {
      provider: 'vercel',
      model: 'v0-1.5-lg',

    },
    'gemini-2.5-pro': {
      provider: 'google',
      model: 'gemini-2.5-pro',
    },

    'gemini-2.5-flash': {
      provider: 'google',
      model: 'gemini-2.5-flash',
    },
    'gemini-2.5-flash-lite': {
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
    },
    'llama3.1:8b': {
      provider: 'ollama',
      model: 'llama3.1:8b',
    },
    'codellama:7b': {
      provider: 'ollama',
      model: 'codellama:7b',
    },
    'deepseek-r1:8b': {
      provider: 'ollama',
      model: 'deepseek-r1:8b',
    },
    'deepseek-r1:3b': {
      provider: 'ollama',
      model: 'deepseek-r1:3b',
    },
    'deepseek-r1:7b': {
      provider: 'ollama',
      model: 'deepseek-r1:7b',
    },
    'mistral:7b': {
      provider: 'ollama',
      model: 'mistral:7b',
    },
    'gpt-oss:20b': {
      provider: 'openai',
      model: 'gpt-oss:20b',
    },
    'gemma3n': {
      provider: 'openai',
      model: 'gemma3n',
    },
    'gemma3n-large': {
      provider: 'openai',
      model: 'gemma3n-large',
    },
    'cline:cline/sonic': {
      provider: 'gateway',
      model: 'cline:cline/sonic',
    },
    'cline:cline/sonic-pro': {
      provider: 'gateway',
      model: 'cline:cline/sonic-pro',
    },

  };

  private defaultConfig: ConfigType = {
    currentModel: 'claude-3-7-sonnet-20250219',
    temperature: 1,
    maxTokens: 8000,
    chatHistory: true,
    maxHistoryLength: 100,
    systemPrompt: undefined,
    autoAnalyzeWorkspace: true,
    enableAutoApprove: false,
    models: this.defaultModels,
    apiKeys: {},
    mcpServers: {},
    maxConcurrentAgents: 3,
    enableGuidanceSystem: true,
    defaultAgentTimeout: 60000,
    logLevel: 'info' as const,
    requireApprovalForNetwork: true,
    approvalPolicy: 'moderate' as const,
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
        'registry.npmjs.org', 'npmjs.org', 'npm.community', 'yarnpkg.com',
        'crates.io', 'static.crates.io', 'index.crates.io',
        'pypi.org', 'files.pythonhosted.org', 'pypi.python.org',
        'rubygems.org', 'api.rubygems.org',
        'proxy.golang.org', 'sum.golang.org', 'golang.org',
        'github.com', 'api.github.com', 'raw.githubusercontent.com', 'codeload.github.com',
        'packagist.org', 'repo1.maven.org', 'central.maven.org', 'mvnrepository.com',
        'registry-1.docker.io', 'docker.io', 'hub.docker.com'
      ],
    },
    redis: {
      enabled: true,
      host: 'localhost',
      port: 6379,
      database: 0,
      keyPrefix: 'nikcli:',
      ttl: 3600,
      maxRetries: 3,
      retryDelayMs: 1000,
      cluster: { enabled: true },
      fallback: { enabled: true, strategy: 'memory' as const },
      strategies: { tokens: true, sessions: true, agents: true, documentation: true }
    },
    supabase: {
      enabled: true,
      features: {
        database: true,
        storage: true,
        auth: false,
        realtime: false,
        vector: true,
      },
      tables: {
        sessions: 'cli_sessions',
        blueprints: 'agent_blueprints',
        users: 'cli_users',
        metrics: 'usage_metrics',
        documents: 'documentation',
      }
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
  };

  constructor() {
    // Create config directory in user's home directory
    const configDir = path.join(os.homedir(), '.nikcli');
    this.configPath = path.join(configDir, 'config.json');

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Load or create config
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        // Merge with defaults to ensure all fields exist
        this.config = { ...this.defaultConfig, ...configData };
      } else {
        this.config = { ...this.defaultConfig };
        this.saveConfig();
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Failed to load config, using defaults'));
      this.config = { ...this.defaultConfig };
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error(chalk.red('Error: Failed to save config'), error);
    }
  }

  get<K extends keyof ConfigType>(key: K): ConfigType[K] {
    return this.config[key];
  }

  set<K extends keyof ConfigType>(key: K, value: ConfigType[K]): void {
    this.config[key] = value;
    this.saveConfig();
  }

  getAll(): ConfigType {
    return { ...this.config };
  }

  setAll(newConfig: ConfigType): void {
    this.config = { ...newConfig };
    this.saveConfig();
  }

  // API Key management
  setApiKey(model: string, apiKey: string): void {
    if (!this.config.apiKeys) {
      this.config.apiKeys = {};
    }
    // Encrypt the API key before storing
    this.config.apiKeys[model] = KeyEncryption.encrypt(apiKey);
    this.saveConfig();
  }

  getApiKey(model: string): string | undefined {
    // First check config file
    if (this.config.apiKeys && this.config.apiKeys[model]) {
      // Decrypt the API key when retrieving
      return KeyEncryption.decrypt(this.config.apiKeys[model]);
    }

    // Then check environment variables
    const modelConfig = this.config.models[model];
    if (modelConfig) {
      switch (modelConfig.provider) {
        case 'openai':
          return process.env.OPENAI_API_KEY;
        case 'anthropic':
          return process.env.ANTHROPIC_API_KEY;
        case 'google':
          return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        case 'vercel':
          return process.env.V0_API_KEY;
        case 'gateway':
          return process.env.GATEWAY_API_KEY;
        case 'ollama':
          return undefined; // Ollama doesn't need API keys
      }
    }

    return undefined;
  }

  // Cloud documentation API keys
  getCloudDocsApiKeys(): { apiUrl?: string; apiKey?: string } {
    // Fallback to environment variables if config not loaded
    if (!this.config || !this.config.cloudDocs) {
      return {
        apiUrl: process.env.SUPABASE_URL,
        apiKey: process.env.SUPABASE_ANON_KEY
      };
    }

    const cloudDocsConfig = this.config.cloudDocs;

    return {
      apiUrl: cloudDocsConfig.apiUrl || process.env.SUPABASE_URL,
      apiKey: cloudDocsConfig.apiKey || process.env.SUPABASE_ANON_KEY
    };
  }

  // Model management
  setCurrentModel(model: string): void {
    if (!this.config.models[model]) {
      throw new Error(`Model ${model} not found in configuration`);
    }
    this.config.currentModel = model;
    this.saveConfig();
  }

  getCurrentModel(): string {
    return this.config.currentModel;
  }

  addModel(name: string, config: ModelConfig): void {
    this.config.models[name] = config;
    this.saveConfig();
  }

  removeModel(name: string): void {
    if (this.config.currentModel === name) {
      throw new Error('Cannot remove the currently active model');
    }
    delete this.config.models[name];
    this.saveConfig();
  }

  listModels(): Array<{
    name: string;
    config: ModelConfig;
    hasApiKey: boolean;
  }> {
    return Object.entries(this.config.models).map(([name, config]) => ({
      name,
      config,
      hasApiKey: !!this.getApiKey(name),
    }));
  }

  // Validation
  validateConfig(): boolean {
    try {
      ConfigSchema.parse(this.config);
      return true;
    } catch (error) {
      console.error(chalk.red('Config validation failed:'), error);
      return false;
    }
  }

  // Reset to defaults
  reset(): void {
    this.config = { ...this.defaultConfig };
    this.saveConfig();
  }

  // Export/Import
  export(): ConfigType {
    return { ...this.config };
  }

  getConfig(): ConfigType {
    return { ...this.config };
  }

  import(config: Partial<ConfigType>): void {
    this.config = { ...this.defaultConfig, ...config };
    this.saveConfig();
  }

  // Redis configuration management
  getRedisConfig(): ConfigType['redis'] {
    return this.config.redis;
  }

  setRedisConfig(config: Partial<ConfigType['redis']>): void {
    this.config.redis = { ...this.config.redis, ...config };
    this.saveConfig();
  }

  getRedisConnectionString(): string | null {
    const redisConfig = this.config.redis;
    if (!redisConfig.enabled) return null;

    const auth = redisConfig.password ? `:${redisConfig.password}@` : '';
    return `redis://${auth}${redisConfig.host}:${redisConfig.port}/${redisConfig.database}`;
  }

  // Supabase configuration management  
  getSupabaseConfig(): ConfigType['supabase'] {
    return this.config.supabase;
  }

  setSupabaseConfig(config: Partial<ConfigType['supabase']>): void {
    this.config.supabase = { ...this.config.supabase, ...config };
    this.saveConfig();
  }

  getSupabaseCredentials(): { url?: string; anonKey?: string; serviceRoleKey?: string } {
    const supabaseConfig = this.config.supabase;

    return {
      url: supabaseConfig.url || process.env.SUPABASE_URL,
      anonKey: supabaseConfig.anonKey || process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: supabaseConfig.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY
    };
  }
}

// Create and export singleton instance
export const simpleConfigManager = new SimpleConfigManager();

// Export aliases for compatibility
export const ConfigManager = SimpleConfigManager;
export const configManager = simpleConfigManager;
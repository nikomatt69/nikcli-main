export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'ollama' | 'vercel' | 'gateway' | 'openrouter';

export type OutputStyle =
  | 'production-focused'
  | 'concise'
  | 'detailed'
  | 'educational'
  | 'conversational'
  | 'technical';

export type SecurityMode = 'safe' | 'default' | 'developer';
export type ApprovalPolicy = 'strict' | 'moderate' | 'permissive';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ApprovalSetting = 'always' | 'risky' | 'never';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  enableReasoning?: boolean;
  reasoningMode?: 'auto' | 'explicit' | 'disabled';
  outputStyle?: OutputStyle;
}

export interface OutputStyleConfig {
  defaultStyle: OutputStyle;
  customizations: {
    verbosityLevel: number;
    includeCodeExamples: boolean;
    includeStepByStep: boolean;
    useDecorative: boolean;
    maxResponseLength: 'short' | 'medium' | 'long';
  };
  contextOverrides?: Partial<Record<string, OutputStyle>>;
  providerOverrides?: Partial<Record<ModelProvider, OutputStyle>>;
}

export interface ModelRoutingConfig {
  enabled: boolean;
  verbose: boolean;
  mode: 'conservative' | 'balanced' | 'aggressive';
}

export interface ReasoningConfig {
  enabled: boolean;
  autoDetect: boolean;
  showReasoningProcess: boolean;
  logReasoning: boolean;
}

export interface MCPServerConfig {
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled: boolean;
  environment?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  priority?: number;
  capabilities?: string[];
}

export interface ToolApprovalPolicies {
  fileOperations: ApprovalSetting;
  gitOperations: ApprovalSetting;
  packageOperations: ApprovalSetting;
  systemCommands: ApprovalSetting;
  networkRequests: ApprovalSetting;
}

export interface MiddlewareConfig {
  enabled: boolean;
  security: {
    enabled: boolean;
    priority: number;
    strictMode: boolean;
    requireApproval: boolean;
    riskThreshold: 'low' | 'medium' | 'high';
  };
  logging: {
    enabled: boolean;
    priority: number;
    logLevel: LogLevel;
    logToFile: boolean;
    sanitizeData: boolean;
    includeArgs: boolean;
    includeResponse: boolean;
  };
  validation: {
    enabled: boolean;
    priority: number;
    strictMode: boolean;
    validateArgs: boolean;
    validateContext: boolean;
    validateResponse: boolean;
    failOnValidationError: boolean;
  };
  performance: {
    enabled: boolean;
    priority: number;
    trackMemory: boolean;
    trackCpu: boolean;
    slowExecutionThreshold: number;
    reportSlowOperations: boolean;
    enableOptimizations: boolean;
  };
  audit: {
    enabled: boolean;
    priority: number;
    auditLevel: 'minimal' | 'standard' | 'comprehensive';
    enableCompliance: boolean;
    enableIntegrityChecks: boolean;
    dataRetentionDays: number;
    enableRealTimeAlerts: boolean;
  };
}

export interface SessionSettings {
  approvalTimeoutMs: number;
  devModeTimeoutMs: number;
  batchApprovalEnabled: boolean;
  autoApproveReadOnly: boolean;
}

export interface SandboxConfig {
  enabled: boolean;
  allowFileSystem: boolean;
  allowNetwork: boolean;
  allowCommands: boolean;
  trustedDomains: string[];
}

export interface RedisConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  database: number;
  keyPrefix: string;
  ttl: number;
  maxRetries: number;
  retryDelayMs: number;
  cluster: {
    enabled: boolean;
    nodes?: Array<{ host: string; port: number }>;
  };
  fallback: {
    enabled: boolean;
    strategy: 'memory' | 'file' | 'none';
  };
  strategies: {
    tokens: boolean;
    sessions: boolean;
    agents: boolean;
    documentation: boolean;
  };
}

export interface SupabaseConfig {
  enabled: boolean;
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  features: {
    database: boolean;
    storage: boolean;
    auth: boolean;
    realtime: boolean;
    vector: boolean;
  };
  tables: {
    sessions: string;
    blueprints: string;
    users: string;
    metrics: string;
    documents: string;
  };
}

export interface EmbeddingProviderConfig {
  default: 'openai' | 'google' | 'anthropic' | 'openrouter';
  fallbackChain: Array<'openai' | 'google' | 'anthropic' | 'openrouter'>;
  costOptimization: boolean;
  autoSwitchOnFailure: boolean;
}

export interface DiffConfig {
  enabled: boolean;
  style: 'unified' | 'side-by-side' | 'compact';
  theme: 'dark' | 'light' | 'auto';
  showLineNumbers: boolean;
  contextLines: number;
  syntaxHighlight: boolean;
  showStats: boolean;
  maxWidth: number;
  compactThreshold: number;
}

export interface NikCLIConfig {
  currentModel: string;
  temperature: number;
  maxTokens: number;
  chatHistory: boolean;
  maxHistoryLength: number;
  systemPrompt?: string;
  autoAnalyzeWorkspace: boolean;
  enableAutoApprove: boolean;
  preferredAgent?: string;
  outputStyle: OutputStyleConfig;
  models: Record<string, ModelConfig>;
  apiKeys?: Record<string, string>;
  environmentVariables: Record<string, string>;
  environmentSources: string[];
  modelRouting: ModelRoutingConfig;
  reasoning: ReasoningConfig;
  mcp?: Record<string, MCPServerConfig>;
  mcpServers?: Record<string, any>;
  maxConcurrentAgents: number;
  enableGuidanceSystem: boolean;
  defaultAgentTimeout: number;
  logLevel: LogLevel;
  requireApprovalForNetwork: boolean;
  approvalPolicy: ApprovalPolicy;
  embeddingProvider: EmbeddingProviderConfig;
  securityMode: SecurityMode;
  toolApprovalPolicies: ToolApprovalPolicies;
  middleware: MiddlewareConfig;
  sessionSettings: SessionSettings;
  sandbox: SandboxConfig;
  redis: RedisConfig;
  supabase: SupabaseConfig;
  cloudDocs: {
    enabled: boolean;
    provider: 'supabase' | 'firebase' | 'github';
    apiUrl?: string;
    apiKey?: string;
    autoSync: boolean;
    contributionMode: boolean;
    maxContextSize: number;
    autoLoadForAgents: boolean;
    smartSuggestions: boolean;
  };
  autoTodo: {
    requireExplicitTrigger: boolean;
  };
  diff: DiffConfig;
}

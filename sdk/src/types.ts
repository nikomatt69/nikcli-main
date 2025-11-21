/**
 * NikCLI Enterprise SDK - Type Definitions
 * Complete type system for all SDK functionalities
 */

// ============================================================================
// Core SDK Types
// ============================================================================

export interface SDKConfig {
  /** Working directory for operations */
  workingDirectory?: string;
  /** API keys configuration */
  apiKeys?: Record<string, string>;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Enable debug mode */
  debug?: boolean;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Temperature setting (0.0-2.0) */
  temperature?: number;
  /** Enable adaptive routing */
  adaptiveRouting?: boolean;
  /** Redis connection URL */
  redisUrl?: string;
  /** Upstash Vector configuration */
  upstashVector?: {
    url: string;
    token: string;
  };
  /** Supabase configuration */
  supabase?: {
    url: string;
    key: string;
  };
  /** Feature flags */
  features?: Record<string, boolean>;
}

export interface SDKResponse<T = any> {
  success: boolean;
  data?: T;
  error?: SDKError;
  metadata?: Record<string, any>;
}

export interface SDKError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

// ============================================================================
// Command Types
// ============================================================================

export interface CommandResult {
  output: string;
  exitCode: number;
  metadata?: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FileOperation {
  path: string;
  content?: string;
  encoding?: string;
}

export interface SearchOptions {
  pattern: string;
  directory?: string;
  caseSensitive?: boolean;
  includeHidden?: boolean;
  fileTypes?: string[];
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  handler: ToolHandler;
}

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
}

export type ToolHandler = (params: Record<string, any>) => Promise<any>;

export interface ToolExecutionResult {
  toolName: string;
  result: any;
  duration: number;
  error?: Error;
}

export interface FileToolOptions {
  backup?: boolean;
  createDirectories?: boolean;
  overwrite?: boolean;
  encoding?: string;
}

export interface SearchToolOptions {
  regex?: boolean;
  caseInsensitive?: boolean;
  maxResults?: number;
  includeLineNumbers?: boolean;
}

export interface BashToolOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
}

export interface VisionAnalysisOptions {
  model?: string;
  maxTokens?: number;
  detailLevel?: 'low' | 'medium' | 'high';
}

export interface ImageGenerationOptions {
  model?: string;
  size?: string;
  quality?: string;
  style?: string;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  systemPrompt?: string;
  tools?: string[];
  config?: Record<string, any>;
}

export interface AgentTask {
  id: string;
  description: string;
  context?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high';
  deadline?: Date;
}

export interface AgentResult {
  agentId: string;
  taskId: string;
  success: boolean;
  output: any;
  logs: string[];
  duration: number;
  tokensUsed?: number;
}

export interface AgentBlueprint {
  name: string;
  type: string;
  capabilities: string[];
  configuration: Record<string, any>;
}

export interface ParallelAgentConfig {
  agents: string[];
  task: string;
  mergeStrategy?: 'first' | 'all' | 'best';
}

// ============================================================================
// Planning Types
// ============================================================================

export interface ExecutionPlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  estimatedDuration?: number;
  risks?: RiskAssessment[];
}

export interface PlanStep {
  id: string;
  description: string;
  dependencies?: string[];
  estimatedDuration?: number;
  tools?: string[];
  agents?: string[];
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  description: string;
  mitigation?: string;
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// AI Provider Types
// ============================================================================

export interface AIModelConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface AICompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  systemPrompt?: string;
  tools?: ToolDefinition[];
}

export interface AICompletionResult {
  content: string;
  model: string;
  tokensUsed: number;
  finishReason: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  metadata?: Record<string, any>;
}

// ============================================================================
// Memory & RAG Types
// ============================================================================

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, any>;
  timestamp: Date;
  tags?: string[];
}

export interface MemorySearchOptions {
  query: string;
  limit?: number;
  filters?: Record<string, any>;
  threshold?: number;
}

export interface RAGSearchOptions {
  query: string;
  topK?: number;
  filters?: Record<string, any>;
  namespace?: string;
}

export interface RAGDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score?: number;
}

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
}

// ============================================================================
// Browser Automation Types
// ============================================================================

export interface BrowserSession {
  id: string;
  url: string;
  status: 'active' | 'idle' | 'closed';
  metadata?: Record<string, any>;
}

export interface BrowserNavigateOptions {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface BrowserClickOptions {
  selector: string;
  waitForSelector?: boolean;
  timeout?: number;
}

export interface BrowserTypeOptions {
  selector: string;
  text: string;
  delay?: number;
}

export interface BrowserScreenshotOptions {
  fullPage?: boolean;
  selector?: string;
  path?: string;
  type?: 'png' | 'jpeg';
}

export interface BrowserExtractOptions {
  selector?: string;
  attribute?: string;
}

// ============================================================================
// Web3 & Blockchain Types
// ============================================================================

export interface Web3Config {
  provider?: string;
  privateKey?: string;
  network?: string;
  rpcUrl?: string;
}

export interface WalletInfo {
  address: string;
  balance: string;
  network: string;
}

export interface TransferOptions {
  to: string;
  amount: string;
  token?: string;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  outcomes: string[];
  volume: number;
  endDate: Date;
}

export interface PolymarketBetOptions {
  marketId: string;
  outcome: string;
  amount: string;
}

export interface PolymarketPosition {
  marketId: string;
  outcome: string;
  shares: number;
  value: string;
}

// ============================================================================
// VM & Container Types
// ============================================================================

export interface VMConfig {
  type: 'repo' | 'os';
  repository?: string;
  os?: string;
  resources?: {
    cpu?: number;
    memory?: string;
    disk?: string;
  };
}

export interface VMInstance {
  id: string;
  status: 'creating' | 'running' | 'stopped' | 'failed';
  config: VMConfig;
  connection?: {
    host: string;
    port: number;
    credentials?: Record<string, string>;
  };
}

// ============================================================================
// CAD & Manufacturing Types
// ============================================================================

export interface CADGenerationOptions {
  description: string;
  format?: 'step' | 'stl' | 'obj';
  units?: 'mm' | 'cm' | 'in';
}

export interface CADResult {
  model: string;
  format: string;
  filePath: string;
  preview?: string;
}

export interface GCodeGenerationOptions {
  description: string;
  material?: string;
  toolDiameter?: number;
  feedRate?: number;
  spindleSpeed?: number;
}

export interface GCodeResult {
  gcode: string;
  filePath: string;
  estimatedTime?: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Service Types
// ============================================================================

export interface ServiceStatus {
  name: string;
  status: 'active' | 'inactive' | 'error';
  uptime?: number;
  lastError?: Error;
}

export interface DashboardMetrics {
  tokensUsed: number;
  requestsCount: number;
  averageLatency: number;
  errorRate: number;
  activeAgents: number;
  queueSize: number;
}

export interface NotificationOptions {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  title?: string;
  duration?: number;
}

export interface SubscriptionInfo {
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'inactive' | 'cancelled';
  features: string[];
  quota: QuotaInfo;
}

export interface QuotaInfo {
  tokensLimit: number;
  tokensUsed: number;
  requestsLimit: number;
  requestsUsed: number;
  resetDate: Date;
}

// ============================================================================
// Snapshot & State Types
// ============================================================================

export interface ProjectSnapshot {
  id: string;
  name: string;
  timestamp: Date;
  files: FileSnapshot[];
  metadata: Record<string, any>;
}

export interface FileSnapshot {
  path: string;
  content: string;
  hash: string;
  size: number;
}

// ============================================================================
// Background Job Types
// ============================================================================

export interface BackgroundJob {
  id: string;
  type: string;
  payload: any;
  status: 'queued' | 'running' | 'completed' | 'failed';
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: Error;
}

export interface JobOptions {
  priority?: number;
  retries?: number;
  timeout?: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Analytics & Monitoring Types
// ============================================================================

export interface UsageStats {
  totalTokens: number;
  totalRequests: number;
  totalDuration: number;
  modelUsage: Record<string, number>;
  toolUsage: Record<string, number>;
  errorCount: number;
}

export interface PerformanceMetrics {
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errorRate: number;
}

export interface TraceEvent {
  id: string;
  name: string;
  timestamp: Date;
  duration: number;
  attributes: Record<string, any>;
  parentId?: string;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthCredentials {
  email?: string;
  password?: string;
  token?: string;
}

export interface AuthSession {
  userId: string;
  token: string;
  expiresAt: Date;
  refreshToken?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  plan: string;
  createdAt: Date;
}

// ============================================================================
// Event Types
// ============================================================================

export type SDKEvent =
  | { type: 'tool.start'; toolName: string }
  | { type: 'tool.complete'; toolName: string; result: any }
  | { type: 'tool.error'; toolName: string; error: Error }
  | { type: 'agent.start'; agentId: string }
  | { type: 'agent.complete'; agentId: string; result: any }
  | { type: 'agent.error'; agentId: string; error: Error }
  | { type: 'chat.message'; message: ChatMessage }
  | { type: 'stream.chunk'; chunk: StreamChunk }
  | { type: 'job.queued'; job: BackgroundJob }
  | { type: 'job.complete'; job: BackgroundJob }
  | { type: 'notification'; notification: NotificationOptions };

export type SDKEventHandler = (event: SDKEvent) => void | Promise<void>;

// ============================================================================
// Advanced Features
// ============================================================================

export interface ContextWindow {
  tokens: number;
  messages: ChatMessage[];
  metadata: Record<string, any>;
}

export interface TokenOptimization {
  strategy: 'cache' | 'compress' | 'summarize';
  threshold: number;
}

export interface SemanticCacheConfig {
  enabled: boolean;
  threshold: number;
  ttl?: number;
}

export interface LoadBalancingConfig {
  strategy: 'round-robin' | 'least-loaded' | 'adaptive';
  providers: string[];
}

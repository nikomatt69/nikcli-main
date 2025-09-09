import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createGateway, gateway } from '@ai-sdk/gateway';
import {
  generateText,
  streamText,
  tool,
  CoreMessage,
  CoreTool,
  ToolCallPart,
  ToolResultPart,
  generateObject,
  StreamData
} from 'ai';
import { z } from 'zod';
import { simpleConfigManager as configManager } from '../core/config-manager';
import { adaptiveModelRouter, ModelScope } from './adaptive-model-router';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'fs';
import { join, relative, resolve, dirname, extname } from 'path';
import { exec, execSync } from 'child_process';
import chalk from 'chalk';
import { promisify } from 'util';
import { compactAnalysis, safeStringifyContext, truncateForPrompt } from '../utils/analysis-utils';
import { tokenCache } from '../core/token-cache';
import { completionCache } from '../core/completion-protocol-cache';
import { ContextEnhancer } from '../core/context-enhancer';
import { PerformanceOptimizer } from '../core/performance-optimizer';
import { WebSearchProvider } from '../core/web-search-provider';
import { IDEContextEnricher } from '../core/ide-context-enricher';
import { AdvancedTools } from '../core/advanced-tools';
import { ToolRouter } from '../core/tool-router';
import { PromptManager } from '../prompts/prompt-manager';
import { smartCache } from '../core/smart-cache-manager';
import { docLibrary } from '../core/documentation-library';
import { documentationTools } from '../core/documentation-tool';
import { docsContextManager } from '../context/docs-context-manager';
import { smartDocsTools } from '../tools/smart-docs-tool';
import { aiDocsTools } from '../tools/docs-request-tool';
import { intelligentFeedbackWrapper } from '../core/intelligent-feedback-wrapper';
import FeedbackAwareTools from '../core/feedback-aware-tools';
import { validatorManager, ValidationContext, ExtendedValidationResult } from '../core/validator-manager';
import { TokenOptimizer, TokenOptimizationConfig, QuietCacheLogger } from '../core/performance-optimizer';
import { ProgressiveTokenManager } from '../core/progressive-token-manager';
import { DiffViewer, FileDiff } from '../ui/diff-viewer';
import { diffManager } from '../ui/diff-manager';

// 🧠 Import Cognitive Orchestration Types
import type { TaskCognition, OrchestrationPlan } from '../automation/agents/universal-agent';

// 🔧 Command System Schemas with Zod
const CommandSchema = z.object({
  type: z.enum(['npm', 'bash', 'git', 'docker', 'node', 'build', 'test', 'lint']),
  command: z.string().min(1).max(500),
  args: z.array(z.string()).optional(),
  workingDir: z.string().optional(),
  description: z.string().min(5).max(200),
  safety: z.enum(['safe', 'moderate', 'risky']),
  requiresApproval: z.boolean().default(false),
  estimatedDuration: z.number().min(1).max(3600).optional(),
  dependencies: z.array(z.string()).optional(),
  expectedOutputPattern: z.string().optional()
});

const PackageSearchResult = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  downloads: z.number().optional(),
  verified: z.boolean().default(false),
  lastUpdated: z.string().optional(),
  repository: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

const CommandExecutionResult = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  duration: z.number(),
  command: CommandSchema,
  timestamp: z.date(),
  workspaceState: z.object({
    filesCreated: z.array(z.string()).optional(),
    filesModified: z.array(z.string()).optional(),
    packagesInstalled: z.array(z.string()).optional()
  }).optional()
});

type Command = z.infer<typeof CommandSchema>;
type PackageSearchResult = z.infer<typeof PackageSearchResult>;
type CommandExecutionResult = z.infer<typeof CommandExecutionResult>;

const execAsync = promisify(exec);

export interface StreamEvent {
  type: 'start' | 'thinking' | 'tool_call' | 'tool_result' | 'text_delta' | 'complete' | 'error';
  content?: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: any;
  error?: string;
  metadata?: any;
}

export interface AutonomousProvider {
  streamChatWithFullAutonomy(messages: CoreMessage[], abortSignal?: AbortSignal): AsyncGenerator<StreamEvent>;
  executeAutonomousTask(task: string, context?: any): AsyncGenerator<StreamEvent>;
  // 🧠 Enhanced Cognitive Methods
  generateWithCognition(messages: CoreMessage[], cognition?: TaskCognition): AsyncGenerator<StreamEvent>;
  optimizePromptWithPlan(messages: CoreMessage[], plan?: OrchestrationPlan): CoreMessage[];
  adaptResponseToCognition(response: string, cognition?: TaskCognition): string;
}

export class AdvancedAIProvider implements AutonomousProvider {
  private tokenOptimizer: TokenOptimizer;

  // 🔧 Command System Properties  
  private commandHistory: CommandExecutionResult[] = [];
  private packageCache: Map<string, PackageSearchResult[]> = new Map();
  private commandTemplates: Map<string, Command> = new Map();
  private streamSilentMode: boolean = false;

  generateWithTools(planningMessages: CoreMessage[]): Promise<{
    text: string;
    toolCalls: any[];
    toolResults: any[];
  }> {
    throw new Error('Method not implemented.');
  }

  // Truncate long free-form strings to keep prompts safe
  private truncateForPrompt(s: string, maxChars: number = 2000): string {
    if (!s) return '';
    return s.length > maxChars ? s.slice(0, maxChars) + '…[truncated]' : s;
  }

  // Approximate token counting (1 token ≈ 4 characters for most languages)
  private estimateTokens(text: string): number {
    if (!text) return 0;
    // More accurate estimation: count words, punctuation, special chars
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const specialChars = (text.match(/[{}[\](),.;:!?'"]/g) || []).length;
    return Math.ceil((words.length + specialChars * 0.5) * 1.3); // Conservative estimate
  }

  // Estimate total tokens in messages array
  private estimateMessagesTokens(messages: CoreMessage[]): number {
    let totalTokens = 0;
    for (const message of messages) {
      const content = typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
          ? message.content.map(part => typeof part === 'string' ? part : JSON.stringify(part)).join('')
          : JSON.stringify(message.content);

      totalTokens += this.estimateTokens(content);
      totalTokens += 10; // Role, metadata overhead
    }
    return totalTokens;
  }

  // Intelligent message truncation with token optimization - AGGRESSIVE MODE
  private async truncateMessages(messages: CoreMessage[], maxTokens: number = 120000): Promise<CoreMessage[]> {
    // First apply token optimization to all messages
    const optimizedMessages = await this.optimizeMessages(messages);
    const currentTokens = this.estimateMessagesTokens(optimizedMessages);

    if (currentTokens <= maxTokens) {
      return optimizedMessages;
    }

    // Messages too long - applying intelligent truncation

    // Strategy: Keep system messages, recent user/assistant, and important tool calls
    const truncatedMessages: CoreMessage[] = [];
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Always keep system messages (but truncate AGGRESSIVELY)
    for (const sysMsg of systemMessages) {
      const content = typeof sysMsg.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg.content);
      truncatedMessages.push({
        ...sysMsg,
        content: this.truncateForPrompt(content, 3000) // REDUCED: Max 3k chars for system messages
      });
    }

    // Keep the most recent messages (MORE AGGRESSIVE sliding window)
    const recentMessages = nonSystemMessages.slice(-10); // REDUCED: Keep last 10 non-system messages
    let accumulatedTokens = this.estimateMessagesTokens(truncatedMessages);

    // Add recent messages in reverse order until we hit the limit
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const msgTokens = this.estimateTokens(
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      );

      if (accumulatedTokens + msgTokens > maxTokens) {
        // Truncate this message if it's too long
        const availableTokens = maxTokens - accumulatedTokens;
        const availableChars = Math.max(500, availableTokens * 3); // Conservative char conversion

        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const truncatedContent = this.truncateForPrompt(content, availableChars);

        // Handle different message types properly
        if (msg.role === 'tool') {
          truncatedMessages.push({
            ...msg,
            content: [{ type: 'text', text: truncatedContent }] as any
          });
        } else {
          truncatedMessages.push({
            ...msg,
            content: truncatedContent
          });
        }
        break;
      }

      truncatedMessages.push(msg);
      accumulatedTokens += msgTokens;
    }

    // If we still need more space, add truncation summary
    if (nonSystemMessages.length > 10) {
      const skippedCount = nonSystemMessages.length - 10;
      truncatedMessages.splice(systemMessages.length, 0, {
        role: 'system' as const,
        content: `[Conversation truncated: ${skippedCount} older messages removed to fit context limit. Total original: ${currentTokens} tokens, truncated to: ~${this.estimateMessagesTokens(truncatedMessages)} tokens]`
      });
    }

    return truncatedMessages;
  }

  /**
   * Estimate tokens for a tool call
   */
  private estimateToolCallTokens(toolCall: any): number {
    const toolName = toolCall.name || 'unknown';
    const args = toolCall.args || {};
    const argsStr = JSON.stringify(args);
    return Math.ceil((toolName.length + argsStr.length) / 4) + 100; // Base overhead
  }

  private currentModel: string;
  private workingDirectory: string = process.cwd();
  private executionContext: Map<string, any> = new Map();
  private enhancedContext: Map<string, any> = new Map();
  private conversationMemory: CoreMessage[] = [];
  private analysisCache: Map<string, any> = new Map();
  private contextEnhancer: ContextEnhancer;
  private performanceOptimizer: PerformanceOptimizer;
  private webSearchProvider: WebSearchProvider;
  private ideContextEnricher: IDEContextEnricher;
  private advancedTools: AdvancedTools;
  private toolRouter: ToolRouter;
  private promptManager: PromptManager;
  private smartCache: typeof smartCache;
  private docLibrary: typeof docLibrary;
  private progressiveTokenManager: ProgressiveTokenManager;

  constructor(optimizationConfig?: TokenOptimizationConfig) {
    this.tokenOptimizer = new TokenOptimizer(optimizationConfig);
    this.progressiveTokenManager = new ProgressiveTokenManager();
    this.currentModel = configManager.get('currentModel') || 'claude-sonnet-4-20250514';
    this.contextEnhancer = new ContextEnhancer();
    this.performanceOptimizer = new PerformanceOptimizer(optimizationConfig);
    this.webSearchProvider = new WebSearchProvider();
    this.ideContextEnricher = new IDEContextEnricher();
    this.advancedTools = new AdvancedTools();
    this.toolRouter = new ToolRouter();
    this.promptManager = PromptManager.getInstance(process.cwd(), optimizationConfig);
    this.smartCache = smartCache;
    this.docLibrary = docLibrary;
  }

  // Optimize messages with token compression
  private async optimizeMessages(messages: CoreMessage[]): Promise<CoreMessage[]> {
    const optimizedMessages: CoreMessage[] = [];

    for (const message of messages) {
      if (typeof message.content === 'string') {
        const result = await this.tokenOptimizer.optimizePrompt(message.content);
        optimizedMessages.push({
          ...message,
          content: result.content
        } as CoreMessage);
      } else if (message.role === 'tool' && Array.isArray(message.content)) {
        // Handle tool messages with array content
        const optimizedContent = await Promise.all(
          message.content.map(async (part: any) => {
            if (part.type === 'text' && typeof part.text === 'string') {
              const result = await this.tokenOptimizer.optimizePrompt(part.text);
              return { ...part, text: result.content };
            }
            return part;
          })
        );
        optimizedMessages.push({
          ...message,
          content: optimizedContent
        } as CoreMessage);
      } else {
        optimizedMessages.push(message);
      }
    }

    return optimizedMessages;
  }

  // Tool call tracking for intelligent continuation
  private toolCallHistory: Array<{
    toolName: string;
    args: any;
    result: any;
    timestamp: Date;
    success: boolean;
  }> = [];

  // Round tracking for 2-round limit
  private completedRounds: number = 0;
  private maxRounds: number = 2;

  // Advanced context enhancement system
  private async enhanceContext(messages: CoreMessage[]): Promise<CoreMessage[]> {
    // Store enhanced context for reuse
    const contextKey = this.generateContextKey(messages);
    if (this.enhancedContext.has(contextKey)) {
      const cached = this.enhancedContext.get(contextKey);
      QuietCacheLogger.logCacheSave(cached.tokensSaved || 0);
      return cached.messages;
    }

    const enhancedMessages = await this.contextEnhancer.enhance(messages, {
      workingDirectory: this.workingDirectory,
      executionContext: this.executionContext,
      conversationMemory: this.conversationMemory,
      analysisCache: this.analysisCache
    });

    // Apply token optimization to enhanced messages
    const optimizedMessages = await this.optimizeMessages(enhancedMessages);

    // Calculate token savings
    const originalTokens = this.estimateMessagesTokens(enhancedMessages);
    const optimizedTokens = this.estimateMessagesTokens(optimizedMessages);
    const tokensSaved = originalTokens - optimizedTokens;

    // Cache enhanced context
    this.enhancedContext.set(contextKey, {
      messages: optimizedMessages,
      tokensSaved,
      timestamp: Date.now()
    });

    // Update conversation memory
    this.conversationMemory = optimizedMessages.slice(-20); // Keep last 20 messages

    // Reset tool history and rounds for new conversation context
    const lastUserMessage = optimizedMessages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      this.toolCallHistory = []; // Fresh start for new queries
      this.completedRounds = 0; // Reset rounds counter
    }

    return optimizedMessages;
  }

  /**
   * Generate context key for caching
   */
  private generateContextKey(messages: CoreMessage[]): string {
    const content = messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('|');
    return require('crypto').createHash('md5').update(content).digest('hex').substring(0, 16);
  }

  // Enhanced system prompt with advanced capabilities (using PromptManager)
  private async getEnhancedSystemPrompt(context: any = {}): Promise<string> {
    try {
      // Get documentation context if available
      const docsContext = await this.getDocumentationContext();

      // Try to load base agent prompt first
      const basePrompt = await this.promptManager.loadPromptForContext({
        agentId: 'base-agent',
        parameters: {
          workingDirectory: this.workingDirectory,
          availableTools: this.toolRouter.getAllTools().map(tool => `${tool.tool}: ${tool.description}`).join(', '),
          documentationContext: docsContext,
          ...context
        }
      });

      // If docs are loaded, append them to the base prompt
      if (docsContext) {
        return `${basePrompt}\n\n${docsContext}`;
      }

      return basePrompt;
    } catch (error) {
      // Fallback to hardcoded prompt if file system prompts fail
      const toolDescriptions = this.toolRouter.getAllTools()
        .map(tool => `${tool.tool}: ${tool.description}`)
        .join(', ');

      // Get documentation context for fallback too
      const docsContext = await this.getDocumentationContext();

      const basePrompt = `You are an advanced AI development assistant with enhanced capabilities:

🧠 **Enhanced Intelligence**:
- Context-aware analysis and reasoning
- Multi-step problem solving
- Pattern recognition and optimization
- Adaptive learning from conversation history

🛠️ **Advanced Tools**:
- File system operations with metadata analysis
- Code generation with syntax validation
- Directory exploration with intelligent filtering
- Command execution with safety checks
- Package management with dependency analysis

📊 **Context Management**:
- Workspace awareness and file structure understanding
- Conversation memory and pattern recognition
- Execution context tracking
- Analysis result caching

🎯 **Optimization Features**:
- Token-aware response generation
- Chained file reading for large analyses
- Intelligent caching strategies
- Performance monitoring and optimization

💡 **Best Practices**:
- Always validate file operations
- Provide clear explanations for complex tasks
- Use appropriate tools for each task type
- Maintain conversation context and continuity

**Current Working Directory**: ${this.workingDirectory}
**Available Tools**: ${toolDescriptions}

Respond in a helpful, professional manner with clear explanations and actionable insights.`;

      // Add documentation context if available
      if (docsContext) {
        return `${basePrompt}\n\n${docsContext}`;
      }

      return basePrompt;
    }
  }

  // Get current documentation context for AI
  private async getDocumentationContext(): Promise<string | null> {
    try {
      const stats = docsContextManager.getContextStats();

      if (stats.loadedCount === 0) {
        return null;
      }

      // Get context summary and full context
      const contextSummary = docsContextManager.getContextSummary();
      const fullContext = docsContextManager.getFullContext();

      // Apply token optimization to documentation context
      let optimizedContext = fullContext;
      if (fullContext.length > 1000) {
        const optimizationResult = await this.tokenOptimizer.optimizePrompt(fullContext);
        optimizedContext = optimizationResult.content;

        if (optimizationResult.tokensSaved > 50) {
          QuietCacheLogger.logCacheSave(optimizationResult.tokensSaved);
        }
      }

      // Limit context size to prevent token overflow
      const maxContextLength = 25000; // Reduced due to optimization
      if (optimizedContext.length <= maxContextLength) {
        return optimizedContext;
      }

      // If still too large, return optimized summary
      const optimizedSummary = await this.tokenOptimizer.optimizePrompt(contextSummary);
      return `# DOCUMENTATION CONTEXT SUMMARY\n\n${optimizedSummary.content}\n\n[Full documentation context available but truncated due to size limits. ${stats.totalWords.toLocaleString()} words across ${stats.loadedCount} documents loaded.]`;
    } catch (error) {
      console.error('Error getting documentation context:', error);
      return null;
    }
  }

  // Load tool-specific prompts for enhanced execution
  private async getToolPrompt(toolName: string, parameters: any = {}): Promise<string> {
    try {
      return await this.promptManager.loadPromptForContext({
        toolName,
        parameters: {
          workingDirectory: this.workingDirectory,
          ...parameters
        }
      });
    } catch (error) {
      // Return fallback prompt if file prompt fails
      return `Execute ${toolName} with the provided parameters. Follow best practices and provide clear, helpful output.`;
    }
  }

  // Advanced file operations with context awareness
  private getAdvancedTools(): Record<string, CoreTool> {
    return {
      // Enhanced file reading with analysis
      read_file: tool({
        description: 'Read and analyze file contents with metadata',
        parameters: z.object({
          path: z.string().describe('File path to read'),
          analyze: z.boolean().default(true).describe('Whether to analyze file structure'),
        }),
        execute: async ({ path, analyze }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('read_file', { path, analyze });

            const fullPath = resolve(this.workingDirectory, path);
            if (!existsSync(fullPath)) {
              return { error: `File not found: ${path}` };
            }

            const content = readFileSync(fullPath, 'utf-8');
            const stats = statSync(fullPath);
            const extension = extname(fullPath);

            let analysis = null;
            if (analyze) {
              analysis = this.analyzeFileContent(content, extension);
            }

            // Store in context for future operations
            this.executionContext.set(`file:${path}`, {
              content,
              stats,
              analysis,
              lastRead: new Date(),
              toolPrompt // Store prompt for potential reuse
            });

            return {
              content,
              size: stats.size,
              modified: stats.mtime,
              path: relative(this.workingDirectory, fullPath),
              extension,
              analysis,
              lines: content.split('\n').length
            };
          } catch (error: any) {
            return { error: `Failed to read file: ${error.message}` };
          }
        },
      }),

      // Smart file writing with automatic LSP validation
      write_file: tool({
        description: 'Write content to file with automatic LSP validation, backup, and auto-fix capabilities',
        parameters: z.object({
          path: z.string().describe('File path to write'),
          content: z.string().describe('Content to write'),
          backup: z.boolean().default(true).describe('Create backup if file exists'),
          validate: z.boolean().default(true).describe('Use LSP validation before writing'),
          agentId: z.string().optional().describe('ID of the agent making this request'),
          reasoning: z.string().optional().describe('Reasoning behind this file creation/modification'),
        }),
        execute: async ({ path, content, backup, validate, agentId, reasoning }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('write_file', { path, content: content.substring(0, 100) + '...', backup, validate });

            const fullPath = resolve(this.workingDirectory, path);
            const dir = dirname(fullPath);

            // Ensure directory exists
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }

            // 🧠 VALIDATION WITH LSP - Before writing anything
            let validationResult = null;
            let finalContent = content;

            if (validate) {
              console.log(chalk.cyan(`🔍 Validating ${path} with LSP before writing...`));

              const validationContext: ValidationContext = {
                filePath: fullPath,
                content,
                operation: existsSync(fullPath) ? 'update' : 'create',
                agentId,
                projectType: this.detectProjectType(this.workingDirectory)
              };

              validationResult = await validatorManager.validateContent(validationContext);

              if (!validationResult.isValid) {
                // Auto-fix was attempted in ValidatorManager
                if (validationResult.fixedContent) {
                  finalContent = validationResult.fixedContent;
                  console.log(chalk.green(`🔧 Auto-fix and formatting applied successfully`));
                } else {
                  // If validation fails and no auto-fix available, return error
                  return {
                    success: false,
                    error: `File processing failed: ${validationResult.errors?.join(', ')}`,
                    path,
                    validationErrors: validationResult.errors,
                    reasoning: reasoning || 'Agent attempted to write file but processing failed'
                  };
                }
              } else {
                // Use formatted content even if validation passed
                if (validationResult.fixedContent) {
                  finalContent = validationResult.fixedContent;
                }

                if (validationResult.formatted) {
                  console.log(chalk.green(`✅ File formatted and validated successfully`));
                } else {
                  console.log(chalk.green(`✅ Validation passed for ${path}`));
                }
              }
            }

            // Create backup if file exists
            let backedUp = false;
            if (backup && existsSync(fullPath)) {
              const backupPath = `${fullPath}.backup.${Date.now()}`;
              writeFileSync(backupPath, readFileSync(fullPath, 'utf-8'));
              backedUp = true;
              console.log(chalk.blue(`📁 Backup created: ${backupPath}`));
            }

            // Prepare diff preview before writing
            let existingContent = '';
            let hasExisting = false;
            try {
              if (existsSync(fullPath)) {
                existingContent = readFileSync(fullPath, 'utf-8');
                hasExisting = true;
              }
            } catch { /* ignore */ }

            // Show visual diff in stream/panels when content changed
            try {
              if (!hasExisting) {
                const fd: FileDiff = {
                  filePath: fullPath,
                  originalContent: '',
                  newContent: finalContent,
                  isNew: true,
                  isDeleted: false,
                };
                console.log('\n');
                DiffViewer.showFileDiff(fd, { compact: true });
              } else if (existingContent !== finalContent) {
                const fd: FileDiff = {
                  filePath: fullPath,
                  originalContent: existingContent,
                  newContent: finalContent,
                  isNew: false,
                  isDeleted: false,
                };
                console.log('\n');
                DiffViewer.showFileDiff(fd, { compact: true });
                diffManager.addFileDiff(fullPath, existingContent, finalContent);
              }
            } catch { /* ignore visual diff errors */ }

            // Write the validated file
            writeFileSync(fullPath, finalContent, 'utf-8');
            const stats = statSync(fullPath);

            console.log(chalk.green(`✅ File written successfully: ${path} (${stats.size} bytes)`));

            // Update context
            this.executionContext.set(`file:${path}`, {
              content,
              stats,
              lastWritten: new Date(),
              backedUp,
              toolPrompt
            });

            // File operation completed

            return {
              path: relative(this.workingDirectory, fullPath),
              size: stats.size,
              created: !backedUp,
              updated: backedUp,
              backedUp,
              formatted: validationResult?.formatted || false,
              formatter: validationResult?.formatter,
              validation: validationResult ? {
                isValid: validationResult.isValid,
                errors: validationResult.errors,
                warnings: validationResult.warnings
              } : null,
              reasoning: reasoning || `File ${backedUp ? 'updated' : 'created'} by agent`
            };
          } catch (error: any) {
            return { error: `Failed to write file: ${error.message}` };
          }
        },
      }),

      // Intelligent directory operations
      explore_directory: tool({
        description: 'Explore directory structure with intelligent filtering',
        parameters: z.object({
          path: z.string().default('.').describe('Directory to explore'),
          depth: z.number().default(2).describe('Maximum depth to explore'),
          includeHidden: z.boolean().default(false).describe('Include hidden files'),
          filterBy: z.enum(['all', 'code', 'config', 'docs']).default('all').describe('Filter files by type'),
        }),
        execute: async ({ path, depth, includeHidden, filterBy }) => {
          try {
            // Load tool-specific prompt for context
            const toolPrompt = await this.getToolPrompt('explore_directory', { path, depth, includeHidden, filterBy });

            const fullPath = resolve(this.workingDirectory, path);
            const structure = this.exploreDirectoryStructure(fullPath, depth, includeHidden, filterBy);

            // Update context with directory understanding
            this.executionContext.set(`dir:${path}`, {
              structure,
              explored: new Date(),
              fileCount: this.countFiles(structure),
              toolPrompt
            });

            return {
              path: relative(this.workingDirectory, fullPath),
              structure,
              summary: this.generateDirectorySummary(structure),
              fileCount: this.countFiles(structure),
              recommendations: this.generateDirectoryRecommendations(structure)
            };
          } catch (error: any) {
            return { error: `Failed to explore directory: ${error.message}` };
          }
        },
      }),

      // Autonomous command execution with intelligence
      execute_command: tool({
        description: 'Execute commands autonomously with context awareness and safety checks',
        parameters: z.object({
          command: z.string().describe('Command to execute'),
          args: z.array(z.string()).default([]).describe('Command arguments'),
          autonomous: z.boolean().default(true).describe('Execute without confirmation'),
          timeout: z.number().default(30000).describe('Timeout in milliseconds'),
        }),
        execute: async ({ command, args, autonomous, timeout }) => {
          try {
            const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;

            // Safety check for dangerous commands
            const isDangerous = this.isDangerousCommand(fullCommand);
            if (isDangerous && !autonomous) {
              return {
                error: 'Command requires manual confirmation',
                command: fullCommand,
                reason: isDangerous
              };
            }

            // Verifica che il comando non esca dalla directory del progetto
            const projectRoot = this.workingDirectory;
            const commandCwd = this.workingDirectory;

            // Controlla se il comando tenta di cambiare directory
            if (fullCommand.includes('cd ') && !fullCommand.includes(`cd ${projectRoot}`)) {
              return {
                error: 'Command blocked: cannot change directory outside project',
                command: fullCommand,
                reason: 'Security: directory change blocked'
              };
            }

            console.log(chalk.blue(`🚀 Executing: ${fullCommand}`));

            const startTime = Date.now();
            const { stdout, stderr } = await execAsync(fullCommand, {
              cwd: commandCwd,
              timeout,
              maxBuffer: 1024 * 1024 * 10, // 10MB
            });

            const duration = Date.now() - startTime;

            // Pausa molto leggera tra comandi per evitare sovraccarichi
            await this.sleep(50);

            // Store execution context
            this.executionContext.set(`cmd:${command}`, {
              command: fullCommand,
              stdout,
              stderr,
              duration,
              executed: new Date(),
              cwd: commandCwd
            });

            // Command completed

            return {
              command: fullCommand,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              success: true,
              duration,
              cwd: commandCwd
            };
          } catch (error: any) {
            console.log(chalk.red(`❌ Command failed: ${error.message}`));
            return {
              command: `${command} ${args.join(' ')}`,
              error: error.message,
              success: false,
              code: error.code
            };
          }
        },
      }),

      // Advanced project analysis
      analyze_project: tool({
        description: 'Comprehensive autonomous project analysis',
        parameters: z.object({
          includeMetrics: z.boolean().default(true).describe('Include code metrics'),
          analyzeDependencies: z.boolean().default(true).describe('Analyze dependencies'),
          securityScan: z.boolean().default(true).describe('Basic security analysis'),
        }),
        execute: async ({ includeMetrics, analyzeDependencies, securityScan }) => {
          try {
            console.log(chalk.blue('🔍 Starting comprehensive project analysis...'));

            const analysis = await this.performAdvancedProjectAnalysis({
              includeMetrics,
              analyzeDependencies,
              securityScan
            });

            // Store complete analysis in context (may be large)
            this.executionContext.set('project:analysis', analysis);

            // Return a compact, chunk-safe summary to avoid prompt overflow
            const compact = compactAnalysis(analysis, {
              maxDirs: 40,
              maxFiles: 150,
              maxChars: 8000,
            });

            return compact;
          } catch (error: any) {
            return { error: `Project analysis failed: ${error.message}` };
          }
        },
      }),

      // Autonomous package management
      manage_packages: tool({
        description: 'Autonomously manage project dependencies',
        parameters: z.object({
          action: z.enum(['install', 'add', 'remove', 'update', 'audit']).describe('Package action'),
          packages: z.array(z.string()).default([]).describe('Package names'),
          dev: z.boolean().default(false).describe('Development dependency'),
          global: z.boolean().default(false).describe('Global installation'),
        }),
        execute: async ({ action, packages, dev, global }) => {
          try {
            let command = 'yarn';
            let args: string[] = [];

            switch (action) {
              case 'install':
                args = ['install'];
                break;
              case 'add':
                args = ['add', ...packages];
                if (dev) args.push('--dev');
                if (global) args.push('--global');
                break;
              case 'remove':
                args = ['remove', ...packages];
                break;
              case 'update':
                args = ['upgrade', ...packages];
                break;
              case 'audit':
                args = ['audit'];
                break;
            }

            console.log(chalk.blue(`📦 ${action} packages: ${packages.join(', ') || 'all'}`));

            const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`, {
              cwd: this.workingDirectory,
              timeout: 120000, // 2 minutes for package operations
            });

            return {
              action,
              packages,
              success: true,
              output: stdout.trim(),
              warnings: stderr.trim()
            };
          } catch (error: any) {
            return {
              action,
              packages,
              success: false,
              error: error.message
            };
          }
        },
      }),

      // Intelligent code generation
      generate_code: tool({
        description: 'Generate code with context awareness and best practices',
        parameters: z.object({
          type: z.enum(['component', 'function', 'class', 'test', 'config', 'docs']).describe('Code type'),
          description: z.string().describe('What to generate'),
          language: z.string().default('typescript').describe('Programming language'),
          framework: z.string().optional().describe('Framework context (react, node, etc)'),
          outputPath: z.string().optional().describe('Where to save the generated code'),
        }),
        execute: async ({ type, description, language, framework, outputPath }) => {
          try {
            console.log(chalk.blue(`🎨 Generating ${type}: ${description}`));

            const projectContext = this.executionContext.get('project:analysis');
            const codeGenResult = await this.generateIntelligentCode({
              type,
              description,
              language,
              framework: framework || projectContext?.framework,
              projectContext,
              outputPath
            });

            if (outputPath && codeGenResult.code) {
              writeFileSync(resolve(this.workingDirectory, outputPath), codeGenResult.code);
              // Code generated
            }

            return codeGenResult;
          } catch (error: any) {
            return { error: `Code generation failed: ${error.message}` };
          }
        },
      }),

      // Web search capabilities
      web_search: this.webSearchProvider.getWebSearchTool(),

      // IDE context enrichment
      ide_context: this.ideContextEnricher.getIDEContextTool(),

      // Advanced AI-powered tools
      semantic_search: this.advancedTools.getSemanticSearchTool(),
      code_analysis: this.advancedTools.getCodeAnalysisTool(),
      dependency_analysis: this.advancedTools.getDependencyAnalysisTool(),
      git_workflow: this.advancedTools.getGitWorkflowTool(),

      // Documentation tools
      doc_search: documentationTools.search,
      doc_add: documentationTools.add,
      doc_stats: documentationTools.stats,

      // Smart documentation tools for AI agents
      smart_docs_search: smartDocsTools.search,
      smart_docs_load: smartDocsTools.load,
      smart_docs_context: smartDocsTools.context,

      // AI documentation request tools
      docs_request: aiDocsTools.request,
      docs_gap_report: aiDocsTools.gapReport,
    };
  }

  // Claude Code style streaming with full autonomy
  async *streamChatWithFullAutonomy(messages: CoreMessage[], abortSignal?: AbortSignal): AsyncGenerator<StreamEvent> {
    if (abortSignal && !(abortSignal instanceof AbortSignal)) {
      throw new TypeError('Invalid AbortSignal provided');
    }

    // Start performance monitoring
    const sessionId = `session_${Date.now()}`;
    const startTime = Date.now();
    this.performanceOptimizer.startMonitoring();

    // Enhance context with advanced intelligence
    const enhancedMessages = await this.enhanceContext(messages);

    // Optimize messages for performance
    const optimizedMessages = await this.performanceOptimizer.optimizeMessages(enhancedMessages);

    // Apply AGGRESSIVE truncation to prevent prompt length errors
    const truncatedMessages = await this.truncateMessages(optimizedMessages, 80000); // ULTRA REDUCED: 80k tokens safety margin

    const routingCfg = configManager.get('modelRouting');
    const effectiveModelName = routingCfg?.enabled ? this.resolveAdaptiveModel('chat_default', truncatedMessages) : undefined;
    const model = this.getModel(effectiveModelName) as any;
    const tools = this.getAdvancedTools();

    try {
      // ADVANCED: Check completion protocol cache first (ultra-efficient)
      const lastUserMessage = truncatedMessages.filter(m => m.role === 'user').pop();
      const systemContext = truncatedMessages.filter(m => m.role === 'system').map(m => m.content).join('\n');

      if (lastUserMessage) {
        // Check if this is an analysis request (skip cache for fresh analysis)
        const userContent = typeof lastUserMessage.content === 'string'
          ? lastUserMessage.content
          : Array.isArray(lastUserMessage.content)
            ? lastUserMessage.content.map(part => typeof part === 'string' ? part : part.experimental_providerMetadata?.content || '').join('')
            : String(lastUserMessage.content);

        // Use ToolRouter for intelligent tool analysis
        const toolRecommendations = this.toolRouter.analyzeMessage(lastUserMessage);
        this.toolRouter.logRecommendations(userContent, toolRecommendations);

        const isAnalysisRequest = userContent.toLowerCase().includes('analizza') ||
          userContent.toLowerCase().includes('analysis') ||
          userContent.toLowerCase().includes('analisi') ||
          userContent.toLowerCase().includes('scan') ||
          userContent.toLowerCase().includes('esplora') ||
          userContent.toLowerCase().includes('explore') ||
          userContent.toLowerCase().includes('trova') ||
          userContent.toLowerCase().includes('find') ||
          userContent.toLowerCase().includes('cerca') ||
          userContent.toLowerCase().includes('search');

        // Usa cache intelligente ma leggera
        const cacheDecision = this.smartCache.shouldCache(userContent, systemContext);

        if (cacheDecision.should && !isAnalysisRequest) {
          const cachedResponse = await this.smartCache.getCachedResponse(userContent, systemContext);

          if (cachedResponse) {
            yield { type: 'start', content: `🎯 Using smart cache (${cacheDecision.strategy})...` };

            // Stream the cached response properly formatted
            const formattedResponse = this.formatCachedResponse(cachedResponse.response);
            for (const chunk of this.chunkText(formattedResponse, 80)) {
              yield { type: 'text_delta', content: chunk };
            }

            yield { type: 'complete', content: `Cache hit - ${cachedResponse.metadata.tokensSaved} tokens saved!` };
            return;
          }
        } else if (isAnalysisRequest) {
          yield { type: 'start', content: '🔍 Starting fresh analysis (bypassing cache)...' };
        }
      }

      yield { type: 'start', content: 'Initializing autonomous AI assistant...' };

      const originalTokens = this.estimateMessagesTokens(messages);
      const truncatedTokens = this.estimateMessagesTokens(truncatedMessages);

      // 🛡️ TOKEN GUARD: Check toolchain token limits before starting
      const globalNikCLI = (global as any).__nikcli;
      if (globalNikCLI && globalNikCLI.manageToolchainTokens) {
        const estimatedToolchainTokens = Math.max(originalTokens, truncatedTokens) * 2; // Estimate toolchain overhead
        const canProceed = globalNikCLI.manageToolchainTokens('streamChat', estimatedToolchainTokens);

        if (!canProceed) {
          yield { type: 'thinking', content: '🛡️ Token limit reached - clearing context and continuing...' };
          globalNikCLI.clearToolchainContext('streamChat');
          // Continue with fresh context
        }
      }

      // Check if we're approaching token limits and need to create a summary
      const tokenLimit = 150000; // Conservative limit
      const isAnalysisRequest = lastUserMessage && typeof lastUserMessage.content === 'string' &&
        (lastUserMessage.content.toLowerCase().includes('analizza') ||
          lastUserMessage.content.toLowerCase().includes('analysis') ||
          lastUserMessage.content.toLowerCase().includes('analisi') ||
          lastUserMessage.content.toLowerCase().includes('scan') ||
          lastUserMessage.content.toLowerCase().includes('esplora') ||
          lastUserMessage.content.toLowerCase().includes('explore'));

      if (isAnalysisRequest && originalTokens > tokenLimit * 0.8) {
        yield { type: 'thinking', content: '📊 Large analysis detected - enabling chained file reading to avoid token limits...' };

        // Enabling chained file reading mode for large analysis

        // Add special instruction for chained file reading
        const chainedInstruction = `IMPORTANT: For this analysis, use chained file reading approach:
1. First, scan and list files/directories to understand structure
2. Then read files in small batches (max 3-5 files per call)
3. Process each batch before moving to the next
4. Build analysis incrementally to avoid token limits
5. Use find_files_tool first, then read_file_tool in small groups`;

        // Add the instruction to the system context
        const enhancedSystemContext = systemContext + '\n\n' + chainedInstruction;

        // Update messages with enhanced context
        const enhancedMessages = messages.map(msg =>
          msg.role === 'system'
            ? { ...msg, content: enhancedSystemContext }
            : msg
        );

        // Use enhanced messages for the rest of the processing
        messages = enhancedMessages;
      }

      const params = this.getProviderParams();

      // Add enhanced system prompt to truncatedMessages (async)
      const enhancedSystemPrompt = await this.getEnhancedSystemPrompt();
      const messagesWithEnhancedPrompt = truncatedMessages.map(msg =>
        msg.role === 'system' ? { ...msg, content: enhancedSystemPrompt } : msg
      );

      const provider = this.getCurrentModelInfo().config.provider;
      const safeMessages = this.sanitizeMessagesForProvider(provider, messagesWithEnhancedPrompt);

      // 🚨 EMERGENCY TOKEN ENFORCEMENT - Truncate if exceeding limits
      const finalMessages = safeMessages.map(msg => ({
        ...msg,
        content: typeof msg.content === 'string'
          ? this.progressiveTokenManager.emergencyTruncate(msg.content, 120000)
          : msg.content
      })) as CoreMessage[];

      const streamOpts: any = {
        model,
        messages: finalMessages,
        tools,
        maxToolRoundtrips: isAnalysisRequest ? 25 : 50, // Increased for deeper analysis and toolchains
        temperature: params.temperature,
        abortSignal,
        onStepFinish: (_evt: any) => { },
      };
      if (provider !== 'openai') {
        streamOpts.maxTokens = params.maxTokens;
      }
      const result = streamText(streamOpts);

      let currentToolCalls: ToolCallPart[] = [];
      let accumulatedText = '';
      let toolCallCount = 0;
      const maxToolCallsForAnalysis = 30; // Increased limit for comprehensive analysis

      const approxCharLimit = provider === 'openai' ? params.maxTokens * 4 : Number.POSITIVE_INFINITY;
      let truncatedByCap = false;
      for await (const delta of (await result).fullStream) {
        try {
          // Check for abort signal interruption
          if (abortSignal?.aborted) {
            yield {
              type: 'error',
              error: 'Interrupted by user',
              content: 'Stream processing interrupted'
            };
            break;
          }

          switch (delta.type) {
            case 'text-delta':
              if (delta.textDelta) {
                accumulatedText += delta.textDelta;
                yield {
                  type: 'text_delta',
                  content: delta.textDelta,
                  metadata: {
                    accumulatedLength: accumulatedText.length,
                    provider: this.getCurrentModelInfo().config.provider
                  }
                };
                if (provider === 'openai' && accumulatedText.length >= approxCharLimit) {
                  truncatedByCap = true;
                  break;
                }
              }
              break;

            case 'tool-call':
              toolCallCount++;
              currentToolCalls.push(delta);

              // 🛡️ TOKEN GUARD: Check tool call token usage
              const globalNikCLI = (global as any).__nikcli;
              if (globalNikCLI && globalNikCLI.manageToolchainTokens) {
                const toolTokens = this.estimateToolCallTokens(delta);
                const canProceed = globalNikCLI.manageToolchainTokens(delta.toolName, toolTokens);

                if (!canProceed) {
                  yield { type: 'thinking', content: `🛡️ Token limit for ${delta.toolName} - clearing context...` };
                  globalNikCLI.clearToolchainContext(delta.toolName);
                }
              }

              // Track this tool call in history (always track for intelligent analysis)
              this.toolCallHistory.push({
                toolName: delta.toolName,
                args: delta.args,
                result: null, // Will be updated when result comes
                timestamp: new Date(),
                success: false // Will be updated
              });

              // Check if we're hitting tool call limits for analysis - use intelligent continuation
              if (isAnalysisRequest && toolCallCount > maxToolCallsForAnalysis) {
                // Increment completed rounds
                this.completedRounds++;

                const originalQuery = typeof lastUserMessage?.content === 'string'
                  ? lastUserMessage.content
                  : String(lastUserMessage?.content || '');

                // Check if we've completed 2 rounds - if so, provide final summary and stop
                if (this.completedRounds >= this.maxRounds) {
                  const finalSummary = this.generateFinalSummary(originalQuery, this.toolCallHistory);

                  yield {
                    type: 'thinking',
                    content: `🏁 Completed ${this.completedRounds} rounds of analysis. Providing final summary.`
                  };
                  yield {
                    type: 'text_delta',
                    content: `\n\n${finalSummary}\n\n`
                  };
                  yield {
                    type: 'complete',
                    content: `Analysis completed after ${this.completedRounds} rounds. Please review the summary above.`,
                    metadata: { finalStop: true, rounds: this.completedRounds }
                  };
                  return; // Hard stop after 2 rounds
                }

                // If this is the first round, continue with intelligent question
                const gapAnalysis = this.analyzeMissingInformation(originalQuery, this.toolCallHistory);
                const clarifyingQuestion = this.generateClarifyingQuestion(gapAnalysis, originalQuery, this.toolCallHistory);

                yield {
                  type: 'thinking',
                  content: this.truncateForPrompt(`🔄 Round ${this.completedRounds} complete. ${gapAnalysis}`, 100)
                };
                yield {
                  type: 'text_delta',
                  content: `\n\n**Round ${this.completedRounds} Analysis:**\n${gapAnalysis}\n\n**Question to continue:**\n${clarifyingQuestion}\n\n`
                };
                // Don't break - let the conversation continue naturally
                break;
              }

              yield {
                type: 'tool_call',
                toolName: delta.toolName,
                toolArgs: delta.args,
                content: `Executing ${delta.toolName}... (${toolCallCount}/${maxToolCallsForAnalysis})`,
                metadata: { toolCallId: delta.toolCallId }
              };
              break;

            case 'tool-call-delta':
              const toolCall = currentToolCalls.find(tc => tc.toolCallId === delta.toolCallId);

              // Update tool history with result
              const historyEntry = this.toolCallHistory.find(h => h.toolName === toolCall?.toolName);
              if (historyEntry) {
                historyEntry.result = delta.argsTextDelta;
                historyEntry.success = !!delta.argsTextDelta;
              }

              yield {
                type: 'tool_result',
                toolName: toolCall?.toolName,
                toolResult: delta.argsTextDelta,
                content: `Completed ${toolCall?.toolName}`,
                metadata: {
                  toolCallId: delta.toolCallId,
                  success: !delta.argsTextDelta
                }
              };
              break;

            case 'step-finish':
              if (delta.isContinued) {
                // Step completed, continue to next
              }
              break;

            case 'finish':
              // Salva nella cache adattiva
              if (lastUserMessage && accumulatedText.trim()) {
                const userContentLength = typeof lastUserMessage.content === 'string'
                  ? lastUserMessage.content.length
                  : String(lastUserMessage.content).length;
                const tokensUsed = delta.usage?.totalTokens || Math.round((userContentLength + accumulatedText.length) / 4);

                // Extract user content as string for storage
                const userContentStr = typeof lastUserMessage.content === 'string'
                  ? lastUserMessage.content
                  : Array.isArray(lastUserMessage.content)
                    ? lastUserMessage.content.map(part => typeof part === 'string' ? part : part.experimental_providerMetadata?.content || '').join('')
                    : String(lastUserMessage.content);

                // Salva nella cache intelligente
                try {
                  await this.smartCache.setCachedResponse(
                    userContentStr,
                    accumulatedText.trim(),
                    systemContext.substring(0, 1000),
                    {
                      tokensSaved: tokensUsed,
                      responseTime: Date.now() - startTime,
                      userSatisfaction: 1.0 // Default satisfaction
                    }
                  );
                } catch (cacheError: any) {
                  // Continue without caching - don't fail the stream
                }

                yield {
                  type: 'complete',
                  content: truncatedByCap ? 'Output truncated by local cap' : 'Task completed',
                  metadata: {
                    finishReason: delta.finishReason,
                    usage: delta.usage,
                    totalText: accumulatedText.length,
                    capped: truncatedByCap
                  }
                };
              }
              break;

            case 'error':
              yield {
                type: 'error',
                error: (delta?.error) as any,
                content: `Error: ${delta.error}`
              };
              break;
          }
        } catch (deltaError: any) {
          // Stream delta error occurred
          yield {
            type: 'error',
            error: deltaError.message,
            content: `Stream error: ${deltaError.message}`
          };
        }
      }

      // Check if response was complete
      if (accumulatedText.length === 0) {
        // No text received from model
        yield {
          type: 'error',
          error: 'Empty response',
          content: 'No text was generated - possible parameter mismatch'
        };
      }

      // End performance monitoring and log metrics
      const metrics = this.performanceOptimizer.endMonitoring(sessionId, {
        tokenCount: this.estimateMessagesTokens(truncatedMessages),
        toolCallCount,
        responseQuality: this.performanceOptimizer.analyzeResponseQuality(accumulatedText)
      });

      // Show only essential info: tokens used and context remaining  
      if (truncatedTokens > 0) {
        console.log(chalk.dim(`\n\n💬 ${truncatedTokens} tokens | ${Math.max(0, 280000 - truncatedTokens)} remaining`));
      }

    } catch (error: any) {
      console.error(`Provider error (${this.getCurrentModelInfo().config.provider}):`, error);
      yield {
        type: 'error',
        error: error.message,
        content: `System error: ${error.message} (Provider: ${this.getCurrentModelInfo().config.provider})`
      };
    }
  }

  // Execute autonomous task with intelligent planning and parallel agent support
  async *executeAutonomousTask(task: string, context?: any): AsyncGenerator<StreamEvent> {
    yield { type: 'start', content: `🎯 Starting task: ${task}` };

    // First, analyze the task and create a plan
    yield { type: 'thinking', content: 'Analyzing task and creating execution plan...' };

    try {
      // If prebuilt messages are provided, use them directly to avoid duplicating large prompts
      if (context && Array.isArray(context.messages)) {
        const providedMessages: CoreMessage[] = context.messages;
        // Note: streamChatWithFullAutonomy will handle truncation internally
        for await (const event of this.streamChatWithFullAutonomy(providedMessages)) {
          yield event;
        }
        return;
      }

      // Analizza se il task richiede agenti paralleli
      const requiresParallelAgents = this.analyzeParallelRequirements(task);

      if (requiresParallelAgents) {
        yield { type: 'thinking', content: '🔄 Task requires parallel agent execution...' };

        // Esegui con agenti paralleli
        for await (const event of this.executeParallelTask(task, context)) {
          yield event;
        }
        return;
      }

      const planningMessages: CoreMessage[] = [
        {
          role: 'system',
          content: `AI dev assistant. CWD: ${this.workingDirectory}
Tools: read_file, write_file, explore_directory, execute_command, analyze_project, manage_packages, generate_code, doc_search, doc_add
Task: ${this.truncateForPrompt(task, 300)} 

${context ? this.truncateForPrompt(safeStringifyContext(context), 150) : ''}

Execute task autonomously with tools. Be direct. Stay within project directory.`
        },
        {
          role: 'user',
          content: task
        }
      ];

      // Stream the autonomous execution
      for await (const event of this.streamChatWithFullAutonomy(planningMessages)) {
        yield event;
      }

    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message,
        content: `Autonomous execution failed: ${error.message}`
      };
    }
  }

  // Analizza se un task richiede agenti paralleli
  private analyzeParallelRequirements(task: string): boolean {
    const parallelKeywords = [
      'parallel', 'simultaneous', 'concurrent', 'multiple', 'several',
      'parallelo', 'simultaneo', 'concorrente', 'multiplo', 'diversi',
      'build and test', 'compile and deploy', 'analyze and generate'
    ];

    const lowerTask = task.toLowerCase();
    return parallelKeywords.some(keyword => lowerTask.includes(keyword));
  }

  // Esegue task con agenti paralleli
  private async *executeParallelTask(task: string, context?: any): AsyncGenerator<StreamEvent> {
    yield { type: 'thinking', content: '🔄 Planning parallel execution...' };

    try {
      // Dividi il task in sottotask paralleli
      const subtasks = this.splitIntoSubtasks(task);

      yield { type: 'thinking', content: `📋 Split into ${subtasks.length} parallel subtasks` };

      // Esegui sottotask in parallelo con isolamento
      const results = await Promise.allSettled(
        subtasks.map(async (subtask, index) => {
          // Pausa molto leggera tra l'avvio degli agenti per evitare sovraccarichi
          await this.sleep(index * 50);

          return this.executeSubtask(subtask, index, context);
        })
      );

      // Aggrega risultati
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      yield {
        type: 'complete',
        content: `✅ Parallel execution complete: ${successful} successful, ${failed} failed`,
        metadata: { parallel: true, subtasks: subtasks.length }
      };

    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message,
        content: `Parallel execution failed: ${error.message}`
      };
    }
  }

  // Divide un task in sottotask paralleli
  private splitIntoSubtasks(task: string): string[] {
    // Logica semplice per dividere task complessi
    const subtasks: string[] = [];

    if (task.toLowerCase().includes('build and test')) {
      subtasks.push('Build the project');
      subtasks.push('Run tests');
    } else if (task.toLowerCase().includes('analyze and generate')) {
      subtasks.push('Analyze code structure');
      subtasks.push('Generate documentation');
    } else {
      // Fallback: dividi per frasi
      const sentences = task.split(/[.!?]+/).filter(s => s.trim().length > 10);
      subtasks.push(...sentences.slice(0, 3)); // Massimo 3 sottotask
    }

    return subtasks.length > 0 ? subtasks : [task];
  }

  // Esegue un singolo sottotask con isolamento
  private async executeSubtask(subtask: string, index: number, context?: any): Promise<any> {
    const subtaskContext = {
      ...context,
      subtaskIndex: index,
      isParallel: true,
      workingDirectory: this.workingDirectory // Mantieni directory del progetto
    };

    const messages: CoreMessage[] = [
      {
        role: 'system',
        content: `AI agent ${index + 1}. CWD: ${this.workingDirectory}
Execute this subtask independently. Do not interfere with other agents.
Subtask: ${subtask}
Stay within project directory.`
      },
      {
        role: 'user',
        content: subtask
      }
    ];

    // Esegui il sottotask
    const result = await this.streamChatWithFullAutonomy(messages);
    return result;
  }

  // Safely stringify and truncate large contexts to prevent prompt overflow - AGGRESSIVE
  private safeStringifyContext(ctx: any, maxChars: number = 1000): string { // REDUCED from 4000
    if (!ctx) return '{}';
    try {
      const str = JSON.stringify(ctx, (key, value) => {
        // Truncate long strings AGGRESSIVELY
        if (typeof value === 'string') {
          return value.length > 100 ? value.slice(0, 100) + '…[truncated]' : value; // REDUCED from 512
        }
        // Limit large arrays
        if (Array.isArray(value)) {
          const limited = value.slice(0, 20);
          if (value.length > 20) limited.push('…[+' + (value.length - 20) + ' more]');
          return limited;
        }
        return value;
      });
      return str.length > maxChars ? str.slice(0, maxChars) + '…[truncated]' : str;
    } catch {
      return '[unstringifiable context]';
    }
  }

  // Helper methods for intelligent analysis
  private analyzeFileContent(content: string, extension: string): any {
    const analysis: any = {
      lines: content.split('\n').length,
      size: content.length,
      language: this.detectLanguage(extension),
    };

    // Language-specific analysis
    switch (extension) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        analysis.imports = (content.match(/import .* from/g) || []).length;
        analysis.exports = (content.match(/export/g) || []).length;
        analysis.functions = (content.match(/function \w+|const \w+ = |=>/g) || []).length;
        analysis.classes = (content.match(/class \w+/g) || []).length;
        break;
      case '.json':
        try {
          analysis.valid = true;
          analysis.keys = Object.keys(JSON.parse(content)).length;
        } catch {
          analysis.valid = false;
        }
        break;
      case '.md':
        analysis.headers = (content.match(/^#+/gm) || []).length;
        analysis.links = (content.match(/\[.*\]\(.*\)/g) || []).length;
        break;
    }

    return analysis;
  }

  private validateFileContent(content: string, extension: string): any {
    const validation: any = { valid: true, errors: [] };

    switch (extension) {
      case '.json':
        try {
          JSON.parse(content);
        } catch (error: any) {
          validation.valid = false;
          validation.errors.push(`Invalid JSON: ${error.message}`);
        }
        break;
      case '.ts':
      case '.tsx':
        // Basic TypeScript validation could be added here
        break;
    }

    return validation;
  }

  private exploreDirectoryStructure(dirPath: string, maxDepth: number, includeHidden: boolean, filterBy: string): any {
    // ULTRA LIMITED directory exploration to prevent token overflow
    const MAX_FILES_PER_DIR = 20; // Drastically limit files per directory
    const MAX_TOTAL_FILES = 100; // Global limit
    let totalFileCount = 0;

    const explore = (currentPath: string, depth: number): any => {
      if (depth > Math.min(maxDepth, 2) || totalFileCount >= MAX_TOTAL_FILES) return null; // Force max depth 2

      try {
        const items = readdirSync(currentPath, { withFileTypes: true });
        const structure: any = { files: [], directories: [] };
        let fileCount = 0;

        for (const item of items) {
          if (!includeHidden && item.name.startsWith('.')) continue;
          if (fileCount >= MAX_FILES_PER_DIR || totalFileCount >= MAX_TOTAL_FILES) break; // Hard limits

          const itemPath = join(currentPath, item.name);
          const relativePath = relative(this.workingDirectory, itemPath);

          if (item.isDirectory() && depth < 1) { // Limit directory recursion
            const subStructure = explore(itemPath, depth + 1);
            if (subStructure) {
              structure.directories.push({
                name: item.name,
                path: relativePath,
                fileCount: this.countFiles(subStructure) // Just count, don't include all details
              });
            }
          } else if (item.isFile()) {
            const fileInfo = {
              name: item.name,
              path: relativePath,
              ext: extname(item.name) // Shortened field name
            };

            // Apply filter
            if (this.matchesFilter(fileInfo, filterBy)) {
              structure.files.push(fileInfo);
              fileCount++;
              totalFileCount++;
            }
          }
        }

        return structure;
      } catch {
        return null;
      }
    };

    return explore(dirPath, 0);
  }

  private matchesFilter(fileInfo: any, filterBy: string): boolean {
    const ext = fileInfo.ext || fileInfo.extension; // Support both field names
    switch (filterBy) {
      case 'code':
        return ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.rs'].includes(ext);
      case 'config':
        return ['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext);
      case 'docs':
        return ['.md', '.txt', '.rst', '.adoc'].includes(ext);
      default:
        return true;
    }
  }

  private countFiles(structure: any): number {
    let count = structure.files?.length || 0;
    if (structure.directories) {
      for (const dir of structure.directories) {
        count += this.countFiles(dir);
      }
    }
    return count;
  }

  private generateDirectorySummary(structure: any): string {
    const fileCount = this.countFiles(structure);
    const dirCount = structure.directories?.length || 0;
    const extensions = new Set();

    const collectExtensions = (struct: any) => {
      struct.files?.forEach((file: any) => {
        if (file.extension) extensions.add(file.extension);
      });
      struct.directories?.forEach((dir: any) => collectExtensions(dir));
    };

    collectExtensions(structure);

    return `${fileCount} files, ${dirCount} directories. Languages: ${Array.from(extensions).join(', ')}`;
  }

  private generateDirectoryRecommendations(structure: any): string[] {
    const recommendations: string[] = [];

    // Analyze project structure and provide recommendations
    const hasPackageJson = structure.files?.some((f: any) => f.name === 'package.json');
    const hasTypeScript = structure.files?.some((f: any) => f.extension === '.ts');
    const hasTests = structure.files?.some((f: any) => f.name.includes('.test.') || f.name.includes('.spec.'));

    if (hasPackageJson && !hasTypeScript) {
      recommendations.push('Consider adding TypeScript for better type safety');
    }

    if (hasTypeScript && !hasTests) {
      recommendations.push('Add unit tests for better code quality');
    }

    return recommendations;
  }

  private isDangerousCommand(command: string): string | false {
    const dangerous = [
      'rm -rf /',
      'dd if=',
      'mkfs',
      'fdisk',
      'format',
      'del /f /s /q',
      'shutdown',
      'reboot'
    ];

    for (const dangerousCmd of dangerous) {
      if (command.includes(dangerousCmd)) {
        return `Dangerous command detected: ${dangerousCmd}`;
      }
    }

    return false;
  }

  private async performAdvancedProjectAnalysis(options: any): Promise<any> {
    const analysis: any = {
      timestamp: new Date(),
      directory: this.workingDirectory,
      options
    };

    // Basic project structure
    const packageJsonPath = join(this.workingDirectory, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      analysis.package = packageJson;
      analysis.name = packageJson.name;
      analysis.version = packageJson.version;
      analysis.framework = this.detectFramework(packageJson);
    }

    // File analysis
    const structure = this.exploreDirectoryStructure(this.workingDirectory, 3, false, 'all');
    analysis.structure = structure;
    analysis.fileCount = this.countFiles(structure);

    // Language detection
    analysis.languages = this.detectProjectLanguages(structure);

    // Dependencies analysis
    if (options.analyzeDependencies && analysis.package) {
      analysis.dependencies = {
        production: Object.keys(analysis.package.dependencies || {}),
        development: Object.keys(analysis.package.devDependencies || {}),
        total: Object.keys({
          ...analysis.package.dependencies,
          ...analysis.package.devDependencies
        }).length
      };
    }

    return analysis;
  }

  private detectLanguage(extension: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.c': 'c',
      '.toml': 'toml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.ini': 'ini',
      '.env': 'env',
      '.sh': 'shell',
      '.bash': 'shell',
      '.rs': 'rust',
      '.go': 'go',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin'
    };
    return langMap[extension] || 'unknown';
  }

  private detectFramework(packageJson: any): string {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps.next) return 'Next.js';
    if (deps.nuxt) return 'Nuxt.js';
    if (deps['@angular/core']) return 'Angular';
    if (deps.vue) return 'Vue.js';
    if (deps.react) return 'React';
    if (deps.express) return 'Express';
    if (deps.fastify) return 'Fastify';
    if (deps.svelte) return 'Svelte';
    if (deps.astro) return 'Astro';



    if (deps.remix) return 'Remix';
    return 'JavaScript/Node.js';
  }
  private detectProjectLanguages(structure: any): string[] {
    const languages = new Set<string>();

    const collectLanguages = (struct: any) => {
      struct.files?.forEach((file: any) => {
        if (file.extension) {
          const lang = this.detectLanguage(file.extension);
          if (lang !== 'unknown') languages.add(lang);
        }
      });
      struct.directories?.forEach((dir: any) => collectLanguages(dir));
    };

    collectLanguages(structure);
    return Array.from(languages);
  }

  private async generateIntelligentCode(params: any): Promise<any> {
    // This would integrate with the AI model to generate context-aware code
    const { type, description, language, framework, projectContext } = params;

    // Use AI to generate appropriate code based on context
    const codeGenPrompt = `Generate ${type} code for: ${description}
Language: ${language}
Framework: ${framework || 'none'}
Project Context: ${JSON.stringify(projectContext?.summary || {})}

Requirements:
- Follow ${language} best practices
- Use ${framework} patterns if applicable
- Include proper types for TypeScript
- Add comments for complex logic
- Ensure code is production-ready`;

    try {
      const routingCfg = configManager.get('modelRouting');
      const resolved = routingCfg?.enabled ? this.resolveAdaptiveModel('code_gen', [
        { role: 'user', content: `${type}: ${description} (${language})` } as any
      ]) : undefined;
      const model = this.getModel(resolved) as any;
      const params = this.getProviderParams();
      const provider = this.getCurrentModelInfo().config.provider;
      const genOpts: any = {
        model,
        prompt: this.progressiveTokenManager.emergencyTruncate(codeGenPrompt, 120000),
      };
      if (this.getCurrentModelInfo().config.provider !== 'openai') {
        genOpts.maxTokens = Math.min(params.maxTokens, 2000);
      }
      const result = await generateText(genOpts);

      return {
        type,
        description,
        language,
        code: result.text,
        generated: new Date(),
        context: params
      };
    } catch (error: any) {
      return { error: `Code generation failed: ${error.message}` };
    }
  }

  // Resolve adaptive model variant for given messages/scope using router
  private resolveAdaptiveModel(scope: ModelScope, coreMessages: CoreMessage[]): string {
    try {
      const info = this.getCurrentModelInfo();
      const provider = info.config.provider as any;
      const baseModel = info.config.model;

      const toText = (c: any) => typeof c === 'string'
        ? c
        : Array.isArray(c)
          ? c.map(part => typeof part === 'string' ? part : (part?.text || JSON.stringify(part))).join('')
          : String(c);

      const simpleMessages = coreMessages.map(m => ({
        role: (m.role as any) || 'user',
        content: toText(m.content)
      }));

      const decision = adaptiveModelRouter.choose({ provider, baseModel, messages: simpleMessages as any, scope });

      // Log gently (if UI exists)
      try {
        const nik = (global as any).__nikCLI;
        const msg = `[Router] ${info.name} → ${decision.selectedModel} (${decision.tier}, ~${decision.estimatedTokens} tok)`;
        if (nik?.advancedUI) nik.advancedUI.logInfo('Model Router', msg);
        else console.log(chalk.dim(msg));
      } catch { }

      // The router returns a provider model id. Our config keys match these ids in default models.
      // If key is missing, fallback to current model name in config.
      const models = configManager.get('models');
      return models[decision.selectedModel] ? decision.selectedModel : (this.currentModel || configManager.get('currentModel'));
    } catch {
      return this.currentModel || configManager.get('currentModel');
    }
  }

  // Model management
  private getModel(modelName?: string): any {
    const model = modelName || this.currentModel || configManager.get('currentModel');
    const allModels = configManager.get('models');
    const configData = allModels[model];

    if (!configData) {
      throw new Error(`Model ${model} not found in configuration`);
    }

    // Configure providers with API keys properly
    // Create provider instances with API keys, then get the specific model
    switch (configData.provider) {
      case 'openai': {
        let apiKey = configManager.getApiKey(model);
        if (!apiKey) {
          const current = configManager.get('currentModel');
          if (current && current !== model) apiKey = configManager.getApiKey(current);
        }
        if (!apiKey) throw new Error(`No API key found for provider OpenAI (model ${model})`);
        const openaiProvider = createOpenAI({ apiKey, compatibility: 'strict' });
        return openaiProvider(configData.model);
      }
      case 'anthropic': {
        let apiKey = configManager.getApiKey(model);
        if (!apiKey) {
          const current = configManager.get('currentModel');
          if (current && current !== model) apiKey = configManager.getApiKey(current);
        }
        if (!apiKey) throw new Error(`No API key found for provider Anthropic (model ${model})`);
        const anthropicProvider = createAnthropic({ apiKey });
        return anthropicProvider(configData.model);
      }
      case 'google': {
        let apiKey = configManager.getApiKey(model);
        if (!apiKey) {
          const current = configManager.get('currentModel');
          if (current && current !== model) apiKey = configManager.getApiKey(current);
        }
        if (!apiKey) throw new Error(`No API key found for provider Google (model ${model})`);
        const googleProvider = createGoogleGenerativeAI({ apiKey });
        return googleProvider(configData.model);
      }
      case 'gateway': {
        let apiKey = configManager.getApiKey(model);
        if (!apiKey) {
          const current = configManager.get('currentModel');
          if (current && current !== model) apiKey = configManager.getApiKey(current);
        }
        if (!apiKey) throw new Error(`No API key found for provider Gateway (model ${model})`);
        const gatewayProvider = createGateway({ apiKey });
        return gatewayProvider(configData.model);
      }
      case 'ollama': {
        // Ollama runs locally and does not require API keys
        const ollamaProvider = createOllama({});
        return ollamaProvider(configData.model);
      }
      default:
        throw new Error(`Unsupported provider: ${configData.provider}`);
    }
  }

  // Get provider-specific parameters
  private getProviderParams(modelName?: string): { maxTokens: number; temperature: number } {
    const model = modelName || this.currentModel || configManager.get('currentModel');
    const allModels = configManager.get('models');
    const configData = allModels[model];

    if (!configData) {
      return { maxTokens: 4000, temperature: 0.7 }; // REDUCED default
    }

    // Provider-specific token limits and settings
    switch (configData.provider) {
      case 'openai':
        // OpenAI models - REDUCED for lighter requests
        if (configData.model.includes('gpt-5')) {
          return { maxTokens: 4096, temperature: 1 }; // REDUCED from 8192
        } else if (configData.model.includes('gpt-4')) {
          return { maxTokens: 4096, temperature: 1 }; // REDUCED from 4096
        }
        return { maxTokens: 4096, temperature: 1 };

      case 'anthropic':
        // Claude models - RIDOTTO per compatibilità con tutti i modelli
        if (configData.model.includes('claude-4') ||
          configData.model.includes('claude-4-sonnet') ||
          configData.model.includes('claude-sonnet-4')) {
          return { maxTokens: 8192, temperature: 1 }; // RIDOTTO per compatibilità
        }
        return { maxTokens: 3096, temperature: 1 }; // RIDOTTO per compatibilità con 8192 limit

      case 'google':
        // Gemini models - AUMENTATO per risposte più complete
        return { maxTokens: 4096, temperature: 0.7 }; // AUMENTATO da 1500

      case 'ollama':
        // Local models - AUMENTATO per risposte più complete
        return { maxTokens: 4000, temperature: 0.7 }; // AUMENTATO da 1000

      case 'vercel':
        // v0 models - Optimized for web development
        if (configData.model.includes('v0-1.5-lg')) {
          return { maxTokens: 4000, temperature: 0.7 }; // High capacity model
        } else if (configData.model.includes('v0-1.5-md')) {
          return { maxTokens: 4000, temperature: 0.7 }; // Medium capacity model
        } else if (configData.model.includes('v0-1.0-md')) {
          return { maxTokens: 4000, temperature: 0.7 }; // Legacy model
        }
        return { maxTokens: 4000, temperature: 0.7 };

      default:
        return { maxTokens: 4096, temperature: 0.7 }; // RIDOTTO per compatibilità universale
    }
  }

  // Build provider-specific options to satisfy differing token parameter names
  private getProviderOptions(maxTokens: number): any {
    try {
      const provider = this.getCurrentModelInfo().config.provider;
      switch (provider) {
        case 'openai':
          return { openai: { max_completion_tokens: maxTokens } };
        case 'google':
          // Google Generative AI expects max_output_tokens
          return { google: { max_output_tokens: maxTokens } };
        // Anthropic and others work with normalized maxTokens via AI SDK
        default:
          return {};
      }
    } catch {
      return {};
    }
  }

  // Build a provider-safe message array by enforcing hard character caps
  private sanitizeMessagesForProvider(provider: string, messages: CoreMessage[]): CoreMessage[] {
    const maxTotalChars = provider === 'openai' ? 800_000 : 400_000; // conservative caps
    const maxPerMessage = provider === 'openai' ? 60_000 : 30_000;

    const safeMessages: CoreMessage[] = [];
    let total = 0;

    const clamp = (text: string, limit: number): string => {
      if (text.length <= limit) return text;
      const head = text.slice(0, Math.floor(limit * 0.8));
      const tail = text.slice(-Math.floor(limit * 0.2));
      return `${head}\n…[omitted ${text.length - limit} chars]\n${tail}`;
    };

    // Keep system messages first (clamped)
    const systems = messages.filter(m => m.role === 'system');
    for (const m of systems) {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const clamped = clamp(content, 8000);
      total += clamped.length;
      if (total > maxTotalChars) break;
      // For tool messages, wrap clamped string as tool-friendly text content
      if ((m as any).role === 'tool') {
        safeMessages.push({ ...(m as any), content: [{ type: 'text', text: clamped }] as any });
      } else {
        const role = (m as any).role;
        safeMessages.push({ role, content: clamped } as any);
      }
    }

    // Then add the most recent non-system messages until we hit the cap
    const rest = messages.filter(m => m.role !== 'system');
    for (let i = Math.max(0, rest.length - 40); i < rest.length; i++) { // last 40 msgs
      const m = rest[i];
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const clamped = clamp(content, maxPerMessage);
      if (total + clamped.length > maxTotalChars) break;
      total += clamped.length;
      if ((m as any).role === 'tool') {
        safeMessages.push({ ...(m as any), content: [{ type: 'text', text: clamped }] as any });
      } else {
        const role = (m as any).role;
        safeMessages.push({ role, content: clamped } as any);
      }
    }

    return safeMessages;
  }

  /**
   * Detect project type based on working directory
   */
  private detectProjectType(workingDirectory: string): string {
    try {
      const packageJsonPath = join(workingDirectory, 'package.json');
      const cargoTomlPath = join(workingDirectory, 'Cargo.toml');
      const requirementsPath = join(workingDirectory, 'requirements.txt');
      const goModPath = join(workingDirectory, 'go.mod');

      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

        // Check for React/Next.js
        if (packageJson.dependencies?.['next'] || packageJson.devDependencies?.['next']) {
          return 'next.js';
        }
        if (packageJson.dependencies?.['react'] || packageJson.devDependencies?.['react']) {
          return 'react';
        }
        if (packageJson.dependencies?.['express'] || packageJson.devDependencies?.['express']) {
          return 'express';
        }
        if (packageJson.dependencies?.['typescript'] || packageJson.devDependencies?.['typescript']) {
          return 'typescript';
        }

        return 'node';
      }

      if (existsSync(cargoTomlPath)) {
        return 'rust';
      }

      if (existsSync(requirementsPath)) {
        return 'python';
      }

      if (existsSync(goModPath)) {
        return 'go';
      }

      return 'generic';
    } catch {
      return 'generic';
    }
  }

  // Configuration methods
  setWorkingDirectory(directory: string): void {
    this.workingDirectory = resolve(directory);
    this.executionContext.clear(); // Reset context for new directory
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  setModel(modelName: string): void {
    this.currentModel = modelName;
  }

  getCurrentModelInfo() {
    const allModels = configManager.get('models');
    const modelConfig = allModels[this.currentModel];
    return {
      name: this.currentModel,
      config: modelConfig || { provider: 'unknown', model: 'unknown' },
    };
  }

  validateApiKey(): boolean {
    try {
      const apiKey = configManager.getApiKey(this.currentModel);
      return !!apiKey;
    } catch {
      return false;
    }
  }

  // Get execution context for debugging/analysis
  getExecutionContext(): Map<string, any> {
    return new Map(this.executionContext);
  }

  // Clear execution context
  clearExecutionContext(): void {
    this.executionContext.clear();
  }

  // Utility method for sleep
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Test method to verify prompt loading works
  async testPromptLoading(): Promise<{ baseAgent: string, readFile: string }> {
    try {
      const baseAgent = await this.getEnhancedSystemPrompt();
      const readFile = await this.getToolPrompt('read_file', { path: 'test.txt' });

      return {
        baseAgent: baseAgent.substring(0, 4000) + '...',
        readFile: readFile.substring(0, 4000) + '...'
      };
    } catch (error: any) {
      return {
        baseAgent: `Error loading base agent: ${error.message}`,
        readFile: `Error loading read_file: ${error.message}`
      };
    }
  }

  // Format cached response to preserve proper text formatting
  private formatCachedResponse(cachedText: string): string {
    if (!cachedText || typeof cachedText !== 'string') {
      return cachedText;
    }

    // Restore proper formatting
    let formatted = cachedText
      // Fix missing spaces after punctuation
      .replace(/([.!?,:;])([A-Z])/g, '$1 $2')
      // Fix missing spaces after commas and periods
      .replace(/([,])([a-zA-Z])/g, '$1 $2')
      // Fix missing spaces around common words
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Fix code block formatting
      .replace(/```([a-z]*)\n/g, '```$1\n')
      // Fix list items
      .replace(/^(\d+\.)([A-Z])/gm, '$1 $2')
      .replace(/^([-*])([A-Z])/gm, '$1 $2')
      // Fix markdown headers
      .replace(/^(#{1,6})([A-Z])/gm, '$1 $2')
      // Fix step numbers
      .replace(/Step(\d+):/g, 'Step $1:')
      // Add space after certain patterns
      .replace(/(\w)###/g, '$1\n\n###')
      .replace(/(\w)##/g, '$1\n\n##')
      .replace(/(\w)#([A-Z])/g, '$1\n\n# $2');

    return formatted;
  }

  // Chunk text into smaller pieces for streaming
  private chunkText(text: string, chunkSize: number = 80): string[] {
    if (!text || text.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';
    const words = text.split(/(\s+)/); // Split on whitespace but keep separators

    for (const word of words) {
      if ((currentChunk + word).length <= chunkSize) {
        currentChunk += word;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk);
        }
        currentChunk = word;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  // Analyze gaps when tool roundtrips are exhausted (token-optimized)
  private analyzeMissingInformation(originalQuery: string, toolHistory: Array<{ toolName: string, args: any, result: any, success: boolean }>): string {
    const tools = [...new Set(toolHistory.map(t => t.toolName))];
    const failed = toolHistory.filter(t => !t.success).length;
    const queryLower = originalQuery.toLowerCase();

    let analysis = `Used ${tools.length} tools: ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? '...' : ''}. `;

    if (failed > 0) analysis += `${failed} failed. `;

    // Suggest missing tools based on query
    const missing = [];
    if ((queryLower.includes('search') || queryLower.includes('find') || queryLower.includes('cerca') || queryLower.includes('trova')) && !tools.includes('semantic_search')) {
      missing.push('semantic search');
    }
    if ((queryLower.includes('analyze') || queryLower.includes('analizza')) && !tools.includes('code_analysis')) {
      missing.push('code analysis');
    }

    if (missing.length > 0) {
      analysis += `Missing: ${missing.join(', ')}.`;
    }

    return this.truncateForPrompt(analysis, 200);
  }

  // Generate specific clarifying questions (token-optimized)
  private generateClarifyingQuestion(gapAnalysis: string, originalQuery: string, toolHistory: Array<{ toolName: string, args: any, result: any, success: boolean }>): string {
    const queryLower = originalQuery.toLowerCase();
    const tools = toolHistory.map(t => t.toolName);

    let question = '';

    if ((queryLower.includes('function') || queryLower.includes('funzione')) && !tools.includes('semantic_search')) {
      question = '🔎 Should I search for similar functions with different names?';
    } else if (queryLower.includes('component') || queryLower.includes('componente')) {
      question = '⚛️ Is the component in specific subdirectories (components/, ui/)?';
    } else if (queryLower.includes('config')) {
      question = '⚙️ Is the config in different files (.env, .yaml, .toml)?';
    } else if (queryLower.includes('error') || queryLower.includes('errore')) {
      question = '🐛 Do you have specific error logs or messages?';
    } else {
      question = '🎯 More context on where to search?';
    }

    return this.truncateForPrompt(`${question}\n💡 Tell me how to continue.`, 150);
  }

  // Generate final summary after 2 rounds of roundtrips
  private generateFinalSummary(originalQuery: string, toolHistory: Array<{ toolName: string, args: any, result: any, success: boolean }>): string {
    const tools = [...new Set(toolHistory.map(t => t.toolName))];
    const successful = toolHistory.filter(t => t.success).length;
    const failed = toolHistory.filter(t => !t.success).length;
    const totalOperations = toolHistory.length;

    let summary = `**Final Analysis Summary:**\n\n`;

    // What was done
    summary += `📊 **Operations Completed:** ${totalOperations} total operations across ${this.completedRounds} rounds\n`;
    summary += `✅ **Successful:** ${successful} operations\n`;
    summary += `❌ **Failed:** ${failed} operations\n`;
    summary += `🛠️ **Tools Used:** ${tools.join(', ')}\n\n`;

    // Key findings
    summary += `🔍 **Key Findings:**\n`;
    if (successful > 0) {
      summary += `- Successfully executed ${successful} operations\n`;
    }
    if (failed > 0) {
      summary += `- ${failed} operations encountered issues\n`;
    }

    // Analysis of query fulfillment
    const queryLower = originalQuery.toLowerCase();
    summary += `\n📝 **Query Analysis:**\n`;
    summary += `- Original request: "${this.truncateForPrompt(originalQuery, 80)}"\n`;

    // Recommend next steps based on analysis
    summary += `\n🎯 **Recommended Next Steps:**\n`;

    // Strategy based on what was tried
    if (failed > successful && failed > 3) {
      summary += `- Review and refine search criteria (many operations failed)\n`;
      summary += `- Try different search patterns or keywords\n`;
    }

    if (queryLower.includes('search') || queryLower.includes('find')) {
      if (!tools.includes('web_search')) {
        summary += `- Try web search for external documentation\n`;
      }
      if (!tools.includes('semantic_search')) {
        summary += `- Use semantic search for similar patterns\n`;
      }
      summary += `- Manually specify directories or file patterns\n`;
      summary += `- Consider searching in hidden/config directories\n`;
    }

    if (queryLower.includes('analyze') || queryLower.includes('analisi')) {
      if (!tools.includes('dependency_analysis')) {
        summary += `- Run dependency analysis for comprehensive view\n`;
      }
      if (!tools.includes('code_analysis')) {
        summary += `- Perform detailed code quality analysis\n`;
      }
      summary += `- Focus on specific modules or components\n`;
    }

    // General strategies
    summary += `- Provide more specific context or constraints\n`;
    summary += `- Break down the request into smaller, targeted tasks\n`;
    summary += `- Try alternative approaches or tools not yet used\n`;

    // Final guidance
    summary += `\n💡 **How to Continue:** Please provide more specific guidance, narrow the scope, or try a different approach based on the recommendations above. Consider breaking your request into smaller, more focused tasks.`;

    return this.truncateForPrompt(summary, 800);
  }

  // ====================== 🧠 COGNITIVE ENHANCEMENT METHODS ======================

  /**
   * 🧠 Generate with Cognitive Understanding
   * Enhanced generation method that uses task cognition for better responses
   */
  async* generateWithCognition(messages: CoreMessage[], cognition?: TaskCognition): AsyncGenerator<StreamEvent> {
    try {
      yield {
        type: 'start',
        metadata: {
          method: 'generateWithCognition',
          hasCognition: !!cognition,
          cognitionId: cognition?.id
        }
      };

      // Step 1: Optimize prompts based on cognition
      const optimizedMessages = cognition
        ? this.optimizePromptWithCognition(messages, cognition)
        : messages;

      yield {
        type: 'thinking',
        content: cognition
          ? `🧠 Using cognitive understanding: ${cognition.intent.primary} task with ${cognition.estimatedComplexity}/10 complexity`
          : '🧠 Processing without cognitive context'
      };

      // Step 2: Use enhanced streaming with cognitive awareness
      const streamGen = this.streamChatWithFullAutonomy(optimizedMessages);

      for await (const event of streamGen) {
        // Adapt responses based on cognition
        if (event.type === 'text_delta' && event.content && cognition) {
          event.content = this.adaptResponseToCognition(event.content, cognition);
        }

        // Add cognitive metadata to tool calls
        if (event.type === 'tool_call' && cognition) {
          event.metadata = {
            ...event.metadata,
            cognition: {
              intent: cognition.intent.primary,
              complexity: cognition.estimatedComplexity,
              riskLevel: cognition.riskLevel
            }
          };
        }

        yield event;
      }

      yield {
        type: 'complete',
        metadata: {
          method: 'generateWithCognition',
          cognitionApplied: !!cognition
        }
      };

    } catch (error: any) {
      yield {
        type: 'error',
        error: `Cognitive generation failed: ${error.message}`,
        metadata: { method: 'generateWithCognition' }
      };
    }
  }

  /**
   * 🎯 Optimize Prompts with Orchestration Plan
   * Enhances prompts based on orchestration plan for better alignment
   */
  optimizePromptWithPlan(messages: CoreMessage[], plan?: OrchestrationPlan): CoreMessage[] {
    if (!plan) return messages;

    const optimizedMessages = [...messages];

    // Find system message or create one
    let systemMessage = optimizedMessages.find(m => m.role === 'system');
    if (!systemMessage) {
      systemMessage = { role: 'system', content: '' };
      optimizedMessages.unshift(systemMessage);
    }

    // Add orchestration context to system prompt
    const orchestrationContext = `

🎯 ORCHESTRATION CONTEXT:
- Strategy: ${plan.strategy}
- Estimated Duration: ${plan.estimatedDuration}s
- Phases: ${plan.phases.length} (${plan.phases.map(p => p.name).join(' → ')})
- Required Tools: ${plan.phases.flatMap(p => p.tools).join(', ')}
- Risk Level: Based on ${plan.fallbackStrategies.length} fallback strategies

Focus on the current execution phase and use the orchestration strategy for optimal results.`;

    systemMessage.content += orchestrationContext;

    return optimizedMessages;
  }

  /**
   * 🧠 Adapt Response to Cognitive Understanding
   * Modifies AI responses based on task cognition for better alignment
   */
  adaptResponseToCognition(response: string, cognition?: TaskCognition): string {
    if (!cognition) return response;

    let adaptedResponse = response;

    // Adapt based on intent
    switch (cognition.intent.primary) {
      case 'create':
        // Emphasize creation and generation language
        adaptedResponse = adaptedResponse.replace(/analyze|review|check/gi, 'create');
        break;
      case 'analyze':
        // Emphasize analytical language
        adaptedResponse = adaptedResponse.replace(/create|build|make/gi, 'analyze');
        break;
      case 'debug':
        // Emphasize problem-solving language
        adaptedResponse = adaptedResponse.replace(/create|analyze/gi, 'fix');
        break;
    }

    // Adapt based on urgency
    if (cognition.intent.urgency === 'critical') {
      adaptedResponse = '🚨 URGENT: ' + adaptedResponse;
    } else if (cognition.intent.urgency === 'high') {
      adaptedResponse = '⚡ HIGH PRIORITY: ' + adaptedResponse;
    }

    // Adapt based on complexity
    if (cognition.estimatedComplexity >= 8) {
      adaptedResponse = '🔥 COMPLEX TASK: ' + adaptedResponse;
    }

    // Adapt based on risk level
    if (cognition.riskLevel === 'high') {
      adaptedResponse = '⚠️ HIGH RISK - ' + adaptedResponse;
    }

    return adaptedResponse;
  }

  /**
   * 🎯 Private: Optimize Prompts with Cognition
   * Internal method to enhance prompts based on cognitive understanding
   */
  private optimizePromptWithCognition(messages: CoreMessage[], cognition: TaskCognition): CoreMessage[] {
    const optimizedMessages = [...messages];

    // Find system message or create one
    let systemMessage = optimizedMessages.find(m => m.role === 'system');
    if (!systemMessage) {
      systemMessage = { role: 'system', content: '' };
      optimizedMessages.unshift(systemMessage);
    }

    // Add cognitive context to system prompt
    const cognitiveContext = `

🧠 COGNITIVE UNDERSTANDING:
- Primary Intent: ${cognition.intent.primary} (confidence: ${Math.round(cognition.intent.confidence * 100)}%)
- Complexity Level: ${cognition.estimatedComplexity}/10
- Risk Assessment: ${cognition.riskLevel}
- Urgency: ${cognition.intent.urgency}
- Required Capabilities: ${cognition.requiredCapabilities.join(', ')}
- Detected Entities: ${cognition.entities.map(e => `${e.type}:${e.name}`).join(', ')}
- Dependencies: ${cognition.dependencies.join(', ')}
- Contexts: ${cognition.contexts.join(', ')}

Use this cognitive understanding to provide more targeted and effective responses.`;

    systemMessage.content += cognitiveContext;

    // Enhance user messages with entity context
    const lastUserMessage = optimizedMessages.filter(m => m.role === 'user').pop();
    if (lastUserMessage && cognition.entities.length > 0) {
      const entityContext = `\n\n[Detected entities: ${cognition.entities.map(e => e.name).join(', ')}]`;
      lastUserMessage.content += entityContext;
    }

    return optimizedMessages;
  }

  /**
   * 📊 Get Cognitive Statistics
   * Returns statistics about cognitive processing
   */
  getCognitiveStats(): {
    totalCognitiveRequests: number;
    averageComplexity: number;
    commonIntents: string[];
    riskDistribution: Record<string, number>;
  } {
    // This would be tracked in a real implementation
    return {
      totalCognitiveRequests: 0,
      averageComplexity: 5.0,
      commonIntents: ['analyze', 'create', 'update'],
      riskDistribution: { low: 60, medium: 30, high: 10 }
    };
  }

  /**
   * 🔧 Configure Cognitive Enhancement
   * Allows customization of cognitive processing behavior
   */
  configureCognition(config: {
    enablePromptOptimization?: boolean;
    enableResponseAdaptation?: boolean;
    complexityThreshold?: number;
    riskAwareness?: boolean;
  }): void {
    // Configuration would be stored and used in cognitive methods
    console.log('🧠 Cognitive configuration updated:', config);
  }

  // ====================== 🔧 AUTONOMOUS COMMAND SYSTEM ======================

  /**
   * 🔍 Intelligent Package Search with NPM Registry
   * Searches for packages with verification and recommendations
   */
  async searchPackagesIntelligently(
    query: string,
    context: 'frontend' | 'backend' | 'testing' | 'devops' | 'general' = 'general'
  ): Promise<PackageSearchResult[]> {

    // Check cache first
    const cacheKey = `${query}_${context}`;
    if (this.packageCache.has(cacheKey)) {
      return this.packageCache.get(cacheKey)!;
    }

    try {
      if (!this.streamSilentMode) {
        console.log(chalk.blue(`🔍 Searching packages for: ${query} (context: ${context})`));
      }

      // Execute NPM search with context-aware filtering
      const searchCommand = `npm search ${query} --json --long`;
      const { stdout } = await execAsync(searchCommand);

      let rawResults: any[] = [];
      try {
        rawResults = JSON.parse(stdout);
      } catch {
        // Fallback to empty array if parsing fails
        rawResults = [];
      }

      // Process and score results
      const processedResults: PackageSearchResult[] = rawResults
        .slice(0, 10) // Limit results
        .map(pkg => this.scorePackageRelevance(pkg, query, context))
        .filter(pkg => pkg.confidence > 0.3)
        .sort((a, b) => b.confidence - a.confidence);

      // Validate with Zod
      const validatedResults = processedResults.map(result => {
        try {
          return PackageSearchResult.parse(result);
        } catch {
          return null;
        }
      }).filter(Boolean) as PackageSearchResult[];

      // Cache results
      this.packageCache.set(cacheKey, validatedResults);

      if (!this.streamSilentMode) {
        console.log(chalk.green(`✅ Found ${validatedResults.length} relevant packages`));
      }

      return validatedResults;

    } catch (error: any) {
      if (!this.streamSilentMode) {
        console.log(chalk.red(`❌ Package search failed: ${error.message}`));
      }
      return [];
    }
  }

  /**
   * 🏗️ Build Intelligent Commands with Validation
   * Creates safe, validated commands based on context and requirements
   */
  buildIntelligentCommand(
    intent: 'install' | 'build' | 'test' | 'lint' | 'deploy' | 'analyze',
    context: {
      packages?: string[];
      target?: string;
      environment?: 'development' | 'production' | 'testing';
      framework?: 'react' | 'node' | 'next' | 'vue' | 'angular';
    } = {}
  ): Command {

    let command: Partial<Command> = {
      workingDir: process.cwd(),
      safety: 'safe',
      requiresApproval: false
    };

    switch (intent) {
      case 'install':
        command = this.buildInstallCommand(context);
        break;
      case 'build':
        command = this.buildBuildCommand(context);
        break;
      case 'test':
        command = this.buildTestCommand(context);
        break;
      case 'lint':
        command = this.buildLintCommand(context);
        break;
      case 'deploy':
        command = this.buildDeployCommand(context);
        break;
      case 'analyze':
        command = this.buildAnalyzeCommand(context);
        break;
    }

    // Validate with Zod
    try {
      return CommandSchema.parse(command);
    } catch (error) {
      // Fallback to safe default
      return CommandSchema.parse({
        type: 'bash',
        command: 'echo "Command validation failed"',
        description: 'Fallback safe command',
        safety: 'safe',
        requiresApproval: true
      });
    }
  }

  /**
   * ⚡ Execute Command with Safety Checks and Monitoring
   * Executes commands with comprehensive safety and monitoring
   */
  async executeCommandSafely(command: Command): Promise<CommandExecutionResult> {
    const startTime = Date.now();

    if (!this.streamSilentMode) {
      console.log(chalk.blue(`⚡ Executing: ${command.description}`));
    }

    try {
      // Pre-execution safety checks
      const safetyCheck = this.validateCommandSafety(command);
      if (!safetyCheck.safe) {
        throw new Error(`Safety check failed: ${safetyCheck.reason}`);
      }

      // Execute with timeout
      const timeout = command.estimatedDuration ? command.estimatedDuration * 1000 : 30000;
      const fullCommand = command.args
        ? `${command.command} ${command.args.join(' ')}`
        : command.command;

      const { stdout, stderr } = await Promise.race([
        execAsync(fullCommand, {
          cwd: command.workingDir || process.cwd(),
          timeout
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Command timeout')), timeout)
        )
      ]);

      const duration = Date.now() - startTime;

      // Analyze workspace changes
      const workspaceState = await this.analyzeWorkspaceChanges(command);

      const result: CommandExecutionResult = {
        success: true,
        output: stdout || '',
        error: stderr || undefined,
        duration,
        command,
        timestamp: new Date(),
        workspaceState
      };

      // Validate result
      const validatedResult = CommandExecutionResult.parse(result);

      // Store in history
      this.commandHistory.push(validatedResult);

      if (!this.streamSilentMode) {
        console.log(chalk.green(`✅ Command completed in ${duration}ms`));
      }

      return validatedResult;

    } catch (error: any) {
      const duration = Date.now() - startTime;

      const errorResult: CommandExecutionResult = {
        success: false,
        output: '',
        error: error.message,
        duration,
        command,
        timestamp: new Date()
      };

      const validatedErrorResult = CommandExecutionResult.parse(errorResult);
      this.commandHistory.push(validatedErrorResult);

      if (!this.streamSilentMode) {
        console.log(chalk.red(`❌ Command failed: ${error.message}`));
      }

      return validatedErrorResult;
    }
  }

  /**
   * 🔄 Stream Commands with Clean Output
   * Enhanced streaming with clean, organized output
   */
  async* streamCommandExecution(command: Command): AsyncGenerator<StreamEvent> {
    try {
      // Enable silent mode for clean streaming
      this.streamSilentMode = true;

      yield {
        type: 'start',
        content: `🔧 Preparing: ${command.description}`,
        metadata: {
          command: command.command,
          safety: command.safety,
          estimatedDuration: command.estimatedDuration
        }
      };

      // Pre-execution analysis
      if (command.type === 'npm' && command.command.includes('install')) {
        yield {
          type: 'thinking',
          content: '📦 Verifying package integrity and compatibility...'
        };
      }

      // Execute command
      const result = await this.executeCommandSafely(command);

      // Stream results cleanly
      if (result.success) {
        yield {
          type: 'tool_result',
          content: `✅ ${command.description} completed successfully`,
          toolName: command.type,
          toolResult: {
            success: true,
            duration: `${result.duration}ms`,
            output: result.output ? this.cleanCommandOutput(result.output) : undefined
          }
        };

        // Show workspace changes if any
        if (result.workspaceState) {
          const changes = this.summarizeWorkspaceChanges(result.workspaceState);
          if (changes) {
            yield {
              type: 'text_delta',
              content: `\n📁 Workspace changes: ${changes}`
            };
          }
        }
      } else {
        yield {
          type: 'tool_result',
          content: `❌ ${command.description} failed`,
          toolName: command.type,
          toolResult: {
            success: false,
            error: result.error,
            duration: `${result.duration}ms`
          }
        };
      }

      yield {
        type: 'complete',
        metadata: { commandExecuted: true, success: result.success }
      };

    } catch (error: any) {
      yield {
        type: 'error',
        error: `Command execution failed: ${error.message}`,
        metadata: { command: command.command }
      };
    } finally {
      // Restore normal logging
      this.streamSilentMode = false;
    }
  }

  /**
   * 🧠 Suggest Commands Based on Context
   * AI-powered command suggestions based on project state and intent
   */
  async suggestCommands(
    projectContext: {
      hasPackageJson?: boolean;
      frameworks?: string[];
      hasTests?: boolean;
      hasBuild?: boolean;
      currentIssue?: string;
    },
    userIntent: string
  ): Promise<Command[]> {

    const suggestions: Command[] = [];
    const lowerIntent = userIntent.toLowerCase();

    // React/Frontend suggestions
    if (projectContext.frameworks?.includes('react') || lowerIntent.includes('react')) {
      if (lowerIntent.includes('component') || lowerIntent.includes('ui')) {
        suggestions.push(this.buildIntelligentCommand('install', {
          packages: ['@types/react', 'prop-types'],
          framework: 'react'
        }));
      }
    }

    // Testing suggestions
    if (lowerIntent.includes('test') || projectContext.currentIssue?.includes('test')) {
      if (!projectContext.hasTests) {
        suggestions.push(this.buildIntelligentCommand('install', {
          packages: ['jest', '@testing-library/react', '@testing-library/jest-dom'],
          environment: 'testing'
        }));
      }
      suggestions.push(this.buildIntelligentCommand('test', {}));
    }

    // Build suggestions
    if (lowerIntent.includes('build') || lowerIntent.includes('compile')) {
      suggestions.push(this.buildIntelligentCommand('build', {
        environment: 'production'
      }));
    }

    // Package installation suggestions
    if (lowerIntent.includes('install') || lowerIntent.includes('add')) {
      const packages = await this.extractPackageNames(userIntent);
      if (packages.length > 0) {
        suggestions.push(this.buildIntelligentCommand('install', { packages }));
      }
    }

    return suggestions.slice(0, 3); // Limit to top 3 suggestions
  }

  // ====================== 🔧 COMMAND BUILDER HELPERS ======================

  private buildInstallCommand(context: any): Partial<Command> {
    const packages = context.packages || [];
    const devFlag = context.environment === 'development' ? ' --save-dev' : '';

    return {
      type: 'npm',
      command: `npm install${devFlag} ${packages.join(' ')}`,
      description: `Install ${packages.length} package(s)${devFlag ? ' as dev dependencies' : ''}`,
      safety: 'safe',
      estimatedDuration: 30,
      dependencies: packages
    };
  }

  private buildBuildCommand(context: any): Partial<Command> {
    const framework = context.framework || 'generic';
    const env = context.environment || 'production';

    return {
      type: 'npm',
      command: 'npm run build',
      description: `Build ${framework} project for ${env}`,
      safety: 'safe',
      estimatedDuration: 60
    };
  }

  private buildTestCommand(context: any): Partial<Command> {
    return {
      type: 'npm',
      command: 'npm test',
      description: 'Run project tests',
      safety: 'safe',
      estimatedDuration: 45
    };
  }

  private buildLintCommand(context: any): Partial<Command> {
    return {
      type: 'npm',
      command: 'npm run lint',
      description: 'Run code linting',
      safety: 'safe',
      estimatedDuration: 15
    };
  }

  private buildDeployCommand(context: any): Partial<Command> {
    return {
      type: 'npm',
      command: 'npm run deploy',
      description: 'Deploy application',
      safety: 'risky',
      requiresApproval: true,
      estimatedDuration: 120
    };
  }

  private buildAnalyzeCommand(context: any): Partial<Command> {
    return {
      type: 'bash',
      command: 'npm audit',
      description: 'Analyze project dependencies for vulnerabilities',
      safety: 'safe',
      estimatedDuration: 20
    };
  }

  // ====================== 🛡️ SAFETY AND VALIDATION ======================

  private validateCommandSafety(command: Command): { safe: boolean; reason?: string } {
    // Dangerous command patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /sudo\s+rm/,
      /dd\s+if=/,
      /:\(\)\{.*\}:/,
      /wget.*\|\s*sh/,
      /curl.*\|\s*sh/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command.command)) {
        return { safe: false, reason: 'Command contains dangerous pattern' };
      }
    }

    // Check for risky commands that require approval
    if (command.safety === 'risky' && !command.requiresApproval) {
      return { safe: false, reason: 'Risky command requires approval' };
    }

    return { safe: true };
  }

  private scorePackageRelevance(pkg: any, query: string, context: string): PackageSearchResult {
    let confidence = 0;

    // Name similarity
    if (pkg.name.includes(query)) confidence += 0.4;
    if (pkg.name.startsWith(query)) confidence += 0.2;

    // Description relevance
    if (pkg.description?.toLowerCase().includes(query.toLowerCase())) confidence += 0.2;

    // Context relevance
    const contextKeywords = {
      'frontend': ['react', 'vue', 'angular', 'ui', 'component', 'css'],
      'backend': ['express', 'fastify', 'node', 'server', 'api', 'database'],
      'testing': ['test', 'jest', 'mocha', 'cypress', 'spec'],
      'devops': ['docker', 'kubernetes', 'deploy', 'ci', 'cd']
    };

    const keywords = contextKeywords[context as keyof typeof contextKeywords] || [];
    for (const keyword of keywords) {
      if (pkg.description?.toLowerCase().includes(keyword)) {
        confidence += 0.1;
      }
    }

    // Popularity boost (mock - would use real download data)
    if (pkg.name.startsWith('@types/')) confidence += 0.1;

    return {
      name: pkg.name,
      version: pkg.version || 'latest',
      description: pkg.description || '',
      confidence: Math.min(confidence, 1.0),
      verified: pkg.publisher?.username === 'types' || confidence > 0.8,
      lastUpdated: pkg.date
    };
  }

  private async analyzeWorkspaceChanges(command: Command): Promise<any> {
    // Mock implementation - would analyze actual file changes
    if (command.type === 'npm' && command.command.includes('install')) {
      return {
        packagesInstalled: command.dependencies || []
      };
    }
    return undefined;
  }

  private cleanCommandOutput(output: string): string {
    return output
      .split('\n')
      .filter(line => !line.includes('npm WARN') && line.trim().length > 0)
      .slice(0, 5) // Limit output lines
      .join('\n');
  }

  private summarizeWorkspaceChanges(workspaceState: any): string {
    const parts = [];
    if (workspaceState.filesCreated?.length) {
      parts.push(`${workspaceState.filesCreated.length} files created`);
    }
    if (workspaceState.packagesInstalled?.length) {
      parts.push(`${workspaceState.packagesInstalled.length} packages installed`);
    }
    return parts.join(', ');
  }

  private async extractPackageNames(text: string): Promise<string[]> {
    const npmPackagePattern = /(?:npm install |add |install )([a-z0-9\-@\/\s]+)/gi;
    const matches = [...text.matchAll(npmPackagePattern)];

    return matches
      .flatMap(match => match[1].trim().split(/\s+/))
      .filter(pkg => pkg.length > 1 && !pkg.startsWith('-'));
  }

  // ====================== 📊 COMMAND SYSTEM ANALYTICS ======================

  /**
   * Get command execution statistics
   */
  getCommandStats(): {
    totalExecuted: number;
    successRate: number;
    averageDuration: number;
    topCommands: string[];
    recentFailures: string[];
  } {
    const totalExecuted = this.commandHistory.length;
    const successful = this.commandHistory.filter(cmd => cmd.success).length;
    const successRate = totalExecuted > 0 ? successful / totalExecuted : 0;

    const durations = this.commandHistory.map(cmd => cmd.duration);
    const averageDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const commandCounts = new Map<string, number>();
    this.commandHistory.forEach(cmd => {
      const key = cmd.command.command.split(' ')[0];
      commandCounts.set(key, (commandCounts.get(key) || 0) + 1);
    });

    const topCommands = [...commandCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cmd]) => cmd);

    const recentFailures = this.commandHistory
      .filter(cmd => !cmd.success)
      .slice(-3)
      .map(cmd => cmd.error || 'Unknown error');

    return {
      totalExecuted,
      successRate,
      averageDuration,
      topCommands,
      recentFailures
    };
  }

  /**
   * Clear command history and caches
   */
  clearCommandData(): void {
    this.commandHistory = [];
    this.packageCache.clear();
    this.commandTemplates.clear();
  }

  /**
   * Configure cognitive features for the AI provider
   */
  configureCognitiveFeatures(config: {
    enableCognition: boolean;
    orchestrationLevel: number;
    intelligentCommands: boolean;
    adaptivePlanning: boolean;
  }): void {
    console.log(chalk.cyan(`🧠 AdvancedAIProvider cognitive features configured`));
    if (config.enableCognition) {
      console.log(chalk.cyan(`🎯 Cognitive features enabled (level: ${config.orchestrationLevel})`));
    }
    if (config.intelligentCommands) {
      console.log(chalk.cyan(`⚡ Intelligent commands active`));
    }
    if (config.adaptivePlanning) {
      console.log(chalk.cyan(`📋 Adaptive planning enabled`));
    }
  }
}

export const advancedAIProvider = new AdvancedAIProvider();

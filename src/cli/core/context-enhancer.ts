import { CoreMessage } from 'ai';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, extname, relative } from 'path';
import chalk from 'chalk';

// Import existing systems for integration
import { contextManager } from './context-manager';
import { docsContextManager } from '../context/docs-context-manager';
import { workspaceContext } from '../context/workspace-context';

export interface EnhancementContext {
  workingDirectory: string;
  executionContext: Map<string, any>;
  conversationMemory: CoreMessage[];
  analysisCache: Map<string, any>;
  // Enhanced context providers
  enableRAGIntegration?: boolean;
  enableDocsContext?: boolean;
  enableWorkspaceContext?: boolean;
  maxContextTokens?: number;
  semanticSearchEnabled?: boolean;
  cachingEnabled?: boolean;
}

export interface ContextSource {
  id: string;
  priority: number;
  content: string;
  metadata: Record<string, any>;
  relevanceScore?: number;
  tokens?: number;
}

export interface SmartContext {
  sources: ContextSource[];
  totalTokens: number;
  relevanceThreshold: number;
  compressionRatio: number;
  cacheHits: number;
}

export class ContextEnhancer {
  private smartContextCache = new Map<string, SmartContext>();
  private lastCacheCleanup = Date.now();
  private readonly CACHE_TTL = 300000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  // Enhanced main method with smart context integration
  async enhance(messages: CoreMessage[], context: EnhancementContext): Promise<CoreMessage[]> {

    // Get optimized context from all sources
    const smartContext = await this.buildSmartContext(messages, context);

    // Apply context optimization
    const optimizedContext = await this.optimizeContext(smartContext, context);

    // Build enhanced messages
    const enhancedMessages = await this.buildEnhancedMessages(messages, optimizedContext, context);

    return enhancedMessages;
  }

  // Build smart context from all available sources
  private async buildSmartContext(messages: CoreMessage[], context: EnhancementContext): Promise<SmartContext> {
    const cacheKey = this.generateCacheKey(messages, context);

    // Check cache first
    if (context.cachingEnabled !== false && this.smartContextCache.has(cacheKey)) {
      const cached = this.smartContextCache.get(cacheKey)!;
      cached.cacheHits++;
      return cached;
    }

    const sources: ContextSource[] = [];
    let totalTokens = 0;
    let cacheHits = 0;

    // 1. Core workspace context
    if (context.enableWorkspaceContext !== false) {
      const workspaceSource = await this.getWorkspaceContextSource(context);
      if (workspaceSource) {
        sources.push(workspaceSource);
        totalTokens += workspaceSource.tokens || 0;
      }
    }

    // 2. Documentation context
    if (context.enableDocsContext !== false) {
      const docsSource = await this.getDocsContextSource(messages);
      if (docsSource) {
        sources.push(docsSource);
        totalTokens += docsSource.tokens || 0;
      }
    }

    // 3. Conversation memory with relevance
    const memorySource = await this.getEnhancedMemorySource(context.conversationMemory, messages);
    if (memorySource) {
      sources.push(memorySource);
      totalTokens += memorySource.tokens || 0;
    }

    // 4. Execution context
    if (context.executionContext.size > 0) {
      const execSource = this.getExecutionContextSource(context.executionContext);
      if (execSource) {
        sources.push(execSource);
        totalTokens += execSource.tokens || 0;
      }
    }

    // 5. Semantic search results
    if (context.semanticSearchEnabled !== false) {
      const semanticSources = await this.getSemanticContextSources(messages, context);
      sources.push(...semanticSources);
      totalTokens += semanticSources.reduce((sum, s) => sum + (s.tokens || 0), 0);
    }

    const smartContext: SmartContext = {
      sources: sources.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)),
      totalTokens,
      relevanceThreshold: 0.3,
      compressionRatio: 1.0,
      cacheHits
    };

    // Cache the result
    if (context.cachingEnabled !== false) {
      this.cacheSmartContext(cacheKey, smartContext);
    }

    return smartContext;
  }

  // Optimize context based on token limits and relevance
  private async optimizeContext(smartContext: SmartContext, context: EnhancementContext): Promise<SmartContext> {
    const maxTokens = context.maxContextTokens || 15000;

    if (smartContext.totalTokens <= maxTokens) {
      return smartContext;
    }

    console.log(chalk.yellow(`⚠️ Context optimization needed: ${smartContext.totalTokens} > ${maxTokens} tokens`));

    // Intelligent context compression
    const optimizedSources: ContextSource[] = [];
    let currentTokens = 0;

    // Always include high-priority sources
    const highPriorityThreshold = 8;
    for (const source of smartContext.sources) {
      if (source.priority >= highPriorityThreshold || currentTokens < maxTokens * 0.3) {
        optimizedSources.push(source);
        currentTokens += source.tokens || 0;
      }
    }

    // Add remaining sources by relevance score
    const remainingSources = smartContext.sources.filter(s => s.priority < highPriorityThreshold);
    for (const source of remainingSources) {
      if (currentTokens + (source.tokens || 0) <= maxTokens) {
        optimizedSources.push(source);
        currentTokens += source.tokens || 0;
      } else {
        // Try to compress the source content
        const compressedSource = this.compressContextSource(source, maxTokens - currentTokens);
        if (compressedSource && compressedSource.tokens! > 100) {
          optimizedSources.push(compressedSource);
          currentTokens += compressedSource.tokens!;
        }
      }
    }

    const compressionRatio = currentTokens / smartContext.totalTokens;
    console.log(chalk.green(`✅ Context optimized: ${smartContext.totalTokens} → ${currentTokens} tokens (${Math.round(compressionRatio * 100)}%)`));

    return {
      ...smartContext,
      sources: optimizedSources,
      totalTokens: currentTokens,
      compressionRatio
    };
  }

  // Build final enhanced messages
  private async buildEnhancedMessages(
    originalMessages: CoreMessage[],
    smartContext: SmartContext,
    context: EnhancementContext
  ): Promise<CoreMessage[]> {
    const enhancedMessages = [...originalMessages];

    // Add enhanced system prompt if not present
    if (!enhancedMessages.some(msg => msg.role === 'system')) {
      enhancedMessages.unshift({
        role: 'system',
        content: this.buildEnhancedSystemPrompt(context, smartContext)
      });
    }

    // Insert context sources in order of priority
    let insertIndex = 1;
    for (const source of smartContext.sources) {
      if (source.priority >= 7) { // High priority sources go first
        enhancedMessages.splice(insertIndex++, 0, {
          role: 'system',
          content: `${this.getSourceIcon(source.id)} **${source.metadata.title || source.id}**:\n${source.content}`
        });
      }
    }

    // Add medium priority sources
    for (const source of smartContext.sources) {
      if (source.priority >= 4 && source.priority < 7) {
        enhancedMessages.splice(insertIndex++, 0, {
          role: 'system',
          content: `${this.getSourceIcon(source.id)} **${source.metadata.title || source.id}**:\n${source.content}`
        });
      }
    }

    return enhancedMessages;
  }

  // Integration methods with existing systems
  private async getWorkspaceContextSource(context: EnhancementContext): Promise<ContextSource | null> {
    try {
      const workspaceInfo = workspaceContext.getContextForAgent('enhancer', 10);
      const content = workspaceInfo.projectSummary + '\n\nKey Files:\n' +
        workspaceInfo.relevantFiles.slice(0, 5).map(f => `- ${f.path}: ${f.summary}`).join('\n');

      return {
        id: 'workspace',
        priority: 8,
        content,
        metadata: {
          title: 'Workspace Context',
          type: 'workspace',
          fileCount: workspaceInfo.relevantFiles.length
        },
        relevanceScore: 0.9,
        tokens: this.estimateTokens(content)
      };
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not load workspace context'));
      return null;
    }
  }

  private async getDocsContextSource(messages: CoreMessage[]): Promise<ContextSource | null> {
    try {
      const docsContext = docsContextManager.getContextSummary();
      if (!docsContext || docsContext.includes('No documentation loaded')) {
        return null;
      }

      return {
        id: 'documentation',
        priority: 6,
        content: docsContext,
        metadata: {
          title: 'Documentation Context',
          type: 'documentation'
        },
        relevanceScore: 0.7,
        tokens: this.estimateTokens(docsContext)
      };
    } catch (error) {
      return null;
    }
  }

  private async getEnhancedMemorySource(conversationMemory: CoreMessage[], currentMessages: CoreMessage[]): Promise<ContextSource | null> {
    if (conversationMemory.length === 0) return null;

    // Use context manager for optimized memory handling
    const optimizedContext = contextManager.optimizeContext(conversationMemory);
    const memoryContent = this.summarizeMessages(optimizedContext.optimizedMessages);

    return {
      id: 'conversation_memory',
      priority: 7,
      content: memoryContent,
      metadata: {
        title: 'Conversation Memory',
        type: 'memory',
        messageCount: optimizedContext.optimizedMessages.length,
        compressionRatio: optimizedContext.metrics.compressionRatio
      },
      relevanceScore: 0.8,
      tokens: optimizedContext.metrics.estimatedTokens
    };
  }

  private getExecutionContextSource(executionContext: Map<string, any>): ContextSource | null {
    if (executionContext.size === 0) return null;

    const contextEntries = Array.from(executionContext.entries()).slice(0, 5);
    const content = contextEntries.map(([key, value]) => {
      const valueStr = typeof value === 'object' ? JSON.stringify(value).substring(0, 200) : String(value);
      return `${key}: ${valueStr}`;
    }).join('\n');

    return {
      id: 'execution_context',
      priority: 5,
      content,
      metadata: {
        title: 'Execution Context',
        type: 'execution',
        entryCount: executionContext.size
      },
      relevanceScore: 0.6,
      tokens: this.estimateTokens(content)
    };
  }

  private async getSemanticContextSources(messages: CoreMessage[], context: EnhancementContext): Promise<ContextSource[]> {
    const sources: ContextSource[] = [];
    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();

    if (!lastUserMessage) return sources;

    const query = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : String(lastUserMessage.content);

    // Try to get semantic results from workspace context
    try {
      const semanticResults = await workspaceContext.extractRelevantContext(query);
      if (semanticResults && semanticResults.length > 100) {
        sources.push({
          id: 'semantic_search',
          priority: 6,
          content: semanticResults,
          metadata: {
            title: 'Semantic Search Results',
            type: 'semantic',
            query: query.substring(0, 50)
          },
          relevanceScore: 0.75,
          tokens: this.estimateTokens(semanticResults)
        });
      }
    } catch (error) {
      // Semantic search not available
    }

    return sources;
  }

  // Utility methods
  private generateCacheKey(messages: CoreMessage[], context: EnhancementContext): string {
    const lastMessage = messages[messages.length - 1];
    const content = typeof lastMessage?.content === 'string' ? lastMessage.content : '';
    const contextKey = `${context.workingDirectory}-${context.enableRAGIntegration}-${context.enableDocsContext}`;
    return `${contextKey}-${this.hashString(content)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private cacheSmartContext(key: string, context: SmartContext): void {
    // Clean cache if needed
    if (Date.now() - this.lastCacheCleanup > this.CACHE_TTL) {
      this.cleanCache();
    }

    if (this.smartContextCache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entries
      const oldestKey = this.smartContextCache.keys().next().value;
      if (oldestKey) {
        this.smartContextCache.delete(oldestKey);
      }
    }

    this.smartContextCache.set(key, { ...context });
  }

  private cleanCache(): void {
    // Simple cleanup - in a real implementation, you'd track timestamps
    if (this.smartContextCache.size > this.MAX_CACHE_SIZE * 0.8) {
      const keysToDelete = Array.from(this.smartContextCache.keys()).slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.3));
      keysToDelete.forEach(key => this.smartContextCache.delete(key));
    }
    this.lastCacheCleanup = Date.now();
  }

  private compressContextSource(source: ContextSource, maxTokens: number): ContextSource | null {
    if (!source.tokens || source.tokens <= maxTokens) return source;

    const compressionRatio = maxTokens / source.tokens;
    const maxChars = Math.floor(source.content.length * compressionRatio * 0.9); // 90% to be safe

    if (maxChars < 100) return null; // Too small to be useful

    const compressedContent = this.intelligentTruncation(source.content, maxChars);

    return {
      ...source,
      content: compressedContent,
      tokens: maxTokens,
      metadata: {
        ...source.metadata,
        compressed: true,
        originalTokens: source.tokens
      }
    };
  }

  private intelligentTruncation(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;

    // Try to find natural break points
    const sentences = content.split(/[.!?]+/);
    let result = '';

    for (const sentence of sentences) {
      if (result.length + sentence.length + 1 <= maxChars) {
        result += sentence + '.';
      } else {
        break;
      }
    }

    if (result.length < maxChars * 0.5) {
      // Fallback to character truncation
      result = content.substring(0, maxChars - 20) + '\n\n[...truncated]';
    }

    return result;
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4); // Rough estimation
  }

  private summarizeMessages(messages: CoreMessage[]): string {
    return messages.slice(-5).map(msg => {
      const content = typeof msg.content === 'string' ? msg.content : String(msg.content);
      return `${msg.role}: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`;
    }).join('\n');
  }

  private buildEnhancedSystemPrompt(context: EnhancementContext, smartContext: SmartContext): string {
    const stats = `Context sources: ${smartContext.sources.length}, Total tokens: ${smartContext.totalTokens}, Compression: ${Math.round(smartContext.compressionRatio * 100)}%`;

    return `You are an advanced AI development assistant with enhanced context capabilities.

🧠 **Context Intelligence**: ${stats}
📁 **Working Directory**: ${context.workingDirectory}
🔧 **Available Tools**: read_file, write_file, explore_directory, run_command, analyze_project

**Context Sources Loaded**:
${smartContext.sources.map(s => `• ${s.metadata.title || s.id} (Priority: ${s.priority}, Relevance: ${Math.round((s.relevanceScore || 0) * 100)}%)`).join('\n')}

Use this rich context to provide accurate, contextually-aware responses. Always leverage the available context sources to enhance your understanding and provide better assistance.`;
  }

  private getSourceIcon(sourceId: string): string {
    const icons: Record<string, string> = {
      workspace: '📁',
      documentation: '📚',
      conversation_memory: '🧠',
      execution_context: '⚙️',
      semantic_search: '🔍'
    };
    return icons[sourceId] || '📄';
  }

  // Legacy methods - kept for backward compatibility
  getWorkspaceContext(workingDirectory: string): string {
    try {
      const workspaceInfo = workspaceContext.getContextForAgent('legacy', 5);
      return workspaceInfo.projectSummary || 'No workspace context available';
    } catch (error) {
      return 'Could not load workspace context';
    }
  }

  isFileRelatedQuery(content: any): boolean {
    const text = typeof content === 'string' ? content : String(content);
    const fileKeywords = ['file', 'read', 'write', 'create', 'modify', 'delete', 'analyze', 'scan', 'explore', 'directory', 'folder'];
    return fileKeywords.some(keyword => text.toLowerCase().includes(keyword));
  }

  getConversationMemory(memory: CoreMessage[]): string {
    return this.summarizeMessages(memory.slice(-5));
  }

  getExecutionContext(executionContext: Map<string, any>): string {
    const source = this.getExecutionContextSource(executionContext);
    return source?.content || 'No execution context available';
  }

  // Public methods for external usage
  async getSmartContextForMessages(messages: CoreMessage[], options?: Partial<EnhancementContext>): Promise<SmartContext> {
    const context: EnhancementContext = {
      workingDirectory: process.cwd(),
      executionContext: new Map(),
      conversationMemory: [],
      analysisCache: new Map(),
      enableRAGIntegration: true,
      enableDocsContext: true,
      enableWorkspaceContext: true,
      semanticSearchEnabled: true,
      cachingEnabled: true,
      ...options
    };

    return this.buildSmartContext(messages, context);
  }

  clearCache(): void {
    this.smartContextCache.clear();
    console.log(chalk.green('✅ Context enhancer cache cleared'));
  }

  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    let totalCacheHits = 0;
    let totalRequests = 0;

    for (const context of this.smartContextCache.values()) {
      totalCacheHits += context.cacheHits;
      totalRequests += context.cacheHits + 1; // +1 for initial miss
    }

    return {
      size: this.smartContextCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: totalRequests > 0 ? totalCacheHits / totalRequests : 0
    };
  }
}

// Export singleton instance
export const contextEnhancer = new ContextEnhancer();

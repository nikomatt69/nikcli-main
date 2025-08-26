import { z } from 'zod';
import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import chalk from 'chalk';

import { logger } from '../utils/logger';
import { advancedUI } from '../ui/advanced-cli-ui';

export const PromptMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['tool', 'agent', 'system', 'validation', 'error-handling', 'reasoning']),
  version: z.string().default('1.0.0'),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  language: z.string().default('en'),
  targetAudience: z.enum(['ai', 'human', 'mixed']).default('ai'),
  complexity: z.enum(['basic', 'intermediate', 'advanced', 'expert']).default('intermediate'),
  usageCount: z.number().int().default(0),
  successRate: z.number().min(0).max(1).default(1),
  lastUsed: z.date().optional(),
  isEnabled: z.boolean().default(true),
  requiresContext: z.boolean().default(false),
  contextTypes: z.array(z.string()).default([]),
  variables: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().default(false),
    description: z.string(),
    defaultValue: z.any().optional()
  })).default([]),
  examples: z.array(z.object({
    title: z.string(),
    description: z.string(),
    input: z.record(z.any()),
    expectedOutput: z.string()
  })).default([]),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

export const PromptTemplateSchema = z.object({
  metadata: PromptMetadataSchema,
  template: z.string(),
  isLoaded: z.boolean().default(false),
  compiledTemplate: z.function().optional(),
  loadTime: z.number().optional(),
  filePath: z.string().optional()
});

export const PromptRegistryConfigSchema = z.object({
  promptsDirectory: z.string().default('src/cli/prompts'),
  autoDiscovery: z.boolean().default(true),
  enableCaching: z.boolean().default(true),
  enableMetrics: z.boolean().default(true),
  enableVersioning: z.boolean().default(false),
  templateEngine: z.enum(['handlebars', 'mustache', 'simple']).default('simple'),
  maxPromptSize: z.number().int().default(50000),
  enableHotReload: z.boolean().default(false),
  validatePrompts: z.boolean().default(true)
});

export type PromptMetadata = z.infer<typeof PromptMetadataSchema>;
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;
export type PromptRegistryConfig = z.infer<typeof PromptRegistryConfigSchema>;

export interface PromptContext {
  [key: string]: any;
  workingDirectory?: string;
  agentId?: string;
  toolName?: string;
  timestamp?: Date;
  sessionId?: string;
}

export class PromptRegistry {
  private static instance: PromptRegistry;
  private prompts: Map<string, PromptTemplate> = new Map();
  private categories: Map<string, string[]> = new Map();
  private loadedPrompts: Set<string> = new Set();
  private config: PromptRegistryConfig;
  private workingDirectory: string;
  private isInitialized = false;

  constructor(workingDirectory: string, config: Partial<PromptRegistryConfig> = {}) {
    this.workingDirectory = workingDirectory;
    this.config = PromptRegistryConfigSchema.parse(config);
  }

  static getInstance(workingDirectory?: string, config?: Partial<PromptRegistryConfig>): PromptRegistry {
    if (!PromptRegistry.instance && workingDirectory) {
      PromptRegistry.instance = new PromptRegistry(workingDirectory, config);
    }
    return PromptRegistry.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    advancedUI.logInfo('🧠 Initializing Prompt Registry...');
    const startTime = Date.now();

    try {
      await this.registerBuiltInPrompts();
      
      if (this.config.autoDiscovery) {
        await this.discoverPrompts();
      }

      if (this.config.validatePrompts) {
        await this.validateAllPrompts();
      }

      this.isInitialized = true;
      const loadTime = Date.now() - startTime;

      advancedUI.logSuccess(`✅ Prompt Registry initialized (${this.prompts.size} prompts, ${loadTime}ms)`);
      
      if (this.config.enableMetrics) {
        this.logRegistryStats();
      }

    } catch (error: any) {
      advancedUI.logError(`❌ Prompt Registry initialization failed: ${error.message}`);
      throw error;
    }
  }

  async registerPrompt(promptId: string, templateContent: string, metadata: Partial<PromptMetadata>): Promise<void> {
    try {
      const promptMetadata: PromptMetadata = PromptMetadataSchema.parse({
        id: promptId,
        name: metadata.name || promptId,
        description: metadata.description || 'No description provided',
        category: metadata.category || 'system',
        ...metadata
      });

      if (templateContent.length > this.config.maxPromptSize) {
        throw new Error(`Prompt ${promptId} exceeds maximum size limit`);
      }

      const promptTemplate: PromptTemplate = {
        metadata: promptMetadata,
        template: templateContent,
        isLoaded: true,
        loadTime: Date.now()
      };

      this.prompts.set(promptId, promptTemplate);
      this.addToCategory(promptMetadata.category, promptId);
      this.loadedPrompts.add(promptId);

      advancedUI.logSuccess(`🧠 Registered prompt: ${promptMetadata.name} (${promptId})`);

    } catch (error: any) {
      advancedUI.logError(`❌ Failed to register prompt ${promptId}: ${error.message}`);
      throw error;
    }
  }

  async getPrompt(promptId: string, context: PromptContext = {}): Promise<string> {
    const promptTemplate = this.prompts.get(promptId);
    if (!promptTemplate) {
      throw new Error(`Prompt not found: ${promptId}`);
    }

    if (!promptTemplate.metadata.isEnabled) {
      throw new Error(`Prompt is disabled: ${promptId}`);
    }

    try {
      // Update usage metrics
      promptTemplate.metadata.usageCount++;
      promptTemplate.metadata.lastUsed = new Date();

      // Compile template with context
      const compiledPrompt = await this.compileTemplate(promptTemplate.template, context);

      // Validate required variables
      if (promptTemplate.metadata.requiresContext && Object.keys(context).length === 0) {
        advancedUI.logWarning(`⚠️  Prompt ${promptId} requires context but none provided`);
      }

      return compiledPrompt;

    } catch (error: any) {
      advancedUI.logError(`❌ Failed to get prompt ${promptId}: ${error.message}`);
      throw error;
    }
  }

  async getPromptsByCategory(category: string): Promise<PromptTemplate[]> {
    const promptIds = this.categories.get(category) || [];
    return promptIds.map(id => this.prompts.get(id)).filter(Boolean) as PromptTemplate[];
  }

  searchPrompts(query: string): PromptTemplate[] {
    const searchTerm = query.toLowerCase();
    return Array.from(this.prompts.values()).filter(prompt => 
      prompt.metadata.name.toLowerCase().includes(searchTerm) ||
      prompt.metadata.description.toLowerCase().includes(searchTerm) ||
      prompt.metadata.tags.some(tag => tag.toLowerCase().includes(searchTerm))
    );
  }

  async updatePrompt(promptId: string, newContent: string, metadata?: Partial<PromptMetadata>): Promise<void> {
    const existingPrompt = this.prompts.get(promptId);
    if (!existingPrompt) {
      throw new Error(`Prompt not found: ${promptId}`);
    }

    const updatedMetadata = metadata ? 
      PromptMetadataSchema.parse({ ...existingPrompt.metadata, ...metadata, updatedAt: new Date() }) :
      { ...existingPrompt.metadata, updatedAt: new Date() };

    const updatedPrompt: PromptTemplate = {
      ...existingPrompt,
      template: newContent,
      metadata: updatedMetadata,
      loadTime: Date.now()
    };

    this.prompts.set(promptId, updatedPrompt);
    advancedUI.logSuccess(`✅ Updated prompt: ${promptId}`);
  }

  async deletePrompt(promptId: string): Promise<boolean> {
    const promptTemplate = this.prompts.get(promptId);
    if (!promptTemplate) return false;

    this.prompts.delete(promptId);
    this.loadedPrompts.delete(promptId);
    this.removeFromCategory(promptTemplate.metadata.category, promptId);

    advancedUI.logInfo(`🗑️  Deleted prompt: ${promptId}`);
    return true;
  }

  getAvailablePrompts(): Map<string, PromptTemplate> {
    return new Map([...this.prompts.entries()].filter(([, prompt]) => prompt.metadata.isEnabled));
  }

  getPromptMetadata(promptId: string): PromptMetadata | null {
    const prompt = this.prompts.get(promptId);
    return prompt ? prompt.metadata : null;
  }

  getRegistryStats() {
    const stats = {
      totalPrompts: this.prompts.size,
      loadedPrompts: this.loadedPrompts.size,
      enabledPrompts: Array.from(this.prompts.values()).filter(p => p.metadata.isEnabled).length,
      categories: Object.fromEntries(this.categories.entries()),
      topPrompts: Array.from(this.prompts.values())
        .sort((a, b) => b.metadata.usageCount - a.metadata.usageCount)
        .slice(0, 5)
        .map(p => ({ 
          name: p.metadata.name, 
          usage: p.metadata.usageCount, 
          successRate: p.metadata.successRate,
          category: p.metadata.category
        }))
    };

    return stats;
  }

  updateConfig(newConfig: Partial<PromptRegistryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    advancedUI.logInfo('🧠 Prompt Registry configuration updated');
  }

  private async registerBuiltInPrompts(): Promise<void> {
    // Register key system prompts
    
    // Universal Agent System Prompt
    await this.registerPrompt('universal-agent-system', `
You are the Universal Agent, a comprehensive AI assistant for autonomous software development.

## Core Capabilities
- Full-stack development (React, TypeScript, Node.js, databases)
- Code generation, analysis, review, and optimization
- DevOps operations and deployment
- Autonomous project creation and management
- LSP integration for code intelligence
- Context-aware workspace understanding

## Operating Principles
1. **Enterprise Quality**: Always produce production-ready code
2. **Security First**: Follow security best practices
3. **Clean Architecture**: Use proper separation of concerns
4. **Type Safety**: Leverage TypeScript for type safety
5. **Testing**: Include comprehensive tests
6. **Documentation**: Provide clear documentation
7. **Performance**: Optimize for performance and scalability
8. **Accessibility**: Follow accessibility guidelines

## Integration Requirements
- Always use LSP for code intelligence
- Integrate with Context system for workspace awareness  
- Use Zod for runtime validation
- Follow existing code patterns and conventions
- Leverage existing tools and services

## Communication Style
- Be concise but comprehensive
- Explain complex decisions
- Provide actionable recommendations
- Focus on practical solutions
`, {
      name: 'Universal Agent System Prompt',
      description: 'Core system prompt for the Universal Agent',
      category: 'agent',
      tags: ['system', 'agent', 'universal'],
      complexity: 'expert'
    });

    // Tool Execution Prompt
    await this.registerPrompt('tool-execution-system', `
## Tool Execution Guidelines

### Pre-Execution Analysis
1. Analyze the task requirements and context
2. Select appropriate tools based on capabilities
3. Validate inputs and permissions
4. Check LSP diagnostics for code operations
5. Review context history for patterns

### Execution Process
1. Use tools in logical sequence
2. Handle errors gracefully with rollback
3. Validate outputs and results
4. Record operations for learning
5. Provide clear feedback

### Quality Assurance
1. Validate all inputs with Zod schemas
2. Use appropriate error handling
3. Follow security best practices
4. Ensure type safety throughout
5. Test critical operations

Context Variables:
- workingDirectory: {{workingDirectory}}
- agentId: {{agentId}}
- toolName: {{toolName}}
- timestamp: {{timestamp}}
`, {
      name: 'Tool Execution System',
      description: 'System prompt for tool execution operations',
      category: 'tool',
      tags: ['execution', 'tools', 'validation'],
      complexity: 'advanced',
      requiresContext: true,
      contextTypes: ['workingDirectory', 'agentId', 'toolName'],
      variables: [
        { name: 'workingDirectory', type: 'string', required: true, description: 'Current working directory' },
        { name: 'agentId', type: 'string', required: false, description: 'Executing agent ID' },
        { name: 'toolName', type: 'string', required: false, description: 'Tool being executed' }
      ]
    });

    // Error Handling Prompt
    await this.registerPrompt('error-handling-system', `
## Error Handling Protocol

### Error Classification
1. **Critical Errors**: System failures, security violations, data corruption
2. **Operational Errors**: Tool failures, validation errors, network issues
3. **User Errors**: Invalid input, missing permissions, configuration issues
4. **Warning Conditions**: Non-blocking issues, performance concerns

### Response Strategy
- Critical: Immediate stop with rollback
- Operational: Retry with backoff, fallback strategies
- User: Clear error messages with solutions
- Warning: Log and continue with notification

### Recovery Actions
1. Automatic rollback for file operations
2. State restoration for agent tasks
3. Error reporting with context
4. Learning from error patterns
5. Prevention strategies for future

Error Context:
- errorType: {{errorType}}
- errorMessage: {{errorMessage}}
- stackTrace: {{stackTrace}}
- recoveryOptions: {{recoveryOptions}}
`, {
      name: 'Error Handling System',
      description: 'System prompt for error handling and recovery',
      category: 'error-handling',
      tags: ['error', 'recovery', 'system'],
      complexity: 'advanced',
      requiresContext: true
    });
  }

  private async discoverPrompts(): Promise<void> {
    const promptsDir = join(this.workingDirectory, this.config.promptsDirectory);
    
    try {
      const files = await readdir(promptsDir);
      
      for (const file of files) {
        if (extname(file) === '.txt' || extname(file) === '.md') {
          await this.loadPromptFromFile(join(promptsDir, file));
        }
      }
    } catch (error) {
      // Directory doesn't exist or not accessible
      logger.debug(`Prompt discovery failed for ${promptsDir}`);
    }
  }

  private async loadPromptFromFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf8');
      const filename = filePath.split('/').pop()?.replace(/\.(txt|md)$/, '') || 'unknown';
      
      // Extract metadata from content if present (YAML frontmatter style)
      const metadataMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      let metadata = {};
      let template = content;
      
      if (metadataMatch) {
        try {
          // Simple key-value parsing (not full YAML)
          const metadataLines = metadataMatch[1].split('\n');
          for (const line of metadataLines) {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
              const value = valueParts.join(':').trim();
              (metadata as any)[key.trim()] = value.replace(/^["']|["']$/g, '');
            }
          }
          template = metadataMatch[2];
        } catch (parseError) {
          // Ignore metadata parsing errors
        }
      }

      await this.registerPrompt(filename, template, {
        ...metadata,
        category: (metadata as any)['category'] || 'system'
      });

    } catch (error: any) {
      logger.debug(`Failed to load prompt from ${filePath}: ${error.message}`);
    }
  }

  private async validateAllPrompts(): Promise<void> {
    for (const [promptId, prompt] of this.prompts.entries()) {
      try {
        await this.validatePrompt(prompt);
      } catch (error: any) {
        advancedUI.logWarning(`⚠️  Prompt validation failed for ${promptId}: ${error.message}`);
      }
    }
  }

  private async validatePrompt(prompt: PromptTemplate): Promise<void> {
    if (!prompt.template || prompt.template.trim().length === 0) {
      throw new Error('Prompt template is empty');
    }

    if (prompt.template.length > this.config.maxPromptSize) {
      throw new Error('Prompt exceeds maximum size limit');
    }

    // Validate template variables
    const variablePattern = /\{\{(\w+)\}\}/g;
    const foundVariables = [];
    let match;

    while ((match = variablePattern.exec(prompt.template)) !== null) {
      foundVariables.push(match[1]);
    }

    // Check if all found variables are declared in metadata
    const declaredVariables = prompt.metadata.variables.map(v => v.name);
    const undeclaredVariables = foundVariables.filter(v => !declaredVariables.includes(v));

    if (undeclaredVariables.length > 0) {
      advancedUI.logWarning(`Undeclared variables in ${prompt.metadata.id}: ${undeclaredVariables.join(', ')}`);
    }
  }

  private async compileTemplate(template: string, context: PromptContext): Promise<string> {
    let compiled = template;

    // Simple template engine - replace {{variable}} with context values
    const variablePattern = /\{\{(\w+)\}\}/g;
    compiled = compiled.replace(variablePattern, (match, variableName) => {
      if (context.hasOwnProperty(variableName)) {
        return String(context[variableName]);
      }
      return match; // Keep original if not found in context
    });

    return compiled;
  }

  private addToCategory(category: string, promptId: string): void {
    if (!this.categories.has(category)) {
      this.categories.set(category, []);
    }
    this.categories.get(category)!.push(promptId);
  }

  private removeFromCategory(category: string, promptId: string): void {
    const categoryPrompts = this.categories.get(category);
    if (categoryPrompts) {
      const index = categoryPrompts.indexOf(promptId);
      if (index > -1) {
        categoryPrompts.splice(index, 1);
      }
    }
  }

  private logRegistryStats(): void {
    const stats = this.getRegistryStats();
    
    advancedUI.logInfo(`🧠 Prompt Registry Statistics:`);
    console.log(chalk.cyan(`   Total Prompts: ${stats.totalPrompts}`));
    console.log(chalk.cyan(`   Loaded: ${stats.loadedPrompts}`));
    console.log(chalk.cyan(`   Enabled: ${stats.enabledPrompts}`));
    console.log(chalk.cyan(`   Categories: ${Object.keys(stats.categories).length}`));
    
    if (stats.topPrompts.length > 0) {
      console.log(chalk.cyan(`   Top Prompts:`));
      stats.topPrompts.forEach(prompt => {
        console.log(chalk.gray(`     ${prompt.name}: ${prompt.usage} uses (${(prompt.successRate * 100).toFixed(1)}% success)`));
      });
    }
  }
}

export const promptRegistry = PromptRegistry.getInstance();